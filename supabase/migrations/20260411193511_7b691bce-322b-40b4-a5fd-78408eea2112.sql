-- 1. Vitals table
CREATE TABLE public.vitals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.encounters(id) ON DELETE SET NULL,
  bp_systolic integer,
  bp_diastolic integer,
  heart_rate integer,
  temperature numeric(5,1),
  weight_lbs numeric(6,1),
  height_in numeric(5,1),
  o2_sat numeric(5,1),
  pain_scale integer,
  bmi numeric(5,1),
  recorded_by uuid REFERENCES auth.users(id),
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.vitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view vitals" ON public.vitals FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "Staff can insert vitals" ON public.vitals FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "Staff can update vitals" ON public.vitals FOR UPDATE TO authenticated USING (is_staff(auth.uid()));

CREATE TRIGGER update_vitals_updated_at BEFORE UPDATE ON public.vitals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_vitals_patient ON public.vitals(patient_id);
CREATE INDEX idx_vitals_encounter ON public.vitals(encounter_id);

-- 2. Clinical note addenda table
CREATE TABLE public.clinical_note_addenda (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id uuid NOT NULL REFERENCES public.clinical_notes(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  content text NOT NULL,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.clinical_note_addenda ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view addenda" ON public.clinical_note_addenda FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "Staff can insert addenda" ON public.clinical_note_addenda FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

CREATE INDEX idx_addenda_note ON public.clinical_note_addenda(note_id);

-- 3. Add photo_release to consent_type enum
ALTER TYPE public.consent_type ADD VALUE IF NOT EXISTS 'photo_release';