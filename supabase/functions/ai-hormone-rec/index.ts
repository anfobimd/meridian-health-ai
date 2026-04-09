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
  lab_igf1: { label: "IGF-1", unit: "ng/mL", low: 100, high: 300 },
  lab_fins: { label: "Fasting Insulin", unit: "µIU/mL", low: 2, high: 20 },
  lab_crp: { label: "hs-CRP", unit: "mg/L", low: 0, high: 3 },
  lab_igfbp3: { label: "IGF-BP3", unit: "mg/L", low: 3.4, high: 7.8 },
  lab_calcitonin: { label: "Calcitonin", unit: "pg/mL", low: 0, high: 10 },
  lab_b12: { label: "Vitamin B12", unit: "pg/mL", low: 200, high: 900 },
  lab_folate: { label: "Folate", unit: "ng/mL", low: 3, high: 20 },
  lab_vitd: { label: "Vitamin D", unit: "ng/mL", low: 30, high: 100 },
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

    // Qualitative labs
    const qualLabs: string[] = [];
    if (visit?.lab_ana) qualLabs.push(`ANA: ${visit.lab_ana}`);
    if (visit?.lab_rpr) qualLabs.push(`RPR: ${visit.lab_rpr}`);
    if (visit?.lab_cd4cd8) qualLabs.push(`CD4/CD8: ${visit.lab_cd4cd8}`);
    if (visit?.lab_igg) qualLabs.push(`Immunoglobulins: ${visit.lab_igg}`);
    if (visit?.lab_apoe) qualLabs.push(`APOE genotype: ${visit.lab_apoe}`);

    const priorLabSummary = priorVisits?.length
      ? priorVisits.map((v: any) => {
          const date = v.visit_date ? new Date(v.visit_date).toLocaleDateString() : "Unknown";
          const tt = v.lab_tt != null ? `TT:${v.lab_tt}` : "";
          const e2 = v.lab_e2 != null ? `E2:${v.lab_e2}` : "";
          const tsh = v.lab_tsh != null ? `TSH:${v.lab_tsh}` : "";
          return `${date}: ${[tt, e2, tsh].filter(Boolean).join(", ")}`;
        }).join("\n")
      : "No prior visits.";

    // Determine focus areas and build appropriate system prompt
    const focusAreas = patient?.focus || visit?.intake_focus || [];
    const hasPeptides = focusAreas.some((f: string) => f.startsWith("peptide_"));
    const isMale = patient?.gender === "male" || patient?.sex === "male";
    const isFemale = patient?.gender === "female" || patient?.sex === "female";

    const systemPrompt = `You are an expert hormone optimization and peptide therapy clinical decision support system for a medspa/wellness clinic. You provide physician-grade treatment recommendations based on laboratory data, patient history, and clinical protocols.

## HARD STOPS — CHECK FIRST (NO EXCEPTIONS)
These conditions MUST be flagged before any recommendation:
${isMale ? `- PSA > 4.0 ng/mL → STOP. Urology referral required before TRT.
- Prolactin > 20 ng/mL → STOP. Evaluate pituitary.
- Hematocrit > 54% → HOLD testosterone therapy.` : ""}
${isFemale ? `- Prolactin > 25 ng/mL → STOP. MRI pituitary if > 25.
- Hematocrit > 50% on testosterone → HOLD therapy.
- Total T > 70 ng/dL → Target ceiling, never exceed.
- Uterine status unknown → Cannot finalize progesterone plan.
- E2 < 20 pg/mL (on TRT) → Do NOT initiate anastrozole.` : ""}
- Active malignancy → NO peptides of any category. Absolute.
- Abnormal cancer screening (unresolved) → NO peptides until resolved.
- Pregnant or trying to conceive → NO peptides. Absolute.
- Breastfeeding → NO peptides. Absolute.

${isMale ? `## MALE HORMONE OPTIMIZATION PROTOCOL (6-Step)
1. AXIS CLASSIFICATION: Primary vs secondary hypogonadism using LH/FSH/TT
2. TESTOSTERONE PROTOCOL: Start TRT at 100-120mg/week IM or 60-80mg/week SubQ (cypionate). Adjust based on trough TT target 600-900 ng/dL.
3. ESTROGEN MANAGEMENT: Only consider anastrozole if E2 > 40 pg/mL WITH symptoms. NEVER if E2 < 20. Start 0.25mg 2x/week if needed.
4. HCG CONSIDERATION: 500 IU 2x/week if fertility preservation needed or testicular atrophy concern.
5. ANCILLARY: DHEA 25-50mg daily if DHEA-S low. Thyroid optimization if TSH > 2.5.
6. SAFETY: CBC q6 months (hematocrit), metabolic panel, lipids annually.` : ""}

${isFemale ? `## FEMALE HORMONE OPTIMIZATION PROTOCOL (6-Step)
1. MENOPAUSAL STAGING: Pre/peri/post using FSH, E2, symptoms, LMP
2. ESTROGEN: Bi-est cream (80/20 E3:E2) 0.5-2mg/day or estradiol patch 0.025-0.1mg/day. Oral estradiol 0.5-2mg for select cases.
3. PROGESTERONE: Oral micronized progesterone 100-200mg HS if uterus intact. Consider even post-hysterectomy for sleep/neuroprotection.
4. TESTOSTERONE: Cream 0.5-2mg/day or pellet. Target free T 2-5 pg/mL, total T 20-50 ng/dL. NEVER > 70 ng/dL.
5. DHEA: 5-25mg daily. DHEA-S target 150-250 mcg/dL.
6. THYROID: Optimize TSH to 1-2 mIU/L range. Consider T3/T4 combo if FT3 low despite normal TSH.` : ""}

${hasPeptides ? `## PEPTIDE THERAPY PROTOCOLS

### GH Secretagogues (if focus includes peptide_gh)
- Ipamorelin: 200-300 mcg SubQ before bed, 5 days on / 2 off
- CJC-1295 (no DAC): 100-200 mcg SubQ with Ipamorelin
- Tesamorelin: 2mg SubQ daily (FDA-approved for visceral fat)
- Monitor IGF-1 q3 months. Target age-adjusted upper quartile. If supraphysiologic → reduce dose (cancer risk)
- CONTRAINDICATION: Active malignancy, abnormal PSA (males)

### GLP-1 Agents (if focus includes peptide_glp1)
- Semaglutide: Start 0.25mg/week SubQ x4 weeks → 0.5mg x4 weeks → 1mg maintenance
- Tirzepatide: Start 2.5mg/week SubQ x4 weeks → 5mg → 7.5mg → 10mg
- HARD STOP: Calcitonin elevated → medullary thyroid cancer risk
- HARD STOP: Personal/family history medullary thyroid cancer or MEN2
- HARD STOP: History of pancreatitis
- Monitor: A1c, fasting glucose, lipase q3 months initially

### Sexual Health — PT-141 (if focus includes peptide_sexual)
- Bremelanotide (PT-141): 1.75mg SubQ PRN, max 1 dose/24h, max 8 doses/month
- Evaluate SHBG — high SHBG may reduce efficacy
- Contraindicated with uncontrolled HTN

### Tissue Repair (if focus includes peptide_tissue)
- BPC-157: 250-500 mcg SubQ 1-2x daily at injury site, 4-8 week cycles
- TB-500: 2.5mg SubQ 2x/week x4 weeks loading → 2.5mg/week maintenance
- Monitor CRP for inflammation response

### Cognitive Enhancement (if focus includes peptide_cognitive)
- Selank: 250-500 mcg intranasal 1-2x daily
- Semax: 200-600 mcg intranasal 1-2x daily
- REQUIRED: APOE genotype before starting. If e4/e4 homozygous → explicit written consent required
- Monitor B12, folate, vitamin D

### Immune Support (if focus includes peptide_immune)
- Thymosin Alpha-1: 1.6mg SubQ 2x/week
- HARD STOP: ANA positive → NO Thymosin Alpha-1, rheumatology referral
- HARD STOP: RPR positive → treat infection first, confirm negative before starting
- Required labs: CD4/CD8 ratio, immunoglobulins
- Monitor CRP, CBC

### Sleep & Recovery (if focus includes peptide_sleep)
- DSIP (Delta Sleep-Inducing Peptide): 100-200 mcg SubQ before bed
- Epithalon: 5-10mg SubQ daily for 10-20 day cycles, 2-3x/year
` : ""}

## RESPONSE REQUIREMENTS
Your response must include:
1. treatment_recommendation: Specific protocol recommendations with compound, dose, frequency, route for EACH focus area
2. monitoring_plan: Follow-up labs, timeline, and milestones
3. risk_flags: ALL safety concerns, hard stops triggered, and contraindication alerts
4. summary: Brief clinical summary (2-3 sentences covering all treatment areas)

Be specific with dosages. Reference the protocols above. If contraindications are present, state clearly what CANNOT be prescribed and why.`;

    const symptomsText = (patient?.symptoms || visit?.intake_symptoms || []).join(", ");
    const goalsText = (patient?.goals || visit?.intake_goals || []).join(", ");
    const contraindicationsText = (patient?.contraindications || visit?.peptide_contraindications || []).join(", ");
    const routesText = (patient?.preferred_routes || []).join(", ");

    const userPrompt = `Patient: ${patient?.first_name || "Unknown"} ${patient?.last_name || ""}, ${patient?.gender || patient?.sex || "Unknown gender"}, DOB: ${patient?.date_of_birth || "Unknown"}
Weight: ${patient?.weight_lbs || "Unknown"} lbs, Height: ${patient?.height_in || "Unknown"} inches
${isFemale ? `Menopausal status: ${patient?.meno_status || "Unknown"}
Uterine status: ${patient?.uterine_status || "Unknown"}` : ""}

FOCUS AREAS: ${focusAreas.join(", ") || "Hormone optimization"}
REPORTED SYMPTOMS: ${symptomsText || "None specified"}
TREATMENT GOALS: ${goalsText || "Not specified"}
PREFERRED ROUTES: ${routesText || "No preference"}
PRIOR THERAPY: ${patient?.prior_therapy || "None reported"}
CURRENT MEDICATIONS: ${patient?.medications || "None reported"}
CONTRAINDICATIONS: ${contraindicationsText || "None reported"}

CURRENT LABS (${visit?.visit_date ? new Date(visit.visit_date).toLocaleDateString() : "Today"}):
${labLines.length > 0 ? labLines.join("\n") : "No labs entered."}
${qualLabs.length > 0 ? "\nQUALITATIVE LABS:\n" + qualLabs.join("\n") : ""}

PRIOR VISIT HISTORY:
${priorLabSummary}

Please analyze this intake and provide your full clinical recommendation covering all selected focus areas.`;

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
            description: "Provide structured hormone and peptide therapy recommendations",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "2-3 sentence clinical summary" },
                treatment_recommendation: { type: "string", description: "Full treatment plan with compounds, doses, frequencies, routes for each focus area" },
                monitoring_plan: { type: "string", description: "Follow-up labs, timeline, milestones" },
                risk_flags: { type: "string", description: "Safety concerns, hard stops, contraindication alerts" },
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
