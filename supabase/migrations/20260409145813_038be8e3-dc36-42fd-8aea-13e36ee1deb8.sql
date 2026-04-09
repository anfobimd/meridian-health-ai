
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

-- Add missing columns to chart_template_sections
ALTER TABLE public.chart_template_sections
  ADD COLUMN IF NOT EXISTS section_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS icon VARCHAR(10) DEFAULT '📋',
  ADD COLUMN IF NOT EXISTS is_collapsible BOOLEAN DEFAULT TRUE;

-- Add missing columns to chart_template_fields
ALTER TABLE public.chart_template_fields
  ADD COLUMN IF NOT EXISTS field_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS placeholder TEXT,
  ADD COLUMN IF NOT EXISTS ai_variable VARCHAR(100),
  ADD COLUMN IF NOT EXISTS maps_to_column VARCHAR(100);

-- Create chart_template_orders table
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

ALTER TABLE public.chart_template_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon view chart_template_orders" ON public.chart_template_orders FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert chart_template_orders" ON public.chart_template_orders FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update chart_template_orders" ON public.chart_template_orders FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view chart_template_orders" ON public.chart_template_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert chart_template_orders" ON public.chart_template_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update chart_template_orders" ON public.chart_template_orders FOR UPDATE TO authenticated USING (true);

-- Enhance encounter_field_responses with richer columns
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

-- Add template_id to encounters
ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.chart_templates(id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chart_tpl_category ON public.chart_templates(category);
CREATE INDEX IF NOT EXISTS idx_chart_tpl_orders ON public.chart_template_orders(template_id);
CREATE INDEX IF NOT EXISTS idx_efr_field_key ON public.encounter_field_responses(field_key);
CREATE INDEX IF NOT EXISTS idx_efr_template ON public.encounter_field_responses(template_id);
