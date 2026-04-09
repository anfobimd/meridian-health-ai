
-- Service Package Templates
CREATE TABLE public.service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  package_type text NOT NULL DEFAULT 'single', -- single, multi, unlimited
  category text,
  session_count integer NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  individual_price numeric, -- a-la-carte price for savings calculation
  valid_days integer DEFAULT 365,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view service_packages" ON public.service_packages FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert service_packages" ON public.service_packages FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update service_packages" ON public.service_packages FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view service_packages" ON public.service_packages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert service_packages" ON public.service_packages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update service_packages" ON public.service_packages FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_service_packages_updated_at BEFORE UPDATE ON public.service_packages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Package Items (treatments in a package)
CREATE TABLE public.service_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.service_packages(id) ON DELETE CASCADE,
  treatment_id uuid REFERENCES public.treatments(id),
  treatment_name text NOT NULL,
  sessions_included integer NOT NULL DEFAULT 1,
  unit_price numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_package_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view service_package_items" ON public.service_package_items FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert service_package_items" ON public.service_package_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update service_package_items" ON public.service_package_items FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view service_package_items" ON public.service_package_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert service_package_items" ON public.service_package_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update service_package_items" ON public.service_package_items FOR UPDATE TO authenticated USING (true);

-- Patient Package Purchases
CREATE TABLE public.patient_package_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.service_packages(id),
  provider_id uuid REFERENCES public.providers(id),
  status text NOT NULL DEFAULT 'active', -- active, paused, completed, expired, cancelled
  sessions_total integer NOT NULL DEFAULT 0,
  sessions_used integer NOT NULL DEFAULT 0,
  price_paid numeric NOT NULL DEFAULT 0,
  deferred_revenue_amount numeric NOT NULL DEFAULT 0,
  revenue_recognized_amount numeric NOT NULL DEFAULT 0,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  paused_at timestamptz,
  cancelled_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_package_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view patient_package_purchases" ON public.patient_package_purchases FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert patient_package_purchases" ON public.patient_package_purchases FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update patient_package_purchases" ON public.patient_package_purchases FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view patient_package_purchases" ON public.patient_package_purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert patient_package_purchases" ON public.patient_package_purchases FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update patient_package_purchases" ON public.patient_package_purchases FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_patient_package_purchases_updated_at BEFORE UPDATE ON public.patient_package_purchases
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Individual Session Redemptions
CREATE TABLE public.patient_package_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.patient_package_purchases(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id),
  provider_id uuid REFERENCES public.providers(id),
  treatment_name text,
  revenue_amount numeric NOT NULL DEFAULT 0,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_package_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view patient_package_sessions" ON public.patient_package_sessions FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert patient_package_sessions" ON public.patient_package_sessions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon delete patient_package_sessions" ON public.patient_package_sessions FOR DELETE TO anon USING (true);
CREATE POLICY "Auth view patient_package_sessions" ON public.patient_package_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert patient_package_sessions" ON public.patient_package_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth delete patient_package_sessions" ON public.patient_package_sessions FOR DELETE TO authenticated USING (true);

-- Notification Rules
CREATE TABLE public.package_notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type text NOT NULL,
  trigger_label text NOT NULL,
  description text,
  channel text NOT NULL DEFAULT 'email', -- email, sms, both
  tone text NOT NULL DEFAULT 'friendly', -- friendly, professional, urgent
  timing_days integer, -- days after trigger event
  threshold_sessions integer, -- for low-supply triggers
  is_active boolean NOT NULL DEFAULT true,
  template_subject text,
  template_body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.package_notification_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view package_notification_rules" ON public.package_notification_rules FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert package_notification_rules" ON public.package_notification_rules FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update package_notification_rules" ON public.package_notification_rules FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view package_notification_rules" ON public.package_notification_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert package_notification_rules" ON public.package_notification_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update package_notification_rules" ON public.package_notification_rules FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_package_notification_rules_updated_at BEFORE UPDATE ON public.package_notification_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notification Log
CREATE TABLE public.package_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.patient_package_purchases(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.package_notification_rules(id),
  channel text NOT NULL DEFAULT 'email',
  subject text,
  body text,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.package_notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view package_notification_log" ON public.package_notification_log FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert package_notification_log" ON public.package_notification_log FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth view package_notification_log" ON public.package_notification_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert package_notification_log" ON public.package_notification_log FOR INSERT TO authenticated WITH CHECK (true);

-- Trigger: sync session count on redemption
CREATE OR REPLACE FUNCTION public.sync_package_session_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase record;
  v_used int;
  v_rev_per_session numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_purchase FROM patient_package_purchases WHERE id = NEW.purchase_id;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT * INTO v_purchase FROM patient_package_purchases WHERE id = OLD.purchase_id;
  END IF;

  IF v_purchase IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COUNT(*) INTO v_used FROM patient_package_sessions WHERE purchase_id = v_purchase.id;

  v_rev_per_session := CASE WHEN v_purchase.sessions_total > 0 THEN v_purchase.price_paid / v_purchase.sessions_total ELSE 0 END;

  UPDATE patient_package_purchases SET
    sessions_used = v_used,
    revenue_recognized_amount = v_used * v_rev_per_session,
    deferred_revenue_amount = v_purchase.price_paid - (v_used * v_rev_per_session),
    status = CASE
      WHEN v_used >= v_purchase.sessions_total AND v_purchase.sessions_total > 0 THEN 'completed'
      ELSE status
    END,
    updated_at = now()
  WHERE id = v_purchase.id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_package_sessions
AFTER INSERT OR DELETE ON public.patient_package_sessions
FOR EACH ROW EXECUTE FUNCTION public.sync_package_session_count();

-- Function: expire stale packages
CREATE OR REPLACE FUNCTION public.expire_stale_packages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE patient_package_purchases
  SET status = 'expired', updated_at = now()
  WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Seed 16 default notification rules
INSERT INTO public.package_notification_rules (trigger_type, trigger_label, description, channel, tone, timing_days, threshold_sessions) VALUES
('purchase_confirmation', 'Purchase Confirmation', 'Sent immediately after package purchase', 'email', 'friendly', 0, NULL),
('welcome_series_1', 'Welcome — Day 1', 'First welcome message with booking encouragement', 'email', 'friendly', 1, NULL),
('welcome_series_3', 'Welcome — Day 3', 'Follow-up if no session booked yet', 'email', 'friendly', 3, NULL),
('first_session_complete', 'First Session Complete', 'Congratulations on first session', 'email', 'friendly', 0, NULL),
('halfway_milestone', 'Halfway Milestone', 'Celebrate reaching the halfway point', 'email', 'friendly', 0, NULL),
('low_supply_3', 'Low Supply — 3 Left', 'Alert when 3 sessions remaining', 'email', 'professional', NULL, 3),
('low_supply_2', 'Low Supply — 2 Left', 'Alert when 2 sessions remaining', 'email', 'professional', NULL, 2),
('low_supply_1', 'Low Supply — Last Session', 'Alert when 1 session remaining', 'email', 'urgent', NULL, 1),
('completion', 'Package Complete', 'All sessions used — offer renewal', 'email', 'friendly', 0, NULL),
('expiry_warning_30', 'Expiry Warning — 30 Days', 'Package expires in 30 days', 'email', 'professional', NULL, NULL),
('expiry_warning_7', 'Expiry Warning — 7 Days', 'Package expires in 7 days', 'email', 'urgent', NULL, NULL),
('expired', 'Package Expired', 'Package has expired with unused sessions', 'email', 'friendly', 0, NULL),
('win_back_30', 'Win-Back — 30 Days', 'Re-engagement 30 days after expiry/completion', 'email', 'friendly', 30, NULL),
('win_back_60', 'Win-Back — 60 Days', 'Re-engagement 60 days after expiry/completion', 'email', 'friendly', 60, NULL),
('win_back_90', 'Win-Back — 90 Days', 'Final win-back attempt', 'email', 'professional', 90, NULL),
('synergy_upsell', 'Synergy Upsell', 'AI-recommended synergistic treatment bundle', 'email', 'friendly', NULL, NULL);
