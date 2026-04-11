
-- 1. Add admin flags to treatments table
ALTER TABLE public.treatments ADD COLUMN IF NOT EXISTS requires_gfe boolean NOT NULL DEFAULT false;
ALTER TABLE public.treatments ADD COLUMN IF NOT EXISTS requires_md_review boolean NOT NULL DEFAULT false;
ALTER TABLE public.treatments ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. Medications / Formulary table
CREATE TABLE public.medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  generic_name text,
  category text DEFAULT 'general',
  route text DEFAULT 'oral',
  default_dose text,
  default_unit text,
  is_controlled boolean NOT NULL DEFAULT false,
  schedule_class text,
  requires_credentials text[],
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view medications" ON public.medications FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "Admin can insert medications" ON public.medications FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can update medications" ON public.medications FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_medications_updated_at BEFORE UPDATE ON public.medications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Provider clearances table
CREATE TABLE public.provider_clearances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  treatment_id uuid NOT NULL REFERENCES public.treatments(id) ON DELETE CASCADE,
  cleared_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  cleared_by uuid,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id, treatment_id)
);

ALTER TABLE public.provider_clearances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view provider_clearances" ON public.provider_clearances FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "Admin can insert provider_clearances" ON public.provider_clearances FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can update provider_clearances" ON public.provider_clearances FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can delete provider_clearances" ON public.provider_clearances FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_provider_clearances_updated_at BEFORE UPDATE ON public.provider_clearances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
