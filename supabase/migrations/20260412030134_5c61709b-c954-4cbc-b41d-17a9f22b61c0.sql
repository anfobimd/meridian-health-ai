
-- Provider-to-clinic assignments for all staff
CREATE TABLE public.provider_clinic_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  is_primary boolean DEFAULT false,
  role_at_clinic text DEFAULT 'provider',
  effective_from date DEFAULT CURRENT_DATE,
  effective_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id, clinic_id)
);

ALTER TABLE public.provider_clinic_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view provider clinic assignments"
ON public.provider_clinic_assignments FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "Admins can manage provider clinic assignments"
ON public.provider_clinic_assignments FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_provider_clinic_provider ON public.provider_clinic_assignments(provider_id);
CREATE INDEX idx_provider_clinic_clinic ON public.provider_clinic_assignments(clinic_id);

CREATE TRIGGER update_provider_clinic_assignments_updated_at
BEFORE UPDATE ON public.provider_clinic_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
