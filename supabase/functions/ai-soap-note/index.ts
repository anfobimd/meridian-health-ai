import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { chatCompletion } from "../_shared/bedrock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { patient, appointment, treatment, provider, priorNotes } = await req.json();

    const systemPrompt = `You are a clinical documentation AI assistant for a medspa/wellness EHR called Meridian. Generate a professional SOAP note based on the provided appointment context.

IMPORTANT GUIDELINES:
- Use professional medical terminology appropriate for medspa/aesthetic/wellness settings
- Be specific and clinically relevant
- Include dosages, units, treatment areas, and settings where applicable
- For hormone therapy, reference lab values and protocol adjustments
- Keep each section concise but thorough (2-4 sentences each)
- Do NOT fabricate specific measurements, vitals, or lab values not provided in context

Return a JSON object with exactly these keys:
{
  "subjective": "Patient-reported symptoms, concerns, goals, and relevant history",
  "objective": "Clinical observations, measurements, treatment parameters, vitals if available",
  "assessment": "Clinical assessment, treatment response evaluation, risk factors",
  "plan": "Treatment plan, follow-up schedule, prescriptions, patient education"
}`;

    const userPrompt = `Generate a SOAP note for the following appointment:

PATIENT: ${patient?.first_name} ${patient?.last_name}, DOB: ${patient?.date_of_birth || "Unknown"}, Gender: ${patient?.gender || "Unknown"}
${patient?.allergies?.length ? `ALLERGIES: ${patient.allergies.join(", ")}` : ""}
${patient?.medications?.length ? `MEDICATIONS: ${patient.medications.join(", ")}` : ""}

APPOINTMENT: ${appointment?.scheduled_at ? new Date(appointment.scheduled_at).toLocaleDateString() : "Today"}
STATUS: ${appointment?.status || "completed"}
${appointment?.notes ? `NOTES: ${appointment.notes}` : ""}

TREATMENT: ${treatment?.name || "General Visit"}
${treatment?.description ? `DESCRIPTION: ${treatment.description}` : ""}
${treatment?.category ? `CATEGORY: ${treatment.category}` : ""}

PROVIDER: ${provider?.first_name || ""} ${provider?.last_name || ""}, ${provider?.credentials || ""} — ${provider?.specialty || ""}

${priorNotes?.length ? `PRIOR NOTES (most recent first):\n${priorNotes.map((n: any) => `- ${n.assessment || ""} | Plan: ${n.plan || ""}`).join("\n")}` : "No prior notes available."}`;

    const response = await chatCompletion({
messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_soap_note",
            description: "Generate a structured SOAP note",
            parameters: {
              type: "object",
              properties: {
                subjective: { type: "string" },
                objective: { type: "string" },
                assessment: { type: "string" },
                plan: { type: "string" }
              },
              required: ["subjective", "objective", "assessment", "plan"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "generate_soap_note" } }
      });

    

    const result = response;
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    const soapNote = toolCall ? JSON.parse(toolCall.function.arguments) : null;

    if (!soapNote) {
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(soapNote), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-soap-note error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});