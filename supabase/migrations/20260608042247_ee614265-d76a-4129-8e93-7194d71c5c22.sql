
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


-- patients
CREATE POLICY "Anon view patients" ON public.patients FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert patients" ON public.patients FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update patients" ON public.patients FOR UPDATE TO anon USING (true);

-- providers
CREATE POLICY "Anon view providers" ON public.providers FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert providers" ON public.providers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update providers" ON public.providers FOR UPDATE TO anon USING (true);

-- treatments
CREATE POLICY "Anon view treatments" ON public.treatments FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert treatments" ON public.treatments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update treatments" ON public.treatments FOR UPDATE TO anon USING (true);

-- appointments
CREATE POLICY "Anon view appointments" ON public.appointments FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert appointments" ON public.appointments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update appointments" ON public.appointments FOR UPDATE TO anon USING (true);

-- clinical_notes
CREATE POLICY "Anon view clinical_notes" ON public.clinical_notes FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert clinical_notes" ON public.clinical_notes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update clinical_notes" ON public.clinical_notes FOR UPDATE TO anon USING (true);

-- intake_forms
CREATE POLICY "Anon view intake_forms" ON public.intake_forms FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert intake_forms" ON public.intake_forms FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update intake_forms" ON public.intake_forms FOR UPDATE TO anon USING (true);

-- audit_logs
CREATE POLICY "Anon insert audit_logs" ON public.audit_logs FOR INSERT TO anon WITH CHECK (true);


-- Hormone visits table (ported from HCDSS schema)
-- Tracks lab draws, AI recommendations, and physician approvals

CREATE TABLE public.hormone_visits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  provider_id         UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  visit_date          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Lab values (all nullable — only store what was drawn)
  lab_tt              NUMERIC(8,2),   -- Total testosterone ng/dL
  lab_ft              NUMERIC(8,2),   -- Free testosterone pg/mL
  lab_e2              NUMERIC(8,2),   -- Estradiol pg/mL
  lab_p4              NUMERIC(8,2),   -- Progesterone ng/mL
  lab_lh              NUMERIC(8,2),   -- LH mIU/mL
  lab_fsh             NUMERIC(8,2),   -- FSH mIU/mL
  lab_shbg            NUMERIC(8,2),   -- SHBG nmol/L
  lab_prl             NUMERIC(8,2),   -- Prolactin ng/mL
  lab_psa             NUMERIC(8,3),   -- PSA ng/mL
  lab_dhea            NUMERIC(8,2),   -- DHEA-S mcg/dL
  lab_tsh             NUMERIC(8,3),   -- TSH mIU/L
  lab_ft3             NUMERIC(8,2),   -- Free T3 pg/mL
  lab_ft4             NUMERIC(8,2),   -- Free T4 ng/dL
  lab_hgb             NUMERIC(6,2),   -- Hemoglobin g/dL
  lab_hct             NUMERIC(5,2),   -- Hematocrit %
  lab_rbc             NUMERIC(6,2),   -- RBC M/uL
  lab_glc             NUMERIC(6,1),   -- Fasting glucose mg/dL
  lab_a1c             NUMERIC(5,2),   -- HbA1c %
  lab_alt             NUMERIC(7,1),   -- ALT U/L
  lab_ast             NUMERIC(7,1),   -- AST U/L
  lab_crt             NUMERIC(6,3),   -- Creatinine mg/dL

  -- AI recommendation
  ai_recommendation   TEXT,           -- Full raw AI response
  ai_sections         JSONB,          -- Parsed sections [{title, body}]

  -- Physician approval workflow
  approval_status     TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'modified', 'rejected')),
  approved_by         UUID REFERENCES public.providers(id),
  approved_at         TIMESTAMPTZ,
  approval_notes      TEXT,
  edited_treatment    TEXT,           -- Physician-modified treatment plan
  edited_monitoring   TEXT,           -- Physician-modified monitoring plan

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_hormone_visits_patient    ON public.hormone_visits(patient_id);
CREATE INDEX idx_hormone_visits_provider   ON public.hormone_visits(provider_id);
CREATE INDEX idx_hormone_visits_approval   ON public.hormone_visits(approval_status);
CREATE INDEX idx_hormone_visits_date       ON public.hormone_visits(visit_date DESC);

-- Enable RLS
ALTER TABLE public.hormone_visits ENABLE ROW LEVEL SECURITY;

-- Temporary open policies for development (will tighten with auth)
CREATE POLICY "Anon view hormone_visits" ON public.hormone_visits FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert hormone_visits" ON public.hormone_visits FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update hormone_visits" ON public.hormone_visits FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view hormone_visits" ON public.hormone_visits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert hormone_visits" ON public.hormone_visits FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update hormone_visits" ON public.hormone_visits FOR UPDATE TO authenticated USING (true);

-- Updated_at trigger
CREATE TRIGGER update_hormone_visits_updated_at
  BEFORE UPDATE ON public.hormone_visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================
-- PHASE 1: ENRICHED SCHEMA MIGRATION
-- ============================================

-- -----------------------------------------------
-- 1. Treatment Categories
-- -----------------------------------------------
CREATE TABLE public.treatment_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  sort_order integer DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.treatment_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view treatment_categories" ON public.treatment_categories FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view treatment_categories" ON public.treatment_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert treatment_categories" ON public.treatment_categories FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert treatment_categories" ON public.treatment_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update treatment_categories" ON public.treatment_categories FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update treatment_categories" ON public.treatment_categories FOR UPDATE TO authenticated USING (true);

-- Link treatments to categories
ALTER TABLE public.treatments ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.treatment_categories(id);

-- -----------------------------------------------
-- 2. Patient Sub-tables
-- -----------------------------------------------
CREATE TABLE public.patient_allergies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  allergen text NOT NULL,
  reaction text,
  severity text,
  onset_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.patient_allergies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view patient_allergies" ON public.patient_allergies FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view patient_allergies" ON public.patient_allergies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert patient_allergies" ON public.patient_allergies FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert patient_allergies" ON public.patient_allergies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update patient_allergies" ON public.patient_allergies FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update patient_allergies" ON public.patient_allergies FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.patient_medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  name text NOT NULL,
  dosage text,
  frequency text,
  prescriber text,
  start_date date,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.patient_medications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view patient_medications" ON public.patient_medications FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view patient_medications" ON public.patient_medications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert patient_medications" ON public.patient_medications FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert patient_medications" ON public.patient_medications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update patient_medications" ON public.patient_medications FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update patient_medications" ON public.patient_medications FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.patient_medical_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  condition text NOT NULL,
  diagnosed_date date,
  resolved_date date,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.patient_medical_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view patient_medical_history" ON public.patient_medical_history FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view patient_medical_history" ON public.patient_medical_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert patient_medical_history" ON public.patient_medical_history FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert patient_medical_history" ON public.patient_medical_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update patient_medical_history" ON public.patient_medical_history FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update patient_medical_history" ON public.patient_medical_history FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.patient_insurance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  provider_name text NOT NULL,
  policy_number text,
  group_number text,
  subscriber_name text,
  subscriber_dob date,
  relationship text DEFAULT 'self',
  is_primary boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.patient_insurance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view patient_insurance" ON public.patient_insurance FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view patient_insurance" ON public.patient_insurance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert patient_insurance" ON public.patient_insurance FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert patient_insurance" ON public.patient_insurance FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update patient_insurance" ON public.patient_insurance FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update patient_insurance" ON public.patient_insurance FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.patient_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  name text NOT NULL,
  relationship text,
  phone text,
  email text,
  is_emergency boolean NOT NULL DEFAULT false,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.patient_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view patient_contacts" ON public.patient_contacts FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view patient_contacts" ON public.patient_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert patient_contacts" ON public.patient_contacts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert patient_contacts" ON public.patient_contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update patient_contacts" ON public.patient_contacts FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update patient_contacts" ON public.patient_contacts FOR UPDATE TO authenticated USING (true);

-- -----------------------------------------------
-- 3. Encounters & Charting
-- -----------------------------------------------
CREATE TYPE public.encounter_status AS ENUM ('open', 'in_progress', 'completed', 'signed', 'amended');

CREATE TABLE public.encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.providers(id),
  appointment_id uuid REFERENCES public.appointments(id),
  chief_complaint text,
  status encounter_status NOT NULL DEFAULT 'open',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  signed_at timestamptz,
  signed_by uuid REFERENCES public.providers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view encounters" ON public.encounters FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view encounters" ON public.encounters FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert encounters" ON public.encounters FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert encounters" ON public.encounters FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update encounters" ON public.encounters FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update encounters" ON public.encounters FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.chart_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  keywords text[] DEFAULT '{}',
  category text,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chart_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view chart_templates" ON public.chart_templates FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view chart_templates" ON public.chart_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert chart_templates" ON public.chart_templates FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert chart_templates" ON public.chart_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update chart_templates" ON public.chart_templates FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update chart_templates" ON public.chart_templates FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.chart_template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.chart_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer DEFAULT 0,
  is_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chart_template_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view chart_template_sections" ON public.chart_template_sections FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view chart_template_sections" ON public.chart_template_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert chart_template_sections" ON public.chart_template_sections FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert chart_template_sections" ON public.chart_template_sections FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update chart_template_sections" ON public.chart_template_sections FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update chart_template_sections" ON public.chart_template_sections FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.chart_template_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.chart_template_sections(id) ON DELETE CASCADE,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  options jsonb,
  default_value text,
  unit text,
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chart_template_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view chart_template_fields" ON public.chart_template_fields FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view chart_template_fields" ON public.chart_template_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert chart_template_fields" ON public.chart_template_fields FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert chart_template_fields" ON public.chart_template_fields FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update chart_template_fields" ON public.chart_template_fields FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update chart_template_fields" ON public.chart_template_fields FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.encounter_field_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.chart_template_fields(id),
  value text,
  ai_suggested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.encounter_field_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view encounter_field_responses" ON public.encounter_field_responses FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view encounter_field_responses" ON public.encounter_field_responses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert encounter_field_responses" ON public.encounter_field_responses FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert encounter_field_responses" ON public.encounter_field_responses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update encounter_field_responses" ON public.encounter_field_responses FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update encounter_field_responses" ON public.encounter_field_responses FOR UPDATE TO authenticated USING (true);

-- -----------------------------------------------
-- 4. Protocol Templates & Enrollments
-- -----------------------------------------------
CREATE TABLE public.protocol_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  default_duration_weeks integer,
  compound text,
  default_dose text,
  default_frequency text,
  default_route text,
  monitoring_schedule jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.protocol_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view protocol_templates" ON public.protocol_templates FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view protocol_templates" ON public.protocol_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert protocol_templates" ON public.protocol_templates FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert protocol_templates" ON public.protocol_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update protocol_templates" ON public.protocol_templates FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update protocol_templates" ON public.protocol_templates FOR UPDATE TO authenticated USING (true);

CREATE TYPE public.enrollment_status AS ENUM ('active', 'paused', 'completed', 'discontinued');

CREATE TABLE public.protocol_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.protocol_templates(id),
  provider_id uuid REFERENCES public.providers(id),
  protocol_name text NOT NULL,
  compound text,
  dose text,
  frequency text,
  route text,
  start_date date NOT NULL,
  end_date date,
  status enrollment_status NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.protocol_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view protocol_enrollments" ON public.protocol_enrollments FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view protocol_enrollments" ON public.protocol_enrollments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert protocol_enrollments" ON public.protocol_enrollments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert protocol_enrollments" ON public.protocol_enrollments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update protocol_enrollments" ON public.protocol_enrollments FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update protocol_enrollments" ON public.protocol_enrollments FOR UPDATE TO authenticated USING (true);

-- -----------------------------------------------
-- 5. Revenue Cycle
-- -----------------------------------------------
CREATE TYPE public.quote_status AS ENUM ('draft', 'sent', 'accepted', 'declined', 'expired');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'partial', 'paid', 'overdue', 'void');
CREATE TYPE public.payment_method AS ENUM ('cash', 'credit_card', 'debit_card', 'check', 'insurance', 'financing', 'other');

CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.providers(id),
  status quote_status NOT NULL DEFAULT 'draft',
  subtotal numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  notes text,
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view quotes" ON public.quotes FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view quotes" ON public.quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert quotes" ON public.quotes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert quotes" ON public.quotes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update quotes" ON public.quotes FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update quotes" ON public.quotes FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  treatment_id uuid REFERENCES public.treatments(id),
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  discount_percent numeric DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view quote_items" ON public.quote_items FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view quote_items" ON public.quote_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert quote_items" ON public.quote_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert quote_items" ON public.quote_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update quote_items" ON public.quote_items FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update quote_items" ON public.quote_items FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES public.quotes(id),
  appointment_id uuid REFERENCES public.appointments(id),
  status invoice_status NOT NULL DEFAULT 'draft',
  subtotal numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  amount_paid numeric DEFAULT 0,
  balance_due numeric DEFAULT 0,
  due_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view invoices" ON public.invoices FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert invoices" ON public.invoices FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update invoices" ON public.invoices FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update invoices" ON public.invoices FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  treatment_id uuid REFERENCES public.treatments(id),
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  discount_percent numeric DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view invoice_items" ON public.invoice_items FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view invoice_items" ON public.invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert invoice_items" ON public.invoice_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert invoice_items" ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update invoice_items" ON public.invoice_items FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update invoice_items" ON public.invoice_items FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  amount numeric NOT NULL,
  method payment_method NOT NULL DEFAULT 'credit_card',
  reference_number text,
  notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view payments" ON public.payments FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view payments" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert payments" ON public.payments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update payments" ON public.payments FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update payments" ON public.payments FOR UPDATE TO authenticated USING (true);

-- -----------------------------------------------
-- 6. Scheduling
-- -----------------------------------------------
CREATE TABLE public.provider_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_start time,
  break_end time,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view provider_availability" ON public.provider_availability FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view provider_availability" ON public.provider_availability FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert provider_availability" ON public.provider_availability FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert provider_availability" ON public.provider_availability FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update provider_availability" ON public.provider_availability FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update provider_availability" ON public.provider_availability FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.provider_availability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  override_date date NOT NULL,
  is_available boolean NOT NULL DEFAULT false,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_availability_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view overrides" ON public.provider_availability_overrides FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view overrides" ON public.provider_availability_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert overrides" ON public.provider_availability_overrides FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert overrides" ON public.provider_availability_overrides FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update overrides" ON public.provider_availability_overrides FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update overrides" ON public.provider_availability_overrides FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.appointment_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  treatment_id uuid REFERENCES public.treatments(id),
  provider_id uuid REFERENCES public.providers(id),
  preferred_date date,
  preferred_time_start time,
  preferred_time_end time,
  notes text,
  is_fulfilled boolean NOT NULL DEFAULT false,
  fulfilled_appointment_id uuid REFERENCES public.appointments(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.appointment_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view waitlist" ON public.appointment_waitlist FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view waitlist" ON public.appointment_waitlist FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert waitlist" ON public.appointment_waitlist FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert waitlist" ON public.appointment_waitlist FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update waitlist" ON public.appointment_waitlist FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update waitlist" ON public.appointment_waitlist FOR UPDATE TO authenticated USING (true);

-- -----------------------------------------------
-- 7. Lab System
-- -----------------------------------------------
CREATE TYPE public.lab_order_status AS ENUM ('ordered', 'collected', 'processing', 'resulted', 'cancelled');

CREATE TABLE public.lab_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.providers(id),
  encounter_id uuid REFERENCES public.encounters(id),
  order_date timestamptz NOT NULL DEFAULT now(),
  lab_name text,
  tests_ordered text[] DEFAULT '{}',
  status lab_order_status NOT NULL DEFAULT 'ordered',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lab_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view lab_orders" ON public.lab_orders FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view lab_orders" ON public.lab_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert lab_orders" ON public.lab_orders FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert lab_orders" ON public.lab_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update lab_orders" ON public.lab_orders FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update lab_orders" ON public.lab_orders FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.lab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_order_id uuid NOT NULL REFERENCES public.lab_orders(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  test_name text NOT NULL,
  value numeric,
  value_text text,
  unit text,
  reference_low numeric,
  reference_high numeric,
  is_abnormal boolean DEFAULT false,
  resulted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lab_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view lab_results" ON public.lab_results FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view lab_results" ON public.lab_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert lab_results" ON public.lab_results FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert lab_results" ON public.lab_results FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update lab_results" ON public.lab_results FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update lab_results" ON public.lab_results FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.providers(id),
  encounter_id uuid REFERENCES public.encounters(id),
  medication_name text NOT NULL,
  dosage text,
  frequency text,
  route text,
  quantity integer,
  refills integer DEFAULT 0,
  start_date date,
  end_date date,
  pharmacy text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view prescriptions" ON public.prescriptions FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view prescriptions" ON public.prescriptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert prescriptions" ON public.prescriptions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert prescriptions" ON public.prescriptions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update prescriptions" ON public.prescriptions FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update prescriptions" ON public.prescriptions FOR UPDATE TO authenticated USING (true);

-- -----------------------------------------------
-- 8. Updated_at triggers for new tables
-- -----------------------------------------------
CREATE TRIGGER update_treatment_categories_updated_at BEFORE UPDATE ON public.treatment_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_patient_insurance_updated_at BEFORE UPDATE ON public.patient_insurance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_encounters_updated_at BEFORE UPDATE ON public.encounters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_chart_templates_updated_at BEFORE UPDATE ON public.chart_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_encounter_field_responses_updated_at BEFORE UPDATE ON public.encounter_field_responses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_protocol_templates_updated_at BEFORE UPDATE ON public.protocol_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_protocol_enrollments_updated_at BEFORE UPDATE ON public.protocol_enrollments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lab_orders_updated_at BEFORE UPDATE ON public.lab_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_prescriptions_updated_at BEFORE UPDATE ON public.prescriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_appointment_waitlist_updated_at BEFORE UPDATE ON public.appointment_waitlist FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
