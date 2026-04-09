
-- Add HCDSS intake fields to patients table
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS weight_lbs numeric(6,1),
  ADD COLUMN IF NOT EXISTS height_in numeric(5,1),
  ADD COLUMN IF NOT EXISTS meno_status text,
  ADD COLUMN IF NOT EXISTS uterine_status text,
  ADD COLUMN IF NOT EXISTS lmp_status text,
  ADD COLUMN IF NOT EXISTS fertility_goals text,
  ADD COLUMN IF NOT EXISTS focus text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS symptoms text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS goals text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_routes text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prior_therapy text,
  ADD COLUMN IF NOT EXISTS contraindications text[] DEFAULT '{}';

-- Add peptide-specific lab columns and metadata to hormone_visits
ALTER TABLE public.hormone_visits
  ADD COLUMN IF NOT EXISTS lab_igf1 numeric,
  ADD COLUMN IF NOT EXISTS lab_fins numeric,
  ADD COLUMN IF NOT EXISTS lab_crp numeric,
  ADD COLUMN IF NOT EXISTS lab_igfbp3 numeric,
  ADD COLUMN IF NOT EXISTS lab_calcitonin numeric,
  ADD COLUMN IF NOT EXISTS lab_b12 numeric,
  ADD COLUMN IF NOT EXISTS lab_folate numeric,
  ADD COLUMN IF NOT EXISTS lab_vitd numeric,
  ADD COLUMN IF NOT EXISTS lab_ana text,
  ADD COLUMN IF NOT EXISTS lab_rpr text,
  ADD COLUMN IF NOT EXISTS lab_cd4cd8 text,
  ADD COLUMN IF NOT EXISTS lab_igg text,
  ADD COLUMN IF NOT EXISTS lab_apoe text,
  ADD COLUMN IF NOT EXISTS peptide_categories text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS peptide_contraindications text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS intake_symptoms text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS intake_goals text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS intake_focus text[] DEFAULT '{}';
