// supabase/functions/send-contract-admin-invitation/index.ts
//
// Sends an invitation email to a contract's designated admin (clinic
// manager / partner-side coordinator). Mirrors send-contract-invitation
// but uses the admin_* columns and a different email body emphasising
// the recipient's admin responsibilities.
//
// Body: { contract_id: string, email?: string, name?: string }
//   - if omitted, falls back to contracts.admin_email / admin_name
//
// On success, increments contracts.admin_invitation_count and stamps
// contracts.admin_invited_at, then returns { success: true, count }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendViaSendGrid(to: string, subject: string, html: string, apiKey: string) {
  const fromRaw = Deno.env.get("EMAIL_FROM") || "Meridian AI Care <noreply@meridian-ai-care.lovable.app>";
  const match = fromRaw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  const from = match ? { name: match[1] || undefined, email: match[2] } : { email: fromRaw.trim() };
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
  if (!res.ok) throw new Error(`SendGrid error [${res.status}]: ${await res.text()}`);
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
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function appUrl(): string {
  return (Deno.env.get("APP_URL") || "https://glow-meridian-health.lovable.app").replace(/\/+$/, "");
}

// QA #58 — Contract Admin invitation now includes a Get Started CTA so the
// admin can click through into the app instead of needing a second message.
function ctaButton(href: string, label: string): string {
  return `
    <div style="margin: 28px 0; text-align: center;">
      <a href="${href}"
         style="display: inline-block; background: #0ea5a4; color: #ffffff; text-decoration: none;
                padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        ${label}
      </a>
      <p style="margin-top: 12px; color: #6b7280; font-size: 11px;">
        Or copy this link: <span style="color:#374151;">${href}</span>
      </p>
    </div>
  `;
}

function renderAdminHtml(
  c: { id: string; name: string; start_date: string; end_date: string | null; notes: string | null },
  adminName: string | null,
  count: number,
): string {
  const heading = count === 0
    ? "You've been assigned as Contract Admin"
    : "Reminder: Contract Admin assignment";
  const greeting = adminName ? `Hi ${adminName},` : "Hello,";
  const cta = ctaButton(
    `${appUrl()}/auth?invite=contract-admin&contract=${encodeURIComponent(c.id)}`,
    "Get Started",
  );
  return `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
      <h2 style="color: #111827; margin-bottom: 8px;">${heading}</h2>
      <p>${greeting}</p>
      <p>You have been designated as the <strong>Contract Admin</strong> for the following contract on Meridian Wellness:</p>
      <table style="border-collapse: collapse; margin: 16px 0; width: 100%;">
        <tr><td style="padding: 8px 12px; background: #f9fafb; font-weight: 600; width: 140px;">Contract</td><td style="padding: 8px 12px; background: #f9fafb;">${c.name}</td></tr>
        <tr><td style="padding: 8px 12px; font-weight: 600;">Start date</td><td style="padding: 8px 12px;">${fmtDate(c.start_date)}</td></tr>
        <tr><td style="padding: 8px 12px; background: #f9fafb; font-weight: 600;">End date</td><td style="padding: 8px 12px; background: #f9fafb;">${fmtDate(c.end_date)}</td></tr>
        ${c.notes ? `<tr><td style="padding: 8px 12px; font-weight: 600; vertical-align: top;">Notes</td><td style="padding: 8px 12px; white-space: pre-wrap;">${c.notes}</td></tr>` : ""}
      </table>
      ${cta}
      <p>As Contract Admin you are the point of contact for staffing, scheduling, and compliance under this contract.</p>
      <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">This message was sent from the Meridian Wellness EHR. If you received it in error, please disregard or reply to let us know.</p>
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
    let { email, name } = body;

    if (!contract_id) {
      return new Response(
        JSON.stringify({ error: "contract_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: contract, error: fetchErr } = await admin
      .from("contracts")
      .select("id, name, start_date, end_date, notes, admin_email, admin_name, admin_invitation_count")
      .eq("id", contract_id)
      .single();

    if (fetchErr || !contract) {
      return new Response(
        JSON.stringify({ error: "Contract not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    email = (email || (contract as any).admin_email || "").trim();
    name = (name || (contract as any).admin_name || "").trim() || null;

    if (!email) {
      return new Response(
        JSON.stringify({ error: "No admin email provided and contract has no admin_email on file" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const count = (contract as any).admin_invitation_count ?? 0;
    const html = renderAdminHtml(
      { id: contract.id, name: contract.name, start_date: contract.start_date, end_date: contract.end_date, notes: contract.notes },
      name,
      count,
    );
    const subject = count === 0
      ? `You're the Contract Admin for ${contract.name}`
      : `Reminder — Contract Admin: ${contract.name}`;

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
      console.log("[send-contract-admin-invitation] dev-stub", { to: email, subject });
    }

    const newCount = count + 1;
    const { error: updErr } = await admin
      .from("contracts")
      .update({
        admin_email: email,
        admin_name: name,
        admin_invited_at: new Date().toISOString(),
        admin_invitation_count: newCount,
      } as never)
      .eq("id", contract_id);

    if (updErr) {
      console.error("[send-contract-admin-invitation] tracking update failed:", updErr.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_id: messageId,
        admin_invitation_count: newCount,
        ...(providerNote ? { note: providerNote } : {}),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("send-contract-admin-invitation error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
