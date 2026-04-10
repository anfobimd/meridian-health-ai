
-- 1. Add auth_user_id to patients
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE;

-- 2. Create consent_type enum
DO $$ BEGIN
  CREATE TYPE public.consent_type AS ENUM ('general', 'telehealth', 'hipaa');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Create e_consents table
CREATE TABLE IF NOT EXISTS public.e_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  consent_type public.consent_type NOT NULL,
  consent_text text NOT NULL,
  signature_data text, -- base64 canvas image
  ip_address text,
  user_agent text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.e_consents ENABLE ROW LEVEL SECURITY;

-- 4. Patient-scoped RLS: patients see own record
CREATE POLICY "Patients view own record" ON public.patients
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR is_staff(auth.uid()));

-- Drop existing staff-only SELECT on patients so we don't conflict
DROP POLICY IF EXISTS "Staff can view patients" ON public.patients;

-- 5. Patient-scoped RLS on appointments
CREATE POLICY "Patients view own appointments" ON public.appointments
  FOR SELECT TO authenticated
  USING (
    patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid())
    OR is_staff(auth.uid())
  );
DROP POLICY IF EXISTS "Staff can view appointments" ON public.appointments;

-- 6. Patient-scoped RLS on patient_package_purchases
CREATE POLICY "Patients view own packages" ON public.patient_package_purchases
  FOR SELECT TO authenticated
  USING (
    patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid())
    OR is_staff(auth.uid())
  );
DROP POLICY IF EXISTS "Staff can view patient_package_purchases" ON public.patient_package_purchases;

-- 7. Patient-scoped RLS on clinical_notes (signed only for patients)
CREATE POLICY "Patients view own signed notes" ON public.clinical_notes
  FOR SELECT TO authenticated
  USING (
    (patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid()) AND status = 'signed')
    OR is_staff(auth.uid())
  );
DROP POLICY IF EXISTS "Staff can view clinical_notes" ON public.clinical_notes;

-- 8. Patient-scoped RLS on hormone_visits
CREATE POLICY "Patients view own hormone visits" ON public.hormone_visits
  FOR SELECT TO authenticated
  USING (
    patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid())
    OR is_staff(auth.uid())
  );
DROP POLICY IF EXISTS "Staff can view hormone_visits" ON public.hormone_visits;

-- 9. E-consents RLS
CREATE POLICY "Patients insert own consents" ON public.e_consents
  FOR INSERT TO authenticated
  WITH CHECK (patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid()) OR is_staff(auth.uid()));

CREATE POLICY "Anon insert consents" ON public.e_consents
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Patients view own consents" ON public.e_consents
  FOR SELECT TO authenticated
  USING (patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid()) OR is_staff(auth.uid()));

-- 10. Function to link patient record to auth user by email
CREATE OR REPLACE FUNCTION public.link_patient_auth(_user_id uuid, _email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id uuid;
BEGIN
  -- Find patient by email that isn't already linked
  SELECT id INTO v_patient_id
  FROM public.patients
  WHERE lower(email) = lower(_email) AND auth_user_id IS NULL
  LIMIT 1;

  IF v_patient_id IS NOT NULL THEN
    UPDATE public.patients SET auth_user_id = _user_id WHERE id = v_patient_id;
  ELSE
    -- Check if already linked
    SELECT id INTO v_patient_id FROM public.patients WHERE auth_user_id = _user_id LIMIT 1;
  END IF;

  RETURN v_patient_id;
END;
$$;
