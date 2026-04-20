import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { chatCompletion } from "../_shared/bedrock.ts";

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
    const sb = createClient(supabaseUrl, supabaseKey);    const callAI = async (systemPrompt: string, userPrompt: string) => {
      const res = await chatCompletion({
messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7
        });
      
      const json = res;
      return json.choices?.[0]?.message?.content || "";
    };

    const parseJSON = (raw: string, fallback: any) => {
      try {
        const match = raw.match(/\{[\s\S]*\}/);
        return match ? JSON.parse(match[0]) : fallback;
      } catch {
        return fallback;
      }
    };

    // ─── MODE: recommend_package ─────────────────────────────────────────
    if (mode === "recommend_package") {
      const { data: appointments } = await sb
        .from("appointments")
        .select("*, treatments(name, price)")
        .eq("patient_id", patient_id)
        .order("scheduled_at", { ascending: false })
        .limit(30);

      const { data: packages } = await sb
        .from("service_packages")
        .select("*, service_package_items(treatment_id, treatment_name, sessions_included, unit_price)")
        .eq("is_active", true);

      const { data: pastPurchases } = await sb
        .from("patient_package_purchases")
        .select("*, service_packages(name, package_type)")
        .eq("patient_id", patient_id);

      const system = `You are a medspa business intelligence AI specializing in treatment package optimization.

Analyze this patient's FULL treatment history and recommend the best service packages. Your goal is to maximize both patient value (savings, results) and clinic revenue (higher-margin packages, renewals).

Consider ALL of the following:
1. **Frequency analysis**: Treatments done ≥2 times indicate commitment — prioritize packages for these
2. **Synergistic treatments**: Identify complementary treatment pairs (e.g., Botox + HydraFacial, Laser + Chemical Peel, Microneedling + PRP) and suggest bundles
3. **Savings calculation**: Show exact dollar savings vs à-la-carte pricing
4. **Renewal opportunities**: If they've bought and completed/expired packages, suggest renewals with urgency
5. **Upsell ladder**: If they buy single-treatment packages, suggest multi-treatment bundles as next step
6. **Timing intelligence**: Note seasonal patterns (e.g., laser in fall/winter) and suggest pre-purchase
7. **Untapped potential**: Treatments they haven't tried that their profile suggests they'd benefit from

Return valid JSON:
{
  "recommendations": [{
    "package_name": string,
    "package_id": string|null,
    "reasoning": string (1-2 sentences, specific to this patient),
    "estimated_savings": string (dollar amount),
    "synergy_note": string|null (why treatments work together),
    "urgency": "high"|"medium"|"low",
    "renewal": boolean
  }],
  "insight": string (1-2 sentence executive summary of this patient's package opportunity)
}`;

      const result = await callAI(system, JSON.stringify({
        patient_appointments: appointments,
        available_packages: packages,
        past_purchases: pastPurchases,
      }));

      const parsed = parseJSON(result, { recommendations: [], insight: result });
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MODE: generate_notification ────────────────────────────────────
    if (mode === "generate_notification") {
      const { trigger_type, tone, patient_name, package_name, sessions_remaining, sessions_total, expires_in_days, provider_name, last_session_date, channel } = data;

      const system = `You are the communications assistant for a luxury medspa. Write warm, professional, personalized outbound messages on behalf of the spa.

Rules:
- Emails: subject under 60 chars, body under 150 words
- SMS: body under 160 characters, no subject needed
- ALWAYS mention the patient by first name
- ALWAYS mention the specific treatment/package by name
- If a provider name is given, mention them
- Include a specific call-to-action (book, call, visit)
- Never use generic language like "valued client"
- Match the tone exactly: ${tone}

Tone guide:
- warm: friendly, encouraging, personal
- professional: polished, informative, respectful
- urgent: time-sensitive, action-oriented, but not panicky
- celebratory: excited, congratulatory, milestone-focused
- educational: informative, helpful, positions spa as expert

Return valid JSON: { "subject": string (skip for SMS), "body": string }`;

      const result = await callAI(system, JSON.stringify({
        trigger_type,
        channel: channel || "email",
        patient_name,
        package_name,
        sessions_remaining,
        sessions_total,
        expires_in_days,
        provider_name,
        last_session_date,
      }));

      const parsed = parseJSON(result, { subject: "Your package update", body: result });
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MODE: preview_notification ─────────────────────────────────────
    if (mode === "preview_notification") {
      const { rule_id } = data || {};
      
      const { data: rule } = await sb
        .from("package_notification_rules")
        .select("*")
        .eq("id", rule_id)
        .single();

      if (!rule) throw new Error("Rule not found");

      // Use sample patient data for preview
      const sampleData = {
        trigger_type: rule.trigger_type,
        channel: rule.channel,
        tone: rule.tone,
        patient_name: "Sarah Johnson",
        package_name: "Glow Bundle — 6 Sessions",
        sessions_remaining: rule.threshold_sessions || 3,
        sessions_total: 6,
        expires_in_days: rule.timing_days || 14,
        provider_name: "Dr. Mitchell",
        last_session_date: "March 15, 2026",
      };

      const system = `You are the communications assistant for a luxury medspa. Generate a SAMPLE notification preview using the provided context. This is for admin preview — make it realistic and compelling.

Rules:
- Emails: subject under 60 chars, body under 150 words
- SMS: body under 160 characters
- Mention patient by name, treatment by name, provider if given
- Match tone: ${rule.tone}

Return valid JSON: { "subject": string, "body": string }`;

      const result = await callAI(system, JSON.stringify(sampleData));
      const parsed = parseJSON(result, { subject: "Preview", body: result });
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MODE: risk_score ───────────────────────────────────────────────
    if (mode === "risk_score") {
      const { data: activePurchases } = await sb
        .from("patient_package_purchases")
        .select("*, service_packages(name, session_count, price), patients(first_name, last_name)")
        .eq("status", "active");

      if (!activePurchases || activePurchases.length === 0) {
        return new Response(JSON.stringify({ at_risk: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get last session dates for each purchase
      const purchaseIds = activePurchases.map((p: any) => p.id);
      const { data: sessions } = await sb
        .from("patient_package_sessions")
        .select("purchase_id, redeemed_at")
        .in("purchase_id", purchaseIds)
        .order("redeemed_at", { ascending: false });

      const lastSessionMap: Record<string, string> = {};
      sessions?.forEach((s: any) => {
        if (!lastSessionMap[s.purchase_id]) lastSessionMap[s.purchase_id] = s.redeemed_at;
      });

      const enriched = activePurchases.map((p: any) => ({
        ...p,
        last_session_date: lastSessionMap[p.id] || null,
        days_since_last_session: lastSessionMap[p.id]
          ? Math.floor((Date.now() - new Date(lastSessionMap[p.id]).getTime()) / 86400000)
          : null,
        days_until_expiry: p.expires_at
          ? Math.floor((new Date(p.expires_at).getTime() - Date.now()) / 86400000)
          : null,
        utilization_pct: p.sessions_total > 0 ? Math.round((p.sessions_used / p.sessions_total) * 100) : 0,
      }));

      const system = `You are a retention analytics AI for a luxury medspa. Score each active package purchase for abandonment risk (0-100, higher = more at risk).

Scoring factors (weighted):
- **Low utilization + approaching expiry** (heaviest weight): <25% used with <30 days = critical
- **Inactivity gap**: >21 days since last session = concerning, >45 days = high risk
- **No sessions started**: Purchased but never used = very high risk
- **Payment vs usage**: High-value packages with low usage = higher risk (more revenue at stake)

For each at-risk purchase (score ≥ 40), suggest a SPECIFIC action:
- "Send re-engagement SMS" for mild risk
- "Personal call from provider" for moderate risk
- "Offer session extension" for high risk with good history
- "Schedule complimentary consultation" for never-started packages

Return valid JSON:
{
  "at_risk": [{
    "purchase_id": string,
    "patient_name": string,
    "package_name": string,
    "risk_score": number,
    "reason": string (1 sentence, specific),
    "suggested_action": string,
    "revenue_at_risk": string (dollar amount of deferred revenue)
  }]
}

Sort by risk_score descending. Only include purchases with risk_score ≥ 40.`;

      const result = await callAI(system, JSON.stringify({ purchases: enriched }));
      const parsed = parseJSON(result, { at_risk: [] });
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MODE: dashboard_insights ───────────────────────────────────────
    if (mode === "dashboard_insights") {
      const { data: allPurchases } = await sb
        .from("patient_package_purchases")
        .select("*, service_packages(name, price, package_type)")
        .order("created_at", { ascending: false })
        .limit(200);

      const { data: recentSessions } = await sb
        .from("patient_package_sessions")
        .select("*")
        .order("redeemed_at", { ascending: false })
        .limit(100);

      const system = `You are a business analytics AI for a luxury medspa. Generate a concise, actionable narrative summary of package performance.

Cover these areas:
1. **Portfolio health**: Active vs completed vs expired packages, completion rate
2. **Revenue snapshot**: Total deferred revenue (liability), revenue recognized trend
3. **Top performers**: Which packages sell best and have highest completion rates
4. **At-risk alert**: How many packages look at risk of expiring unused
5. **Growth opportunity**: Identify gaps — treatments with high appointment volume but no package option
6. **Actionable recommendation**: One specific thing the admin should do THIS WEEK

Return valid JSON:
{
  "narrative": string (2-3 paragraph executive summary),
  "kpi_highlights": [{ "label": string, "value": string, "trend": "up"|"down"|"stable" }],
  "weekly_action": string (one specific recommendation)
}`;

      const result = await callAI(system, JSON.stringify({
        purchases: allPurchases,
        recent_sessions: recentSessions,
        generated_at: new Date().toISOString(),
      }));

      const parsed = parseJSON(result, { narrative: result, kpi_highlights: [], weekly_action: "" });
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MODE: evaluate_notifications ───────────────────────────────────
    // Batch evaluates all active rules against all active purchases to find which notifications should fire
    if (mode === "evaluate_notifications") {
      const { data: rules } = await sb
        .from("package_notification_rules")
        .select("*")
        .eq("is_active", true);

      const { data: activePurchases } = await sb
        .from("patient_package_purchases")
        .select("*, service_packages(name), patients(first_name, last_name, email, phone)")
        .eq("status", "active");

      if (!rules?.length || !activePurchases?.length) {
        return new Response(JSON.stringify({ notifications_to_send: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get already-sent notifications to prevent duplicates
      const { data: sentLogs } = await sb
        .from("package_notification_log")
        .select("purchase_id, rule_id, sent_at")
        .order("sent_at", { ascending: false });

      const sentMap = new Map<string, string>();
      sentLogs?.forEach((log: any) => {
        const key = `${log.purchase_id}__${log.rule_id}`;
        if (!sentMap.has(key)) sentMap.set(key, log.sent_at);
      });

      // Get last session dates
      const { data: sessions } = await sb
        .from("patient_package_sessions")
        .select("purchase_id, redeemed_at")
        .order("redeemed_at", { ascending: false });

      const lastSessionMap: Record<string, string> = {};
      sessions?.forEach((s: any) => {
        if (!lastSessionMap[s.purchase_id]) lastSessionMap[s.purchase_id] = s.redeemed_at;
      });

      const notifications: any[] = [];

      for (const purchase of activePurchases) {
        const sessionsRemaining = purchase.sessions_total - purchase.sessions_used;
        const utilizationPct = purchase.sessions_total > 0 ? (purchase.sessions_used / purchase.sessions_total) * 100 : 0;
        const daysUntilExpiry = purchase.expires_at
          ? Math.floor((new Date(purchase.expires_at).getTime() - Date.now()) / 86400000)
          : null;
        const lastSession = lastSessionMap[purchase.id];
        const daysSinceLastSession = lastSession
          ? Math.floor((Date.now() - new Date(lastSession).getTime()) / 86400000)
          : null;

        for (const rule of rules!) {
          const alreadySent = sentMap.has(`${purchase.id}__${rule.id}`);
          if (alreadySent) continue;

          let shouldFire = false;

          switch (rule.trigger_type) {
            case "sessions_remaining":
              shouldFire = rule.threshold_sessions != null && sessionsRemaining <= rule.threshold_sessions && sessionsRemaining > 0;
              break;
            case "percentage_used":
              shouldFire = rule.threshold_sessions != null && utilizationPct >= rule.threshold_sessions;
              break;
            case "expiry_warning":
              shouldFire = rule.timing_days != null && daysUntilExpiry != null && daysUntilExpiry <= rule.timing_days && daysUntilExpiry > 0;
              break;
            case "inactivity":
              shouldFire = rule.timing_days != null && daysSinceLastSession != null && daysSinceLastSession >= rule.timing_days;
              break;
            case "post_purchase_nudge":
              shouldFire = rule.timing_days != null && purchase.sessions_used === 0 &&
                Math.floor((Date.now() - new Date(purchase.purchased_at).getTime()) / 86400000) >= rule.timing_days;
              break;
            case "low_supply":
              shouldFire = rule.threshold_sessions != null && sessionsRemaining <= rule.threshold_sessions && sessionsRemaining > 0;
              break;
            case "completion":
              // handled separately when status changes to completed
              break;
            case "winback":
              // handled for expired packages
              break;
          }

          if (shouldFire) {
            notifications.push({
              purchase_id: purchase.id,
              rule_id: rule.id,
              trigger_type: rule.trigger_type,
              channel: rule.channel,
              tone: rule.tone,
              patient_name: `${(purchase as any).patients?.first_name} ${(purchase as any).patients?.last_name}`,
              package_name: (purchase as any).service_packages?.name,
              sessions_remaining: sessionsRemaining,
              sessions_total: purchase.sessions_total,
              expires_in_days: daysUntilExpiry,
            });
          }
        }
      }

      return new Response(JSON.stringify({ notifications_to_send: notifications }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid mode" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});