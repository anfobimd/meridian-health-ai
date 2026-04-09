import { corsHeaders } from "@supabase/supabase-js/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const LOVABLE_API_URL = "https://api.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { section, template_name, template_category, patient_name, patient_age, patient_gender, chief_complaint, field_responses, allergies, medications } = await req.json();

    if (!section) {
      return new Response(JSON.stringify({ error: "section is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build context from field responses
    const fieldSummary = Object.entries(field_responses || {})
      .filter(([_, v]) => v && String(v).trim())
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
      .join("\n");

    const systemPrompt = `You are a clinical documentation AI assistant for a medical spa and wellness EHR system called Meridian Wellness.
You generate professional SOAP note sections based on clinical template data and patient information.
Write in concise clinical language. Be specific using the data provided. Do not fabricate data not provided.
Use standard medical abbreviations where appropriate.`;

    const sectionInstructions: Record<string, string> = {
      subjective: "Write the SUBJECTIVE section. Include chief complaint, patient-reported symptoms, history, and relevant context from the template fields. Write in narrative form.",
      objective: "Write the OBJECTIVE section. Include vitals, examination findings, lab values, measurements, and template field data. Use structured clinical format.",
      assessment: "Write the ASSESSMENT section. Synthesize the subjective and objective findings into clinical impressions. Include relevant diagnoses and clinical status.",
      plan: "Write the PLAN section as a numbered list. Include treatment decisions, medication changes, lab orders, follow-up scheduling, and patient education based on the template data.",
    };

    const userPrompt = `Generate the ${section.toUpperCase()} section for this clinical encounter:

Template: ${template_name} (${template_category})
Patient: ${patient_name || "Unknown"}${patient_age ? `, ${patient_age}y` : ""}${patient_gender ? `, ${patient_gender}` : ""}
Chief Complaint: ${chief_complaint || "Not specified"}
${allergies?.length ? `Allergies: ${allergies.join(", ")}` : ""}
${medications?.length ? `Current Medications: ${medications.join(", ")}` : ""}

Clinical Data from Template Fields:
${fieldSummary || "No field data entered yet"}

${sectionInstructions[section] || "Write a professional clinical note section."}

Return ONLY the note text, no labels or headers.`;

    const response = await fetch(LOVABLE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
