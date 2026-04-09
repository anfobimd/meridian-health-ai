
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'provider', 'front_desk');
CREATE TYPE public.appointment_status AS ENUM ('booked', 'checked_in', 'in_progress', 'completed', 'no_show', 'cancelled');
CREATE TYPE public.note_status AS ENUM ('draft', 'signed', 'amended');

-- Timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- user_roles table FIRST
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- has_role function AFTER user_roles exists
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- patients
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  date_of_birth DATE, gender TEXT, email TEXT, phone TEXT,
  address TEXT, city TEXT, state TEXT, zip TEXT,
  insurance_provider TEXT, insurance_id TEXT,
  allergies TEXT[], medications TEXT[],
  emergency_contact_name TEXT, emergency_contact_phone TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view patients" ON public.patients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert patients" ON public.patients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update patients" ON public.patients FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- providers
CREATE TABLE public.providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  specialty TEXT, credentials TEXT, license_number TEXT, npi TEXT,
  bio TEXT, phone TEXT, email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view providers" ON public.providers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert providers" ON public.providers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update providers" ON public.providers FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON public.providers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- treatments
CREATE TABLE public.treatments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, description TEXT, category TEXT,
  duration_minutes INTEGER DEFAULT 30,
  price NUMERIC(10,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view treatments" ON public.treatments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert treatments" ON public.treatments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update treatments" ON public.treatments FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_treatments_updated_at BEFORE UPDATE ON public.treatments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- appointments
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  treatment_id UUID REFERENCES public.treatments(id) ON DELETE SET NULL,
  status appointment_status NOT NULL DEFAULT 'booked',
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  notes TEXT,
  checked_in_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view appointments" ON public.appointments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert appointments" ON public.appointments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update appointments" ON public.appointments FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- clinical_notes
CREATE TABLE public.clinical_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  subjective TEXT, objective TEXT, assessment TEXT, plan TEXT,
  status note_status NOT NULL DEFAULT 'draft',
  signed_at TIMESTAMPTZ,
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clinical_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view clinical_notes" ON public.clinical_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert clinical_notes" ON public.clinical_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update clinical_notes" ON public.clinical_notes FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_clinical_notes_updated_at BEFORE UPDATE ON public.clinical_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- intake_forms
CREATE TABLE public.intake_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  form_type TEXT NOT NULL DEFAULT 'general',
  responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.intake_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view intake_forms" ON public.intake_forms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert intake_forms" ON public.intake_forms FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update intake_forms" ON public.intake_forms FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_intake_forms_updated_at BEFORE UPDATE ON public.intake_forms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- audit_logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, table_name TEXT NOT NULL,
  record_id UUID, old_values JSONB, new_values JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth insert audit_logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins view audit_logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Indexes
CREATE INDEX idx_appointments_patient ON public.appointments(patient_id);
CREATE INDEX idx_appointments_provider ON public.appointments(provider_id);
CREATE INDEX idx_appointments_scheduled ON public.appointments(scheduled_at);
CREATE INDEX idx_appointments_status ON public.appointments(status);
CREATE INDEX idx_notes_patient ON public.clinical_notes(patient_id);
CREATE INDEX idx_notes_appointment ON public.clinical_notes(appointment_id);
CREATE INDEX idx_intake_patient ON public.intake_forms(patient_id);
CREATE INDEX idx_audit_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_table ON public.audit_logs(table_name);
CREATE INDEX idx_patients_name ON public.patients(last_name);
CREATE INDEX idx_patients_email ON public.patients(email);
