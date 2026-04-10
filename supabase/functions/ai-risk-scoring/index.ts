import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is staff
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all active patients
    const { data: patients, error: pErr } = await admin
      .from("patients")
      .select("id, first_name, last_name, email, created_at, is_active")
      .eq("is_active", true);

    if (pErr) throw pErr;
    if (!patients || patients.length === 0) {
      return new Response(JSON.stringify({ scored: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Get appointments for all patients in last 90 days
    const { data: recentApts } = await admin
      .from("appointments")
      .select("patient_id, scheduled_at, status")
      .gte("scheduled_at", ninetyDaysAgo)
      .in("status", ["booked", "checked_in", "in_progress", "completed"]);

    // Get last appointment per patient (all time)
    const { data: allApts } = await admin
      .from("appointments")
      .select("patient_id, scheduled_at")
      .in("status", ["completed", "checked_in", "in_progress"])
      .order("scheduled_at", { ascending: false });

    // Get active packages
    const { data: packages } = await admin
      .from("patient_package_purchases")
      .select("patient_id, status, sessions_used, sessions_total, expires_at")
      .eq("status", "active");

    // Get active hormone visits
    const { data: hormoneVisits } = await admin
      .from("hormone_visits")
      .select("patient_id, visit_date")
      .order("visit_date", { ascending: false });

    // Build lookup maps
    const recentAptMap = new Map<string, number>();
    (recentApts ?? []).forEach((a) => {
      recentAptMap.set(a.patient_id, (recentAptMap.get(a.patient_id) ?? 0) + 1);
    });

    const lastVisitMap = new Map<string, string>();
    (allApts ?? []).forEach((a) => {
      if (!lastVisitMap.has(a.patient_id)) {
        lastVisitMap.set(a.patient_id, a.scheduled_at);
      }
    });
    // Also check hormone visits
    (hormoneVisits ?? []).forEach((h) => {
      const existing = lastVisitMap.get(h.patient_id);
      if (!existing || h.visit_date > existing) {
        lastVisitMap.set(h.patient_id, h.visit_date);
      }
    });

    const pkgMap = new Map<string, boolean>();
    (packages ?? []).forEach((p) => {
      pkgMap.set(p.patient_id, true);
    });

    // Score each patient
    const scores = patients.map((p) => {
      const visitCount90d = recentAptMap.get(p.id) ?? 0;
      const lastVisit = lastVisitMap.get(p.id);
      const hasActivePkg = pkgMap.get(p.id) ?? false;

      let daysSince = 999;
      let lastVisitDate: string | null = null;
      if (lastVisit) {
        daysSince = Math.floor((now.getTime() - new Date(lastVisit).getTime()) / (1000 * 60 * 60 * 24));
        lastVisitDate = new Date(lastVisit).toISOString().split("T")[0];
      }

      // Deterministic scoring factors
      const factors: Record<string, number> = {};

      // Visit recency (0-35 points)
      if (daysSince > 180) factors.recency = 35;
      else if (daysSince > 120) factors.recency = 28;
      else if (daysSince > 90) factors.recency = 20;
      else if (daysSince > 60) factors.recency = 12;
      else if (daysSince > 30) factors.recency = 5;
      else factors.recency = 0;

      // Visit frequency in 90d (0-30 points, fewer = higher risk)
      if (visitCount90d === 0) factors.frequency = 30;
      else if (visitCount90d === 1) factors.frequency = 20;
      else if (visitCount90d === 2) factors.frequency = 10;
      else factors.frequency = 0;

      // Package status (0-20 points)
      factors.package = hasActivePkg ? 0 : 20;

      // Patient tenure — new patients who haven't returned are higher risk (0-15)
      const tenureDays = Math.floor((now.getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24));
      if (tenureDays < 90 && visitCount90d <= 1) factors.tenure = 15;
      else if (tenureDays < 180 && visitCount90d <= 1) factors.tenure = 10;
      else factors.tenure = 0;

      const riskScore = Math.min(100, Object.values(factors).reduce((a, b) => a + b, 0));

      let riskTier: string;
      if (riskScore >= 75) riskTier = "critical";
      else if (riskScore >= 50) riskTier = "high";
      else if (riskScore >= 25) riskTier = "medium";
      else riskTier = "low";

      return {
        patient_id: p.id,
        risk_score: riskScore,
        risk_tier: riskTier,
        factors,
        last_visit_date: lastVisitDate,
        days_since_visit: daysSince === 999 ? null : daysSince,
        visit_count_90d: visitCount90d,
        has_active_package: hasActivePkg,
        scored_at: now.toISOString(),
      };
    });

    // Now use AI to generate summaries for the top 20 at-risk patients
    const topRisk = scores
      .filter((s) => s.risk_tier !== "low")
      .sort((a, b) => b.risk_score - a.risk_score)
      .slice(0, 20);

    if (topRisk.length > 0) {
      const patientNames = new Map(patients.map((p) => [p.id, `${p.first_name} ${p.last_name}`]));

      const prompt = `You are a patient retention analyst for an aesthetic medicine clinic. Given these at-risk patients, generate a brief 1-2 sentence actionable insight for each.

Patients:
${topRisk.map((s) => {
  const name = patientNames.get(s.patient_id) ?? "Unknown";
  return `- ${name}: score=${s.risk_score}, tier=${s.risk_tier}, days_since_visit=${s.days_since_visit ?? "never"}, visits_90d=${s.visit_count_90d}, has_package=${s.has_active_package}, factors=${JSON.stringify(s.factors)}`;
}).join("\n")}

Respond with valid JSON array of objects: [{"patient_id": "...", "summary": "..."}]
Only include the JSON array, no other text.`;

      try {
        const aiResp = await fetch("https://api.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
          }),
        });

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const content = aiData.choices?.[0]?.message?.content ?? "";
          // Extract JSON from response
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const summaries: Array<{ patient_id: string; summary: string }> = JSON.parse(jsonMatch[0]);
            summaries.forEach((s) => {
              const score = topRisk.find((r) => r.patient_id === s.patient_id);
              if (score) score.ai_summary = s.summary;
            });
          }
        }
      } catch (aiErr) {
        console.error("AI summary generation failed (non-fatal):", aiErr);
      }
    }

    // Upsert all scores
    const { error: upsertErr } = await admin.from("patient_churn_scores").upsert(
      scores.map((s) => ({
        patient_id: s.patient_id,
        risk_score: s.risk_score,
        risk_tier: s.risk_tier,
        factors: s.factors,
        ai_summary: (s as any).ai_summary ?? null,
        last_visit_date: s.last_visit_date,
        days_since_visit: s.days_since_visit,
        visit_count_90d: s.visit_count_90d,
        has_active_package: s.has_active_package,
        scored_at: s.scored_at,
      })),
      { onConflict: "patient_id" }
    );

    if (upsertErr) throw upsertErr;

    const summary = {
      scored: scores.length,
      critical: scores.filter((s) => s.risk_tier === "critical").length,
      high: scores.filter((s) => s.risk_tier === "high").length,
      medium: scores.filter((s) => s.risk_tier === "medium").length,
      low: scores.filter((s) => s.risk_tier === "low").length,
    };

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Risk scoring error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
