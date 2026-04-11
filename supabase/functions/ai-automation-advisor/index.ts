import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);
    const apiKey = Deno.env.get("LOVABLE_API_KEY");

    async function callAI(systemPrompt: string, userPrompt: string, tools?: any[], toolChoice?: any) {
      const payload: any = {
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      };
      if (tools) { payload.tools = tools; payload.tool_choice = toolChoice; }
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { console.error("AI error:", res.status); return null; }
      const json = await res.json();
      if (tools) {
        try { return JSON.parse(json.choices[0].message.tool_calls[0].function.arguments); }
        catch { return null; }
      }
      return json.choices?.[0]?.message?.content || "";
    }

    const resultTool = [{
      type: "function",
      function: {
        name: "automation_result",
        description: "Return automation analysis",
        parameters: {
          type: "object",
          properties: {
            suggestions: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, trigger: { type: "string" }, action: { type: "string" }, priority: { type: "string", enum: ["high", "medium", "low"] } }, required: ["title", "description", "priority"] } },
            fatigue_alerts: { type: "array", items: { type: "object", properties: { rules: { type: "array", items: { type: "string" } }, overlap_window_minutes: { type: "number" }, recommendation: { type: "string" } }, required: ["rules", "recommendation"] } },
            optimizations: { type: "array", items: { type: "object", properties: { rule_name: { type: "string" }, current_issue: { type: "string" }, suggestion: { type: "string" } }, required: ["rule_name", "current_issue", "suggestion"] } },
            narrative: { type: "string" },
          },
          required: ["narrative"],
        },
      },
    }];

    // ── MODE: rule_optimize ──
    if (body.mode === "rule_optimize") {
      const { data: rules } = await sb.from("automation_rules").select("*").order("created_at");

      const result = await callAI(
        "You are an automation optimization AI for a medical spa. Analyze existing automation rules for inefficiencies, gaps, and improvement opportunities. Consider: trigger coverage, timing optimization, success rates, and redundancy.",
        JSON.stringify({ rules, total_rules: rules?.length }),
        resultTool,
        { type: "function", function: { name: "automation_result" } }
      );

      return new Response(JSON.stringify(result || { narrative: "Unable to analyze rules.", optimizations: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── MODE: fatigue_detect ──
    if (body.mode === "fatigue_detect") {
      const { data: rules } = await sb.from("automation_rules").select("*").eq("is_active", true).order("trigger_event");

      // Detect rules that could fire within 2 hours of each other for same recipient
      const fatigueAlerts: any[] = [];
      const byRecipient: Record<string, any[]> = {};
      for (const r of rules || []) {
        const key = `${r.recipient_type}-${r.trigger_event}`;
        if (!byRecipient[key]) byRecipient[key] = [];
        byRecipient[key].push(r);
      }

      for (const [key, group] of Object.entries(byRecipient)) {
        if (group.length < 2) continue;
        // Check if delays are within 120 min of each other
        const delays = group.map(r => r.delay_minutes).sort((a, b) => a - b);
        for (let i = 1; i < delays.length; i++) {
          if (Math.abs(delays[i] - delays[i - 1]) < 120) {
            fatigueAlerts.push({
              rules: group.map(r => r.name),
              overlap_window_minutes: Math.abs(delays[i] - delays[i - 1]),
              recommendation: `Rules "${group[i - 1].name}" and "${group[i].name}" may fire within ${Math.abs(delays[i] - delays[i - 1])} minutes for same ${group[0].recipient_type}. Consider consolidating or spacing.`,
            });
            break;
          }
        }
      }

      return new Response(JSON.stringify({
        fatigue_alerts: fatigueAlerts,
        total_active_rules: (rules || []).length,
        narrative: fatigueAlerts.length > 0
          ? `Found ${fatigueAlerts.length} potential message fatigue issue(s). Patients may receive multiple notifications too close together.`
          : "No message fatigue issues detected. Rules are well-spaced.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── MODE: rule_suggest ──
    if (body.mode === "rule_suggest") {
      const { data: rules } = await sb.from("automation_rules").select("name, trigger_event, action_type, recipient_type, is_active");
      const { count: totalAppts } = await sb.from("appointments").select("id", { count: "exact", head: true });
      const { count: noShows } = await sb.from("appointments").select("id", { count: "exact", head: true }).eq("status", "no_show");

      const result = await callAI(
        "You are an automation advisor for a medical spa. Suggest new automation rules that would improve operations based on current gaps. Consider: appointment reminders, no-show follow-up, post-treatment care, package expiration, review requests.",
        JSON.stringify({
          existing_rules: rules,
          clinic_stats: { total_appointments: totalAppts, no_shows: noShows },
        }),
        resultTool,
        { type: "function", function: { name: "automation_result" } }
      );

      return new Response(JSON.stringify(result || { narrative: "Unable to suggest rules.", suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown mode: " + body.mode }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("automation-advisor error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
