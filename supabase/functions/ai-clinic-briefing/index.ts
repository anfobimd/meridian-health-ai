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
    const { mode, metrics } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    let systemPrompt = "";
    let userPrompt = "";
    let tools: any[] = [];
    let toolChoice: any = undefined;

    if (mode === "daily_brief") {
      // Enrich with live data
      const today = new Date().toISOString().slice(0, 10);
      const { count: waitlistCount } = await sb.from("appointment_waitlist").select("*", { count: "exact", head: true }).eq("is_fulfilled", false);
      const { count: overdueCharts } = await sb.from("chart_review_records").select("*", { count: "exact", head: true }).in("status", ["pending_ai", "pending_md"]);
      const { data: expiringContracts } = await sb.from("contracts").select("id, name, end_date").eq("status", "active").not("end_date", "is", null).lte("end_date", new Date(Date.now() + 30 * 86400000).toISOString()).limit(5);
      const { data: providerIntel } = await sb.from("ai_provider_intelligence").select("provider_id, correction_rate, coaching_status, providers(first_name, last_name)").in("coaching_status", ["monitoring", "probation"]).limit(5);

      systemPrompt = `You are the AI clinic operations assistant for Meridian Wellness EHR. Generate a concise daily briefing for the clinic admin. Be specific, actionable, and data-driven. Use the clinic data provided to identify priorities, risks, and opportunities. Flag compliance issues prominently.`;
      
      userPrompt = `Generate today's clinic briefing (${today}).

METRICS:
- Today's appointments: ${metrics?.today_appointments ?? 0} (${metrics?.completed ?? 0} completed, ${metrics?.waiting ?? 0} waiting)
- Unsigned notes: ${metrics?.unsigned_notes ?? 0}
- Pending chart reviews: ${overdueCharts ?? metrics?.pending_reviews ?? 0}
- Pending hormone approvals: ${metrics?.pending_approvals ?? 0}
- At-risk packages: ${metrics?.at_risk_packages ?? 0}
- Overdue invoices: ${metrics?.overdue_invoices ?? 0}
- Waitlist entries: ${waitlistCount ?? 0}
- MTD Revenue: $${metrics?.month_revenue ?? 0} (last month: $${metrics?.last_month_revenue ?? 0})
- Active providers: ${metrics?.active_providers ?? 0}
- Total patients: ${metrics?.total_patients ?? 0}

COMPLIANCE:
- Expiring contracts (30d): ${JSON.stringify(expiringContracts ?? [])}
- Providers needing coaching: ${JSON.stringify(providerIntel ?? [])}

Return a structured briefing with narrative, priorities, alerts, and revenue forecast.`;

      tools = [{
        type: "function",
        function: {
          name: "daily_briefing",
          description: "Structured daily clinic briefing",
          parameters: {
            type: "object",
            properties: {
              narrative: { type: "string", description: "2-3 sentence executive summary" },
              priorities: { type: "array", items: { type: "string" }, description: "Top 3-5 action items ranked by urgency" },
              alerts: { type: "array", items: { type: "string" }, description: "Compliance/security alerts as short badges" },
              revenue_forecast: { type: "object", properties: {
                predicted_eom: { type: "number", description: "Predicted end-of-month revenue" },
                confidence: { type: "string", enum: ["low", "medium", "high"] },
                trend: { type: "string", enum: ["growing", "flat", "declining"] },
                commentary: { type: "string", description: "One sentence on revenue trajectory" }
              }, required: ["predicted_eom", "confidence", "trend", "commentary"] },
              provider_flags: { type: "array", items: { type: "object", properties: {
                name: { type: "string" },
                issue: { type: "string" },
                action: { type: "string" }
              }, required: ["name", "issue", "action"] }, description: "Providers needing attention" }
            },
            required: ["narrative", "priorities", "alerts", "revenue_forecast"]
          }
        }
      }];
      toolChoice = { type: "function", function: { name: "daily_briefing" } };

    } else if (mode === "action_items") {
      // Fetch action items from multiple sources
      const { data: overdueCharts } = await sb.from("chart_review_records")
        .select("id, ai_risk_tier, created_at, patients(first_name, last_name), providers(first_name, last_name)")
        .in("status", ["pending_ai", "pending_md"])
        .order("ai_priority_score", { ascending: false }).limit(10);

      const { data: waitlistMatches } = await sb.from("appointment_waitlist")
        .select("id, priority_score, preferred_date, patients(first_name, last_name), treatments(name)")
        .eq("is_fulfilled", false)
        .order("priority_score", { ascending: false }).limit(10);

      const { data: unsignedNotes } = await sb.from("clinical_notes")
        .select("id, created_at, patients(first_name, last_name)")
        .eq("status", "draft").order("created_at", { ascending: true }).limit(10);

      const { data: pendingApprovals } = await sb.from("hormone_visits")
        .select("id, visit_date, patients(first_name, last_name)")
        .eq("approval_status", "pending").limit(10);

      systemPrompt = `You are the AI operations assistant. Analyze clinic action items and rank them by urgency and business impact. Each item should have a clear action verb and destination.`;
      
      userPrompt = `Rank and categorize these action items:
- Overdue chart reviews: ${JSON.stringify(overdueCharts ?? [])}
- Waitlist entries: ${JSON.stringify(waitlistMatches ?? [])}
- Unsigned notes: ${JSON.stringify(unsignedNotes ?? [])}
- Pending approvals: ${JSON.stringify(pendingApprovals ?? [])}`;

      tools = [{
        type: "function",
        function: {
          name: "action_items",
          description: "Prioritized action items list",
          parameters: {
            type: "object",
            properties: {
              items: { type: "array", items: { type: "object", properties: {
                title: { type: "string" },
                urgency: { type: "string", enum: ["critical", "high", "medium", "low"] },
                category: { type: "string", enum: ["chart_review", "waitlist", "unsigned_note", "approval", "compliance", "financial"] },
                action_label: { type: "string", description: "Button label e.g. Review, Sign, Approve" },
                route: { type: "string", description: "App route to navigate to" },
                detail: { type: "string", description: "One line context" }
              }, required: ["title", "urgency", "category", "action_label", "route", "detail"] } },
              summary: { type: "string", description: "One sentence summary of action item state" }
            },
            required: ["items", "summary"]
          }
        }
      }];
      toolChoice = { type: "function", function: { name: "action_items" } };

    } else if (mode === "revenue_forecast") {
      // Get revenue data for forecasting
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data: mtdInvoices } = await sb.from("invoices").select("total, created_at").eq("status", "paid").gte("created_at", monthStart);
      
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();
      const { data: lastMonthInvoices } = await sb.from("invoices").select("total").eq("status", "paid").gte("created_at", lastMonthStart).lte("created_at", lastMonthEnd);

      const { count: upcomingApts } = await sb.from("appointments").select("*", { count: "exact", head: true }).eq("status", "booked").gte("scheduled_at", now.toISOString());

      const mtdTotal = (mtdInvoices ?? []).reduce((s: number, i: any) => s + (i.total || 0), 0);
      const lastMonthTotal = (lastMonthInvoices ?? []).reduce((s: number, i: any) => s + (i.total || 0), 0);
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

      systemPrompt = `You are a financial analyst for a wellness clinic. Predict end-of-month revenue based on current trajectory, historical data, and upcoming appointments.`;
      
      userPrompt = `Forecast revenue:
- Day ${dayOfMonth} of ${daysInMonth}
- MTD revenue: $${mtdTotal}
- Last month total: $${lastMonthTotal}
- Upcoming booked appointments: ${upcomingApts ?? 0}
- Daily run rate: $${dayOfMonth > 0 ? Math.round(mtdTotal / dayOfMonth) : 0}`;

      tools = [{
        type: "function",
        function: {
          name: "revenue_forecast",
          description: "End-of-month revenue prediction",
          parameters: {
            type: "object",
            properties: {
              predicted_eom: { type: "number" },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
              trend: { type: "string", enum: ["growing", "flat", "declining"] },
              commentary: { type: "string" },
              risk_factors: { type: "array", items: { type: "string" } },
              opportunities: { type: "array", items: { type: "string" } }
            },
            required: ["predicted_eom", "confidence", "trend", "commentary"]
          }
        }
      }];
      toolChoice = { type: "function", function: { name: "revenue_forecast" } };

    } else if (mode === "front_desk_actions") {
      // Front desk-specific proactive alerts
      const today = new Date().toISOString().slice(0, 10);
      const todayStart = `${today}T00:00:00.000Z`;
      const todayEnd = `${today}T23:59:59.999Z`;

      // Get today's appointments with patient data
      const { data: todayApts } = await sb.from("appointments")
        .select("id, status, scheduled_at, checked_in_at, patient_id, patients(first_name, last_name, no_show_count), treatments(name)")
        .gte("scheduled_at", todayStart).lte("scheduled_at", todayEnd)
        .order("scheduled_at");

      // Get waitlist entries
      const { data: waitlist } = await sb.from("appointment_waitlist")
        .select("id, patients(first_name, last_name), treatments(name), preferred_date")
        .eq("is_fulfilled", false).limit(5);

      // Get unsigned notes count
      const { count: unsignedCount } = await sb.from("clinical_notes")
        .select("*", { count: "exact", head: true }).eq("status", "draft");

      systemPrompt = `You are the AI front desk assistant for Meridian Wellness clinic. Analyze today's appointment queue and generate actionable alerts for front desk staff. Focus on: patient wait times, check-in reminders, no-show risks, waitlist opportunities, and consent needs. Be concise and action-oriented.`;

      userPrompt = `Generate front desk action items for today (${today}).

TODAY'S APPOINTMENTS: ${JSON.stringify(todayApts ?? [])}
WAITLIST ENTRIES: ${JSON.stringify(waitlist ?? [])}
UNSIGNED NOTES: ${unsignedCount ?? 0}

Identify:
1. Patients arriving in next 2 hours who need check-in preparation
2. Patients with high no-show history (no_show_count >= 2) — suggest confirmation call
3. Long-waiting patients (checked_in but not roomed)
4. Waitlist matches if any cancellations today
5. Any operational alerts`;

      tools = [{
        type: "function",
        function: {
          name: "front_desk_actions",
          description: "Proactive front desk action items",
          parameters: {
            type: "object",
            properties: {
              items: { type: "array", items: { type: "object", properties: {
                title: { type: "string" },
                urgency: { type: "string", enum: ["critical", "high", "medium", "low"] },
                category: { type: "string", enum: ["check_in", "wait_time", "no_show_risk", "waitlist", "consent", "general"] },
                action_label: { type: "string" },
                detail: { type: "string" }
              }, required: ["title", "urgency", "category", "action_label", "detail"] } },
              summary: { type: "string" }
            },
            required: ["items", "summary"]
          }
        }
      }];
      toolChoice = { type: "function", function: { name: "front_desk_actions" } };

    } else {
      return new Response(JSON.stringify({ error: `Unknown mode: ${mode}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await chatCompletion({
messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools,
        tool_choice: toolChoice
      });

    

    const aiData = aiResponse;
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback to content
    const content = aiData.choices?.[0]?.message?.content || "";
    return new Response(JSON.stringify({ narrative: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("ai-clinic-briefing error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});