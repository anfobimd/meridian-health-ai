-- Create patient churn risk scores table
CREATE TABLE public.patient_churn_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  risk_score numeric NOT NULL DEFAULT 0,
  risk_tier text NOT NULL DEFAULT 'low',
  factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_summary text,
  last_visit_date date,
  days_since_visit integer,
  visit_count_90d integer DEFAULT 0,
  has_active_package boolean DEFAULT false,
  scored_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(patient_id)
);

-- Enable RLS
ALTER TABLE public.patient_churn_scores ENABLE ROW LEVEL SECURITY;

-- Staff-only access (internal metric)
CREATE POLICY "Staff can view churn scores" ON public.patient_churn_scores
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can insert churn scores" ON public.patient_churn_scores
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff can update churn scores" ON public.patient_churn_scores
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- Index for quick lookups
CREATE INDEX idx_churn_scores_risk ON public.patient_churn_scores(risk_tier, risk_score DESC);
CREATE INDEX idx_churn_scores_patient ON public.patient_churn_scores(patient_id);

-- Timestamp trigger
CREATE TRIGGER update_churn_scores_updated_at
  BEFORE UPDATE ON public.patient_churn_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();