import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LAB_REFS: Record<string, { label: string; unit: string; low: number; high: number }> = {
  lab_tt: { label: "Total Testosterone", unit: "ng/dL", low: 300, high: 1000 },
  lab_ft: { label: "Free Testosterone", unit: "pg/mL", low: 8.7, high: 25.1 },
  lab_e2: { label: "Estradiol", unit: "pg/mL", low: 10, high: 40 },
  lab_p4: { label: "Progesterone", unit: "ng/mL", low: 0.2, high: 1.4 },
  lab_lh: { label: "LH", unit: "mIU/mL", low: 1.7, high: 8.6 },
  lab_fsh: { label: "FSH", unit: "mIU/mL", low: 1.5, high: 12.4 },
  lab_shbg: { label: "SHBG", unit: "nmol/L", low: 16.5, high: 55.9 },
  lab_prl: { label: "Prolactin", unit: "ng/mL", low: 4, high: 15 },
  lab_psa: { label: "PSA", unit: "ng/mL", low: 0, high: 4 },
  lab_dhea: { label: "DHEA-S", unit: "mcg/dL", low: 80, high: 560 },
  lab_tsh: { label: "TSH", unit: "mIU/L", low: 0.4, high: 4.0 },
  lab_ft3: { label: "Free T3", unit: "pg/mL", low: 2.0, high: 4.4 },
  lab_ft4: { label: "Free T4", unit: "ng/dL", low: 0.8, high: 1.7 },
  lab_hgb: { label: "Hemoglobin", unit: "g/dL", low: 13.5, high: 17.5 },
  lab_hct: { label: "Hematocrit", unit: "%", low: 38.3, high: 48.6 },
  lab_rbc: { label: "RBC", unit: "M/uL", low: 4.5, high: 5.5 },
  lab_glc: { label: "Glucose", unit: "mg/dL", low: 70, high: 100 },
  lab_a1c: { label: "HbA1c", unit: "%", low: 4, high: 5.6 },
  lab_alt: { label: "ALT", unit: "U/L", low: 7, high: 56 },
  lab_ast: { label: "AST", unit: "U/L", low: 10, high: 40 },
  lab_crt: { label: "Creatinine", unit: "mg/dL", low: 0.7, high: 1.3 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { patient, visit, priorVisits } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build lab summary with reference ranges
    const labLines: string[] = [];
    for (const [key, ref] of Object.entries(LAB_REFS)) {
      const val = visit?.[key];
      if (val != null) {
        const flag = val < ref.low ? "⬇ LOW" : val > ref.high ? "⬆ HIGH" : "✓ Normal";
        labLines.push(`${ref.label}: ${val} ${ref.unit} (ref ${ref.low}-${ref.high}) ${flag}`);
      }
    }

    const priorLabSummary = priorVisits?.length
      ? priorVisits.map((v: any) => {
          const date = v.visit_date ? new Date(v.visit_date).toLocaleDateString() : "Unknown";
          const tt = v.lab_tt != null ? `TT:${v.lab_tt}` : "";
          const e2 = v.lab_e2 != null ? `E2:${v.lab_e2}` : "";
          return `${date}: ${[tt, e2].filter(Boolean).join(", ")}`;
        }).join("\n")
      : "No prior visits.";

    const systemPrompt = `You are an expert hormone therapy clinical decision support system for a wellness/medspa clinic. Analyze lab results and provide treatment recommendations.

Your response must include:
1. treatment_recommendation: Specific protocol recommendations (compound, dose, frequency, route)
2. monitoring_plan: Follow-up labs and timeline
3. risk_flags: Any safety concerns or contraindications
4. summary: Brief clinical summary (1-2 sentences)

Be specific with dosages and protocols. Reference standard HRT/TRT/peptide protocols.`;

    const userPrompt = `Patient: ${patient?.first_name} ${patient?.last_name}, ${patient?.gender || "Unknown gender"}, DOB: ${patient?.date_of_birth || "Unknown"}

CURRENT LABS (${visit?.visit_date ? new Date(visit.visit_date).toLocaleDateString() : "Today"}):
${labLines.length > 0 ? labLines.join("\n") : "No labs entered."}

PRIOR VISIT HISTORY:
${priorLabSummary}

Please analyze these labs and provide hormone therapy recommendations.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "hormone_recommendation",
            description: "Provide structured hormone therapy recommendations",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string" },
                treatment_recommendation: { type: "string" },
                monitoring_plan: { type: "string" },
                risk_flags: { type: "string" },
              },
              required: ["summary", "treatment_recommendation", "monitoring_plan", "risk_flags"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "hormone_recommendation" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI error:", status, t);
      return new Response(JSON.stringify({ error: "AI generation failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    const rec = toolCall ? JSON.parse(toolCall.function.arguments) : null;

    if (!rec) {
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(rec), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-hormone-rec error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
