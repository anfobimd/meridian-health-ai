import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { chatCompletion } from "../_shared/bedrock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MODEL = "google/gemini-2.5-flash";

async function callAI(systemPrompt: string, userMessage: string) {
  const res = await chatCompletion({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7
    });
  const rawText = await res.text();
  console.log("AI API raw response (first 200):", rawText.substring(0, 200));
  let data;
  try { data = JSON.parse(rawText); } catch { return { narrative: rawText }; }
  const content = data.choices?.[0]?.message?.content || "{}";
  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { narrative: content };
  }
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function gatherWeeklyMetrics() {
  const sb = getSupabaseAdmin();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

  const thisStart = weekAgo.toISOString();
  const lastStart = twoWeeksAgo.toISOString();
  const nowStr = now.toISOString();

  // This week queries
  const [aptsThis, aptsLast, revenueThis, revenueLast, unsignedNotes, reviewsThis, newPatients, newPatientsLast] = await Promise.all([
    sb.from("appointments").select("id, status", { count: "exact" }).gte("scheduled_at", thisStart).lt("scheduled_at", nowStr),
    sb.from("appointments").select("id, status", { count: "exact" }).gte("scheduled_at", lastStart).lt("scheduled_at", thisStart),
    sb.from("invoices").select("total").eq("status", "paid").gte("created_at", thisStart),
    sb.from("invoices").select("total").eq("status", "paid").gte("created_at", lastStart).lt("created_at", thisStart),
    sb.from("clinical_notes").select("id", { count: "exact", head: true }).eq("status", "draft"),
    sb.from("chart_review_records").select("id, status").gte("created_at", thisStart),
    sb.from("patients").select("id", { count: "exact", head: true }).gte("created_at", thisStart),
    sb.from("patients").select("id", { count: "exact", head: true }).gte("created_at", lastStart).lt("created_at", thisStart),
  ]);

  const thisApts = aptsThis.data || [];
  const lastApts = aptsLast.data || [];

  const completedThis = thisApts.filter((a: any) => a.status === "completed").length;
  const noShowThis = thisApts.filter((a: any) => a.status === "no_show").length;
  const completedLast = lastApts.filter((a: any) => a.status === "completed").length;
  const noShowLast = lastApts.filter((a: any) => a.status === "no_show").length;

  const revThis = (revenueThis.data || []).reduce((s: number, r: any) => s + (r.total || 0), 0);
  const revLast = (revenueLast.data || []).reduce((s: number, r: any) => s + (r.total || 0), 0);

  const reviewData = reviewsThis.data || [];
  const corrections = reviewData.filter((r: any) => r.status === "corrected").length;

  return {
    this_week: {
      appointments: thisApts.length,
      completed: completedThis,
      no_shows: noShowThis,
      completion_rate: thisApts.length > 0 ? Math.round((completedThis / thisApts.length) * 100) : 0,
      revenue: revThis,
      new_patients: newPatients.count ?? 0,
      charts_reviewed: reviewData.length,
      corrections,
    },
    last_week: {
      appointments: lastApts.length,
      completed: completedLast,
      no_shows: noShowLast,
      completion_rate: lastApts.length > 0 ? Math.round((completedLast / lastApts.length) * 100) : 0,
      revenue: revLast,
      new_patients: newPatientsLast.count ?? 0,
    },
    current_state: {
      unsigned_notes: unsignedNotes.count ?? 0,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { mode, ...params } = body;

    if (mode === "weekly_insights") {
      const metrics = await gatherWeeklyMetrics();
      const result = await callAI(
        `You are a medspa clinic analytics AI. Analyze the past 7 days of clinic performance and compare to the prior week.
Return JSON: {
  "narrative": "2-3 paragraph executive summary of this week's clinic performance. Be specific with numbers.",
  "kpi_highlights": [{"label": "metric name", "value": "formatted value", "trend": "up|down|stable"}],
  "weekly_action": "One specific, actionable recommendation for the coming week",
  "trends": [{"metric": "name", "this_week": "value", "last_week": "value", "change_pct": "+X% or -X%"}]
}
Include 4-6 KPI highlights covering: appointments, revenue, completion rate, no-shows, new patients, compliance.
Include 4-5 trend rows. Be professional, data-driven, and actionable. Reference actual numbers.`,
        JSON.stringify(metrics)
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "earnings_analysis") {
      const result = await callAI(
        `You are a medspa financial advisor AI. Analyze provider earnings data and provide actionable insights.
Return JSON: { "narrative": "...", "top_modality": "...", "optimization_tips": ["..."], "risk_flags": ["..."] }
Focus on: which modalities drive the most revenue per hour, underperforming areas, scheduling optimization opportunities.
Reference these benchmark rates: Botox $720/hr, Weight Loss $379/hr, CO₂ Laser $600/hr, Vampire Facial $1,200/hr.`,
        JSON.stringify(params.earnings || [])
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "proforma_optimize") {
      const result = await callAI(
        `You are a medspa revenue optimization AI. Given a provider's current proforma inputs and results, suggest the optimal patient mix to maximize net earnings per hour while respecting realistic time constraints.
Return JSON: { "recommendation": "...", "suggested_changes": [{"modality": "...", "current": N, "suggested": N, "reason": "..."}], "projected_improvement": "$X" }
Key facts: Vampire Facial = $1,200/hr (highest), Botox = $720/hr (compounds with 3.5-month returns), Laser = $600/hr, Weight Loss = $379/hr (but recurring 10 months).
Laser is billed at $150 per use on top of membership. A typical provider works 20-30 hours/week.`,
        JSON.stringify({ inputs: params.inputs, current_results: params.current_results })
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "membership_roi") {
      const result = await callAI(
        `You are a medspa business advisor. Calculate the ROI of the collective membership model vs. independent practice.
Collective model: flat monthly fee ($500 founding / $500-$1,000 standard) covers room access, medical director, malpractice, EMR, wholesale pricing, laser equipment. Laser billed at $150 per use additionally. Provider keeps 100% of patient revenue.
Return JSON: { "narrative": "...", "monthly_savings": "$X", "annual_roi": "X%", "breakeven_patients": N, "comparison_table": [...] }`,
        JSON.stringify(params)
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "anomaly_detect") {
      const result = await callAI(
        `You are a financial anomaly detection AI for a medspa collective. Analyze earnings data for unusual patterns.
Flag: sudden revenue drops, pricing below market, low-margin treatments, providers with declining $/hr, unusual session durations.
Return JSON: { "anomalies": [{"type": "...", "severity": "low|medium|high", "description": "...", "suggestion": "..."}], "summary": "..." }`,
        JSON.stringify(params.earnings || [])
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "daily_briefing") {
      const result = await callAI(
        `You are a clinic operations AI assistant for a medspa wellness collective. Generate a concise morning briefing for the clinic admin/owner.
Return JSON: {
  "summary": "One paragraph executive summary of the day ahead",
  "narrative": "2-3 sentence natural language overview",
  "priorities": ["Priority 1...", "Priority 2...", "Priority 3..."],
  "alerts": ["Short alert badge text..."]
}
Be specific, actionable, and reference the actual numbers provided. Flag anything unusual. Keep the tone professional but warm.`,
        JSON.stringify(params.metrics || {})
      );
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown mode" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("Edge function error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});