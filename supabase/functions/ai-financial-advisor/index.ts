import { corsHeaders } from "@supabase/supabase-js/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const LOVABLE_URL = "https://api.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

async function callAI(systemPrompt: string, userMessage: string) {
  const res = await fetch(LOVABLE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });
  const data = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content || "{}");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { mode, ...params } = await req.json();

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

    return new Response(JSON.stringify({ error: "Unknown mode" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
