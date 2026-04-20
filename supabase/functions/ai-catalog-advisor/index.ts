import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { chatCompletion } from "../_shared/bedrock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mode, data } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    let systemPrompt = "";
    let userPrompt = "";
    let tools: any[] = [];
    let toolChoice: any = undefined;

    // ─── TREATMENTS MODES ───
    if (mode === "template_match") {
      const { treatment_name, category, requires_gfe, requires_md_review } = data || {};
      const { data: templates } = await sb.from("chart_templates").select("id, name, category, description, keywords").eq("is_active", true).limit(20);
      
      systemPrompt = "You are a clinical workflow expert. Given a new treatment being added to a wellness/aesthetics clinic, recommend the best chart template and whether GFE/MD review should be required.";
      userPrompt = `New treatment: "${treatment_name}" (category: ${category || "unknown"})
Current GFE: ${requires_gfe}, MD Review: ${requires_md_review}
Available chart templates: ${JSON.stringify(templates ?? [])}

Recommend the best template match and whether GFE/MD review flags should be set.`;

      tools = [{ type: "function", function: { name: "template_recommendation", description: "Template and compliance recommendation for a treatment", parameters: { type: "object", properties: {
        recommended_template_id: { type: "string", description: "ID of best matching template" },
        recommended_template_name: { type: "string" },
        match_confidence: { type: "string", enum: ["high", "medium", "low"] },
        match_reason: { type: "string" },
        should_require_gfe: { type: "boolean" },
        gfe_reason: { type: "string" },
        should_require_md_review: { type: "boolean" },
        md_review_reason: { type: "string" },
      }, required: ["recommended_template_name", "match_confidence", "match_reason", "should_require_gfe", "should_require_md_review"] } } }];
      toolChoice = { type: "function", function: { name: "template_recommendation" } };

    } else if (mode === "deactivation_impact") {
      const { treatment_id, treatment_name } = data || {};
      const thirtyDays = new Date(Date.now() + 30 * 86400000).toISOString();
      const { data: upcoming } = await sb.from("appointments").select("id, scheduled_at, patients(first_name, last_name)").eq("treatment_id", treatment_id).eq("status", "booked").lte("scheduled_at", thirtyDays);
      const { data: packages } = await sb.from("patient_package_purchases").select("id, sessions_used, sessions_total, patients(first_name, last_name), service_packages(name)").eq("status", "active");
      
      systemPrompt = "You are a clinic operations assistant. Analyze the impact of deactivating a treatment.";
      userPrompt = `Treatment "${treatment_name}" is being deactivated.
Upcoming appointments (30d): ${JSON.stringify(upcoming ?? [])}
Active package purchases that may be affected: ${packages?.length ?? 0}
Analyze the impact and recommend actions.`;

      tools = [{ type: "function", function: { name: "deactivation_impact", description: "Impact analysis of treatment deactivation", parameters: { type: "object", properties: {
        affected_appointments: { type: "number" },
        affected_packages: { type: "number" },
        risk_level: { type: "string", enum: ["safe", "caution", "warning", "critical"] },
        summary: { type: "string" },
        recommended_actions: { type: "array", items: { type: "string" } },
      }, required: ["affected_appointments", "risk_level", "summary", "recommended_actions"] } } }];
      toolChoice = { type: "function", function: { name: "deactivation_impact" } };

    } else if (mode === "revenue_impact") {
      const { treatment_name, old_price, new_price, old_member_price, new_member_price } = data || {};
      const { data: recentApts } = await sb.from("appointments").select("id").eq("status", "completed").limit(100);
      
      systemPrompt = "You are a financial analyst for a wellness clinic. Analyze the revenue impact of a price change.";
      userPrompt = `Price change for "${treatment_name}":
Standard: $${old_price} → $${new_price} (${old_price > 0 ? Math.round(((new_price - old_price) / old_price) * 100) : 0}% change)
Member: $${old_member_price} → $${new_member_price}
Recent completed appointments (proxy for demand): ${recentApts?.length ?? 0}

Analyze revenue impact and flag if below-cost risk.`;

      tools = [{ type: "function", function: { name: "revenue_impact", description: "Revenue impact analysis of price change", parameters: { type: "object", properties: {
        estimated_monthly_impact: { type: "string" },
        risk_level: { type: "string", enum: ["positive", "neutral", "negative", "critical"] },
        below_cost_warning: { type: "boolean" },
        commentary: { type: "string" },
        recommendation: { type: "string" },
      }, required: ["estimated_monthly_impact", "risk_level", "below_cost_warning", "commentary"] } } }];
      toolChoice = { type: "function", function: { name: "revenue_impact" } };

    // ─── MEDICATIONS MODES ───
    } else if (mode === "dosing_suggest") {
      const { medication_name, generic_name, category, route } = data || {};
      
      systemPrompt = "You are a clinical pharmacology expert for a wellness/aesthetics clinic. Provide evidence-based dosing guidance. Include credential restrictions if applicable (e.g., only MDs can prescribe controlled substances). This is for informational purposes only.";
      userPrompt = `New medication: "${medication_name}" (generic: ${generic_name || "N/A"})
Category: ${category}, Route: ${route}
Provide dosing recommendation, monitoring requirements, and credential restrictions.`;

      tools = [{ type: "function", function: { name: "dosing_recommendation", description: "Dosing and monitoring recommendation", parameters: { type: "object", properties: {
        suggested_dose: { type: "string" },
        suggested_unit: { type: "string" },
        frequency: { type: "string" },
        dose_range: { type: "string", description: "Min-max range" },
        monitoring_requirements: { type: "array", items: { type: "object", properties: { test: { type: "string" }, frequency: { type: "string" }, reason: { type: "string" } }, required: ["test", "frequency"] } },
        credential_restrictions: { type: "array", items: { type: "string" } },
        warnings: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
      }, required: ["suggested_dose", "suggested_unit", "monitoring_requirements"] } } }];
      toolChoice = { type: "function", function: { name: "dosing_recommendation" } };

    } else if (mode === "interaction_check") {
      const { medication_name, generic_name } = data || {};
      const { data: existingMeds } = await sb.from("medications").select("name, generic_name, category, route").eq("is_active", true).limit(100);
      
      systemPrompt = "You are a clinical pharmacist. Check for drug interactions between a new medication and the existing formulary. This is for informational/educational purposes only.";
      userPrompt = `New medication: "${medication_name}" (generic: ${generic_name || "N/A"})
Existing formulary: ${JSON.stringify(existingMeds ?? [])}
Identify potential interactions, severity, and clinical significance.`;

      tools = [{ type: "function", function: { name: "interaction_report", description: "Drug interaction check results", parameters: { type: "object", properties: {
        interactions: { type: "array", items: { type: "object", properties: {
          medication: { type: "string" },
          severity: { type: "string", enum: ["minor", "moderate", "major", "contraindicated"] },
          description: { type: "string" },
          clinical_action: { type: "string" },
        }, required: ["medication", "severity", "description"] } },
        overall_risk: { type: "string", enum: ["safe", "caution", "warning"] },
        summary: { type: "string" },
      }, required: ["interactions", "overall_risk", "summary"] } } }];
      toolChoice = { type: "function", function: { name: "interaction_report" } };

    // ─── CLINIC HOURS MODES ───
    } else if (mode === "hours_analysis") {
      const { data: hours } = await sb.from("clinic_hours").select("*").order("day_of_week");
      const { data: appointments } = await sb.from("appointments").select("scheduled_at, status, duration_minutes").gte("scheduled_at", new Date(Date.now() - 90 * 86400000).toISOString()).limit(1000);
      const { data: providers } = await sb.from("providers").select("id").eq("is_active", true);
      
      systemPrompt = "You are a clinic operations analyst. Analyze clinic hours vs. appointment demand patterns to find underutilized windows, coverage gaps, and closure bottlenecks.";
      userPrompt = `Clinic hours: ${JSON.stringify(hours ?? [])}
Last 90 days appointments (${appointments?.length ?? 0} total): Analyze by day-of-week and time distribution.
Active providers: ${providers?.length ?? 0}

Identify: 1) Underutilized time windows, 2) Coverage gaps (demand > availability), 3) Closure bottleneck warnings.`;

      tools = [{ type: "function", function: { name: "hours_analysis", description: "Clinic hours optimization analysis", parameters: { type: "object", properties: {
        underutilized_windows: { type: "array", items: { type: "object", properties: {
          day: { type: "string" }, time_range: { type: "string" }, utilization_pct: { type: "number" }, recommendation: { type: "string" }
        }, required: ["day", "time_range", "utilization_pct", "recommendation"] } },
        coverage_gaps: { type: "array", items: { type: "object", properties: {
          day: { type: "string" }, time_range: { type: "string" }, demand_level: { type: "string" }, recommendation: { type: "string" }
        }, required: ["day", "demand_level", "recommendation"] } },
        closure_warnings: { type: "array", items: { type: "string" } },
        summary: { type: "string" },
        overall_score: { type: "number", description: "0-100 hours optimization score" },
      }, required: ["underutilized_windows", "coverage_gaps", "summary", "overall_score"] } } }];
      toolChoice = { type: "function", function: { name: "hours_analysis" } };

    // ─── PACKAGES MODES ───
    } else if (mode === "bundle_recommend") {
      const { data: treatments } = await sb.from("treatments").select("id, name, category, price, duration_minutes").eq("is_active", true);
      const { data: recentApts } = await sb.from("appointments").select("treatment_id, patient_id").eq("status", "completed").gte("scheduled_at", new Date(Date.now() - 90 * 86400000).toISOString()).limit(500);
      const { data: existingPkgs } = await sb.from("service_packages").select("name, session_count, price, category").eq("is_active", true);
      
      systemPrompt = "You are a business strategist for a wellness clinic. Analyze booking patterns to recommend new package bundles that would increase revenue and patient retention.";
      userPrompt = `Active treatments: ${JSON.stringify(treatments ?? [])}
Recent bookings (90d): ${recentApts?.length ?? 0} appointments
Existing packages: ${JSON.stringify(existingPkgs ?? [])}

Recommend 2-3 new package bundles based on booking patterns, with pricing, session counts, and margin analysis.`;

      tools = [{ type: "function", function: { name: "bundle_recommendations", description: "AI-recommended package bundles", parameters: { type: "object", properties: {
        recommendations: { type: "array", items: { type: "object", properties: {
          name: { type: "string" }, description: { type: "string" },
          treatments_included: { type: "array", items: { type: "string" } },
          session_count: { type: "number" }, suggested_price: { type: "number" },
          individual_value: { type: "number" }, savings_pct: { type: "number" },
          margin_estimate: { type: "string" }, rationale: { type: "string" },
        }, required: ["name", "session_count", "suggested_price", "rationale"] } },
        market_insight: { type: "string" },
      }, required: ["recommendations", "market_insight"] } } }];
      toolChoice = { type: "function", function: { name: "bundle_recommendations" } };

    } else if (mode === "expiration_alerts") {
      const { data: atRisk } = await sb.from("patient_package_purchases")
        .select("id, sessions_used, sessions_total, expires_at, price_paid, patients(first_name, last_name, email, phone), service_packages(name)")
        .eq("status", "active").not("expires_at", "is", null)
        .lte("expires_at", new Date(Date.now() + 60 * 86400000).toISOString())
        .order("expires_at", { ascending: true }).limit(20);
      
      systemPrompt = "You are a patient engagement specialist. Generate personalized outreach messages for patients with expiring packages to encourage redemption.";
      userPrompt = `Patients with expiring packages: ${JSON.stringify(atRisk ?? [])}

For each, generate a brief personalized outreach message and recommended action.`;

      tools = [{ type: "function", function: { name: "expiration_alerts", description: "Personalized expiration alerts", parameters: { type: "object", properties: {
        alerts: { type: "array", items: { type: "object", properties: {
          patient_name: { type: "string" }, package_name: { type: "string" },
          days_remaining: { type: "number" }, sessions_remaining: { type: "number" },
          revenue_at_risk: { type: "number" }, urgency: { type: "string", enum: ["low", "medium", "high", "critical"] },
          message_draft: { type: "string" }, recommended_action: { type: "string" },
        }, required: ["patient_name", "package_name", "urgency", "message_draft", "recommended_action"] } },
        summary: { type: "string" },
        total_revenue_at_risk: { type: "number" },
      }, required: ["alerts", "summary", "total_revenue_at_risk"] } } }];
      toolChoice = { type: "function", function: { name: "expiration_alerts" } };

    // ─── CLEARANCE MODES ───
    } else if (mode === "clearance_risk") {
      const { data: providers } = await sb.from("providers").select("id, first_name, last_name, credentials, specialties, procedure_clearances").eq("is_active", true);
      const { data: intelligence } = await sb.from("ai_provider_intelligence").select("provider_id, total_charts, correction_rate, coaching_status");
      
      systemPrompt = "You are a clinical compliance officer. Analyze provider clearances for high-risk procedures and flag credentialing concerns.";
      userPrompt = `Providers: ${JSON.stringify(providers ?? [])}
Provider intelligence (chart history): ${JSON.stringify(intelligence ?? [])}

Flag: 1) Providers with high-risk clearances but <30 charts, 2) Credentialing readiness issues, 3) Supervised session count concerns.`;

      tools = [{ type: "function", function: { name: "clearance_analysis", description: "Provider clearance risk analysis", parameters: { type: "object", properties: {
        flags: { type: "array", items: { type: "object", properties: {
          provider_name: { type: "string" }, issue: { type: "string" },
          risk_level: { type: "string", enum: ["low", "medium", "high", "critical"] },
          recommendation: { type: "string" },
        }, required: ["provider_name", "issue", "risk_level", "recommendation"] } },
        summary: { type: "string" },
      }, required: ["flags", "summary"] } } }];
      toolChoice = { type: "function", function: { name: "clearance_analysis" } };

    } else {
      return new Response(JSON.stringify({ error: `Unknown mode: ${mode}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await chatCompletion({
messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        tools, tool_choice: toolChoice
      });

    

    const aiData = aiResponse;
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      return new Response(JSON.stringify(JSON.parse(toolCall.function.arguments)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = aiData.choices?.[0]?.message?.content || "";
    return new Response(JSON.stringify({ summary: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("ai-catalog-advisor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});