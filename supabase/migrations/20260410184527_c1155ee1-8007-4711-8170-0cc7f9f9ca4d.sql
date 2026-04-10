
CREATE TABLE public.ai_treatment_recommendations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  goals_input text[] DEFAULT '{}'::text[],
  model_used text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_treatment_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view ai_treatment_recommendations"
  ON public.ai_treatment_recommendations
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE INDEX idx_ai_treatment_rec_patient ON public.ai_treatment_recommendations(patient_id);
