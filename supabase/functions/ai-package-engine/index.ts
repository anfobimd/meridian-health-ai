import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { mode, patient_id, purchase_id, data } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not set");

    const callAI = async (systemPrompt: string, userPrompt: string) => {
      const res = await fetch("https://ai-gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
        }),
      });
      const json = await res.json();
      return json.choices?.[0]?.message?.content || "";
    };

    if (mode === "recommend_package") {
      // Get patient history
      const { data: appointments } = await sb
        .from("appointments")
        .select("*, treatments(name, price)")
        .eq("patient_id", patient_id)
        .order("scheduled_at", { ascending: false })
        .limit(20);

      const { data: packages } = await sb
        .from("service_packages")
        .select("*")
        .eq("is_active", true);

      const { data: pastPurchases } = await sb
        .from("patient_package_purchases")
        .select("*, service_packages(name)")
        .eq("patient_id", patient_id);

      const system = `You are a medspa business intelligence AI. Analyze this patient's treatment history and recommend the best service packages. Consider:
1. Treatments they've done most frequently
2. Synergistic treatments that complement their history (e.g. Botox + HydraFacial)
3. Savings they'd get from a package vs individual sessions
4. Packages they haven't tried that align with their profile
5. Past packages they've bought — suggest renewals if applicable

Return valid JSON: { "recommendations": [{ "package_name": string, "package_id": string|null, "reasoning": string, "estimated_savings": string, "synergy_note": string|null }], "insight": string }`;

      const result = await callAI(system, JSON.stringify({
        patient_appointments: appointments,
        available_packages: packages,
        past_purchases: pastPurchases,
      }));

      // Try to parse JSON from response
      let parsed;
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { recommendations: [], insight: result };
      } catch {
        parsed = { recommendations: [], insight: result };
      }

      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "generate_notification") {
      const { trigger_type, tone, patient_name, package_name, sessions_remaining, expires_in_days } = data;

      const system = `You are a patient engagement copywriter for a premium medspa. Generate a personalized notification.
Tone: ${tone}
Return valid JSON: { "subject": string, "body": string }
Keep subject under 60 chars. Body should be 2-3 sentences max. Be warm and professional.`;

      const result = await callAI(system, JSON.stringify({
        trigger_type,
        patient_name,
        package_name,
        sessions_remaining,
        expires_in_days,
      }));

      let parsed;
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { subject: "Your package update", body: result };
      } catch {
        parsed = { subject: "Your package update", body: result };
      }

      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "risk_score") {
      const { data: activePurchases } = await sb
        .from("patient_package_purchases")
        .select("*, service_packages(name, session_count), patients(first_name, last_name)")
        .eq("status", "active");

      const system = `You are a retention analytics AI. Score each active package purchase for abandonment risk (0-100, higher = more at risk).
Consider: sessions_used vs sessions_total, time elapsed vs expiry, purchase recency.
Return valid JSON: { "at_risk": [{ "purchase_id": string, "patient_name": string, "package_name": string, "risk_score": number, "reason": string, "suggested_action": string }] }`;

      const result = await callAI(system, JSON.stringify({ purchases: activePurchases }));

      let parsed;
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { at_risk: [] };
      } catch {
        parsed = { at_risk: [] };
      }

      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "dashboard_insights") {
      const { data: allPurchases } = await sb
        .from("patient_package_purchases")
        .select("*, service_packages(name, price)")
        .order("created_at", { ascending: false })
        .limit(100);

      const system = `You are a business analytics AI for a medspa. Generate a brief narrative summary of package performance.
Cover: total active packages, deferred revenue, completion rates, at-risk packages, and top-selling packages.
Return valid JSON: { "narrative": string, "kpi_highlights": [{ "label": string, "value": string }] }`;

      const result = await callAI(system, JSON.stringify({ purchases: allPurchases }));

      let parsed;
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { narrative: result, kpi_highlights: [] };
      } catch {
        parsed = { narrative: result, kpi_highlights: [] };
      }

      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid mode" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
