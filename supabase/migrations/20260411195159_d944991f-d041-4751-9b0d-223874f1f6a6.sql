
-- Add headshot_url to providers
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS headshot_url text;

-- RLS: providers can update their own record
CREATE POLICY "Providers can update own profile"
ON public.providers
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- RLS: providers can read own record
CREATE POLICY "Providers can read own profile"
ON public.providers
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
