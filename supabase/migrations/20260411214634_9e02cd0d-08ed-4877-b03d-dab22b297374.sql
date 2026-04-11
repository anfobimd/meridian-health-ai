
ALTER TABLE public.patient_insurance
  ADD COLUMN IF NOT EXISTS eligibility_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS eligibility_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS eligibility_notes text;
