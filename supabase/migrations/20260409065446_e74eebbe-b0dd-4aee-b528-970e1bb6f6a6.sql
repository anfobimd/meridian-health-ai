
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
  severity text, -- mild, moderate, severe
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
  field_type text NOT NULL DEFAULT 'text', -- text, measurement, scale, select, checkbox, computed
  options jsonb, -- for select/checkbox: array of options
  default_value text,
  unit text, -- for measurement fields (e.g., "mg", "mL", "units")
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
  category text, -- TRT, GLP-1, HRT, BPC-157, etc.
  default_duration_weeks integer,
  compound text,
  default_dose text,
  default_frequency text,
  default_route text, -- IM, SubQ, oral, topical
  monitoring_schedule jsonb, -- e.g., {"labs_at_weeks": [6, 12, 24]}
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
  day_of_week integer NOT NULL, -- 0=Sun, 6=Sat
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
