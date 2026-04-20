import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { chatCompletion } from "../_shared/bedrock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { month } = await req.json();
    // month format: "2026-04-01" (first of month)
    const reportMonth = month || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
    const monthStart = reportMonth;
    const nextMonth = new Date(new Date(reportMonth).getFullYear(), new Date(reportMonth).getMonth() + 1, 1).toISOString().split("T")[0];

    // Gather data for the month
    const { data: reviews } = await supabase
      .from("chart_review_records")
      .select("*, encounters(encounter_type, providers(first_name, last_name, credentials))")
      .gte("created_at", monthStart)
      .lt("created_at", nextMonth);

    const { data: providerIntel } = await supabase
      .from("ai_provider_intelligence")
      .select("*, providers(first_name, last_name, credentials, specialty)")
      .order("correction_rate", { ascending: false });

    const { data: apiCalls } = await supabase
      .from("ai_api_calls")
      .select("*")
      .gte("created_at", monthStart)
      .lt("created_at", nextMonth);

    // Calculate metrics
    const totalReviews = reviews?.length || 0;
    const approved = reviews?.filter((r: any) => r.status === "approved").length || 0;
    const corrected = reviews?.filter((r: any) => r.status === "corrected").length || 0;
    const pending = reviews?.filter((r: any) => ["pending_review", "pending_ai"].includes(r.status)).length || 0;
    const reviewed = reviews?.filter((r: any) => r.review_duration_seconds) || [];
    const avgReviewTime = reviewed.length ? Math.round(reviewed.reduce((s: number, r: any) => s + (r.review_duration_seconds || 0), 0) / reviewed.length) : 0;
    const rubberStamps = reviewed.filter((r: any) => (r.review_duration_seconds || 0) < (r.rubber_stamp_threshold_seconds || 30) && r.md_action === "approve").length;

    const totalApiCalls = apiCalls?.length || 0;
    const apiSuccesses = apiCalls?.filter((c: any) => c.status === "success").length || 0;

    const metrics = {
      total_reviews: totalReviews,
      approved,
      corrected,
      pending,
      correction_rate: totalReviews > 0 ? (corrected / totalReviews) : 0,
      avg_review_seconds: avgReviewTime,
      rubber_stamps: rubberStamps,
      total_api_calls: totalApiCalls,
      api_success_rate: totalApiCalls > 0 ? (apiSuccesses / totalApiCalls) : 1,
    };

    // Build MD consistency records
    const reviewerMap: Record<string, any[]> = {};
    (reviews || []).forEach((r: any) => {
      if (r.reviewer_id && r.status in { approved: 1, corrected: 1 }) {
        if (!reviewerMap[r.reviewer_id]) reviewerMap[r.reviewer_id] = [];
        reviewerMap[r.reviewer_id].push(r);
      }
    });

    for (const [reviewerId, recs] of Object.entries(reviewerMap)) {
      const total = recs.length;
      const corr = recs.filter((r: any) => r.status === "corrected").length;
      const rate = total > 0 ? corr / total : 0;
      const avgSec = Math.round(recs.reduce((s: number, r: any) => s + (r.review_duration_seconds || 0), 0) / total);
      const stamps = recs.filter((r: any) => (r.review_duration_seconds || 0) < (r.rubber_stamp_threshold_seconds || 30) && r.md_action === "approve").length;

      // Upsert consistency record
      const { data: existing } = await supabase
        .from("ai_md_consistency")
        .select("id")
        .eq("reviewer_id", reviewerId)
        .eq("month", reportMonth)
        .single();

      if (existing) {
        await supabase.from("ai_md_consistency").update({
          total_reviews: total,
          correction_rate: rate,
          avg_review_seconds: avgSec,
          rubber_stamp_count: stamps,
          consistency_score: Math.max(0, 1 - (stamps / Math.max(total, 1))),
        }).eq("id", existing.id);
      } else {
        await supabase.from("ai_md_consistency").insert({
          reviewer_id: reviewerId,
          month: reportMonth,
          total_reviews: total,
          correction_rate: rate,
          avg_review_seconds: avgSec,
          rubber_stamp_count: stamps,
          consistency_score: Math.max(0, 1 - (stamps / Math.max(total, 1))),
        });
      }
    }

    // Get AI prompt for report narrative
    const { data: promptRow } = await supabase
      .from("ai_prompts")
      .select("system_prompt")
      .eq("prompt_key", "monthly_report")
      .eq("is_active", true)
      .single();

    const systemPrompt = promptRow?.system_prompt || `You are an AI oversight analyst for a medical spa. Generate a monthly oversight report. Return JSON: { "narrative": string, "highlights": string[], "alerts": string[], "recommendations": string[] }`;

    const userPrompt = `Generate a monthly oversight report for ${new Date(reportMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" })}:

Metrics:
${JSON.stringify(metrics, null, 2)}

Providers requiring attention:
${(providerIntel || []).filter((p: any) => p.coaching_status !== "none" || (p.correction_rate || 0) > 0.1).map((p: any) => `- ${p.providers?.first_name} ${p.providers?.last_name}: correction rate ${((p.correction_rate || 0) * 100).toFixed(1)}%, status: ${p.coaching_status}, issues: ${JSON.stringify(p.recurring_issues || [])}`).join("\n") || "None"}

MD Reviewer Summary:
${Object.entries(reviewerMap).map(([id, recs]) => {
  const corr = recs.filter((r: any) => r.status === "corrected").length;
  return `- Reviewer: ${recs.length} reviews, ${corr} corrections`;
}).join("\n") || "No reviews this month"}`;

    const aiResponse = await chatCompletion({
messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ]
});

    const aiData = aiResponse;
    const content = aiData.choices?.[0]?.message?.content || "{}";
    console.log("AI raw content:", content.slice(0, 500));
    let report;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      report = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr);
      report = { narrative: content, highlights: [], alerts: [], recommendations: [] };
    }
    console.log("Parsed report keys:", Object.keys(report), "narrative length:", (report.narrative || "").length);

    // Normalize AI response keys (AI may use different field names)
    const narrative = report.narrative || report.executive_summary || report.summary || "";
    const highlights = report.highlights || report.positive_highlights || [];
    const alerts = report.alerts || report.key_alerts || [];
    const recommendations = report.recommendations || report.recommendations_for_improvement || [];

    // Store the report
    const { data: savedReport, error: insertError } = await supabase.from("ai_oversight_reports").insert({
      report_month: reportMonth,
      report_type: "monthly",
      narrative: narrative || null,
      highlights,
      alerts,
      recommendations,
      metrics,
      generated_by: "ai",
    }).select().single();

    if (insertError) {
      console.error("Failed to save report:", insertError);
    }

    // Log API call
    const latency = Date.now() - startTime;
    await supabase.from("ai_api_calls").insert({
      function_name: "ai-monthly-report",
      model_used: "google/gemini-2.5-flash",
      status: "success",
      latency_ms: latency,
      input_tokens: aiData.usage?.prompt_tokens || 0,
      output_tokens: aiData.usage?.completion_tokens || 0,
    });

    return new Response(JSON.stringify({ success: true, report: savedReport }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const latency = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : "Unknown error";
    await supabase.from("ai_api_calls").insert({
      function_name: "ai-monthly-report",
      status: "error",
      error_message: msg,
      latency_ms: latency,
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});