import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
import { format } from "https://esm.sh/date-fns@3.6.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
    if (!accountSid || !authToken || !fromNumber) {
      throw new Error("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER must be configured");
    }
    const basicAuth = btoa(`${accountSid}:${authToken}`);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const today = format(new Date(), "yyyy-MM-dd");

    // Get providers with daily SMS enabled
    const { data: prefs } = await supabase
      .from("provider_notification_prefs")
      .select("*, providers(first_name, last_name, id)")
      .eq("daily_sms_enabled", true);

    if (!prefs || prefs.length === 0) {
      return new Response(JSON.stringify({ message: "No providers opted in" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results = [];

    for (const pref of prefs) {
      if (!pref.phone_number) continue;
      const provider = pref.providers as any;
      if (!provider) continue;

      // Get today's appointments for this provider
      const { data: appts } = await supabase
        .from("appointments")
        .select("scheduled_at, patients(first_name, last_name), treatments(name)")
        .eq("provider_id", provider.id)
        .gte("scheduled_at", `${today}T00:00:00`)
        .lt("scheduled_at", `${today}T23:59:59`)
        .neq("status", "cancelled")
        .order("scheduled_at");

      const count = appts?.length || 0;
      const firstAppt = appts?.[0];
      const firstTime = firstAppt ? format(new Date(firstAppt.scheduled_at), "h:mm a") : "";

      let body = `Good morning ${provider.first_name}! You have ${count} appointment${count !== 1 ? "s" : ""} today.`;
      if (count > 0 && firstAppt) {
        body += ` First at ${firstTime}.`;
      }

      // Send SMS via Twilio
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: pref.phone_number,
          From: fromNumber,
          Body: body,
        }),
      });

      const data = await response.json();
      results.push({ provider: provider.id, sent: response.ok, sid: data.sid });

      // Log notification
      if (provider.id) {
        const { data: userData } = await supabase.from("providers").select("user_id").eq("id", provider.id).maybeSingle();
        if (userData?.user_id) {
          await supabase.from("notifications").insert({
            user_id: userData.user_id,
            title: "Daily Schedule",
            body,
            channel: "sms",
            status: response.ok ? "sent" : "failed",
            sent_at: response.ok ? new Date().toISOString() : null,
          });
        }
      }
    }

    return new Response(JSON.stringify({ results }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Daily notify error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
