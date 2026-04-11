import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mode, data } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);
    const apiKey = Deno.env.get("LOVABLE_API_KEY");

    async function callAI(systemPrompt: string, userPrompt: string) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "notification_result",
              description: "Return notification content and settings",
              parameters: {
                type: "object",
                properties: {
                  message: { type: "string", description: "The notification message text" },
                  tone: { type: "string", enum: ["warm", "professional", "casual", "urgent"] },
                  optimal_send_time: { type: "string", description: "ISO time string for best send time" },
                  subject: { type: "string" },
                  channel_recommendation: { type: "string", enum: ["sms", "email", "both"] },
                  reasoning: { type: "string" },
                },
                required: ["message", "tone", "reasoning"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "notification_result" } },
        }),
      });
      if (!res.ok) { console.error("AI error:", res.status); return null; }
      const json = await res.json();
      try { return JSON.parse(json.choices[0].message.tool_calls[0].function.arguments); }
      catch { return null; }
    }

    // ── MODE: personalize_tone ──
    if (mode === "personalize_tone") {
      const { patient_id, message_type } = data;
      const { data: patient } = await sb.from("patients").select("first_name, last_name, preferred_contact, created_at, date_of_birth").eq("id", patient_id).single();
      const { data: comms } = await sb.from("patient_communication_log").select("channel, content, direction, created_at").eq("patient_id", patient_id).order("created_at", { ascending: false }).limit(10);

      const result = await callAI(
        "You are a patient communication AI for an aesthetic medicine clinic. Analyze the patient's communication history and determine the best tone and channel for notifications. Consider: formal vs casual language patterns, response rates by channel, time of engagement.",
        JSON.stringify({ patient, communication_history: comms, message_type })
      );

      return new Response(JSON.stringify(result || { tone: "professional", reasoning: "Default tone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── MODE: optimal_time ──
    if (mode === "optimal_time") {
      const { patient_id } = data;
      const { data: comms } = await sb.from("patient_communication_log").select("created_at, channel, delivery_status").eq("patient_id", patient_id).eq("direction", "outbound").order("created_at", { ascending: false }).limit(20);

      // Analyze response patterns
      const hourCounts: Record<number, number> = {};
      for (const c of comms || []) {
        const hour = new Date(c.created_at).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + (c.delivery_status === "delivered" ? 2 : 1);
      }
      const bestHour = Object.entries(hourCounts).sort(([,a], [,b]) => b - a)[0]?.[0] || "10";
      const optimalTime = `${bestHour.padStart(2, "0")}:00`;

      return new Response(JSON.stringify({
        optimal_send_time: optimalTime,
        analysis: hourCounts,
        reasoning: `Based on ${(comms || []).length} prior communications, ${optimalTime} shows highest engagement.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── MODE: re_engage_draft ──
    if (mode === "re_engage_draft") {
      const { patient_id, no_show_date, treatment_name } = data;
      const { data: patient } = await sb.from("patients").select("first_name, last_name, no_show_count").eq("id", patient_id).single();

      const result = await callAI(
        "You are drafting a re-engagement message for a patient who missed their appointment at an aesthetic medicine clinic. The tone should be warm and non-judgmental. Include: acknowledgment, easy rebooking option, gentle mention that we're here for them. Keep under 160 chars for SMS.",
        JSON.stringify({
          patient_name: patient?.first_name,
          missed_date: no_show_date,
          treatment: treatment_name,
          total_no_shows: patient?.no_show_count,
        })
      );

      return new Response(JSON.stringify({
        sms_draft: result?.message || `Hi ${patient?.first_name}, we missed you today! We'd love to help reschedule your ${treatment_name || "appointment"} at your convenience. Reply or call us anytime.`,
        tone: result?.tone || "warm",
        reasoning: result?.reasoning || "",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── MODE: slot_available_draft ──
    if (mode === "slot_available_draft") {
      const { patient_id, slot_date, slot_time, treatment_name, provider_name } = data;
      const { data: patient } = await sb.from("patients").select("first_name, preferred_contact").eq("id", patient_id).single();

      const result = await callAI(
        "Draft a slot-available notification for a waitlisted patient at an aesthetic clinic. Keep SMS under 160 chars. Be enthusiastic but professional. Include the specific date/time and a clear call-to-action.",
        JSON.stringify({ patient_name: patient?.first_name, slot_date, slot_time, treatment: treatment_name, provider: provider_name })
      );

      return new Response(JSON.stringify({
        sms_draft: result?.message || `Hi ${patient?.first_name}, great news! A ${treatment_name || ""} slot opened on ${slot_date} at ${slot_time}. Reply YES to book! — Meridian`,
        email_subject: result?.subject || "A spot just opened up for you!",
        channel: result?.channel_recommendation || patient?.preferred_contact || "sms",
        reasoning: result?.reasoning || "",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown mode: " + mode }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notification-engine error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
