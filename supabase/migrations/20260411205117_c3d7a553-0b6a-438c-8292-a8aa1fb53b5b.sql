
-- Contracts
CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contract_admin_id uuid,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view contracts" ON public.contracts FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins can insert contracts" ON public.contracts FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update contracts" ON public.contracts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete contracts" ON public.contracts FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Clinics
CREATE TABLE public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  manager_user_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view clinics" ON public.clinics FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins can insert clinics" ON public.clinics FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update clinics" ON public.clinics FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete clinics" ON public.clinics FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_clinics_updated_at BEFORE UPDATE ON public.clinics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- MD Coverage Assignments
CREATE TABLE public.md_coverage_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  md_provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  sampling_rate integer NOT NULL DEFAULT 100,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_until date,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.md_coverage_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view md coverage" ON public.md_coverage_assignments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins can insert md coverage" ON public.md_coverage_assignments FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update md coverage" ON public.md_coverage_assignments FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete md coverage" ON public.md_coverage_assignments FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Master Catalog Items
CREATE TABLE public.master_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL DEFAULT 'procedure',
  name text NOT NULL,
  category text,
  status text NOT NULL DEFAULT 'active',
  platform_rules jsonb DEFAULT '{}',
  default_template_id uuid REFERENCES public.chart_templates(id) ON DELETE SET NULL,
  deprecated_at timestamptz,
  deprecated_deadline date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.master_catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view master catalog" ON public.master_catalog_items FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins can insert master catalog" ON public.master_catalog_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update master catalog" ON public.master_catalog_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete master catalog" ON public.master_catalog_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_master_catalog_updated_at BEFORE UPDATE ON public.master_catalog_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Clinic Catalog Items (which clinics enable which master items)
CREATE TABLE public.clinic_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  master_item_id uuid NOT NULL REFERENCES public.master_catalog_items(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  enabled_at timestamptz DEFAULT now(),
  UNIQUE(clinic_id, master_item_id)
);
ALTER TABLE public.clinic_catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view clinic catalog" ON public.clinic_catalog_items FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins can insert clinic catalog" ON public.clinic_catalog_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update clinic catalog" ON public.clinic_catalog_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete clinic catalog" ON public.clinic_catalog_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Automation Rules
CREATE TABLE public.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_event text NOT NULL,
  conditions jsonb DEFAULT '{}',
  delay_minutes integer NOT NULL DEFAULT 0,
  action_type text NOT NULL,
  action_config jsonb DEFAULT '{}',
  recipient_type text NOT NULL DEFAULT 'patient',
  is_platform_rule boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  run_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view automation rules" ON public.automation_rules FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins can insert automation rules" ON public.automation_rules FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update automation rules" ON public.automation_rules FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete automation rules" ON public.automation_rules FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_automation_rules_updated_at BEFORE UPDATE ON public.automation_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
