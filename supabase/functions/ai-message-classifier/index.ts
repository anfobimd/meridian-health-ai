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
    const { message, patient_id, channel } = await req.json();

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Get patient context if available
    let patientContext = "";
    if (patient_id) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: patient } = await supabaseAdmin.from("patients")
        .select("first_name, last_name")
        .eq("id", patient_id)
        .single();
      if (patient) {
        patientContext = `Patient: ${patient.first_name} ${patient.last_name}. `;
      }
    }

    const aiRes = await chatCompletion({
messages: [{
          role: "system",
          content: `You are a front-desk message classifier for a medical aesthetics clinic. Classify the inbound patient message and draft a professional reply.
Return JSON:
- "intent": one of "appointment_request", "cancellation", "reschedule", "pricing", "aftercare", "complaint", "lab_results", "refill", "general"
- "confidence": 0.0-1.0
- "urgency": "low" | "medium" | "high"
- "draftReply": a professional, warm reply (2-3 sentences max). Don't confirm appointments — say the team will follow up.
- "suggestedAction": brief action for staff (e.g. "Check availability for next week", "Escalate to manager")
${patientContext}Channel: ${channel || "sms"}`
        }, {
          role: "user",
          content: message
        }],
temperature: 0.2
      });

    

    const aiData = aiRes;
    let result = {};
    try {
      result = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");
    } catch { result = { intent: "general", confidence: 0 }; }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-message-classifier error:", err);
    return new Response(JSON.stringify({ error: "Classification failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});