
-- Consent Templates
CREATE TABLE public.consent_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  body text NOT NULL,
  procedure_types text[] DEFAULT '{}',
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.consent_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view consent templates" ON public.consent_templates
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can create consent templates" ON public.consent_templates
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Admins can update consent templates" ON public.consent_templates
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete consent templates" ON public.consent_templates
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_consent_templates_updated_at
  BEFORE UPDATE ON public.consent_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Patient Consents
CREATE TABLE public.patient_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.consent_templates(id),
  encounter_id uuid REFERENCES public.encounters(id),
  appointment_id uuid REFERENCES public.appointments(id),
  consent_text text NOT NULL,
  signature_data text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed','declined','expired')),
  signed_at timestamptz,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.patient_consents ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_patient_consents_patient ON public.patient_consents(patient_id);
CREATE INDEX idx_patient_consents_appointment ON public.patient_consents(appointment_id);

CREATE POLICY "Staff can view patient consents" ON public.patient_consents
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can create patient consents" ON public.patient_consents
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update patient consents" ON public.patient_consents
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Patients can view own consents" ON public.patient_consents
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.patients WHERE id = patient_id AND auth_user_id = auth.uid())
  );

CREATE TRIGGER update_patient_consents_updated_at
  BEFORE UPDATE ON public.patient_consents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Patient Communication Log
CREATE TABLE public.patient_communication_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms','email','portal','phone')),
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound','outbound')),
  content text,
  template_used text,
  delivery_status text DEFAULT 'sent' CHECK (delivery_status IN ('queued','sent','delivered','failed','read')),
  staff_user_id uuid,
  appointment_id uuid REFERENCES public.appointments(id),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.patient_communication_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_comm_log_patient ON public.patient_communication_log(patient_id);

CREATE POLICY "Staff can view communication log" ON public.patient_communication_log
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can create communication log" ON public.patient_communication_log
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- Add no-show and late cancel counters to patients
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS no_show_count int NOT NULL DEFAULT 0;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS late_cancel_count int NOT NULL DEFAULT 0;
