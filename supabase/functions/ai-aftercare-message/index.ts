import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletion } from "../_shared/bedrock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { patient_id, procedure_type, custom_instructions, encounter_id, patient_name, auto_send } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Allow either patient_id or encounter_id
    let resolvedPatientId = patient_id;
    if (!resolvedPatientId && encounter_id) {
      const { data: enc } = await supabaseAdmin.from("encounters").select("patient_id").eq("id", encounter_id).single();
      resolvedPatientId = enc?.patient_id;
    }
    if (!resolvedPatientId) {
      return new Response(JSON.stringify({ error: "patient_id or encounter_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get patient info
    const { data: patient } = await supabaseAdmin.from("patients")
      .select("first_name, last_name, allergies, phone, email")
      .eq("id", resolvedPatientId)
      .single();

    // Get recent appointment/treatment info
    const { data: recentApt } = await supabaseAdmin.from("appointments")
      .select("treatments(name), completed_at, notes")
      .eq("patient_id", resolvedPatientId)
      .eq("status", "completed" as any)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Check for existing aftercare template
    let templateBody = "";
    if (procedure_type) {
      const { data: template } = await supabaseAdmin.from("aftercare_templates")
        .select("body")
        .eq("procedure_type", procedure_type)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (template) templateBody = template.body;
    }

    const aptTreatments = recentApt?.treatments as { name?: string } | { name?: string }[] | null | undefined;
    const treatmentFromApt = Array.isArray(aptTreatments) ? aptTreatments[0]?.name : aptTreatments?.name;
    const treatmentName = procedure_type || treatmentFromApt || "general visit";
    const patientFirstName = patient_name?.split(" ")[0] || patient?.first_name || "the patient";

    const aiData = await chatCompletion({
      messages: [{
        role: "system",
        content: `You are a medical aesthetics aftercare specialist. Generate personalized aftercare instructions for a patient.

Return ONLY a JSON object (no markdown, no prose) with these keys:
- "subject": short subject line
- "body": personalized aftercare message (3-5 paragraphs, warm professional tone)
- "keyInstructions": string[] (3-6 bullet points of key do's/don'ts)
- "followUpDays": number (recommended follow-up in days)
- "warningSignsToWatch": string[] (2-4 signs that should prompt immediate contact)

${templateBody ? `Base template (personalize this):\n${templateBody}\n` : ""}
${patient?.allergies?.length ? `Patient allergies: ${patient.allergies.join(", ")}` : ""}
${custom_instructions ? `Additional instructions: ${custom_instructions}` : ""}`,
      }, {
        role: "user",
        content: `Generate aftercare instructions for ${patientFirstName} after their ${treatmentName} procedure.`,
      }],
      temperature: 0.3,
    });

    let result: any = {};
    try {
      const raw = aiData.choices?.[0]?.message?.content || "{}";
      const clean = raw.replace(/```json|```/g, "").trim();
      result = JSON.parse(clean);
    } catch { result = { error: "Failed to parse AI response" }; }

    // Auto-send: log to patient communication
    if (auto_send && resolvedPatientId && result.body) {
      try {
        await supabaseAdmin.from("patient_communication_log").insert({
          patient_id: resolvedPatientId,
          direction: "outbound",
          channel: "sms",
          subject: `Aftercare: ${treatmentName}`,
          body: result.body,
          is_read: false,
        });
      } catch (e) { console.error("Failed to log aftercare communication:", e); }
    }

    return new Response(JSON.stringify({ ...result, auto_sent: !!auto_send }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-aftercare-message error:", err);
    return new Response(JSON.stringify({ error: "Aftercare generation failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
