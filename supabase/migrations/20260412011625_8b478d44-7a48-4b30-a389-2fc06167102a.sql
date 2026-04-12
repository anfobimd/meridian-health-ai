
-- Add telehealth fields to appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS visit_type text NOT NULL DEFAULT 'in_person',
  ADD COLUMN IF NOT EXISTS video_room_url text,
  ADD COLUMN IF NOT EXISTS intake_form_id uuid REFERENCES public.intake_forms(id);

-- Index for quick telehealth filtering
CREATE INDEX IF NOT EXISTS idx_appointments_visit_type ON public.appointments(visit_type);
