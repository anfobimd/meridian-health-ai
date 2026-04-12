import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured", aiUnavailable: true }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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

    const treatmentName = procedure_type || recentApt?.treatments?.name || "general visit";
    const patientFirstName = patient_name?.split(" ")[0] || patient?.first_name || "the patient";

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{
          role: "system",
          content: `You are a medical aesthetics aftercare specialist. Generate personalized aftercare instructions for a patient.

Return JSON:
- "subject": short subject line
- "body": personalized aftercare message (3-5 paragraphs, warm professional tone)
- "keyInstructions": string[] (3-6 bullet points of key do's/don'ts)
- "followUpDays": number (recommended follow-up in days)
- "warningSignsToWatch": string[] (2-4 signs that should prompt immediate contact)

${templateBody ? `Base template (personalize this):\n${templateBody}\n` : ""}
${patient?.allergies?.length ? `Patient allergies: ${patient.allergies.join(", ")}` : ""}
${custom_instructions ? `Additional instructions: ${custom_instructions}` : ""}`
        }, {
          role: "user",
          content: `Generate aftercare instructions for ${patientFirstName} after their ${treatmentName} procedure.`,
        }],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });

    if (!aiRes.ok) {
      const status = aiRes.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI error:", await aiRes.text());
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    let result = {};
    try {
      result = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");
    } catch { result = { error: "Failed to parse AI response" }; }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-aftercare-message error:", err);
    return new Response(JSON.stringify({ error: "Aftercare generation failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
