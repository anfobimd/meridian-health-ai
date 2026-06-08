-- Add missing columns to chart_templates
ALTER TABLE public.chart_templates 
  ADD COLUMN IF NOT EXISTS icon VARCHAR(10) DEFAULT '📋',
  ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#0ab5a8',
  ADD COLUMN IF NOT EXISTS cc_keywords TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS default_icd10 VARCHAR(10)[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS default_cpt VARCHAR(10)[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS auto_protocol_milestone BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_labs BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;

ALTER TABLE public.chart_template_sections
  ADD COLUMN IF NOT EXISTS section_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS icon VARCHAR(10) DEFAULT '📋',
  ADD COLUMN IF NOT EXISTS is_collapsible BOOLEAN DEFAULT TRUE;

ALTER TABLE public.chart_template_fields
  ADD COLUMN IF NOT EXISTS field_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS placeholder TEXT,
  ADD COLUMN IF NOT EXISTS ai_variable VARCHAR(100),
  ADD COLUMN IF NOT EXISTS maps_to_column VARCHAR(100);

CREATE TABLE IF NOT EXISTS public.chart_template_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.chart_templates(id) ON DELETE CASCADE,
  order_type VARCHAR(50) NOT NULL,
  order_key VARCHAR(100) NOT NULL,
  label VARCHAR(255) NOT NULL,
  description TEXT,
  is_auto_added BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  lab_panel VARCHAR(255),
  rx_name VARCHAR(255),
  followup_days INTEGER,
  cpt_code VARCHAR(10),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_template_orders TO anon, authenticated;
GRANT ALL ON public.chart_template_orders TO service_role;
ALTER TABLE public.chart_template_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view chart_template_orders" ON public.chart_template_orders FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert chart_template_orders" ON public.chart_template_orders FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update chart_template_orders" ON public.chart_template_orders FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view chart_template_orders" ON public.chart_template_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert chart_template_orders" ON public.chart_template_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update chart_template_orders" ON public.chart_template_orders FOR UPDATE TO authenticated USING (true);

ALTER TABLE public.encounter_field_responses
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.chart_templates(id),
  ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.chart_template_sections(id),
  ADD COLUMN IF NOT EXISTS field_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS field_label VARCHAR(255),
  ADD COLUMN IF NOT EXISTS field_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS section_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS value_numeric NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS value_boolean BOOLEAN,
  ADD COLUMN IF NOT EXISTS value_json JSONB,
  ADD COLUMN IF NOT EXISTS is_abnormal BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ref_range_low NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS ref_range_high NUMERIC(12,4);

ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.chart_templates(id);

CREATE INDEX IF NOT EXISTS idx_chart_tpl_category ON public.chart_templates(category);
CREATE INDEX IF NOT EXISTS idx_chart_tpl_orders ON public.chart_template_orders(template_id);
CREATE INDEX IF NOT EXISTS idx_efr_field_key ON public.encounter_field_responses(field_key);
CREATE INDEX IF NOT EXISTS idx_efr_template ON public.encounter_field_responses(template_id);

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS weight_lbs numeric(6,1),
  ADD COLUMN IF NOT EXISTS height_in numeric(5,1),
  ADD COLUMN IF NOT EXISTS meno_status text,
  ADD COLUMN IF NOT EXISTS uterine_status text,
  ADD COLUMN IF NOT EXISTS lmp_status text,
  ADD COLUMN IF NOT EXISTS fertility_goals text,
  ADD COLUMN IF NOT EXISTS focus text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS symptoms text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS goals text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_routes text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prior_therapy text,
  ADD COLUMN IF NOT EXISTS contraindications text[] DEFAULT '{}';

ALTER TABLE public.hormone_visits
  ADD COLUMN IF NOT EXISTS lab_igf1 numeric,
  ADD COLUMN IF NOT EXISTS lab_fins numeric,
  ADD COLUMN IF NOT EXISTS lab_crp numeric,
  ADD COLUMN IF NOT EXISTS lab_igfbp3 numeric,
  ADD COLUMN IF NOT EXISTS lab_calcitonin numeric,
  ADD COLUMN IF NOT EXISTS lab_b12 numeric,
  ADD COLUMN IF NOT EXISTS lab_folate numeric,
  ADD COLUMN IF NOT EXISTS lab_vitd numeric,
  ADD COLUMN IF NOT EXISTS lab_ana text,
  ADD COLUMN IF NOT EXISTS lab_rpr text,
  ADD COLUMN IF NOT EXISTS lab_cd4cd8 text,
  ADD COLUMN IF NOT EXISTS lab_igg text,
  ADD COLUMN IF NOT EXISTS lab_apoe text,
  ADD COLUMN IF NOT EXISTS peptide_categories text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS peptide_contraindications text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS intake_symptoms text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS intake_goals text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS intake_focus text[] DEFAULT '{}';

CREATE TABLE public.rooms (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  room_type text NOT NULL DEFAULT 'exam',
  assigned_provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO anon, authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view rooms" ON public.rooms FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert rooms" ON public.rooms FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update rooms" ON public.rooms FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view rooms" ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert rooms" ON public.rooms FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update rooms" ON public.rooms FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.devices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  device_type text NOT NULL DEFAULT 'laser',
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  maintenance_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO anon, authenticated;
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view devices" ON public.devices FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert devices" ON public.devices FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update devices" ON public.devices FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view devices" ON public.devices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert devices" ON public.devices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update devices" ON public.devices FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.treatment_device_requirements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  treatment_id uuid NOT NULL REFERENCES public.treatments(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  is_required boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(treatment_id, device_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_device_requirements TO anon, authenticated;
GRANT ALL ON public.treatment_device_requirements TO service_role;
ALTER TABLE public.treatment_device_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view treatment_device_requirements" ON public.treatment_device_requirements FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert treatment_device_requirements" ON public.treatment_device_requirements FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update treatment_device_requirements" ON public.treatment_device_requirements FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view treatment_device_requirements" ON public.treatment_device_requirements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert treatment_device_requirements" ON public.treatment_device_requirements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update treatment_device_requirements" ON public.treatment_device_requirements FOR UPDATE TO authenticated USING (true);

ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'roomed' AFTER 'checked_in';

ALTER TABLE public.appointments
  ADD COLUMN room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  ADD COLUMN device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  ADD COLUMN roomed_at timestamp with time zone;