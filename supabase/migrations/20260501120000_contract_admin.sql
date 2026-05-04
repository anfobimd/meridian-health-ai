-- 20260501120000 — Contract Admin (QA #54)
--
-- A contract can have a designated Contract Admin (typically a clinic manager
-- or partner-side coordinator) separate from the counter-party invitation.
-- This migration adds nullable tracking columns mirroring the existing
-- invitation_* columns. All NULL by default so existing contracts keep
-- working unchanged.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS admin_name              TEXT,
  ADD COLUMN IF NOT EXISTS admin_email             TEXT,
  ADD COLUMN IF NOT EXISTS admin_invited_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_invitation_count  INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_admin_email_format') THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_admin_email_format
      CHECK (admin_email IS NULL OR admin_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
