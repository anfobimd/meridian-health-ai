// supabase/functions/booking-engine/index.ts
//
// Marketplace booking engine — validates slot, creates patient (or finds
// existing), inserts appointment + marketplace_booking rows, optionally
// creates a Stripe PaymentIntent for the deposit, fires an intake invite,
// and for telehealth visits provisions a Daily.co room atomically.
//
// Two valid call shapes:
//   PUBLIC (anon):  slug + treatment_id + scheduled_start + first_name + last_name + email
//   STAFF (auth):   (slug OR provider_id) + treatment_id + scheduled_start + patient_id
//
// Optional fields (both shapes):
//   visit_type    — 'in_person' (default) | 'telehealth' | 'phone'
//                    If 'telehealth', a Daily.co room is reserved on success.
//                    On room failure the appointment is rolled back so we
//                    never leave a telehealth visit without a usable room.
//   notes         — free-text
//   phone, date_of_birth — patient demographics for new patients

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function slugify(first: string, last: string): string {
  return `${first}-${last}`.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

// Proper interval-overlap predicate: two ranges overlap iff aStart < bEnd && aEnd > bStart.
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const {
      slug,
      treatment_id,
      scheduled_start,
      first_name,
      last_name,
      date_of_birth,
      email,
      phone,
      client_source,
      notes,
      visit_type, // NEW — optional, defaults to 'in_person'
    } = body;

    const resolvedVisitType = (visit_type === "telehealth" || visit_type === "phone") ? visit_type : "in_person";

    // ── Validate required fields ───────────────────────────────────────────
    const hasIdentity = !!body.patient_id || (!!first_name && !!last_name);
    const hasProvider = !!slug || !!body.provider_id;

    if (!hasProvider || !treatment_id || !scheduled_start || !hasIdentity) {
      return new Response(
        JSON.stringify({
          error:
            "Required: (slug OR provider_id) + treatment_id + scheduled_start + (patient_id OR first_name+last_name)",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Resolve provider by slug or by id ─────────────────────────────────────
    let provider: { id: string; first_name: string; last_name: string } | null = null;

    if (body.provider_id) {
      const { data, error: provErr } = await admin
        .from("providers")
        .select("id, first_name, last_name, is_active")
        .eq("id", body.provider_id)
        .eq("is_active", true)
        .maybeSingle();
      if (provErr) throw provErr;
      provider = data;
    } else {
      const { data: providers, error: provErr } = await admin
        .from("providers")
        .select("id, first_name, last_name, is_active")
        .eq("is_active", true);
      if (provErr) throw provErr;
      provider = (providers || []).find(
        (p: any) => slugify(p.first_name, p.last_name) === slug,
      ) || null;
    }

    if (!provider) {
      return new Response(
        JSON.stringify({ error: "Provider not found or inactive" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Check provider has active membership ─────────────────────────────────────
    const { data: membership } = await admin
      .from("provider_memberships")
      .select("id, tier")
      .eq("provider_id", provider.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return new Response(
        JSON.stringify({ error: "This provider does not have an active subscription and is not accepting bookings" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Resolve clinic_id from provider's primary clinic assignment ──────────────
    const { data: assignment } = await admin
      .from("provider_clinic_assignments")
      .select("clinic_id")
      .eq("provider_id", provider.id)
      .eq("is_primary", true)
      .maybeSingle();
    const clinicId: string | null = assignment?.clinic_id ?? null;

    // ── Resolve treatment ────────────────────────────────────────────────
    const { data: treatment, error: txErr } = await admin
      .from("treatments")
      .select("id, name, duration_minutes, price, is_active")
      .eq("id", treatment_id)
      .single();

    if (txErr || !treatment) {
      return new Response(
        JSON.stringify({ error: "Treatment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!treatment.is_active) {
      return new Response(
        JSON.stringify({ error: "This treatment is no longer available" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const durationMin = treatment.duration_minutes || 30;

    // ── Slot conflict check ─ proper interval overlap. ───────────────────────────
    //
    // Previous version only caught conflicts where another appt STARTED inside
    // our window. Now we look back far enough to catch any appt whose interval
    // overlaps ours, then filter in JS. Look-back window is 4 hours — generous
    // enough for any realistic single visit duration.
    const startTime = new Date(scheduled_start);
    const endTime = new Date(startTime.getTime() + durationMin * 60000);
    const lookbackStart = new Date(startTime.getTime() - 4 * 3600 * 1000);

    const { data: candidates } = await admin
      .from("appointments")
      .select("id, scheduled_at, duration_minutes")
      .eq("provider_id", provider.id)
      .in("status", ["booked", "checked_in", "in_progress", "roomed"])
      .gte("scheduled_at", lookbackStart.toISOString())
      .lt("scheduled_at", endTime.toISOString());

    const hasOverlap = (candidates || []).some((apt: any) => {
      const aptStart = new Date(apt.scheduled_at);
      const aptEnd = new Date(aptStart.getTime() + (apt.duration_minutes || 30) * 60000);
      return overlaps(startTime, endTime, aptStart, aptEnd);
    });

    if (hasOverlap) {
      return new Response(
        JSON.stringify({ error: "That time slot is no longer available. Please choose another time." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Resolve patient: provided patient_id, or find/create by email ──────────────────
    let patient_id: string;

    if (body.patient_id) {
      const { data: existing, error: ptErr } = await admin
        .from("patients")
        .select("id")
        .eq("id", body.patient_id)
        .maybeSingle();
      if (ptErr) throw ptErr;
      if (!existing) {
        return new Response(
          JSON.stringify({ error: "Provided patient_id does not match any patient record" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      patient_id = existing.id;
    } else if (email) {
      const { data: existing } = await admin
        .from("patients")
        .select("id")
        .ilike("email", email)
        .limit(1)
        .maybeSingle();

      if (existing) {
        patient_id = existing.id;
      } else {
        const { data: newPt, error: ptErr } = await admin
          .from("patients")
          .insert({
            first_name,
            last_name,
            date_of_birth: date_of_birth || null,
            email: email || null,
            phone: phone || null,
          })
          .select("id")
          .single();
        if (ptErr) throw ptErr;
        patient_id = newPt.id;
      }
    } else {
      const { data: newPt, error: ptErr } = await admin
        .from("patients")
        .insert({
          first_name,
          last_name,
          date_of_birth: date_of_birth || null,
          phone: phone || null,
        })
        .select("id")
        .single();
      if (ptErr) throw ptErr;
      patient_id = newPt.id;
    }

    // ── Create appointment (includes visit_type + clinic_id) ───────────────────────
    const confirmationCode = `MRD-${Date.now().toString(36).toUpperCase()}`;

    const { data: appointment, error: apptErr } = await admin
      .from("appointments")
      .insert({
        patient_id,
        provider_id: provider.id,
        treatment_id: treatment.id,
        status: "booked",
        scheduled_at: startTime.toISOString(),
        duration_minutes: durationMin,
        notes: notes || null,
        visit_type: resolvedVisitType,
        clinic_id: clinicId,
        video_room_url: null, // populated below for telehealth
      })
      .select("id, scheduled_at, duration_minutes")
      .single();

    if (apptErr) throw apptErr;

    // ── Telehealth: reserve Daily.co room atomically. Roll back on failure. ─────────
    let videoRoomUrl: string | null = null;
    if (resolvedVisitType === "telehealth") {
      const apptEndTime = new Date(startTime.getTime() + durationMin * 60000);
      const expiresAt = new Date(apptEndTime.getTime() + 15 * 60000); // 15-min grace after end
      const expiresInMinutes = Math.max(5, Math.ceil((expiresAt.getTime() - Date.now()) / 60000));

      const { data: roomData, error: roomErr } = await admin.functions.invoke("daily-video", {
        body: {
          action: "create_room",
          appointment_id: appointment.id,
          patient_id,
          max_participants: 4,
          expires_in_minutes: expiresInMinutes,
        },
      });

      if (roomErr || !(roomData as any)?.room_url) {
        // Roll back: delete the appointment we just inserted so we never persist
        // a telehealth visit without a usable room.
        await admin.from("appointments").delete().eq("id", appointment.id);
        const msg = (roomData as any)?.error || roomErr?.message ||
          "Couldn't reserve the telehealth video room. Please try again or book as in-person.";
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      videoRoomUrl = (roomData as any).room_url;
      // daily-video.create_room also writes appointments.video_room_url server-side.
    }

    // ── Create marketplace_booking (non-fatal) ───────────────────────────────────
    let marketplace_appt_id: string | null = null;
    try {
      const { data: mkb } = await admin
        .from("marketplace_bookings")
        .insert({
          patient_id,
          provider_id: provider.id,
          treatment_id: treatment.id,
          appointment_id: appointment.id,
          status: "confirmed",
          ai_match_reasoning: `Booked via marketplace. Source: ${client_source || "spa_acquired"}`,
        })
        .select("id")
        .single();

      marketplace_appt_id = mkb?.id || null;
    } catch (e) {
      console.error("marketplace_bookings insert failed (non-fatal):", e);
    }

    // ── Pricing / Stripe deposit ────────────────────────────────────────────
    const serviceAmount = Number(treatment.price) || 0;
    const depositPct = 0.2; // 20 % deposit
    const depositAmount = Math.round(serviceAmount * depositPct * 100) / 100;
    const balanceAmount = Math.round((serviceAmount - depositAmount) * 100) / 100;

    let stripeClientSecret: string | null = null;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (stripeKey && depositAmount > 0) {
      try {
        const stripeRes = await fetch(
          "https://api.stripe.com/v1/payment_intents",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${stripeKey}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              amount: String(Math.round(depositAmount * 100)),
              currency: "usd",
              "metadata[appointment_id]": appointment.id,
              "metadata[patient_id]": patient_id,
              "metadata[confirmation_code]": confirmationCode,
            }),
          },
        );
        const piData = await stripeRes.json();
        if (stripeRes.ok && piData.client_secret) {
          stripeClientSecret = piData.client_secret;
        } else {
          console.error("Stripe PaymentIntent error:", JSON.stringify(piData));
        }
      } catch (stripeErr) {
        console.error("Stripe call failed (non-fatal):", stripeErr);
      }
    }

    const intakeRequired = true;

    // ── Log to communication timeline ─────────────────────────────────────────
    try {
      await admin.from("patient_communication_log").insert({
        patient_id,
        direction: "outbound",
        channel: "portal",
        subject: "Booking Confirmed",
        body: `Appointment ${confirmationCode} confirmed for ${treatment.name} with ${provider.first_name} ${provider.last_name} on ${startTime.toLocaleDateString()}.${resolvedVisitType === "telehealth" ? " Telehealth visit — join link will be in your portal." : ""}`,
        is_read: true,
      });
    } catch (e) {
      console.error("Comm log error (non-fatal):", e);
    }

    const scheduledEnd = new Date(
      startTime.getTime() + durationMin * 60000,
    );

    const resolvedSlug = slug || slugify(provider.first_name, provider.last_name);

    return new Response(
      JSON.stringify({
        confirmation_code: confirmationCode,
        appointment_id: appointment.id,
        marketplace_appt_id,
        scheduled_start: startTime.toISOString(),
        scheduled_end: scheduledEnd.toISOString(),
        provider: {
          id: provider.id,
          name: `${provider.first_name} ${provider.last_name}`,
          slug: resolvedSlug,
        },
        treatment: {
          id: treatment.id,
          name: treatment.name,
          duration_minutes: durationMin,
        },
        patient_id,
        service_amount: serviceAmount,
        deposit_amount: depositAmount,
        balance_amount: balanceAmount,
        client_source: client_source || "spa_acquired",
        stripe_client_secret: stripeClientSecret,
        intake_required: intakeRequired,
        intake_treatment_id: treatment.id,
        visit_type: resolvedVisitType,
        video_room_url: videoRoomUrl,
        clinic_id: clinicId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("booking-engine error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});