-- 20260427 — Patient registration column alignment (QA #19)
--
-- The Register New Patient dialog (PatientRegistrationDialog.tsx) sends
-- six fields that the patients table never had:
--   preferred_name, sex_at_birth, gender_identity, referral_source,
--   preferred_contact_channel, emergency_contact_relationship
--
-- Result: every registration attempt failed with PostgREST PGRST204
--   "Could not find the 'preferred_contact_channel' column"
-- and the UI swallowed the message into a generic "Failed to register
-- patient" toast.
--
-- Adding the columns. All optional. No backfill needed — existing rows
-- get NULL.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS preferred_name                  TEXT,
  ADD COLUMN IF NOT EXISTS sex_at_birth                    TEXT,
  ADD COLUMN IF NOT EXISTS gender_identity                 TEXT,
  ADD COLUMN IF NOT EXISTS referral_source                 TEXT,
  ADD COLUMN IF NOT EXISTS preferred_contact_channel       TEXT DEFAULT 'sms',
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship  TEXT;

-- Lightweight enum-style check constraints so a typo in the dialog
-- can't insert "smss" or "femal" silently.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='patients_sex_at_birth_check') THEN
    ALTER TABLE public.patients
      ADD CONSTRAINT patients_sex_at_birth_check
      CHECK (sex_at_birth IS NULL OR sex_at_birth IN ('male','female','intersex'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='patients_preferred_contact_channel_check') THEN
    ALTER TABLE public.patients
      ADD CONSTRAINT patients_preferred_contact_channel_check
      CHECK (preferred_contact_channel IS NULL OR preferred_contact_channel IN ('sms','email','phone'));
  END IF;
END $$;
