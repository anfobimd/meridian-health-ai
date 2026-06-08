
-- ========= Profiles =========
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========= is_staff helper =========
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('admin', 'provider', 'front_desk', 'medical_director', 'super_admin')
  )
$$;

-- ========= Contracts =========
CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contract_admin_id uuid,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can view contracts" ON public.contracts;
DROP POLICY IF EXISTS "Admins manage contracts" ON public.contracts;
CREATE POLICY "Staff can view contracts" ON public.contracts FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage contracts" ON public.contracts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS update_contracts_updated_at ON public.contracts;
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========= Clinics =========
CREATE TABLE IF NOT EXISTS public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  manager_user_id uuid,
  phone text,
  timezone text DEFAULT 'America/New_York',
  city text,
  state text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinics TO authenticated;
GRANT ALL ON public.clinics TO service_role;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can view clinics" ON public.clinics;
DROP POLICY IF EXISTS "Admins manage clinics" ON public.clinics;
CREATE POLICY "Staff can view clinics" ON public.clinics FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage clinics" ON public.clinics FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS update_clinics_updated_at ON public.clinics;
CREATE TRIGGER update_clinics_updated_at BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========= MD coverage assignments =========
CREATE TABLE IF NOT EXISTS public.md_coverage_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  md_provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  sampling_rate integer NOT NULL DEFAULT 100,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_until date,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.md_coverage_assignments TO authenticated;
GRANT ALL ON public.md_coverage_assignments TO service_role;
ALTER TABLE public.md_coverage_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can view md coverage" ON public.md_coverage_assignments;
DROP POLICY IF EXISTS "Admins manage md coverage" ON public.md_coverage_assignments;
CREATE POLICY "Staff can view md coverage" ON public.md_coverage_assignments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage md coverage" ON public.md_coverage_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ========= Provider-to-clinic assignments =========
CREATE TABLE IF NOT EXISTS public.provider_clinic_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  is_primary boolean DEFAULT false,
  role_at_clinic text DEFAULT 'provider',
  effective_from date DEFAULT CURRENT_DATE,
  effective_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id, clinic_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_clinic_assignments TO authenticated;
GRANT ALL ON public.provider_clinic_assignments TO service_role;
ALTER TABLE public.provider_clinic_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can view provider clinic assignments" ON public.provider_clinic_assignments;
DROP POLICY IF EXISTS "Admins manage provider clinic assignments" ON public.provider_clinic_assignments;
CREATE POLICY "Staff can view provider clinic assignments" ON public.provider_clinic_assignments FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage provider clinic assignments" ON public.provider_clinic_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS update_provider_clinic_assignments_updated_at ON public.provider_clinic_assignments;
CREATE TRIGGER update_provider_clinic_assignments_updated_at BEFORE UPDATE ON public.provider_clinic_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========= Linking columns =========
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id);
ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id);
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id),
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS license_state text,
  ADD COLUMN IF NOT EXISTS npi text,
  ADD COLUMN IF NOT EXISTS is_medical_director boolean DEFAULT false;
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id);

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_id ON public.appointments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_encounters_clinic_id ON public.encounters(clinic_id);
CREATE INDEX IF NOT EXISTS idx_providers_clinic_id ON public.providers(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON public.patients(clinic_id);
