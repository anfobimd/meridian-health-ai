-- 20260418115756 — Super Admin email allowlist + auto-promotion trigger
-- Solves: QA testers can sign up but land as front_desk with no way to promote themselves.
-- New flow: super_admins add emails here in advance; on signup, trigger assigns super_admin role.

CREATE TABLE IF NOT EXISTS public.super_admin_emails (
  email           TEXT PRIMARY KEY,
  added_by        UUID REFERENCES auth.users(id),
  added_at        TIMESTAMPTZ DEFAULT NOW(),
  notes           TEXT
);

ALTER TABLE public.super_admin_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage allowlist"
  ON public.super_admin_emails FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

-- Seed the initial super admin emails (so the first super admin can bootstrap)
INSERT INTO public.super_admin_emails (email, notes) VALUES
  ('anfobi@gmail.com', 'Owner — Aloysius Fobi'),
  ('testerfz69@gmail.com', 'QA tester — Faz Hussain'),
  ('piyushaaryan011@gmail.com', 'Developer — Piyush'),
  ('piyushaaryan@gmail.com', 'Developer — Piyush (alt)')
ON CONFLICT (email) DO NOTHING;

-- ─── Auto-assign role on user signup ────────────────────────────────────────
-- Replace handle_new_user to ALSO insert into user_roles based on allowlist.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_role public.app_role;
BEGIN
  -- Create profile (existing behavior)
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NULL)
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Determine role: super_admin if email is on allowlist, else front_desk default
  IF EXISTS (SELECT 1 FROM public.super_admin_emails WHERE email = NEW.email) THEN
    assigned_role := 'super_admin';
  ELSE
    assigned_role := 'front_desk';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Also retroactively assign super_admin to any existing user whose email is on the allowlist
-- but doesn't yet have the super_admin role
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'super_admin'::public.app_role
FROM auth.users u
WHERE u.email IN (SELECT email FROM public.super_admin_emails)
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = u.id AND ur.role = 'super_admin'
  )
ON CONFLICT (user_id, role) DO NOTHING;

COMMENT ON TABLE public.super_admin_emails IS 'Email allowlist — users signing up with these emails auto-get super_admin role';
