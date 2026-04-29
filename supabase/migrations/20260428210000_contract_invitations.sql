-- 20260428210000 — Contract email invitations (QA #31)
--
-- Contracts so far had no way to notify a counter-party. This migration adds
-- minimal tracking columns so an admin can email contract details on creation
-- and resend on demand. The send is done by a new edge function
-- (send-contract-invitation); this migration just stores who/when/how-many.
--
-- All columns are nullable; existing contracts keep working unchanged.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS invitation_email     TEXT,
  ADD COLUMN IF NOT EXISTS invitation_sent_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invitation_count     INTEGER NOT NULL DEFAULT 0;

-- Cheap email-format guard so a typo can't poison the field. Optional column,
-- so NULL is allowed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_invitation_email_format') THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_invitation_email_format
      CHECK (invitation_email IS NULL OR invitation_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  END IF;
END $$;
