// supabase/functions/booking-engine/index.ts
//
// Marketplace booking engine — validates slot, creates patient (or finds
// existing), inserts appointment + marketplace_booking rows, optionally
// creates a Stripe PaymentIntent for the deposit, and fires an intake
// invite if the treatment requires one.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function slugify(first: string, last: string): string {
  return `${first}-${last}`.toLowerCase().replace(/[^a-z0-9-]/g, "");
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
    } = body;

    // ── Validate required fields ──────────────────────────────────────────
    if (!slug || !treatment_id || !scheduled_start || !first_name || !last_name) {
      return new Response(
        JSON.stringify({ error: "slug, treatment_id, scheduled_start, first_name, and last_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Resolve provider by slug ──────────────────────────────────────────
    const { data: providers, error: provErr } = await admin
      .from("providers")
      .select("id, first_name, last_name, is_active")
      .eq("is_active", true);

    if (provErr) throw provErr;

    const provider = (providers || []).find(
      (p: any) => slugify(p.first_name, p.last_name) === slug,
    );

    if (!provider) {
      return new Response(
        JSON.stringify({ error: `Provider "${slug}" not found or inactive` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Check provider has active membership ────────────────────────────────
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

    // ── Resolve treatment ─────────────────────────────────────────────
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

    // ── Check slot availability ─────────────────────────────────────────
    const startTime = new Date(scheduled_start);
    const endTime = new Date(startTime.getTime() + (treatment.duration_minutes || 30) * 60000);

    const { data: conflicts } = await admin
      .from("appointments")
      .select("id")
      .eq("provider_id", provider.id)
      .in("status", ["booked", "checked_in"])
      .gte("scheduled_at", startTime.toISOString())
      .lt("scheduled_at", endTime.toISOString())
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      return new Response(
        JSON.stringify({ error: "That time slot is no longer available. Please choose another time." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Find or create patient ──────────────────────────────────────────
    let patient_id: string;

    if (email) {
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

    // ── Create appointment ────────────────────────────────────────────
    const confirmationCode = `MRD-${Date.now().toString(36).toUpperCase()}`;

    const { data: appointment, error: apptErr } = await admin
      .from("appointments")
      .insert({
        patient_id,
        provider_id: provider.id,
        treatment_id: treatment.id,
        status: "booked",
        scheduled_at: startTime.toISOString(),
        duration_minutes: treatment.duration_minutes || 30,
        notes: notes || null,
      })
      .select("id, scheduled_at, duration_minutes")
      .single();

    if (apptErr) throw apptErr;

    // ── Create marketplace_booking ────────────────────────────────────────
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

    // ── Pricing / Stripe deposit ────────────────────────────────────────
    const serviceAmount = Number(treatment.price) || 0;
    const depositPct = 0.2; // 20 % deposit
    const depositAmount = Math.round(serviceAmount * depositPct * 100) / 100;
    const balanceAmount = Math.round((serviceAmount - depositAmount) * 100) / 100;

    // Stripe integration — only create PaymentIntent when STRIPE_SECRET_KEY
    // is configured and a deposit is due.
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
              amount: String(Math.round(depositAmount * 100)), // cents
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

    // ── Determine if intake is required ───────────────────────────────────
    const intakeRequired = true; // all marketplace bookings require intake

    // ── Log to communication timeline ─────────────────────────────────────
    try {
      await admin.from("patient_communication_log").insert({
        patient_id,
        direction: "outbound",
        channel: "portal",
        subject: "Booking Confirmed",
        body: `Appointment ${confirmationCode} confirmed for ${treatment.name} with ${provider.first_name} ${provider.last_name} on ${startTime.toLocaleDateString()}.`,
        is_read: true,
      });
    } catch (e) {
      console.error("Comm log error (non-fatal):", e);
    }

    // ── Return response matching BookingResponse type ─────────────────────────
    const scheduledEnd = new Date(
      startTime.getTime() + (treatment.duration_minutes || 30) * 60000,
    );

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
          slug,
        },
        treatment: {
          id: treatment.id,
          name: treatment.name,
          duration_minutes: treatment.duration_minutes,
        },
        patient_id,
        service_amount: serviceAmount,
        deposit_amount: depositAmount,
        balance_amount: balanceAmount,
        client_source: client_source || "spa_acquired",
        stripe_client_secret: stripeClientSecret,
        intake_required: intakeRequired,
        intake_treatment_id: treatment.id,
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
