
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { patient_id, goals } = await req.json();
    if (!patient_id) throw new Error("patient_id required");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not set");

    // Fetch patient data in parallel
    const [patientRes, apptRes, treatmentsRes, packagesRes, hormoneRes] = await Promise.all([
      sb.from("patients").select("*").eq("id", patient_id).single(),
      sb.from("appointments")
        .select("*, treatments(name, price, category)")
        .eq("patient_id", patient_id)
        .order("scheduled_at", { ascending: false })
        .limit(25),
      sb.from("treatments").select("id, name, price, category, duration_minutes").eq("is_active", true),
      sb.from("service_packages")
        .select("id, name, price, package_type, session_count, service_package_items(treatment_name, sessions_included, unit_price)")
        .eq("is_active", true),
      sb.from("hormone_visits")
        .select("visit_date, intake_symptoms, intake_goals, intake_focus, ai_recommendation")
        .eq("patient_id", patient_id)
        .order("visit_date", { ascending: false })
        .limit(3),
    ]);

    const patient = patientRes.data;
    if (!patient) throw new Error("Patient not found");

    // Build treatment frequency map
    const treatmentFreq: Record<string, number> = {};
    (apptRes.data ?? []).forEach((a: any) => {
      const name = a.treatments?.name;
      if (name) treatmentFreq[name] = (treatmentFreq[name] || 0) + 1;
    });

    const systemPrompt = `You are a medspa clinical advisor AI. Analyze this patient's complete profile and recommend personalized treatments and packages.

Consider:
1. **Treatment history**: What they've done before, frequency, and patterns
2. **Patient goals**: Explicitly stated goals and inferred goals from treatment history
3. **Synergistic treatments**: Recommend complementary treatments (e.g., microneedling + PRP, Botox + filler)
4. **Protocol sequencing**: Suggest logical next steps based on what they've already done
5. **Seasonal awareness**: Current date is ${new Date().toISOString().slice(0, 10)}
6. **Budget sensitivity**: Match recommendations to their historical spending patterns
7. **Available packages**: If a package covers their needs, recommend it over à-la-carte

Return valid JSON:
{
  "recommendations": [
    {
      "treatment_name": string,
      "treatment_id": string|null (match from available treatments if possible),
      "category": string,
      "reasoning": string (2-3 sentences, personalized),
      "estimated_cost": string,
      "priority": "high"|"medium"|"low",
      "synergy_with": string|null (name of treatment it pairs well with),
      "package_suggestion": { "name": string, "package_id": string|null, "savings": string }|null
    }
  ],
  "summary": string (2-3 sentence personalized treatment plan narrative),
  "next_visit_suggestion": string (what they should book next and why)
}

Provide 3-6 recommendations sorted by priority. Be specific and actionable.`;

    const userPrompt = JSON.stringify({
      patient: { first_name: patient.first_name, gender: patient.gender, date_of_birth: patient.date_of_birth },
      treatment_history: treatmentFreq,
      recent_appointments: (apptRes.data ?? []).slice(0, 10).map((a: any) => ({
        treatment: a.treatments?.name,
        date: a.scheduled_at,
        status: a.status,
      })),
      patient_goals: goals || [],
      hormone_context: (hormoneRes.data ?? []).map((h: any) => ({
        date: h.visit_date,
        symptoms: h.intake_symptoms,
        goals: h.intake_goals,
        focus: h.intake_focus,
      })),
      available_treatments: (treatmentsRes.data ?? []).map((t: any) => ({
        id: t.id, name: t.name, price: t.price, category: t.category,
      })),
      available_packages: (packagesRes.data ?? []).map((p: any) => ({
        id: p.id, name: p.name, price: p.price, type: p.package_type,
        items: p.service_package_items,
      })),
    });

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);
      if (aiRes.status === 429) throw new Error("Rate limited — try again shortly");
      if (aiRes.status === 402) throw new Error("AI credits exhausted");
      throw new Error(`AI gateway error: ${aiRes.status}`);
    }

    const aiJson = await aiRes.json();
    const raw = aiJson.choices?.[0]?.message?.content || "";

    let parsed: any;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { recommendations: [], summary: raw };
    } catch {
      parsed = { recommendations: [], summary: raw };
    }

    // Save to DB
    await sb.from("ai_treatment_recommendations").insert({
      patient_id,
      recommendations: parsed,
      goals_input: goals || [],
      model_used: "google/gemini-3-flash-preview",
    });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
