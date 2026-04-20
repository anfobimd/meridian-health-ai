import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { chatCompletion } from "../_shared/bedrock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mode, data } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);    async function callAI(systemPrompt: string, userPrompt: string) {
      const res = await chatCompletion({
messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "schedule_result",
              description: "Return structured scheduling analysis",
              parameters: {
                type: "object",
                properties: {
                  recommendations: { type: "array", items: { type: "object", properties: { label: { type: "string" }, detail: { type: "string" }, severity: { type: "string", enum: ["info", "warning", "critical"] } }, required: ["label", "detail", "severity"] } },
                  score: { type: "number", description: "0-100 confidence/risk score" },
                  suggested_duration: { type: "number" },
                  suggested_provider_id: { type: "string" },
                  narrative: { type: "string" },
                  rankings: { type: "array", items: { type: "object", properties: { id: { type: "string" }, score: { type: "number" }, reason: { type: "string" } }, required: ["id", "score", "reason"] } }
                },
                required: ["recommendations", "narrative"]
              }
            }
          }],
          tool_choice: { type: "function", function: { name: "schedule_result" } }
        });
      
      const json = res;
      try {
        return JSON.parse(json.choices[0].message.tool_calls[0].function.arguments);
      } catch { return null; }
    }

    // ── MODE: no_show_risk ──
    if (mode === "no_show_risk") {
      const { patient_id } = data;
      const { data: patient } = await sb.from("patients").select("first_name, last_name, no_show_count, late_cancel_count, created_at").eq("id", patient_id).single();
      const { count: totalAppts } = await sb.from("appointments").select("id", { count: "exact", head: true }).eq("patient_id", patient_id);
      const { count: noShows } = await sb.from("appointments").select("id", { count: "exact", head: true }).eq("patient_id", patient_id).eq("status", "no_show");

      const noShowRate = (totalAppts && totalAppts > 0) ? ((noShows || 0) / totalAppts) * 100 : 0;
      const riskScore = Math.min(100, Math.round(noShowRate * 2 + (patient?.late_cancel_count || 0) * 10));
      const needsDeposit = riskScore >= 40 || (noShows || 0) >= 3;

      return new Response(JSON.stringify({
        risk_score: riskScore,
        no_show_count: noShows || 0,
        total_appointments: totalAppts || 0,
        no_show_rate: Math.round(noShowRate),
        needs_deposit: needsDeposit,
        deposit_reason: needsDeposit ? `${noShows || 0} no-shows (${Math.round(noShowRate)}% rate). Recommend deposit to secure booking.` : null,
        risk_level: riskScore >= 60 ? "high" : riskScore >= 30 ? "moderate" : "low",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── MODE: duration_estimate ──
    if (mode === "duration_estimate") {
      const { patient_id, treatment_id } = data;
      const { data: treatment } = await sb.from("treatments").select("name, duration_minutes, category").eq("id", treatment_id).single();
      const { count: priorVisits } = await sb.from("appointments").select("id", { count: "exact", head: true }).eq("patient_id", patient_id).eq("treatment_id", treatment_id).eq("status", "completed");
      const isNewPatient = (priorVisits || 0) === 0;
      const baseDuration = treatment?.duration_minutes || 30;
      const suggested = isNewPatient ? Math.round(baseDuration * 1.25) : baseDuration;

      return new Response(JSON.stringify({
        base_duration: baseDuration,
        suggested_duration: suggested,
        is_new_patient: isNewPatient,
        prior_visits: priorVisits || 0,
        reason: isNewPatient
          ? `First visit for ${treatment?.name || "this treatment"} — added 25% buffer for consultation & consent.`
          : `Returning patient with ${priorVisits} prior ${treatment?.name || ""} visits — standard duration.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── MODE: provider_match ──
    if (mode === "provider_match") {
      const { patient_id, treatment_id, date } = data;
      const { data: treatment } = await sb.from("treatments").select("name, category").eq("id", treatment_id).single();
      const { data: priorAppts } = await sb.from("appointments").select("provider_id").eq("patient_id", patient_id).eq("status", "completed").order("scheduled_at", { ascending: false }).limit(5);
      const { data: providers } = await sb.from("providers").select("id, first_name, last_name, specialty, credentials").eq("is_active", true);
      const { data: clearances } = await sb.from("provider_clearances" as any).select("provider_id, treatment_id").eq("treatment_id", treatment_id);

      const result = await callAI(
        "You are a clinic scheduling AI. Rank providers for a patient based on continuity of care, specialty match, and clearance. Return rankings array.",
        JSON.stringify({
          treatment: treatment?.name,
          category: treatment?.category,
          recent_providers: priorAppts?.map(a => a.provider_id),
          available_providers: providers,
          cleared_providers: clearances?.map((c: any) => c.provider_id),
        })
      );

      return new Response(JSON.stringify({
        rankings: result?.rankings || [],
        narrative: result?.narrative || "Unable to determine provider ranking.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── MODE: contraindication_check ──
    if (mode === "contraindication_check") {
      const { patient_id, treatment_id } = data;
      const { data: patient } = await sb.from("patients").select("allergies, medications, medical_conditions, date_of_birth, gender").eq("id", patient_id).single();
      const { data: treatment } = await sb.from("treatments").select("name, category, description").eq("id", treatment_id).single();

      const result = await callAI(
        "You are a clinical safety AI for an aesthetic medicine clinic. Check for contraindications between the patient's profile and the requested treatment. Flag any medication interactions, allergy concerns, or age/condition-related risks. Be specific and evidence-based.",
        JSON.stringify({ patient, treatment })
      );

      return new Response(JSON.stringify({
        recommendations: result?.recommendations || [],
        score: result?.score ?? 100,
        narrative: result?.narrative || "No contraindications detected.",
        has_warnings: (result?.recommendations || []).some((r: any) => r.severity !== "info"),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── MODE: running_behind ──
    if (mode === "running_behind") {
      const { date } = data;
      const dateStr = date || new Date().toISOString().split("T")[0];
      const { data: todayAppts } = await sb.from("appointments")
        .select("id, scheduled_at, duration_minutes, status, checked_in_at, roomed_at, completed_at, provider_id, providers(first_name, last_name), patients(first_name, last_name), treatments(name)")
        .gte("scheduled_at", `${dateStr}T00:00:00`)
        .lt("scheduled_at", `${dateStr}T23:59:59`)
        .neq("status", "cancelled")
        .order("scheduled_at");

      const now = new Date();
      const delays: any[] = [];
      for (const apt of todayAppts || []) {
        const scheduledTime = new Date(apt.scheduled_at);
        if (apt.status === "booked" && scheduledTime < now) {
          const delayMins = Math.round((now.getTime() - scheduledTime.getTime()) / 60000);
          if (delayMins > 10) {
            delays.push({
              appointment_id: apt.id,
              provider: `${(apt as any).providers?.first_name} ${(apt as any).providers?.last_name}`,
              patient: `${(apt as any).patients?.first_name} ${(apt as any).patients?.last_name}`,
              treatment: (apt as any).treatments?.name,
              scheduled_at: apt.scheduled_at,
              delay_minutes: delayMins,
              severity: delayMins > 30 ? "critical" : delayMins > 15 ? "warning" : "info",
              suggestion: delayMins > 30
                ? "Consider reassigning to available provider or contacting patient."
                : "Monitor — patient may need to be checked in.",
            });
          }
        }
        // Check if roomed too long (in_progress not started)
        if (apt.status === "roomed" && apt.roomed_at) {
          const roomedTime = new Date(apt.roomed_at);
          const waitMins = Math.round((now.getTime() - roomedTime.getTime()) / 60000);
          if (waitMins > 20) {
            delays.push({
              appointment_id: apt.id,
              provider: `${(apt as any).providers?.first_name} ${(apt as any).providers?.last_name}`,
              patient: `${(apt as any).patients?.first_name} ${(apt as any).patients?.last_name}`,
              treatment: (apt as any).treatments?.name,
              scheduled_at: apt.scheduled_at,
              delay_minutes: waitMins,
              severity: waitMins > 40 ? "critical" : "warning",
              suggestion: `Patient waiting in room for ${waitMins} min. Provider may be running behind.`,
            });
          }
        }
      }

      // Calculate per-provider utilization
      const providerMap: Record<string, { total: number; completed: number; name: string }> = {};
      for (const apt of todayAppts || []) {
        const pid = apt.provider_id;
        if (!pid) continue;
        if (!providerMap[pid]) providerMap[pid] = { total: 0, completed: 0, name: `${(apt as any).providers?.first_name} ${(apt as any).providers?.last_name}` };
        providerMap[pid].total++;
        if (apt.status === "completed") providerMap[pid].completed++;
      }
      const utilization = Object.entries(providerMap).map(([id, v]) => ({
        provider_id: id,
        provider_name: v.name,
        total_today: v.total,
        completed: v.completed,
        utilization_pct: v.total > 0 ? Math.round((v.completed / v.total) * 100) : 0,
      }));

      return new Response(JSON.stringify({ delays, utilization, total_delays: delays.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── MODE: waitlist_rank ──
    if (mode === "waitlist_rank") {
      const { data: entries } = await sb.from("appointment_waitlist")
        .select("id, patient_id, treatment_id, provider_id, preferred_date, notes, created_at, patients(first_name, last_name, no_show_count), treatments(name)")
        .eq("is_fulfilled", false);

      const { data: openSlots } = await sb.from("appointments")
        .select("scheduled_at, provider_id, treatment_id, duration_minutes")
        .eq("status", "cancelled")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at")
        .limit(10);

      const result = await callAI(
        "You are a waitlist optimization AI. Rank waitlist entries by fill probability considering: date preference match, treatment match, patient reliability (low no-shows = better), wait time. Return rankings with id, score (0-100), and reason.",
        JSON.stringify({ waitlist_entries: entries, recently_cancelled_slots: openSlots })
      );

      // Update scores in DB
      if (result?.rankings) {
        for (const r of result.rankings) {
          await sb.from("appointment_waitlist").update({
            priority_score: r.score,
            ai_rank_reason: r.reason,
          }).eq("id", r.id);
        }
      }

      return new Response(JSON.stringify({
        ranked: result?.rankings || [],
        narrative: result?.narrative || "",
        predicted_cancellations: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── MODE: cancel_predict ──
    if (mode === "cancel_predict") {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);

      const { data: upcoming } = await sb.from("appointments")
        .select("id, scheduled_at, patient_id, patients(first_name, last_name, no_show_count, late_cancel_count), treatments(name)")
        .gte("scheduled_at", tomorrow.toISOString().split("T")[0] + "T00:00:00")
        .lt("scheduled_at", dayAfter.toISOString().split("T")[0] + "T23:59:59")
        .eq("status", "booked");

      const predictions = (upcoming || []).map((apt: any) => {
        const noShows = apt.patients?.no_show_count || 0;
        const lateCancels = apt.patients?.late_cancel_count || 0;
        const riskScore = Math.min(100, noShows * 20 + lateCancels * 15);
        return {
          appointment_id: apt.id,
          patient_name: `${apt.patients?.first_name} ${apt.patients?.last_name}`,
          treatment: apt.treatments?.name,
          scheduled_at: apt.scheduled_at,
          cancel_probability: riskScore,
          risk_level: riskScore >= 60 ? "high" : riskScore >= 30 ? "moderate" : "low",
        };
      }).filter((p: any) => p.cancel_probability > 20).sort((a: any, b: any) => b.cancel_probability - a.cancel_probability);

      return new Response(JSON.stringify({ predictions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown mode: " + mode }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("schedule-optimizer error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});