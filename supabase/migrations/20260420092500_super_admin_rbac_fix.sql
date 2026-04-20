-- 20260420092500 — Fix super_admin access to all RBAC-gated resources.
--
-- Context: super_admin role was added after the initial RBAC system was built.
-- Two SECURITY DEFINER functions hardcoded the earlier 3-role set and missed
-- super_admin entirely, causing:
--   - is_staff() returning false for super_admin users → RLS on patients,
--     appointments, encounters, etc. silently filtered rows to zero.
--   - has_role(uid, 'admin') returning false for super_admin users → ~80
--     admin-only policies (catalog, clinic config, contracts, devices, etc.)
--     rejected super_admin mutations.
--
-- Fix: super_admin is the top of the hierarchy and should pass every role
-- check below it. Updating both functions accordingly. No schema or data
-- changes — pure function body updates.

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

-- has_role() now treats super_admin as having every role implicitly. Anywhere
-- policies call has_role(auth.uid(), 'admin') — or any other role — a
-- super_admin user passes, matching the intended hierarchical permission.
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
