
-- Add missing columns to provider_memberships
ALTER TABLE public.provider_memberships 
  ADD COLUMN IF NOT EXISTS founding_rate_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS founding_rate numeric,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS notes text;

-- Membership invoices
CREATE TABLE public.membership_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.provider_memberships(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  membership_amount numeric NOT NULL DEFAULT 0,
  laser_uses integer NOT NULL DEFAULT 0,
  laser_charges numeric NOT NULL DEFAULT 0,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.membership_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view membership_invoices" ON public.membership_invoices FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert membership_invoices" ON public.membership_invoices FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update membership_invoices" ON public.membership_invoices FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view membership_invoices" ON public.membership_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert membership_invoices" ON public.membership_invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update membership_invoices" ON public.membership_invoices FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_membership_invoices_updated_at
  BEFORE UPDATE ON public.membership_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Provider earnings
CREATE TABLE public.provider_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  treatment_id uuid REFERENCES public.treatments(id) ON DELETE SET NULL,
  modality text NOT NULL DEFAULT 'other',
  gross_revenue numeric NOT NULL DEFAULT 0,
  cogs numeric NOT NULL DEFAULT 0,
  net_revenue numeric NOT NULL DEFAULT 0,
  units_used numeric,
  time_minutes integer,
  service_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view provider_earnings" ON public.provider_earnings FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert provider_earnings" ON public.provider_earnings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update provider_earnings" ON public.provider_earnings FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view provider_earnings" ON public.provider_earnings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert provider_earnings" ON public.provider_earnings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update provider_earnings" ON public.provider_earnings FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_provider_earnings_updated_at
  BEFORE UPDATE ON public.provider_earnings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Proforma scenarios
CREATE TABLE public.proforma_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb,
  created_by text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.proforma_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view proforma_scenarios" ON public.proforma_scenarios FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert proforma_scenarios" ON public.proforma_scenarios FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update proforma_scenarios" ON public.proforma_scenarios FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon delete proforma_scenarios" ON public.proforma_scenarios FOR DELETE TO anon USING (true);
CREATE POLICY "Auth view proforma_scenarios" ON public.proforma_scenarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert proforma_scenarios" ON public.proforma_scenarios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update proforma_scenarios" ON public.proforma_scenarios FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete proforma_scenarios" ON public.proforma_scenarios FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_proforma_scenarios_updated_at
  BEFORE UPDATE ON public.proforma_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
