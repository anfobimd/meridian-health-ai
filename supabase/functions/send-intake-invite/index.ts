import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://meridian-ai-care.lovable.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { patient_id, channel, focus_areas, phone, email } = body;

    if (!patient_id) {
      return new Response(JSON.stringify({ error: "patient_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate short token
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

    // Build intake URL
    const params = new URLSearchParams({ token });
    if (focus_areas?.length) params.set("focus", focus_areas.join(","));
    params.set("ref", patient_id);
    const intakeUrl = `${APP_URL}/intake?${params.toString()}`;

    // Insert invitation
    const { data: invitation, error: invErr } = await supabaseAdmin
      .from("intake_invitations")
      .insert({
        patient_id,
        token,
        focus_areas: focus_areas || [],
        channel: channel || "manual",
        phone: phone || null,
        email: email || null,
        status: "sent",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      })
      .select("id, token")
      .single();

    if (invErr) throw invErr;

    // Send SMS via Twilio if channel is sms and phone provided
    let smsSent = false;
    if (channel === "sms" && phone) {
      const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
      const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

      if (accountSid && authToken && fromNumber) {
        try {
          // Fetch patient name for personalized message
          const { data: patient } = await supabaseAdmin
            .from("patients")
            .select("first_name")
            .eq("id", patient_id)
            .single();

          const smsBody = `Hi ${patient?.first_name || "there"}, your intake form is ready. Please complete it before your visit: ${intakeUrl}`;

          const basicAuth = btoa(`${accountSid}:${authToken}`);
          const smsRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${basicAuth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              To: phone,
              From: fromNumber,
              Body: smsBody,
            }),
          });

          const smsData = await smsRes.json();
          if (smsRes.ok) {
            smsSent = true;
          } else {
            console.error("Twilio error:", JSON.stringify(smsData));
          }
        } catch (smsErr) {
          console.error("SMS send failed:", smsErr);
        }
      }
    }

    // Log to communication timeline
    try {
      const { data: patient } = await supabaseAdmin
        .from("patients")
        .select("first_name, last_name")
        .eq("id", patient_id)
        .single();

      await supabaseAdmin.from("patient_communication_log").insert({
        patient_id,
        direction: "outbound",
        channel: channel === "sms" ? "sms" : "portal",
        subject: "Intake Link Sent",
        body: `Intake invitation sent to ${patient?.first_name} ${patient?.last_name}. Link: ${intakeUrl}`,
        is_read: true,
      });
    } catch (e) {
      console.error("Comm log error:", e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        invitation_id: invitation.id,
        token: invitation.token,
        url: intakeUrl,
        sms_sent: smsSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-intake-invite error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to create invitation" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
