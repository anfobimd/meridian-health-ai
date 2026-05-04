-- 20260501130000 — Clinic address completeness (QA #55)
--
-- The New Clinic form was missing zip_code, address_line2, country, and a
-- contact email. This migration adds those columns to public.clinics with
-- the same nullable-by-default approach used for contracts so existing
-- rows keep working unchanged. country defaults to 'US' since the rest of
-- the validation stack is US-only.

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS zip_code      TEXT,
  ADD COLUMN IF NOT EXISTS country       TEXT NOT NULL DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS email         TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinics_zip_code_format') THEN
    ALTER TABLE public.clinics
      ADD CONSTRAINT clinics_zip_code_format
      CHECK (zip_code IS NULL OR zip_code ~ '^\d{5}(-\d{4})?$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinics_email_format') THEN
    ALTER TABLE public.clinics
      ADD CONSTRAINT clinics_email_format
      CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
