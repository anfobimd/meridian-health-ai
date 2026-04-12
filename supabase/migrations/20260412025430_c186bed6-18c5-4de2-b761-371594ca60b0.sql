
-- Add clinic_id to appointments
ALTER TABLE public.appointments
ADD COLUMN clinic_id uuid REFERENCES public.clinics(id);

CREATE INDEX idx_appointments_clinic_id ON public.appointments(clinic_id);

-- Add clinic_id to encounters
ALTER TABLE public.encounters
ADD COLUMN clinic_id uuid REFERENCES public.clinics(id);

CREATE INDEX idx_encounters_clinic_id ON public.encounters(clinic_id);

-- Enrich clinics table
ALTER TABLE public.clinics
ADD COLUMN phone text,
ADD COLUMN timezone text DEFAULT 'America/New_York',
ADD COLUMN city text,
ADD COLUMN state text;
