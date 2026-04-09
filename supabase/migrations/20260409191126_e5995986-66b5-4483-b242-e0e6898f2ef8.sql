
-- 1. oversight_config table for system settings
CREATE TABLE public.oversight_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key text NOT NULL UNIQUE,
  config_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oversight_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon view oversight_config" ON public.oversight_config FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view oversight_config" ON public.oversight_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon update oversight_config" ON public.oversight_config FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update oversight_config" ON public.oversight_config FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anon insert oversight_config" ON public.oversight_config FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert oversight_config" ON public.oversight_config FOR INSERT TO authenticated WITH CHECK (true);

CREATE TRIGGER update_oversight_config_updated_at
  BEFORE UPDATE ON public.oversight_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default config
INSERT INTO public.oversight_config (config_key, config_value, description) VALUES
  ('sampling_rates', '{"low": 0.1, "medium": 0.5, "high": 1.0, "critical": 1.0}'::jsonb, 'Percentage of charts sampled per risk tier'),
  ('rubber_stamp_thresholds', '{"low": 30, "medium": 90, "high": 180, "critical": 300}'::jsonb, 'Minimum review seconds per risk tier'),
  ('coaching_thresholds', '{"monitoring": 0.15, "probation": 0.25}'::jsonb, 'Correction rate thresholds for coaching escalation'),
  ('mandatory_review_chart_count', '30'::jsonb, 'Providers with fewer reviewed charts get 100% review'),
  ('report_generation_day', '1'::jsonb, 'Day of month to generate oversight reports');

-- 2. coaching_actions table
CREATE TABLE public.coaching_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES public.providers(id),
  action_type text NOT NULL DEFAULT 'note',
  title text NOT NULL,
  description text,
  created_by text,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coaching_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon view coaching_actions" ON public.coaching_actions FOR SELECT TO anon USING (true);
CREATE POLICY "Auth view coaching_actions" ON public.coaching_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon insert coaching_actions" ON public.coaching_actions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth insert coaching_actions" ON public.coaching_actions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon update coaching_actions" ON public.coaching_actions FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update coaching_actions" ON public.coaching_actions FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_coaching_actions_updated_at
  BEFORE UPDATE ON public.coaching_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Add update policies for ai_md_consistency and ai_api_calls
CREATE POLICY "Anon update ai_md_consistency" ON public.ai_md_consistency FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update ai_md_consistency" ON public.ai_md_consistency FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Anon update ai_api_calls" ON public.ai_api_calls FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update ai_api_calls" ON public.ai_api_calls FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Anon update ai_oversight_reports" ON public.ai_oversight_reports FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth update ai_oversight_reports" ON public.ai_oversight_reports FOR UPDATE TO authenticated USING (true);

-- 4. Auto-queue trigger: when encounter is signed, create chart_review_record
CREATE OR REPLACE FUNCTION public.auto_queue_encounter_for_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_total_charts int;
  v_provider_correction_rate numeric;
  v_priority numeric;
  v_risk_tier text;
  v_threshold_seconds int;
  v_sampling_rates jsonb;
  v_mandatory_count int;
  v_sample_rate numeric;
  v_should_queue boolean;
BEGIN
  -- Only fire when encounter transitions to signed
  IF NEW.signed_at IS NOT NULL AND (OLD.signed_at IS NULL) THEN

    -- Check if already queued
    IF EXISTS (SELECT 1 FROM chart_review_records WHERE encounter_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    -- Get provider stats
    SELECT total_charts, correction_rate INTO v_provider_total_charts, v_provider_correction_rate
    FROM ai_provider_intelligence WHERE provider_id = NEW.provider_id;

    v_provider_total_charts := COALESCE(v_provider_total_charts, 0);
    v_provider_correction_rate := COALESCE(v_provider_correction_rate, 0);

    -- Calculate initial risk tier based on procedure type and provider history
    IF NEW.encounter_type IN ('laser', 'filler', 'botox') AND v_provider_correction_rate > 0.15 THEN
      v_risk_tier := 'critical';
    ELSIF NEW.encounter_type IN ('laser', 'filler', 'botox') OR v_provider_correction_rate > 0.15 THEN
      v_risk_tier := 'high';
    ELSIF v_provider_correction_rate > 0.08 THEN
      v_risk_tier := 'medium';
    ELSE
      v_risk_tier := 'low';
    END IF;

    -- Get sampling config
    SELECT config_value INTO v_sampling_rates FROM oversight_config WHERE config_key = 'sampling_rates';
    SELECT (config_value)::int INTO v_mandatory_count FROM oversight_config WHERE config_key = 'mandatory_review_chart_count';

    v_sampling_rates := COALESCE(v_sampling_rates, '{"low":0.1,"medium":0.5,"high":1.0,"critical":1.0}'::jsonb);
    v_mandatory_count := COALESCE(v_mandatory_count, 30);

    v_sample_rate := COALESCE((v_sampling_rates->>v_risk_tier)::numeric, 0.5);

    -- Determine if this chart should be queued
    v_should_queue := false;
    IF v_risk_tier IN ('high', 'critical') THEN
      v_should_queue := true;
    ELSIF v_provider_total_charts < v_mandatory_count THEN
      v_should_queue := true;
    ELSIF random() < v_sample_rate THEN
      v_should_queue := true;
    END IF;

    IF v_should_queue THEN
      -- Calculate priority score (higher = review first)
      v_priority := 50; -- base
      IF v_risk_tier = 'critical' THEN v_priority := v_priority + 40;
      ELSIF v_risk_tier = 'high' THEN v_priority := v_priority + 25;
      ELSIF v_risk_tier = 'medium' THEN v_priority := v_priority + 10;
      END IF;
      v_priority := v_priority + LEAST(v_provider_correction_rate * 100, 20);
      IF v_provider_total_charts < v_mandatory_count THEN v_priority := v_priority + 15; END IF;

      -- Get rubber stamp threshold
      SELECT COALESCE((config_value->>v_risk_tier)::int, 30) INTO v_threshold_seconds
      FROM oversight_config WHERE config_key = 'rubber_stamp_thresholds';
      v_threshold_seconds := COALESCE(v_threshold_seconds, 30);

      INSERT INTO chart_review_records (
        encounter_id, patient_id, provider_id, status,
        ai_priority_score, ai_risk_tier, rubber_stamp_threshold_seconds
      ) VALUES (
        NEW.id, NEW.patient_id, NEW.provider_id, 'pending_ai',
        v_priority, v_risk_tier, v_threshold_seconds
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_queue_encounter
  AFTER UPDATE ON public.encounters
  FOR EACH ROW EXECUTE FUNCTION public.auto_queue_encounter_for_review();

-- 5. Update provider intelligence when a review is completed
CREATE OR REPLACE FUNCTION public.update_provider_intelligence_on_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_id uuid;
  v_total int;
  v_corrections int;
  v_rate numeric;
  v_coaching_thresholds jsonb;
  v_new_status text;
BEGIN
  -- Only fire when review is completed (status changes to approved or corrected)
  IF NEW.status IN ('approved', 'corrected') AND OLD.status NOT IN ('approved', 'corrected') THEN
    v_provider_id := NEW.provider_id;

    IF v_provider_id IS NULL THEN RETURN NEW; END IF;

    -- Count totals for this provider
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'corrected')
    INTO v_total, v_corrections
    FROM chart_review_records
    WHERE provider_id = v_provider_id AND status IN ('approved', 'corrected');

    v_rate := CASE WHEN v_total > 0 THEN v_corrections::numeric / v_total ELSE 0 END;

    -- Determine coaching status
    SELECT config_value INTO v_coaching_thresholds FROM oversight_config WHERE config_key = 'coaching_thresholds';
    v_coaching_thresholds := COALESCE(v_coaching_thresholds, '{"monitoring":0.15,"probation":0.25}'::jsonb);

    IF v_rate >= COALESCE((v_coaching_thresholds->>'probation')::numeric, 0.25) THEN
      v_new_status := 'probation';
    ELSIF v_rate >= COALESCE((v_coaching_thresholds->>'monitoring')::numeric, 0.15) THEN
      v_new_status := 'monitoring';
    ELSE
      v_new_status := 'none';
    END IF;

    -- Upsert provider intelligence
    INSERT INTO ai_provider_intelligence (provider_id, total_charts, correction_rate, coaching_status, last_analyzed_at)
    VALUES (v_provider_id, v_total, v_rate, v_new_status, now())
    ON CONFLICT (provider_id) DO UPDATE SET
      total_charts = EXCLUDED.total_charts,
      correction_rate = EXCLUDED.correction_rate,
      coaching_status = CASE
        WHEN ai_provider_intelligence.coaching_status = 'probation' AND EXCLUDED.coaching_status = 'monitoring' THEN 'probation'
        ELSE EXCLUDED.coaching_status
      END,
      last_analyzed_at = now(),
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_provider_intel
  AFTER UPDATE ON public.chart_review_records
  FOR EACH ROW EXECUTE FUNCTION public.update_provider_intelligence_on_review();

-- Add unique constraint on provider_id for upsert
ALTER TABLE public.ai_provider_intelligence ADD CONSTRAINT ai_provider_intelligence_provider_id_unique UNIQUE (provider_id);
