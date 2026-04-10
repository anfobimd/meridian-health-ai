-- Fix 1: e_consents - validate patient exists for anon inserts
DROP POLICY IF EXISTS "Anon insert consents" ON public.e_consents;
CREATE POLICY "Anon insert consents" ON public.e_consents
  FOR INSERT TO anon
  WITH CHECK (patient_id IN (SELECT id FROM public.patients));

-- Fix 2: intake_forms - validate patient exists for anon inserts
DROP POLICY IF EXISTS "Anon can submit intake_forms" ON public.intake_forms;
CREATE POLICY "Anon can submit intake_forms" ON public.intake_forms
  FOR INSERT TO anon
  WITH CHECK (patient_id IN (SELECT id FROM public.patients));

-- Fix 3: Add missing storage UPDATE policy for clinical-photos
CREATE POLICY "Staff can update clinical photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'clinical-photos' AND public.is_staff(auth.uid()));

-- Fix 4: profiles - restrict from public to authenticated role
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);