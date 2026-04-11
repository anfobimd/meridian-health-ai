-- Fix 1: Remove overly permissive anon INSERT on e_consents
DROP POLICY IF EXISTS "Anon insert consents" ON public.e_consents;

-- Fix 2: Remove overly permissive anon INSERT on intake_forms
DROP POLICY IF EXISTS "Anon can submit intake_forms" ON public.intake_forms;

-- Fix 3: Restrict ai_api_calls SELECT to admin only
DROP POLICY IF EXISTS "Staff can view ai_api_calls" ON public.ai_api_calls;
CREATE POLICY "Admin can view ai_api_calls" ON public.ai_api_calls
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix 4: Restrict ai_prompts SELECT to admin only
DROP POLICY IF EXISTS "Staff can view ai_prompts" ON public.ai_prompts;
CREATE POLICY "Admin can view ai_prompts" ON public.ai_prompts
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));