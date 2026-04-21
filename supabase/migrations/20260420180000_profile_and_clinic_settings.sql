-- 20260420180000 — Profile fields + clinic-wide platform settings
--
-- QA gaps surfaced by Faz's testing:
--   - Issue #6: super_admin can't set their own name/phone in Settings →
--     profiles table only has display_name/avatar_url
--   - Issue #7: Settings page is missing platform config (timezone,
--     notification prefs, session timeout, password policy display) →
--     no table to store them
--   - Issue #8: No way to set/view session timeout from the UI

-- ─── Extend profiles ────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone        TEXT,
  ADD COLUMN IF NOT EXISTS title        TEXT,
  ADD COLUMN IF NOT EXISTS timezone     TEXT DEFAULT 'America/Los_Angeles',
  ADD COLUMN IF NOT EXISTS preferences  JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Make sure users can update their own profile row (and admins can too).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile" ON public.profiles
      FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ─── Clinic-wide platform settings (singleton row) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.clinic_settings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  default_timezone       TEXT        NOT NULL DEFAULT 'America/Los_Angeles',
  session_timeout_minutes INTEGER    NOT NULL DEFAULT 60,
  password_min_length    INTEGER     NOT NULL DEFAULT 10,
  password_require_uppercase BOOLEAN NOT NULL DEFAULT TRUE,
  password_require_number    BOOLEAN NOT NULL DEFAULT TRUE,
  password_require_symbol    BOOLEAN NOT NULL DEFAULT FALSE,
  notify_on_new_appointment  BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_intake_submitted BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_md_approval_due  BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by             UUID REFERENCES auth.users(id),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read; only admins write. (super_admin auto-passes via
-- the has_role hierarchy fix from 20260420092500.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clinic_settings' AND policyname='Authenticated can read settings') THEN
    CREATE POLICY "Authenticated can read settings" ON public.clinic_settings
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clinic_settings' AND policyname='Admins can update settings') THEN
    CREATE POLICY "Admins can update settings" ON public.clinic_settings
      FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clinic_settings' AND policyname='Admins can insert settings') THEN
    CREATE POLICY "Admins can insert settings" ON public.clinic_settings
      FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

-- Seed singleton row if none exists.
INSERT INTO public.clinic_settings (default_timezone, session_timeout_minutes)
SELECT 'America/Los_Angeles', 60
WHERE NOT EXISTS (SELECT 1 FROM public.clinic_settings);
