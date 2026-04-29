-- 20260428220000 — Staff assignment notification tracking (QA #34)
--
-- The "Assign Provider to Clinic" workflow now optionally sends an email to
-- the provider letting them know they've been assigned. This migration adds
-- nullable tracking columns so admins can see whether a notification has
-- been sent and resend if needed. Existing assignments keep working
-- unchanged.

ALTER TABLE public.provider_clinic_assignments
  ADD COLUMN IF NOT EXISTS notification_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notification_count    INTEGER NOT NULL DEFAULT 0;
