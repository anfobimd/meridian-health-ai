
-- Fix oversight_config: remove anon SELECT, it exposes AI thresholds
DROP POLICY IF EXISTS "Anon view oversight_config" ON public.oversight_config;
DROP POLICY IF EXISTS "Auth view oversight_config" ON public.oversight_config;
CREATE POLICY "Staff can view oversight_config" ON public.oversight_config FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- Fix user_roles: scope to authenticated instead of public
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
