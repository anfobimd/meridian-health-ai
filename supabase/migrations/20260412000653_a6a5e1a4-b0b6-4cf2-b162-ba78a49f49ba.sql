
CREATE TABLE public.encounter_admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid REFERENCES public.encounters(id) ON DELETE CASCADE NOT NULL,
  patient_id uuid REFERENCES public.patients(id) NOT NULL,
  author_id uuid NOT NULL,
  note_type text NOT NULL DEFAULT 'general',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.encounter_admin_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read admin notes"
  ON public.encounter_admin_notes FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can create admin notes"
  ON public.encounter_admin_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND auth.uid() = author_id);

CREATE POLICY "Staff can update own admin notes"
  ON public.encounter_admin_notes FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND auth.uid() = author_id);

CREATE INDEX idx_encounter_admin_notes_encounter ON public.encounter_admin_notes(encounter_id);
CREATE INDEX idx_encounter_admin_notes_patient ON public.encounter_admin_notes(patient_id);
