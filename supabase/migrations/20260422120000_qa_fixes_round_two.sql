-- 20260422120000 — Faz QA round-two fixes (#3 #4 #5 #6 #8 #10 #12 #14 #15 #16 #17)
--
-- Faz re-tested after the first round and flagged these as still broken. The
-- shared cause for #8, #10, #12, #14 is that has_role()/is_staff() from the
-- earlier migration may not have been applied on the live DB (Lovable/Supabase
-- can baseline-lock migrations that errored earlier). This migration is
-- idempotent and re-applies everything plus adds an RPC that bypasses RLS so
-- the client's role fetch can't be starved by a race.

-- ─── 1. Re-ensure super_admin is in the app_role enum ──────────────────────
-- Safe to rerun — ADD VALUE IF NOT EXISTS is idempotent.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- ─── 2. Re-apply is_staff / has_role with super_admin hierarchy ────────────
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin', 'admin', 'provider', 'front_desk')
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role OR role = 'super_admin'::public.app_role)
  )
$$;

-- ─── 3. SECURITY DEFINER RPC the client uses to fetch its own roles ────────
-- Fixes QA #12 / #14: on hard refresh or tab focus, the user_roles SELECT
-- via RLS sometimes returned 0 rows transiently (stale JWT, RLS evaluation
-- race), which flipped the sidebar role to "user". Using an RPC that bypasses
-- RLS eliminates the race.
CREATE OR REPLACE FUNCTION public.get_my_roles()
RETURNS TABLE (role public.app_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.get_my_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- ─── 4. clinic_settings: ensure table + RLS (QA #8) ────────────────────────
-- This table may not have been created on the live DB if the previous
-- migration had a silent failure. Re-assert it exists with the expected
-- policies.
CREATE TABLE IF NOT EXISTS public.clinic_settings (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  default_timezone           TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  session_timeout_minutes    INTEGER NOT NULL DEFAULT 60,
  password_min_length        INTEGER NOT NULL DEFAULT 10,
  password_require_uppercase BOOLEAN NOT NULL DEFAULT TRUE,
  password_require_number    BOOLEAN NOT NULL DEFAULT TRUE,
  password_require_symbol    BOOLEAN NOT NULL DEFAULT FALSE,
  notify_on_new_appointment  BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_intake_submitted BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_md_approval_due  BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by                 UUID REFERENCES auth.users(id),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;

-- Drop + recreate policies to guarantee super_admin write access.
DROP POLICY IF EXISTS "Authenticated can read settings" ON public.clinic_settings;
DROP POLICY IF EXISTS "Admins can update settings"     ON public.clinic_settings;
DROP POLICY IF EXISTS "Admins can insert settings"     ON public.clinic_settings;

CREATE POLICY "Authenticated can read settings" ON public.clinic_settings
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update settings" ON public.clinic_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
            AND role IN ('admin', 'super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
            AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Admins can insert settings" ON public.clinic_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
            AND role IN ('admin', 'super_admin'))
  );

-- Make sure a singleton row exists.
INSERT INTO public.clinic_settings (default_timezone, session_timeout_minutes)
SELECT 'America/Los_Angeles', 60
WHERE NOT EXISTS (SELECT 1 FROM public.clinic_settings);

-- ─── 5. master_catalog_items: belt-and-suspenders super_admin write (#10) ─
-- Even though has_role() now returns true for super_admin, the older policies
-- call has_role(auth.uid(), 'admin') and some clusters cache plan trees. Drop
-- and recreate the write policies with an explicit IN-list so the policy
-- works even if the has_role fix hasn't propagated.
DROP POLICY IF EXISTS "Admins can insert master catalog" ON public.master_catalog_items;
DROP POLICY IF EXISTS "Admins can update master catalog" ON public.master_catalog_items;
DROP POLICY IF EXISTS "Admins can delete master catalog" ON public.master_catalog_items;

CREATE POLICY "Admins can insert master catalog" ON public.master_catalog_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
            AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Admins can update master catalog" ON public.master_catalog_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
            AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Admins can delete master catalog" ON public.master_catalog_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
            AND role IN ('admin', 'super_admin'))
  );

-- ─── 6. profiles: ensure fields + RLS still correct ────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone       TEXT,
  ADD COLUMN IF NOT EXISTS title       TEXT,
  ADD COLUMN IF NOT EXISTS timezone    TEXT DEFAULT 'America/Los_Angeles',
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Unique index on user_id so we can safely upsert in the client.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_unique ON public.profiles(user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ─── 7. Helpers the client uses to check if it's a provider (QA #6) ────────
CREATE OR REPLACE FUNCTION public.current_user_is_provider()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.providers WHERE user_id = auth.uid())
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_provider() TO authenticated;
