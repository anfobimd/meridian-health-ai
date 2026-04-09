
-- 1. chart_review_records
CREATE TABLE public.chart_review_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id),
  reviewer_id uuid REFERENCES public.providers(id),
  provider_id uuid REFERENCES public.providers(id),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  status text NOT NULL DEFAULT 'pending_ai',
  ai_priority_score numeric DEFAULT 0,
  ai_risk_tier text DEFAULT 'low',
  review_started_at timestamptz,
  review_completed_at timestamptz,
  review_duration_seconds integer,
  rubber_stamp_threshold_seconds integer DEFAULT 30,
  md_comment text,
  md_action text,
  correction_details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chart_review_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view chart_review_records" ON public.chart_review_records FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert chart_review_records" ON public.chart_review_records FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update chart_review_records" ON public.chart_review_records FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view chart_review_records" ON public.chart_review_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert chart_review_records" ON public.chart_review_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update chart_review_records" ON public.chart_review_records FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_chart_review_records_updated_at BEFORE UPDATE ON public.chart_review_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. ai_chart_analysis
CREATE TABLE public.ai_chart_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id),
  review_record_id uuid REFERENCES public.chart_review_records(id),
  risk_score numeric DEFAULT 0,
  risk_tier text DEFAULT 'low',
  documentation_score numeric DEFAULT 0,
  ai_flags jsonb DEFAULT '[]'::jsonb,
  brief jsonb DEFAULT '{}'::jsonb,
  recommended_action text,
  estimated_review_seconds integer DEFAULT 30,
  model_used text,
  prompt_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_chart_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view ai_chart_analysis" ON public.ai_chart_analysis FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert ai_chart_analysis" ON public.ai_chart_analysis FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth view ai_chart_analysis" ON public.ai_chart_analysis FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert ai_chart_analysis" ON public.ai_chart_analysis FOR INSERT TO authenticated WITH CHECK (true);

-- 3. ai_provider_intelligence
CREATE TABLE public.ai_provider_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id),
  total_charts integer DEFAULT 0,
  correction_rate numeric DEFAULT 0,
  avg_documentation_score numeric DEFAULT 0,
  recurring_issues jsonb DEFAULT '[]'::jsonb,
  coaching_status text DEFAULT 'none',
  coaching_notes text,
  last_analyzed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_provider_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view ai_provider_intelligence" ON public.ai_provider_intelligence FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert ai_provider_intelligence" ON public.ai_provider_intelligence FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update ai_provider_intelligence" ON public.ai_provider_intelligence FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view ai_provider_intelligence" ON public.ai_provider_intelligence FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert ai_provider_intelligence" ON public.ai_provider_intelligence FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update ai_provider_intelligence" ON public.ai_provider_intelligence FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_ai_provider_intelligence_updated_at BEFORE UPDATE ON public.ai_provider_intelligence FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. ai_oversight_reports
CREATE TABLE public.ai_oversight_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_month date NOT NULL,
  report_type text NOT NULL DEFAULT 'monthly',
  narrative text,
  alerts jsonb DEFAULT '[]'::jsonb,
  highlights jsonb DEFAULT '[]'::jsonb,
  recommendations jsonb DEFAULT '[]'::jsonb,
  metrics jsonb DEFAULT '{}'::jsonb,
  generated_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_oversight_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view ai_oversight_reports" ON public.ai_oversight_reports FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert ai_oversight_reports" ON public.ai_oversight_reports FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth view ai_oversight_reports" ON public.ai_oversight_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert ai_oversight_reports" ON public.ai_oversight_reports FOR INSERT TO authenticated WITH CHECK (true);

-- 5. ai_doc_checklists
CREATE TABLE public.ai_doc_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_type text NOT NULL,
  checklist_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_doc_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view ai_doc_checklists" ON public.ai_doc_checklists FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert ai_doc_checklists" ON public.ai_doc_checklists FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update ai_doc_checklists" ON public.ai_doc_checklists FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view ai_doc_checklists" ON public.ai_doc_checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert ai_doc_checklists" ON public.ai_doc_checklists FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update ai_doc_checklists" ON public.ai_doc_checklists FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_ai_doc_checklists_updated_at BEFORE UPDATE ON public.ai_doc_checklists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. ai_md_consistency
CREATE TABLE public.ai_md_consistency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id uuid NOT NULL REFERENCES public.providers(id),
  month date NOT NULL,
  total_reviews integer DEFAULT 0,
  correction_rate numeric DEFAULT 0,
  avg_review_seconds integer DEFAULT 0,
  rubber_stamp_count integer DEFAULT 0,
  consistency_score numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_md_consistency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view ai_md_consistency" ON public.ai_md_consistency FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert ai_md_consistency" ON public.ai_md_consistency FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth view ai_md_consistency" ON public.ai_md_consistency FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert ai_md_consistency" ON public.ai_md_consistency FOR INSERT TO authenticated WITH CHECK (true);

-- 7. ai_api_calls
CREATE TABLE public.ai_api_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  model_used text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  status text DEFAULT 'success',
  error_message text,
  encounter_id uuid REFERENCES public.encounters(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_api_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view ai_api_calls" ON public.ai_api_calls FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert ai_api_calls" ON public.ai_api_calls FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth view ai_api_calls" ON public.ai_api_calls FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert ai_api_calls" ON public.ai_api_calls FOR INSERT TO authenticated WITH CHECK (true);

-- 8. ai_prompts
CREATE TABLE public.ai_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key text NOT NULL UNIQUE,
  prompt_name text NOT NULL,
  system_prompt text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view ai_prompts" ON public.ai_prompts FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert ai_prompts" ON public.ai_prompts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update ai_prompts" ON public.ai_prompts FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view ai_prompts" ON public.ai_prompts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert ai_prompts" ON public.ai_prompts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update ai_prompts" ON public.ai_prompts FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_ai_prompts_updated_at BEFORE UPDATE ON public.ai_prompts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Alter encounters — add encounter_type
ALTER TABLE public.encounters ADD COLUMN IF NOT EXISTS encounter_type text DEFAULT 'general';
