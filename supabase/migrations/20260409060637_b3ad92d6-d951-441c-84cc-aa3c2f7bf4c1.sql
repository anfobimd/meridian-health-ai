
-- Hormone visits table (ported from HCDSS schema)
-- Tracks lab draws, AI recommendations, and physician approvals

CREATE TABLE public.hormone_visits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  provider_id         UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  visit_date          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Lab values (all nullable — only store what was drawn)
  lab_tt              NUMERIC(8,2),   -- Total testosterone ng/dL
  lab_ft              NUMERIC(8,2),   -- Free testosterone pg/mL
  lab_e2              NUMERIC(8,2),   -- Estradiol pg/mL
  lab_p4              NUMERIC(8,2),   -- Progesterone ng/mL
  lab_lh              NUMERIC(8,2),   -- LH mIU/mL
  lab_fsh             NUMERIC(8,2),   -- FSH mIU/mL
  lab_shbg            NUMERIC(8,2),   -- SHBG nmol/L
  lab_prl             NUMERIC(8,2),   -- Prolactin ng/mL
  lab_psa             NUMERIC(8,3),   -- PSA ng/mL
  lab_dhea            NUMERIC(8,2),   -- DHEA-S mcg/dL
  lab_tsh             NUMERIC(8,3),   -- TSH mIU/L
  lab_ft3             NUMERIC(8,2),   -- Free T3 pg/mL
  lab_ft4             NUMERIC(8,2),   -- Free T4 ng/dL
  lab_hgb             NUMERIC(6,2),   -- Hemoglobin g/dL
  lab_hct             NUMERIC(5,2),   -- Hematocrit %
  lab_rbc             NUMERIC(6,2),   -- RBC M/uL
  lab_glc             NUMERIC(6,1),   -- Fasting glucose mg/dL
  lab_a1c             NUMERIC(5,2),   -- HbA1c %
  lab_alt             NUMERIC(7,1),   -- ALT U/L
  lab_ast             NUMERIC(7,1),   -- AST U/L
  lab_crt             NUMERIC(6,3),   -- Creatinine mg/dL

  -- AI recommendation
  ai_recommendation   TEXT,           -- Full raw AI response
  ai_sections         JSONB,          -- Parsed sections [{title, body}]

  -- Physician approval workflow
  approval_status     TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'modified', 'rejected')),
  approved_by         UUID REFERENCES public.providers(id),
  approved_at         TIMESTAMPTZ,
  approval_notes      TEXT,
  edited_treatment    TEXT,           -- Physician-modified treatment plan
  edited_monitoring   TEXT,           -- Physician-modified monitoring plan

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_hormone_visits_patient    ON public.hormone_visits(patient_id);
CREATE INDEX idx_hormone_visits_provider   ON public.hormone_visits(provider_id);
CREATE INDEX idx_hormone_visits_approval   ON public.hormone_visits(approval_status);
CREATE INDEX idx_hormone_visits_date       ON public.hormone_visits(visit_date DESC);

-- Enable RLS
ALTER TABLE public.hormone_visits ENABLE ROW LEVEL SECURITY;

-- Temporary open policies for development (will tighten with auth)
CREATE POLICY "Anon view hormone_visits" ON public.hormone_visits FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert hormone_visits" ON public.hormone_visits FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update hormone_visits" ON public.hormone_visits FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view hormone_visits" ON public.hormone_visits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert hormone_visits" ON public.hormone_visits FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update hormone_visits" ON public.hormone_visits FOR UPDATE TO authenticated USING (true);

-- Updated_at trigger
CREATE TRIGGER update_hormone_visits_updated_at
  BEFORE UPDATE ON public.hormone_visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
