// supabase/functions/send-contract-invitation/index.ts
//
// Sends an informational invitation email about a contract to a recipient.
// Used both at contract creation (auto-send when invitation_email is set) and
// for manual resends from the Contracts admin row action.
//
// Body: { contract_id: string, email?: string }
//   - email is optional; if omitted, falls back to contracts.invitation_email
//
// On success, increments contracts.invitation_count and stamps
// contracts.invitation_sent_at, then returns { success: true, count }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parseFromAddress(raw: string): { email: string; name?: string } {
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1] || undefined, email: match[2] };
  return { email: raw.trim() };
}

async function sendViaSendGrid(to: string, subject: string, html: string, apiKey: string) {
  const fromRaw = Deno.env.get("EMAIL_FROM") || "Meridian AI Care <noreply@meridian-ai-care.lovable.app>";
  const from = parseFromAddress(fromRaw);
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from.email, name: from.name },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`SendGrid error [${res.status}]: ${errText}`);
  }
  return res.headers.get("x-message-id") || "sent";
}

async function sendViaResend(to: string, subject: string, html: string, apiKey: string) {
  const from = Deno.env.get("EMAIL_FROM") || "Meridian AI Care <noreply@meridian-ai-care.lovable.app>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Resend error [${res.status}]: ${JSON.stringify(data)}`);
  return data.id || "sent";
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function renderInvitationHtml(c: { name: string; start_date: string; end_date: string | null; notes: string | null }, count: number): string {
  const heading = count === 0 ? "You're invited to a contract with Meridian" : "Reminder: contract invitation from Meridian";
  return `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
      <h2 style="color: #111827; margin-bottom: 8px;">${heading}</h2>
      <p>You've been invited to participate in the following contract:</p>
      <table style="border-collapse: collapse; margin: 16px 0; width: 100%;">
        <tr><td style="padding: 8px 12px; background: #f9fafb; font-weight: 600; width: 140px;">Contract</td><td style="padding: 8px 12px; background: #f9fafb;">${c.name}</td></tr>
        <tr><td style="padding: 8px 12px; font-weight: 600;">Start date</td><td style="padding: 8px 12px;">${fmtDate(c.start_date)}</td></tr>
        <tr><td style="padding: 8px 12px; background: #f9fafb; font-weight: 600;">End date</td><td style="padding: 8px 12px; background: #f9fafb;">${fmtDate(c.end_date)}</td></tr>
        ${c.notes ? `<tr><td style="padding: 8px 12px; font-weight: 600; vertical-align: top;">Notes</td><td style="padding: 8px 12px; white-space: pre-wrap;">${c.notes}</td></tr>` : ""}
      </table>
      <p style="margin-top: 24px;">Please reply to this email to confirm receipt or to discuss the terms. A representative from Meridian will follow up with the next steps.</p>
      <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">This message was sent from the Meridian Wellness EHR. If you received it in error, you can disregard.</p>
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { contract_id } = body;
    let { email } = body;

    if (!contract_id) {
      return new Response(
        JSON.stringify({ error: "contract_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: contract, error: fetchErr } = await admin
      .from("contracts")
      .select("id, name, start_date, end_date, notes, invitation_email, invitation_count")
      .eq("id", contract_id)
      .single();

    if (fetchErr || !contract) {
      return new Response(
        JSON.stringify({ error: "Contract not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    email = (email || contract.invitation_email || "").trim();
    if (!email) {
      return new Response(
        JSON.stringify({ error: "No recipient email provided and contract has no invitation_email on file" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const html = renderInvitationHtml(
      { name: contract.name, start_date: contract.start_date, end_date: contract.end_date, notes: contract.notes },
      contract.invitation_count ?? 0,
    );
    const subject = (contract.invitation_count ?? 0) === 0
      ? `Contract invitation: ${contract.name}`
      : `Reminder — Contract invitation: ${contract.name}`;

    const sendgridKey = Deno.env.get("SENDGRID_API_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");

    let messageId = "dev-stub";
    let providerNote: string | undefined;

    if (sendgridKey) {
      messageId = await sendViaSendGrid(email, subject, html, sendgridKey);
    } else if (resendKey) {
      messageId = await sendViaResend(email, subject, html, resendKey);
    } else {
      providerNote = "No email provider configured — message logged only.";
      console.log("[send-contract-invitation] dev-stub", { to: email, subject });
    }

    const newCount = (contract.invitation_count ?? 0) + 1;
    const { error: updErr } = await admin
      .from("contracts")
      .update({
        invitation_email: email,
        invitation_sent_at: new Date().toISOString(),
        invitation_count: newCount,
      })
      .eq("id", contract_id);

    if (updErr) {
      // Don't fail the whole request — email already sent.
      console.error("[send-contract-invitation] tracking update failed:", updErr.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_id: messageId,
        invitation_count: newCount,
        ...(providerNote ? { note: providerNote } : {}),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("send-contract-invitation error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
