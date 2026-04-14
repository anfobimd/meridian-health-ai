// src/hooks/useEmail.ts
//
// React hook for sending emails via the send-email edge function.
// Supports: simple email, dynamic templates, intake form emails.
//
// Usage:
//   const { sendEmail, sendTemplate, sendIntakeEmail } = useEmail();
//   await sendEmail.mutateAsync({ to: "...", subject: "...", html: "..." });

import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SendEmailRequest {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendTemplateRequest {
  to: string;
  template_id: string;
  dynamic_data?: Record<string, unknown>;
}

export interface SendIntakeEmailRequest {
  patient_email: string;
  patient_name?: string;
  appointment_id: string;
  treatment_id?: string;
  scheduled_start?: string;
}

export interface EmailResponse {
  success: boolean;
  messageId: string;
  note?: string;
}

// ─── Invoke helper ───────────────────────────────────────────────────────────

async function invokeEmail<T>(action: string, body: Record<string, unknown> | object): Promise<T> {
  const { data, error } = await supabase.functions.invoke("send-email", {
    body: { action, ...body },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useEmail() {
  const sendEmail = useMutation({
    mutationFn: async (params: SendEmailRequest) =>
      invokeEmail<EmailResponse>("send", params),
    onSuccess: () => {
      toast.success("Email sent");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Failed to send email");
    },
  });

  const sendTemplate = useMutation({
    mutationFn: async (params: SendTemplateRequest) =>
      invokeEmail<EmailResponse>("send_template", params),
    onSuccess: () => {
      toast.success("Email sent");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Failed to send template email");
    },
  });

  const sendIntakeEmail = useMutation({
    mutationFn: async (params: SendIntakeEmailRequest) =>
      invokeEmail<EmailResponse>("intake_form", params),
    onSuccess: () => {
      toast.success("Intake form email sent");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Failed to send intake email");
    },
  });

  return { sendEmail, sendTemplate, sendIntakeEmail };
}
