import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { chatCompletion } from "../_shared/bedrock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const body = await req.json();

    // ── MODE: prescribe_check ──
    if (body.mode === "prescribe_check") {
      const { data } = body;
      if (!data?.patient_id || !data?.medication_name) throw new Error("patient_id and medication_name required");

      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      // Get patient context
      const [patientRes, rxRes, labsRes] = await Promise.all([
        sb.from("patients").select("first_name, last_name, gender, date_of_birth, allergies, medications, contraindications").eq("id", data.patient_id).single(),
        sb.from("prescriptions").select("medication_name, dosage, frequency, route").eq("patient_id", data.patient_id).eq("is_active", true),
        sb.from("hormone_visits").select("*").eq("patient_id", data.patient_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      const patient = patientRes.data;
      const activeRx = rxRes.data || [];
      const labs = labsRes.data;

      // Build lab summary
      const labLines: string[] = [];
      if (labs) {
        for (const [key, ref] of Object.entries(LAB_REFS)) {
          const val = (labs as any)[key];
          if (val != null) {
            const flag = val < ref.low ? "LOW" : val > ref.high ? "HIGH" : "Normal";
            labLines.push(`${ref.label}: ${val} ${ref.unit} (${flag})`);
          }
        }
      }

      const prompt = `You are a clinical pharmacist AI. Validate this prescription and provide dosing guidance.

Patient: ${patient?.first_name} ${patient?.last_name}, ${patient?.gender || "Unknown"}, DOB: ${patient?.date_of_birth || "Unknown"}
Allergies: ${patient?.allergies?.join(", ") || "None"}
Contraindications: ${patient?.contraindications?.join(", ") || "None"}

Active medications: ${activeRx.map((r: any) => `${r.medication_name} ${r.dosage || ""} ${r.frequency || ""}`).join("; ") || "None"}

Current labs: ${labLines.join("; ") || "No recent labs"}

NEW PRESCRIPTION:
Medication: ${data.medication_name}
Current dosage: ${data.current_dosage || "Not set"}
Route: ${data.route || "Not specified"}
Frequency: ${data.frequency || "Not specified"}

Provide dosing recommendation, contraindication check, titration schedule, and monitoring labs.`;

      const aiRes = await chatCompletion({
messages: [{ role: "user", content: prompt }],
          tools: [{
            type: "function",
            function: {
              name: "prescribe_validation",
              description: "Return prescription validation and dosing guidance",
              parameters: {
                type: "object",
                properties: {
                  suggested_dosage: { type: "string" },
                  titration_schedule: { type: "string" },
                  monitoring_labs: { type: "array", items: { type: "string" } },
                  contraindications: { type: "array", items: { type: "string" } },
                  notes: { type: "string" },
                  safety_level: { type: "string", enum: ["safe", "caution", "contraindicated"] }
                },
                required: ["suggested_dosage", "monitoring_labs", "contraindications", "safety_level"]
              }
            }
          }],
          tool_choice: { type: "function", function: { name: "prescribe_validation" } }
        });

      

      const aiData = aiRes;
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      const result = toolCall ? JSON.parse(toolCall.function.arguments) : { suggested_dosage: "Unable to validate", monitoring_labs: [], contraindications: [], safety_level: "caution" };

      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── DEFAULT MODE: hormone recommendation ──
    const { patient, visit, priorVisits } = body;

    const labLines: string[] = [];
    for (const [key, ref] of Object.entries(LAB_REFS)) {
      const val = visit?.[key];
      if (val != null) {
        const flag = val < ref.low ? "⬇ LOW" : val > ref.high ? "⬆ HIGH" : "✓ Normal";
        labLines.push(`${ref.label}: ${val} ${ref.unit} (ref ${ref.low}-${ref.high}) ${flag}`);
      }
    }

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

    const focusAreas = patient?.focus || visit?.intake_focus || [];
    const hasPeptides = focusAreas.some((f: string) => f.startsWith("peptide_"));
    const isMale = patient?.gender === "male" || patient?.sex === "male";
    const isFemale = patient?.gender === "female" || patient?.sex === "female";

    const systemPrompt = `You are an expert hormone optimization and peptide therapy clinical decision support system for a medspa/wellness clinic. Provide physician-grade treatment recommendations based on laboratory data, patient history, and clinical protocols.

## HARD STOPS
${isMale ? `- PSA > 4.0 → Urology referral before TRT. Prolactin > 20 → Evaluate pituitary. Hematocrit > 54% → HOLD testosterone.` : ""}
${isFemale ? `- Prolactin > 25 → MRI pituitary. Hematocrit > 50% on T → HOLD. Total T > 70 → ceiling. E2 < 20 on TRT → NO anastrozole.` : ""}
- Active malignancy → NO peptides. Pregnant/breastfeeding → NO peptides.

${isMale ? `## MALE PROTOCOL: TRT 100-120mg/week IM or 60-80mg SubQ. Target TT 600-900. Anastrozole only if E2>40 WITH symptoms. HCG 500IU 2x/week if fertility needed.` : ""}
${isFemale ? `## FEMALE PROTOCOL: Bi-est cream 0.5-2mg/day or patch. Progesterone 100-200mg HS. T cream 0.5-2mg/day target FT 2-5.` : ""}
${hasPeptides ? `## PEPTIDE PROTOCOLS: GH secretagogues (Ipamorelin 200-300mcg, CJC-1295 100-200mcg). GLP-1 (Sema start 0.25mg/week). PT-141 1.75mg PRN. BPC-157 250-500mcg. TB-500 2.5mg 2x/week.` : ""}

Respond with specific dosages, monitoring plans, risk flags, and clinical summary.`;

    const symptomsText = (patient?.symptoms || visit?.intake_symptoms || []).join(", ");
    const goalsText = (patient?.goals || visit?.intake_goals || []).join(", ");
    const contraindicationsText = (patient?.contraindications || visit?.peptide_contraindications || []).join(", ");

    const userPrompt = `Patient: ${patient?.first_name || "Unknown"} ${patient?.last_name || ""}, ${patient?.gender || patient?.sex || "Unknown"}
Weight: ${patient?.weight_lbs || "?"} lbs, Height: ${patient?.height_in || "?"} in
FOCUS: ${focusAreas.join(", ") || "Hormone optimization"}
SYMPTOMS: ${symptomsText || "None"} | GOALS: ${goalsText || "Not specified"}
CONTRAINDICATIONS: ${contraindicationsText || "None"}
CURRENT MEDS: ${patient?.medications || "None"}

LABS (${visit?.visit_date ? new Date(visit.visit_date).toLocaleDateString() : "Today"}):
${labLines.length > 0 ? labLines.join("\n") : "No labs entered."}
${qualLabs.length > 0 ? "\nQUAL LABS:\n" + qualLabs.join("\n") : ""}

PRIOR VISITS:
${priorLabSummary}

Provide full clinical recommendation for all focus areas.`;

    const response = await chatCompletion({
messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        tools: [{
          type: "function",
          function: {
            name: "hormone_recommendation",
            description: "Provide structured hormone and peptide therapy recommendations",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string" },
                treatment_recommendation: { type: "string" },
                monitoring_plan: { type: "string" },
                risk_flags: { type: "string" }
              },
              required: ["summary", "treatment_recommendation", "monitoring_plan", "risk_flags"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "hormone_recommendation" } }
      });
    const result = response;
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    const rec = toolCall ? JSON.parse(toolCall.function.arguments) : null;
    if (!rec) throw new Error("Failed to parse AI response");

    return new Response(JSON.stringify(rec), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ai-hormone-rec error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});