// supabase/functions/send-email/index.ts
//
// Unified email sending edge function for Meridian AI Care.
//
// Supports three actions via the `action` field:
//   "send"          – raw HTML email (to, subject, html, text?)
//   "send_template"  – dynamic template email (to, template_id, dynamic_data?)
//   "intake_form"    – sends an intake form link (patient_email, patient_name?,
//                      appointment_id, treatment_id?, scheduled_start?)
//
// Also supports direct component calls with { to, templateId, data } (used by
// GFEGenerator, PhotoConsentGate, PostProcedureInstructions).
//
// Uses SendGrid (SENDGRID_API_KEY) — falls back to Resend (RESEND_API_KEY) if
// SendGrid isn't configured, and finally to console logging in dev/preview.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://meridian-ai-care.lovable.app";

// ── Email templates ─────────────────────────────────────────────────

interface TemplateContext {
  [key: string]: unknown;
}

function renderTemplate(templateId: string, data: TemplateContext): { subject: string; html: string } {
  switch (templateId) {
    case "gfe_estimate":
      return {
        subject: "Your Good Faith Estimate — Meridian AI Care",
        html: `
          <h2>Good Faith Estimate</h2>
          <p>Thank you for choosing Meridian AI Care. Below is your estimated cost breakdown.</p>
          <p><strong>Treatments:</strong> ${Array.isArray(data.treatments) ? data.treatments.map((t: any) => t.name || t).join(", ") : "See attached"}</p>
          ${data.subtotal ? `<p>Subtotal: $${data.subtotal}</p>` : ""}
          ${data.discounts ? `<p>Discounts: $${data.discounts}</p>` : ""}
          ${data.total ? `<p><strong>Estimated Total: $${data.total}</strong></p>` : ""}
          <p>This is an estimate only. Final costs may vary based on your individual needs.</p>
          <p>Questions? Reply to this email or call our front desk.</p>
        `,
      };

    case "photo_consent_request":
      return {
        subject: "Photo Consent Request — Meridian AI Care",
        html: `
          <h2>Photo Consent Request</h2>
          <p>Your provider has requested consent to take clinical photos during your upcoming visit.</p>
          <p>These photos are used for treatment planning, progress tracking, and your medical record.</p>
          <p><a href="${APP_URL}/consent/photo?ref=${data.patientId || ""}">Review & Sign Consent</a></p>
          <p>If you have questions, please contact our office.</p>
        `,
      };

    case "post_procedure_instructions":
      return {
        subject: "Your Post-Procedure Instructions — Meridian AI Care",
        html: `
          <h2>Post-Procedure Instructions</h2>
          <p>Here are your aftercare instructions for your recent ${data.treatmentType || "procedure"}:</p>
          <div style="white-space:pre-wrap; background:#f9f9f9; padding:16px; border-radius:8px; margin:16px 0;">${data.instructions || ""}</div>
          <p>If you experience any unusual symptoms, please contact our office immediately.</p>
        `,
      };

    case "intake_form":
      return {
        subject: "Complete Your Intake Form — Meridian AI Care",
        html: `
          <h2>Welcome to Meridian AI Care</h2>
          <p>Hi ${data.patient_name || "there"},</p>
          <p>Please complete your intake form before your upcoming appointment${data.scheduled_start ? ` on ${new Date(data.scheduled_start as string).toLocaleDateString()}` : ""}.</p>
          <p><a href="${data.intake_url || `${APP_URL}/intake`}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;">Complete Intake Form</a></p>
          <p>This should take about 5–10 minutes. Having this information ready helps us provide the best care for you.</p>
        `,
      };

    default:
      return {
        subject: `Meridian AI Care — ${templateId}`,
        html: `<p>${JSON.stringify(data)}</p>`,
      };
  }
}

// ── Email sending ───────────────────────────────────────────────────

interface SendParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

function parseFromAddress(raw: string): { email: string; name?: string } {
  // Supports "Name <email>" and bare "email" formats.
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1] || undefined, email: match[2] };
  return { email: raw.trim() };
}

async function sendViaSendGrid(params: SendParams, apiKey: string): Promise<{ success: boolean; messageId: string }> {
  const fromRaw = Deno.env.get("EMAIL_FROM") || "Meridian AI Care <noreply@meridian-ai-care.lovable.app>";
  const from = parseFromAddress(fromRaw);

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: params.to }] }],
      from: { email: from.email, name: from.name },
      subject: params.subject,
      content: [
        { type: "text/html", value: params.html },
        ...(params.text ? [{ type: "text/plain", value: params.text }] : []),
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`SendGrid API error [${res.status}]: ${errText}`);
  }

  // SendGrid returns a message ID in the X-Message-Id response header.
  const messageId = res.headers.get("x-message-id") || "sent";
  return { success: true, messageId };
}

async function sendViaResend(params: SendParams, apiKey: string): Promise<{ success: boolean; messageId: string }> {
  const fromAddress = Deno.env.get("EMAIL_FROM") || "Meridian AI Care <noreply@meridian-ai-care.lovable.app>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text || undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Resend API error [${res.status}]: ${JSON.stringify(data)}`);
  return { success: true, messageId: data.id || "sent" };
}

async function sendEmail(params: SendParams): Promise<{ success: boolean; messageId: string; note?: string }> {
  const sendgridKey = Deno.env.get("SENDGRID_API_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");

  if (sendgridKey) return await sendViaSendGrid(params, sendgridKey);
  if (resendKey) return await sendViaResend(params, resendKey);

  // Dev/preview fallback — log the email instead of sending
  console.log("[send-email] No email provider configured — logging email:", {
    to: params.to,
    subject: params.subject,
    htmlLength: params.html.length,
  });
  return {
    success: true,
    messageId: `dev-${crypto.randomUUID().slice(0, 8)}`,
    note: "Email logged (SENDGRID_API_KEY / RESEND_API_KEY not configured).",
  };
}

// ── Resolve patient email from ID ───────────────────────────────────────

async function resolveEmail(
  admin: any,
  toValue: string,
): Promise<string> {
  // If it looks like an email, return as-is
  if (toValue.includes("@")) return toValue;

  // Otherwise treat as patient_id UUID
  const { data: patient, error } = await admin
    .from("patients")
    .select("email")
    .eq("id", toValue)
    .single();

  if (error || !patient?.email) {
    throw new Error(`Could not resolve email for patient ${toValue}`);
  }

  return patient.email;
}

// ── Main handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { action, templateId } = body;

    let result: { success: boolean; messageId: string; note?: string };

    // ── Route: direct component call { to, templateId, data } ─────────
    if (templateId && !action) {
      const recipientEmail = await resolveEmail(admin, body.to);
      const rendered = renderTemplate(templateId, body.data || {});
      result = await sendEmail({
        to: recipientEmail,
        subject: rendered.subject,
        html: rendered.html,
      });
    }
    // ── Route: action-based calls from useEmail hook ───────────────
    else if (action === "send") {
      // Raw HTML email
      const { to, subject, html, text } = body;
      if (!to || !subject || !html) {
        return new Response(
          JSON.stringify({ error: "to, subject, and html are required for action=send" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const recipientEmail = await resolveEmail(admin, to);
      result = await sendEmail({ to: recipientEmail, subject, html, text });
    } else if (action === "send_template") {
      // Dynamic template
      const { to, template_id, dynamic_data } = body;
      if (!to || !template_id) {
        return new Response(
          JSON.stringify({ error: "to and template_id are required for action=send_template" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const recipientEmail = await resolveEmail(admin, to);
      const rendered = renderTemplate(template_id, dynamic_data || {});
      result = await sendEmail({ to: recipientEmail, subject: rendered.subject, html: rendered.html });
    } else if (action === "intake_form") {
      // Intake form email
      const { patient_email, patient_name, appointment_id, treatment_id, scheduled_start } = body;
      if (!patient_email) {
        return new Response(
          JSON.stringify({ error: "patient_email is required for action=intake_form" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Build intake URL with context
      const params = new URLSearchParams();
      if (appointment_id) params.set("appt", appointment_id);
      if (treatment_id) params.set("tx", treatment_id);
      const intakeUrl = `${APP_URL}/intake?${params.toString()}`;

      const rendered = renderTemplate("intake_form", {
        patient_name,
        scheduled_start,
        intake_url: intakeUrl,
      });

      result = await sendEmail({ to: patient_email, subject: rendered.subject, html: rendered.html });

      // Log to communication timeline
      try {
        await admin.from("patient_communication_log").insert({
          direction: "outbound",
          channel: "email",
          subject: "Intake Form Sent",
          body: `Intake form email sent to ${patient_email}`,
          is_read: true,
        });
      } catch (e) {
        console.error("Comm log error (non-fatal):", e);
      }
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown action "${action}". Use send, send_template, or intake_form.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Log outbound email ──────────────────────────────────────────────
    try {
      if (body.to || body.patient_email) {
        const patientRef = body.to || body.patient_email;
        // Only log if to looks like a patient_id (UUID)
        if (patientRef && !patientRef.includes("@")) {
          await admin.from("patient_communication_log").insert({
            patient_id: patientRef,
            direction: "outbound",
            channel: "email",
            subject: action === "intake_form" ? "Intake Form Email" : (body.subject || templateId || "Email"),
            body: `Email sent via ${action || templateId || "send-email"} function`,
            is_read: true,
          });
        }
      }
    } catch (e) {
      console.error("Comm log error (non-fatal):", e);
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("send-email error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
