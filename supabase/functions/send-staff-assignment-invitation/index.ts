// supabase/functions/send-staff-assignment-invitation/index.ts
//
// Notifies a provider by email that they've been assigned to a clinic in a
// specific role. Used both at assignment creation (auto-send when the
// notify checkbox is on) and for manual resends from a staff chip.
//
// Body: { assignment_id: string, email?: string }
//   - email is optional; falls back to the provider's email on file.
//
// On success, increments
// provider_clinic_assignments.notification_count and stamps
// provider_clinic_assignments.notification_sent_at.

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

function prettyRole(raw: string | null): string {
  if (!raw) return "Provider";
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, l => l.toUpperCase());
}

function appUrl(): string {
  return (Deno.env.get("APP_URL") || "https://glow-meridian-health.lovable.app").replace(/\/+$/, "");
}

// QA #58 — every invitation email now ends with a real CTA. Recipients can
// click "Accept Invitation" to land in the app (auth screen for now; once
// the onboarding deep-link router exists the same query params can route to
// it without changing this template).
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

function renderHtml(opts: {
  providerFirstName: string;
  clinicName: string;
  clinicCity?: string | null;
  clinicState?: string | null;
  clinicPhone?: string | null;
  role: string;
  isPrimary: boolean;
  isResend: boolean;
  assignmentId: string;
}): string {
  const heading = opts.isResend
    ? `Reminder: you're assigned to ${opts.clinicName}`
    : `You've been assigned to ${opts.clinicName}`;
  const location = [opts.clinicCity, opts.clinicState].filter(Boolean).join(", ");
  const cta = ctaButton(
    `${appUrl()}/auth?invite=staff&assignment=${encodeURIComponent(opts.assignmentId)}`,
    "Accept Invitation",
  );
  return `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
      <h2 style="color: #111827; margin-bottom: 8px;">${heading}</h2>
      <p>Hi ${opts.providerFirstName},</p>
      <p>You've been added to the staff roster at the clinic below. Here are the details:</p>
      <table style="border-collapse: collapse; margin: 16px 0; width: 100%;">
        <tr><td style="padding: 8px 12px; background: #f9fafb; font-weight: 600; width: 140px;">Clinic</td><td style="padding: 8px 12px; background: #f9fafb;">${opts.clinicName}</td></tr>
        ${location ? `<tr><td style="padding: 8px 12px; font-weight: 600;">Location</td><td style="padding: 8px 12px;">${location}</td></tr>` : ""}
        ${opts.clinicPhone ? `<tr><td style="padding: 8px 12px; background: #f9fafb; font-weight: 600;">Clinic phone</td><td style="padding: 8px 12px; background: #f9fafb;">${opts.clinicPhone}</td></tr>` : ""}
        <tr><td style="padding: 8px 12px; font-weight: 600;">Your role</td><td style="padding: 8px 12px;">${opts.role}${opts.isPrimary ? " (Primary clinic)" : ""}</td></tr>
      </table>
      ${cta}
      <p style="margin-top: 24px;">If anything looks wrong, please reply to this email and the clinic admin will follow up.</p>
      <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">Sent from the Meridian Wellness EHR.</p>
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
    const { assignment_id } = body;
    let { email } = body;

    if (!assignment_id) {
      return new Response(
        JSON.stringify({ error: "assignment_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: assignment, error: fetchErr } = await admin
      .from("provider_clinic_assignments")
      .select("id, role_at_clinic, is_primary, notification_count, providers(first_name, last_name, email), clinics(name, city, state, phone)")
      .eq("id", assignment_id)
      .single();

    if (fetchErr || !assignment) {
      return new Response(
        JSON.stringify({ error: "Assignment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const provider: any = (assignment as any).providers;
    const clinic: any = (assignment as any).clinics;

    email = (email || provider?.email || "").trim();
    if (!email) {
      return new Response(
        JSON.stringify({ error: "No recipient email — provider has no email on file and none was passed in" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isResend = ((assignment as any).notification_count ?? 0) > 0;
    const html = renderHtml({
      providerFirstName: provider?.first_name || "there",
      clinicName: clinic?.name || "your clinic",
      clinicCity: clinic?.city,
      clinicState: clinic?.state,
      clinicPhone: clinic?.phone,
      role: prettyRole(assignment.role_at_clinic),
      isPrimary: !!assignment.is_primary,
      isResend,
      assignmentId: assignment_id,
    });
    const subject = isResend
      ? `Reminder — assignment to ${clinic?.name || "your clinic"}`
      : `You've been assigned to ${clinic?.name || "a clinic"}`;

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
      console.log("[send-staff-assignment-invitation] dev-stub", { to: email, subject });
    }

    const newCount = ((assignment as any).notification_count ?? 0) + 1;
    const { error: updErr } = await admin
      .from("provider_clinic_assignments")
      .update({
        notification_sent_at: new Date().toISOString(),
        notification_count: newCount,
      })
      .eq("id", assignment_id);

    if (updErr) {
      console.error("[send-staff-assignment-invitation] tracking update failed:", updErr.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_id: messageId,
        notification_count: newCount,
        ...(providerNote ? { note: providerNote } : {}),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("send-staff-assignment-invitation error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
