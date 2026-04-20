import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { chatCompletion } from "../_shared/bedrock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { patient_id, appointment_id } = await req.json();
    if (!patient_id) throw new Error("patient_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Gather patient context
    const [patientRes, aptsRes, encountersRes, notesRes, consentsRes] = await Promise.all([
      sb.from("patients").select("*").eq("id", patient_id).single(),
      sb.from("appointments").select("*, treatments(name), providers(first_name, last_name)")
        .eq("patient_id", patient_id).order("scheduled_at", { ascending: false }).limit(5),
      sb.from("encounters").select("id, encounter_type, chief_complaint, status, signed_at, created_at")
        .eq("patient_id", patient_id).order("created_at", { ascending: false }).limit(5),
      sb.from("clinical_notes").select("subjective, assessment, plan, created_at")
        .eq("patient_id", patient_id).order("created_at", { ascending: false }).limit(3),
      sb.from("patient_consents").select("status, consent_text, signed_at")
        .eq("patient_id", patient_id).order("created_at", { ascending: false }).limit(5),
    ]);

    const patient = patientRes.data;
    const recentApts = aptsRes.data || [];
    const recentEncounters = encountersRes.data || [];
    const recentNotes = notesRes.data || [];
    const consents = consentsRes.data || [];

    const contextPrompt = `You are a medical front desk AI assistant. Generate a concise patient brief for the front desk staff.

Patient: ${patient?.first_name} ${patient?.last_name}
DOB: ${patient?.date_of_birth || "unknown"}
No-show count: ${patient?.no_show_count || 0}
Late cancel count: ${patient?.late_cancel_count || 0}
Allergies: ${patient?.allergies || "None listed"}
Current medications: ${patient?.current_medications || "None listed"}

Recent appointments (last 5): ${JSON.stringify(recentApts.map(a => ({
  date: a.scheduled_at, treatment: a.treatments?.name, status: a.status, provider: a.providers ? `Dr. ${a.providers.last_name}` : null
})))}

Recent encounters: ${JSON.stringify(recentEncounters.map(e => ({
  type: e.encounter_type, complaint: e.chief_complaint, status: e.status, date: e.created_at
})))}

Recent notes summary: ${JSON.stringify(recentNotes.map(n => ({
  assessment: n.assessment?.substring(0, 200), plan: n.plan?.substring(0, 200)
})))}

Pending consents: ${consents.filter(c => c.status === 'pending').length}

Generate a brief with these sections (keep each to 1-2 sentences):
1. **Visit Summary**: Key info about their visit history
2. **Alerts**: Any flags (no-shows, pending consents, allergies)
3. **Last Treatment**: What was done last and any follow-up notes
4. **Today's Prep**: What staff should prepare

Return as JSON with keys: visit_summary, alerts (array of strings), last_treatment, todays_prep`;

    const aiRes = await chatCompletion({
messages: [{ role: "user", content: contextPrompt }],
        tools: [{
          type: "function",
          function: {
            name: "patient_brief",
            description: "Return structured patient brief",
            parameters: {
              type: "object",
              properties: {
                visit_summary: { type: "string" },
                alerts: { type: "array", items: { type: "string" } },
                last_treatment: { type: "string" },
                todays_prep: { type: "string" }
              },
              required: ["visit_summary", "alerts", "last_treatment", "todays_prep"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "patient_brief" } }
      });

    

    const aiData = aiRes;
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    const brief = toolCall ? JSON.parse(toolCall.function.arguments) : {
      visit_summary: "Unable to generate brief",
      alerts: [],
      last_treatment: "N/A",
      todays_prep: "Standard preparation",
    };

    return new Response(JSON.stringify({ brief, patient_name: `${patient?.first_name} ${patient?.last_name}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-patient-brief error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});