import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { chatCompletion } from "../_shared/bedrock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { mode } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const callAI = async (system: string, user: string) => {
      const res = await chatCompletion({
messages: [
            { role: "system", content: "You are a clinical scheduling AI. Return only valid JSON, no markdown fences." },
            { role: "user", content: `${system}\n\n${user}` },
          ]
        });
      
      const json = res;
      const content = json.choices?.[0]?.message?.content ?? "{}";
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned);
    };

    // ─── MODE: rank_waitlist ────────────────────────────────────────────
    if (mode === "rank_waitlist") {
      const { data: waitlist } = await sb
        .from("appointment_waitlist")
        .select("*, patients(first_name, last_name, no_show_count, late_cancel_count), treatments(name), providers(first_name, last_name)")
        .eq("is_fulfilled", false)
        .order("created_at", { ascending: true });

      if (!waitlist?.length) {
        return new Response(JSON.stringify({ ranked: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const patientIds = [...new Set(waitlist.map((w: any) => w.patient_id))];
      const { data: recentApts } = await sb
        .from("appointments")
        .select("patient_id, status, scheduled_at")
        .in("patient_id", patientIds)
        .order("scheduled_at", { ascending: false })
        .limit(100);

      const result = await callAI(
        `Rank waitlisted patients by fill probability (0-100). Factors: wait duration (longer=higher), reliability (low no-shows=higher), flexibility (no preferences=higher), treatment value. Return JSON: {"ranked":[{"waitlist_id":"uuid","score":number,"reason":"1 sentence"}]} sorted desc.`,
        JSON.stringify({
          waitlist: waitlist.map((w: any) => ({
            id: w.id, patient: `${w.patients?.first_name} ${w.patients?.last_name}`,
            no_shows: w.patients?.no_show_count || 0, late_cancels: w.patients?.late_cancel_count || 0,
            treatment: w.treatments?.name || "Any", preferred_date: w.preferred_date || "Any",
            preferred_provider: w.providers ? `${w.providers.first_name} ${w.providers.last_name}` : "Any",
            wait_since: w.created_at, notes: w.notes,
          })),
          recent_appointments: recentApts?.slice(0, 50),
          now: new Date().toISOString(),
        })
      );

      for (const item of result.ranked || []) {
        await sb.from("appointment_waitlist").update({
          priority_score: item.score, ai_rank_reason: item.reason,
        }).eq("id", item.waitlist_id);
      }

      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MODE: cancellation_match ──────────────────────────────────────
    if (mode === "cancellation_match") {
      const { provider_id, treatment_id, scheduled_at, duration_minutes } = body.data || {};

      const { data: waitlist } = await sb
        .from("appointment_waitlist")
        .select("*, patients(first_name, last_name, phone, email), treatments(name)")
        .eq("is_fulfilled", false)
        .order("priority_score", { ascending: false });

      if (!waitlist?.length) {
        return new Response(JSON.stringify({ matches: [], sms_draft: "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: treatment } = treatment_id
        ? await sb.from("treatments").select("name").eq("id", treatment_id).single()
        : { data: null };

      const result = await callAI(
        `A cancellation occurred. Find best waitlist matches. Return JSON: {"matches":[{"waitlist_id":"uuid","patient_name":string,"phone":string|null,"fit_score":number,"reason":"1 sentence"}],"sms_draft":"under 160 chars offering slot"} Top 5 max, sorted by fit_score desc.`,
        JSON.stringify({
          cancelled_slot: { scheduled_at, duration_minutes: duration_minutes || 30, treatment: treatment?.name || "General", provider_id },
          waitlist_entries: waitlist.map((w: any) => ({
            id: w.id, patient: `${w.patients?.first_name} ${w.patients?.last_name}`,
            phone: w.patients?.phone, treatment: w.treatments?.name || "Any",
            preferred_date: w.preferred_date, priority_score: w.priority_score,
          })),
        })
      );

      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MODE: re_engagement_draft ─────────────────────────────────────
    if (mode === "re_engagement_draft") {
      const { patient_name, no_show_count, treatment_name } = body.data || {};
      const result = await callAI(
        `Write re-engagement messages for a patient who no-showed/cancelled late. Be empathetic, not punitive. Return JSON: {"sms":"under 160 chars","email_subject":"subject","email_body":"2-3 sentences"}`,
        JSON.stringify({ patient_name, no_show_count, treatment_name })
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MODE: no_show_risk ────────────────────────────────────────────
    if (mode === "no_show_risk") {
      const { patient_id } = body.data || {};
      const { data: patient } = await sb.from("patients").select("first_name, last_name, no_show_count, late_cancel_count").eq("id", patient_id).single();
      const { data: history } = await sb.from("appointments").select("status").eq("patient_id", patient_id).limit(20);
      const total = history?.length || 0;
      const noShows = history?.filter((a: any) => a.status === "no_show").length || 0;
      const cancels = history?.filter((a: any) => a.status === "cancelled").length || 0;
      const riskScore = total === 0 ? 20 : Math.min(100, Math.round(((noShows * 3 + cancels) / (total + 1)) * 100));
      const riskLevel = riskScore >= 60 ? "high" : riskScore >= 30 ? "medium" : "low";
      return new Response(JSON.stringify({ risk_score: riskScore, risk_level: riskLevel, stats: { total, no_shows: noShows, cancellations: cancels } }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MODE: pricing_quote ────────────────────────────────────────────
    if (mode === "pricing_quote") {
      const { treatment_ids, patient_id } = body.data || {};
      const { data: treatments } = await sb.from("treatments").select("id, name, price, category").in("id", treatment_ids || []);
      const { data: packages } = await sb.from("service_packages").select("*, service_package_items(treatment_id, treatment_name, sessions_included, unit_price)").eq("is_active", true);
      const alaCarteTotal = (treatments || []).reduce((s: number, t: any) => s + (t.price || 0), 0);

      const result = await callAI(
        `Build an itemized quote comparing à la carte vs packages. Return JSON: {"line_items":[{"name":string,"price":number}],"a_la_carte_total":number,"package_options":[{"package_name":string,"package_id":string|null,"package_price":number,"savings":number,"savings_pct":number,"covers":string[]}],"recommendation":"1-2 sentences"}`,
        JSON.stringify({ treatments, packages, a_la_carte_total: alaCarteTotal })
      );

      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MODE: membership_recommend ─────────────────────────────────────
    if (mode === "membership_recommend") {
      const { patient_id } = body.data || {};
      const { data: history } = await sb.from("appointments").select("*, treatments(name, price, category)").eq("patient_id", patient_id).eq("status", "completed").order("scheduled_at", { ascending: false }).limit(30);
      const { data: packages } = await sb.from("service_packages").select("*").eq("is_active", true);
      const totalSpent = (history || []).reduce((s: number, a: any) => s + (a.treatments?.price || 0), 0);
      const visitCount = history?.length || 0;

      const result = await callAI(
        `Recommend optimal membership tier based on treatment history. Return JSON: {"recommended_tier":"single|double|triple|founding","reasoning":"2-3 sentences","projected_annual_savings":number,"break_even_months":number,"top_packages":[{"name":string,"id":string|null,"savings_vs_alacarte":number}],"spending_summary":{"total_6mo":number,"avg_per_visit":number,"visit_count":number,"top_treatment":string}}`,
        JSON.stringify({ treatment_history: history, packages, total_spent: totalSpent, visit_count: visitCount })
      );

      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── ORIGINAL: Room/Book scheduling (action-based) ─────────────────
    const { action, appointment_id, treatment_id, scheduled_at, duration_minutes, patient_id } = body;

    const [
      { data: rooms },
      { data: devices },
      { data: requirements },
      { data: providers },
    ] = await Promise.all([
      sb.from("rooms").select("*, providers:assigned_provider_id(id, first_name, last_name, specialty)").eq("is_active", true).order("sort_order"),
      sb.from("devices").select("*, rooms:room_id(id, name)").eq("is_active", true),
      sb.from("treatment_device_requirements").select("*"),
      sb.from("providers").select("*").eq("is_active", true),
    ]);

    const requiredDeviceIds = (requirements ?? [])
      .filter((r: any) => r.treatment_id === treatment_id && r.is_required)
      .map((r: any) => r.device_id);
    const requiredDevices = (devices ?? []).filter((d: any) => requiredDeviceIds.includes(d.id));

    let conflicts: any[] = [];
    if (scheduled_at && requiredDeviceIds.length > 0) {
      const startTime = new Date(scheduled_at);
      const endTime = new Date(startTime.getTime() + (duration_minutes || 30) * 60000);
      const { data: overlapping } = await sb
        .from("appointments")
        .select("id, device_id, room_id, scheduled_at, duration_minutes, patients(first_name, last_name)")
        .in("device_id", requiredDeviceIds)
        .in("status", ["booked", "checked_in", "roomed", "in_progress"])
        .gte("scheduled_at", new Date(startTime.getTime() - 4 * 3600000).toISOString())
        .lte("scheduled_at", endTime.toISOString());
      conflicts = (overlapping ?? []).filter((apt: any) => {
        const aptStart = new Date(apt.scheduled_at);
        const aptEnd = new Date(aptStart.getTime() + (apt.duration_minutes || 30) * 60000);
        return aptStart < endTime && aptEnd > startTime;
      });
    }

    let occupiedRoomIds: string[] = [];
    if (scheduled_at) {
      const startTime = new Date(scheduled_at);
      const endTime = new Date(startTime.getTime() + (duration_minutes || 30) * 60000);
      const { data: roomAppts } = await sb
        .from("appointments")
        .select("room_id, scheduled_at, duration_minutes")
        .not("room_id", "is", null)
        .in("status", ["booked", "checked_in", "roomed", "in_progress"])
        .gte("scheduled_at", new Date(startTime.getTime() - 4 * 3600000).toISOString())
        .lte("scheduled_at", endTime.toISOString());
      occupiedRoomIds = (roomAppts ?? [])
        .filter((apt: any) => {
          const aptStart = new Date(apt.scheduled_at);
          const aptEnd = new Date(aptStart.getTime() + (apt.duration_minutes || 30) * 60000);
          return aptStart < endTime && aptEnd > startTime;
        })
        .map((apt: any) => apt.room_id);
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayAppts } = await sb
      .from("appointments")
      .select("provider_id")
      .gte("scheduled_at", todayStart.toISOString())
      .in("status", ["booked", "checked_in", "roomed", "in_progress"]);

    const providerLoad: Record<string, number> = {};
    (todayAppts ?? []).forEach((a: any) => {
      if (a.provider_id) providerLoad[a.provider_id] = (providerLoad[a.provider_id] || 0) + 1;
    });

    const prompt = `You are a medical clinic scheduling assistant. Given the following context, recommend the best room, device, and provider assignment.

ACTION: ${action} (either "book" for new booking or "room" for rooming a checked-in patient)

AVAILABLE ROOMS:
${(rooms ?? []).map((r: any) => `- ${r.name} (${r.room_type}) ${r.providers ? `— assigned to ${r.providers.first_name} ${r.providers.last_name}` : "— no assigned provider"} ${occupiedRoomIds.includes(r.id) ? "[OCCUPIED]" : "[AVAILABLE]"}`).join("\n")}

AVAILABLE DEVICES:
${(devices ?? []).map((d: any) => `- ${d.name} (${d.device_type}) ${d.rooms ? `in ${d.rooms.name}` : "not in a room"}`).join("\n")}

REQUIRED DEVICES FOR THIS TREATMENT: ${requiredDevices.length > 0 ? requiredDevices.map((d: any) => d.name).join(", ") : "None"}

DEVICE CONFLICTS: ${conflicts.length > 0 ? conflicts.map((c: any) => `${c.patients?.first_name} ${c.patients?.last_name} already using device at overlapping time`).join("; ") : "None"}

PROVIDERS (with today's patient load):
${(providers ?? []).map((p: any) => `- ${p.first_name} ${p.last_name} (${p.specialty || "General"}) — ${providerLoad[p.id] || 0} patients today`).join("\n")}

Respond with a JSON object (no markdown) with these keys:
- "has_conflict": boolean
- "conflict_message": string or null
- "recommended_room_id": string or null
- "recommended_room_name": string or null
- "room_reasoning": string
- "recommended_device_id": string or null
- "recommended_provider_id": string or null
- "recommended_provider_name": string or null
- "provider_reasoning": string`;

    const recommendation = await callAI("", prompt);

    // Post-process: resolve AI-returned names back to real UUIDs
    if (recommendation && !recommendation.error) {
      if (recommendation.recommended_room_id && rooms) {
        const matchedRoom = (rooms as any[]).find((r: any) =>
          r.id === recommendation.recommended_room_id ||
          r.name?.toLowerCase() === String(recommendation.recommended_room_id).toLowerCase() ||
          r.name?.toLowerCase() === String(recommendation.recommended_room_name).toLowerCase()
        );
        if (matchedRoom) {
          recommendation.recommended_room_id = matchedRoom.id;
          recommendation.recommended_room_name = matchedRoom.name;
        } else {
          recommendation.recommended_room_id = null;
        }
      }
      if (recommendation.recommended_provider_id && providers) {
        const matchedProvider = (providers as any[]).find((p: any) =>
          p.id === recommendation.recommended_provider_id ||
          `${p.first_name} ${p.last_name}`.toLowerCase() === String(recommendation.recommended_provider_id).toLowerCase() ||
          `${p.first_name} ${p.last_name}`.toLowerCase() === String(recommendation.recommended_provider_name).toLowerCase()
        );
        if (matchedProvider) {
          recommendation.recommended_provider_id = matchedProvider.id;
          recommendation.recommended_provider_name = `${matchedProvider.first_name} ${matchedProvider.last_name}`;
        } else {
          recommendation.recommended_provider_id = null;
        }
      }
    }

    return new Response(JSON.stringify(recommendation), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-smart-schedule error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});