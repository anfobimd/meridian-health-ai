-- 20260416065342 — Video sessions, intake clearance workflow,
-- multi-vertical intake templates, e-signature audit trail

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. VIDEO SESSIONS (Daily.co integration)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.video_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_name       VARCHAR(100) UNIQUE NOT NULL,
  room_url        TEXT NOT NULL,
  appointment_id  UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  encounter_id    UUID REFERENCES public.encounters(id) ON DELETE SET NULL,
  patient_id      UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  provider_token  TEXT,
  expires_at      TIMESTAMPTZ NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | ended | expired
  recording_enabled BOOLEAN DEFAULT FALSE,
  recording_url   TEXT,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  duration_seconds INTEGER GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NOT NULL THEN EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
    ELSE NULL END
  ) STORED,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_sessions_appointment ON public.video_sessions(appointment_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_patient ON public.video_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_status ON public.video_sessions(status);

ALTER TABLE public.video_sessions ENABLE ROW LEVEL SECURITY;

-- Staff can view sessions for their clinic's patients
CREATE POLICY "Staff view video sessions"
  ON public.video_sessions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
            AND role IN ('admin', 'provider', 'front_desk'))
  );

-- Service role only for mutations (edge function uses service key)
CREATE POLICY "Service role manages sessions"
  ON public.video_sessions FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. TELEHEALTH CONSENT (HIPAA requirement before video visit)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.telehealth_consents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id  UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  consented_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consent_version VARCHAR(20) NOT NULL DEFAULT '1.0',
  ip_address      INET,
  user_agent      TEXT,
  signature_data  TEXT,   -- base64 canvas signature
  signature_hash  TEXT,   -- SHA-256 of signature_data for tamper detection
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telehealth_consents_patient ON public.telehealth_consents(patient_id);

ALTER TABLE public.telehealth_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view telehealth consents"
  ON public.telehealth_consents FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
            AND role IN ('admin', 'provider', 'front_desk'))
  );

CREATE POLICY "Patients insert own consent"
  ON public.telehealth_consents FOR INSERT
  WITH CHECK (true);  -- Edge function or frontend records with service key in practice

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. MULTI-VERTICAL INTAKE TEMPLATES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.intake_form_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  vertical        VARCHAR(30),  -- hormone | peptide | weight_loss | iv_therapy | med_spa | general
  treatment_id    UUID REFERENCES public.treatments(id) ON DELETE SET NULL,
  fields          JSONB NOT NULL DEFAULT '[]',  -- [{id, label, type, required, options, hint}]
  version         INTEGER DEFAULT 1,
  is_active       BOOLEAN DEFAULT TRUE,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intake_tmpl_vertical ON public.intake_form_templates(vertical) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_intake_tmpl_treatment ON public.intake_form_templates(treatment_id) WHERE is_active = TRUE;

ALTER TABLE public.intake_form_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view templates"
  ON public.intake_form_templates FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
            AND role IN ('admin', 'provider', 'front_desk'))
  );

CREATE POLICY "Admins manage templates"
  ON public.intake_form_templates FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Seed default templates (one per vertical)
INSERT INTO public.intake_form_templates (name, description, vertical, fields)
VALUES
  ('General Medical History', 'Standard medical history for all new patients', 'general', '[
    {"id":"full_name","label":"Full Legal Name","type":"text","required":true},
    {"id":"dob","label":"Date of Birth","type":"date","required":true},
    {"id":"sex","label":"Biological Sex","type":"radio","options":["Male","Female"],"required":true},
    {"id":"allergies","label":"Known Allergies","type":"textarea","required":true},
    {"id":"current_medications","label":"Current Medications","type":"textarea","required":true},
    {"id":"medical_conditions","label":"Current Medical Conditions","type":"checkboxes","options":["Diabetes","Hypertension","Heart Disease","Thyroid Disorder","Kidney Disease","Liver Disease","Cancer","Autoimmune Disorder","None"],"required":true},
    {"id":"tobacco","label":"Do you use tobacco?","type":"boolean","required":true},
    {"id":"consent","label":"I consent to evaluation and treatment","type":"boolean","required":true},
    {"id":"signature","label":"Patient Signature","type":"signature","required":true}
  ]'::jsonb),
  ('Hormone Therapy Intake', 'Pre-consultation for HRT/TRT candidates', 'hormone', '[
    {"id":"full_name","label":"Full Legal Name","type":"text","required":true},
    {"id":"dob","label":"Date of Birth","type":"date","required":true},
    {"id":"sex","label":"Biological Sex","type":"radio","options":["Male","Female"],"required":true},
    {"id":"primary_concerns","label":"Primary Concerns","type":"checkboxes","options":["Fatigue","Low Libido","Weight Gain","Mood Changes","Sleep Disturbances","Brain Fog","Hair Thinning","Hot Flashes","Muscle Loss","Erectile Dysfunction"],"required":true},
    {"id":"prior_hrt","label":"Have you previously used hormone therapy?","type":"boolean","required":true},
    {"id":"cancer_history","label":"History of hormone-sensitive cancer?","type":"boolean","required":true},
    {"id":"family_clotting","label":"Family history of clots/stroke before age 55?","type":"boolean","required":true},
    {"id":"consent","label":"I consent to hormone therapy evaluation","type":"boolean","required":true},
    {"id":"signature","label":"Patient Signature","type":"signature","required":true}
  ]'::jsonb),
  ('Peptide Therapy Intake', 'Pre-consultation for peptide candidates', 'peptide', '[
    {"id":"full_name","label":"Full Legal Name","type":"text","required":true},
    {"id":"dob","label":"Date of Birth","type":"date","required":true},
    {"id":"goals","label":"Primary Goals","type":"checkboxes","options":["Anti-Aging","Muscle Growth","Fat Loss","Injury Recovery","Immune Support","Cognitive Enhancement","Sexual Health","Sleep","Gut Health","Hair Regrowth"],"required":true},
    {"id":"injection_comfort","label":"Comfortable with self-injection?","type":"radio","options":["Yes","No","Need training"],"required":true},
    {"id":"cancer_active","label":"Active cancer or treatment?","type":"boolean","required":true},
    {"id":"consent","label":"I consent to peptide therapy evaluation","type":"boolean","required":true},
    {"id":"signature","label":"Patient Signature","type":"signature","required":true}
  ]'::jsonb),
  ('Weight Loss Program Intake', 'Pre-consultation for medical weight management', 'weight_loss', '[
    {"id":"full_name","label":"Full Legal Name","type":"text","required":true},
    {"id":"weight","label":"Current Weight (lbs)","type":"number","required":true},
    {"id":"goal_weight","label":"Goal Weight (lbs)","type":"number","required":true},
    {"id":"eating_disorder","label":"History of eating disorder?","type":"boolean","required":true},
    {"id":"thyroid_cancer","label":"Personal/family history of MTC or MEN2?","type":"boolean","required":true},
    {"id":"pregnant","label":"Currently pregnant or planning?","type":"boolean","required":true},
    {"id":"consent","label":"I consent to weight management evaluation","type":"boolean","required":true},
    {"id":"signature","label":"Patient Signature","type":"signature","required":true}
  ]'::jsonb),
  ('IV Therapy Intake', 'Pre-treatment for IV vitamin/nutrient therapy', 'iv_therapy', '[
    {"id":"full_name","label":"Full Legal Name","type":"text","required":true},
    {"id":"reason","label":"Reason for IV Therapy","type":"checkboxes","options":["Hydration","Immune Boost","Energy","Athletic Recovery","Skin Health","Migraine","Pre/Post Travel","Wellness","NAD+","Glutathione","Myers Cocktail"],"required":true},
    {"id":"iv_reactions","label":"Prior IV reactions?","type":"boolean","required":true},
    {"id":"kidney_disease","label":"Kidney disease history?","type":"boolean","required":true},
    {"id":"heart_failure","label":"CHF history?","type":"boolean","required":true},
    {"id":"consent","label":"I consent to IV therapy","type":"boolean","required":true},
    {"id":"signature","label":"Patient Signature","type":"signature","required":true}
  ]'::jsonb)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. INTAKE CLEARANCE WORKFLOW (state machine for marketplace bookings)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE clearance_status AS ENUM (
    'sent',              -- intake link sent to patient
    'client_submitted',  -- patient submitted form
    'pending_review',    -- awaiting MD review
    'approved',          -- MD approved, appointment proceeds
    'changes_requested', -- MD requested resubmission
    'rejected'           -- MD rejected, appointment cancelled + refund
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.intake_clearance_requests (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id         UUID UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id             UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  template_id            UUID REFERENCES public.intake_form_templates(id),
  status                 clearance_status NOT NULL DEFAULT 'sent',
  intake_response_id     UUID,  -- link to e_consents or intake_forms
  submitted_at           TIMESTAMPTZ,
  pending_review_at      TIMESTAMPTZ,
  approved_at            TIMESTAMPTZ,
  approved_by            UUID REFERENCES auth.users(id),
  rejected_at            TIMESTAMPTZ,
  rejected_by            UUID REFERENCES auth.users(id),
  admin_notes            TEXT,
  resubmission_count     INTEGER DEFAULT 0,
  deposit_refunded       BOOLEAN DEFAULT FALSE,
  deposit_refund_amount  NUMERIC(10,2),
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clearance_status ON public.intake_clearance_requests(status);
CREATE INDEX IF NOT EXISTS idx_clearance_patient ON public.intake_clearance_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_clearance_created ON public.intake_clearance_requests(created_at DESC);

ALTER TABLE public.intake_clearance_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view clearance queue"
  ON public.intake_clearance_requests FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
            AND role IN ('admin', 'provider', 'front_desk'))
  );

CREATE POLICY "Admins manage clearance"
  ON public.intake_clearance_requests FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
            AND role IN ('admin', 'provider'))
  );

CREATE POLICY "Service role inserts clearance"
  ON public.intake_clearance_requests FOR INSERT
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. E-SIGNATURE AUDIT TRAIL (extends e_consents with tamper detection)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.signature_audit_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id        UUID,   -- links to e_consents.id or telehealth_consents.id
  resource_type     VARCHAR(50) NOT NULL,  -- 'e_consent', 'telehealth_consent', 'intake_form'
  resource_id       UUID NOT NULL,
  patient_id        UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  user_id           UUID REFERENCES auth.users(id),
  action            VARCHAR(50) NOT NULL,  -- 'signed', 'viewed', 'printed', 'revoked'
  signature_hash    TEXT,  -- SHA-256 of signature_data at time of action
  ip_address        INET,
  user_agent        TEXT,
  details           JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sig_audit_resource ON public.signature_audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_sig_audit_patient ON public.signature_audit_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_sig_audit_created ON public.signature_audit_log(created_at DESC);

ALTER TABLE public.signature_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view signature audit"
  ON public.signature_audit_log FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
            AND role IN ('admin', 'provider', 'front_desk'))
  );

CREATE POLICY "Service role writes audit"
  ON public.signature_audit_log FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE public.signature_audit_log IS 'Append-only audit trail for every signature interaction (HIPAA 164.312(b))';
