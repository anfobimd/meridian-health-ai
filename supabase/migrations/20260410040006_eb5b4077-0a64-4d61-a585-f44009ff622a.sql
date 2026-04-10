
-- ============================================================
-- BATCH 1: Profiles table + auto-create trigger
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NULL)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Helper: is_staff checks for any of the 3 clinic roles
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'provider', 'front_desk')
  )
$$;

-- ============================================================
-- BATCH 2: RLS Policy Lockdown
-- ============================================================

-- ===================== SERVICE-ONLY TIER =====================
-- ai_api_calls: drop all, add auth SELECT only
DROP POLICY IF EXISTS "Anon insert ai_api_calls" ON public.ai_api_calls;
DROP POLICY IF EXISTS "Anon update ai_api_calls" ON public.ai_api_calls;
DROP POLICY IF EXISTS "Anon view ai_api_calls" ON public.ai_api_calls;
DROP POLICY IF EXISTS "Auth insert ai_api_calls" ON public.ai_api_calls;
DROP POLICY IF EXISTS "Auth update ai_api_calls" ON public.ai_api_calls;
DROP POLICY IF EXISTS "Auth view ai_api_calls" ON public.ai_api_calls;
CREATE POLICY "Staff can view ai_api_calls" ON public.ai_api_calls FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ai_chart_analysis
DROP POLICY IF EXISTS "Anon insert ai_chart_analysis" ON public.ai_chart_analysis;
DROP POLICY IF EXISTS "Anon view ai_chart_analysis" ON public.ai_chart_analysis;
DROP POLICY IF EXISTS "Auth insert ai_chart_analysis" ON public.ai_chart_analysis;
DROP POLICY IF EXISTS "Auth view ai_chart_analysis" ON public.ai_chart_analysis;
CREATE POLICY "Staff can view ai_chart_analysis" ON public.ai_chart_analysis FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ai_md_consistency
DROP POLICY IF EXISTS "Anon insert ai_md_consistency" ON public.ai_md_consistency;
DROP POLICY IF EXISTS "Anon update ai_md_consistency" ON public.ai_md_consistency;
DROP POLICY IF EXISTS "Anon view ai_md_consistency" ON public.ai_md_consistency;
DROP POLICY IF EXISTS "Auth insert ai_md_consistency" ON public.ai_md_consistency;
DROP POLICY IF EXISTS "Auth update ai_md_consistency" ON public.ai_md_consistency;
DROP POLICY IF EXISTS "Auth view ai_md_consistency" ON public.ai_md_consistency;
CREATE POLICY "Staff can view ai_md_consistency" ON public.ai_md_consistency FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ai_oversight_reports
DROP POLICY IF EXISTS "Anon insert ai_oversight_reports" ON public.ai_oversight_reports;
DROP POLICY IF EXISTS "Anon update ai_oversight_reports" ON public.ai_oversight_reports;
DROP POLICY IF EXISTS "Anon view ai_oversight_reports" ON public.ai_oversight_reports;
DROP POLICY IF EXISTS "Auth insert ai_oversight_reports" ON public.ai_oversight_reports;
DROP POLICY IF EXISTS "Auth update ai_oversight_reports" ON public.ai_oversight_reports;
DROP POLICY IF EXISTS "Auth view ai_oversight_reports" ON public.ai_oversight_reports;
CREATE POLICY "Staff can view ai_oversight_reports" ON public.ai_oversight_reports FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ai_provider_intelligence
DROP POLICY IF EXISTS "Anon insert ai_provider_intelligence" ON public.ai_provider_intelligence;
DROP POLICY IF EXISTS "Anon update ai_provider_intelligence" ON public.ai_provider_intelligence;
DROP POLICY IF EXISTS "Anon view ai_provider_intelligence" ON public.ai_provider_intelligence;
DROP POLICY IF EXISTS "Auth insert ai_provider_intelligence" ON public.ai_provider_intelligence;
DROP POLICY IF EXISTS "Auth update ai_provider_intelligence" ON public.ai_provider_intelligence;
DROP POLICY IF EXISTS "Auth view ai_provider_intelligence" ON public.ai_provider_intelligence;
CREATE POLICY "Staff can view ai_provider_intelligence" ON public.ai_provider_intelligence FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ai_prompts
DROP POLICY IF EXISTS "Anon insert ai_prompts" ON public.ai_prompts;
DROP POLICY IF EXISTS "Anon update ai_prompts" ON public.ai_prompts;
DROP POLICY IF EXISTS "Anon view ai_prompts" ON public.ai_prompts;
DROP POLICY IF EXISTS "Auth insert ai_prompts" ON public.ai_prompts;
DROP POLICY IF EXISTS "Auth update ai_prompts" ON public.ai_prompts;
DROP POLICY IF EXISTS "Auth view ai_prompts" ON public.ai_prompts;
CREATE POLICY "Staff can view ai_prompts" ON public.ai_prompts FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ai_doc_checklists
DROP POLICY IF EXISTS "Anon insert ai_doc_checklists" ON public.ai_doc_checklists;
DROP POLICY IF EXISTS "Anon update ai_doc_checklists" ON public.ai_doc_checklists;
DROP POLICY IF EXISTS "Anon view ai_doc_checklists" ON public.ai_doc_checklists;
DROP POLICY IF EXISTS "Auth insert ai_doc_checklists" ON public.ai_doc_checklists;
DROP POLICY IF EXISTS "Auth update ai_doc_checklists" ON public.ai_doc_checklists;
DROP POLICY IF EXISTS "Auth view ai_doc_checklists" ON public.ai_doc_checklists;
CREATE POLICY "Staff can view ai_doc_checklists" ON public.ai_doc_checklists FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- coaching_actions
DROP POLICY IF EXISTS "Anon insert coaching_actions" ON public.coaching_actions;
DROP POLICY IF EXISTS "Anon update coaching_actions" ON public.coaching_actions;
DROP POLICY IF EXISTS "Anon view coaching_actions" ON public.coaching_actions;
DROP POLICY IF EXISTS "Auth insert coaching_actions" ON public.coaching_actions;
DROP POLICY IF EXISTS "Auth update coaching_actions" ON public.coaching_actions;
DROP POLICY IF EXISTS "Auth view coaching_actions" ON public.coaching_actions;
CREATE POLICY "Staff can view coaching_actions" ON public.coaching_actions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ===================== PUBLIC-READ TIER =====================
-- treatments: keep anon SELECT, admin-only writes
DROP POLICY IF EXISTS "Anon insert treatments" ON public.treatments;
DROP POLICY IF EXISTS "Anon update treatments" ON public.treatments;
DROP POLICY IF EXISTS "Auth insert treatments" ON public.treatments;
DROP POLICY IF EXISTS "Auth update treatments" ON public.treatments;
-- Keep "Anon view treatments" and "Auth view treatments"
CREATE POLICY "Admin can insert treatments" ON public.treatments FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update treatments" ON public.treatments FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- treatment_categories
DROP POLICY IF EXISTS "Anon insert treatment_categories" ON public.treatment_categories;
DROP POLICY IF EXISTS "Anon update treatment_categories" ON public.treatment_categories;
DROP POLICY IF EXISTS "Auth insert treatment_categories" ON public.treatment_categories;
DROP POLICY IF EXISTS "Auth update treatment_categories" ON public.treatment_categories;
CREATE POLICY "Admin can insert treatment_categories" ON public.treatment_categories FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update treatment_categories" ON public.treatment_categories FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- marketplace_config
DROP POLICY IF EXISTS "Anon insert marketplace_config" ON public.marketplace_config;
DROP POLICY IF EXISTS "Anon update marketplace_config" ON public.marketplace_config;
DROP POLICY IF EXISTS "Auth insert marketplace_config" ON public.marketplace_config;
DROP POLICY IF EXISTS "Auth update marketplace_config" ON public.marketplace_config;
CREATE POLICY "Admin can insert marketplace_config" ON public.marketplace_config FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update marketplace_config" ON public.marketplace_config FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- oversight_config
DROP POLICY IF EXISTS "Anon insert oversight_config" ON public.oversight_config;
DROP POLICY IF EXISTS "Anon update oversight_config" ON public.oversight_config;
DROP POLICY IF EXISTS "Auth insert oversight_config" ON public.oversight_config;
DROP POLICY IF EXISTS "Auth update oversight_config" ON public.oversight_config;
CREATE POLICY "Admin can insert oversight_config" ON public.oversight_config FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update oversight_config" ON public.oversight_config FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ===================== AUDIT TIER =====================
DROP POLICY IF EXISTS "Anon insert audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Auth insert audit_logs" ON public.audit_logs;
-- "Admins view audit_logs" already exists with correct policy
CREATE POLICY "Auth can insert audit_logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ===================== STAFF TIER =====================
-- Macro: for each staff table, drop anon policies, replace auth with role-scoped

-- patients
DROP POLICY IF EXISTS "Anon insert patients" ON public.patients;
DROP POLICY IF EXISTS "Anon update patients" ON public.patients;
DROP POLICY IF EXISTS "Anon view patients" ON public.patients;
DROP POLICY IF EXISTS "Auth insert patients" ON public.patients;
DROP POLICY IF EXISTS "Auth update patients" ON public.patients;
DROP POLICY IF EXISTS "Auth view patients" ON public.patients;
CREATE POLICY "Staff can view patients" ON public.patients FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert patients" ON public.patients FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update patients" ON public.patients FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- appointments
DROP POLICY IF EXISTS "Anon insert appointments" ON public.appointments;
DROP POLICY IF EXISTS "Anon update appointments" ON public.appointments;
DROP POLICY IF EXISTS "Anon view appointments" ON public.appointments;
DROP POLICY IF EXISTS "Auth insert appointments" ON public.appointments;
DROP POLICY IF EXISTS "Auth update appointments" ON public.appointments;
DROP POLICY IF EXISTS "Auth view appointments" ON public.appointments;
CREATE POLICY "Staff can view appointments" ON public.appointments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert appointments" ON public.appointments FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update appointments" ON public.appointments FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- encounters
DROP POLICY IF EXISTS "Anon insert encounters" ON public.encounters;
DROP POLICY IF EXISTS "Anon update encounters" ON public.encounters;
DROP POLICY IF EXISTS "Anon view encounters" ON public.encounters;
DROP POLICY IF EXISTS "Auth insert encounters" ON public.encounters;
DROP POLICY IF EXISTS "Auth update encounters" ON public.encounters;
DROP POLICY IF EXISTS "Auth view encounters" ON public.encounters;
CREATE POLICY "Staff can view encounters" ON public.encounters FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert encounters" ON public.encounters FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update encounters" ON public.encounters FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- clinical_notes
DROP POLICY IF EXISTS "Anon insert clinical_notes" ON public.clinical_notes;
DROP POLICY IF EXISTS "Anon update clinical_notes" ON public.clinical_notes;
DROP POLICY IF EXISTS "Anon view clinical_notes" ON public.clinical_notes;
DROP POLICY IF EXISTS "Auth insert clinical_notes" ON public.clinical_notes;
DROP POLICY IF EXISTS "Auth update clinical_notes" ON public.clinical_notes;
DROP POLICY IF EXISTS "Auth view clinical_notes" ON public.clinical_notes;
CREATE POLICY "Staff can view clinical_notes" ON public.clinical_notes FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert clinical_notes" ON public.clinical_notes FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update clinical_notes" ON public.clinical_notes FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- hormone_visits
DROP POLICY IF EXISTS "Anon insert hormone_visits" ON public.hormone_visits;
DROP POLICY IF EXISTS "Anon update hormone_visits" ON public.hormone_visits;
DROP POLICY IF EXISTS "Anon view hormone_visits" ON public.hormone_visits;
DROP POLICY IF EXISTS "Auth insert hormone_visits" ON public.hormone_visits;
DROP POLICY IF EXISTS "Auth update hormone_visits" ON public.hormone_visits;
DROP POLICY IF EXISTS "Auth view hormone_visits" ON public.hormone_visits;
CREATE POLICY "Staff can view hormone_visits" ON public.hormone_visits FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert hormone_visits" ON public.hormone_visits FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update hormone_visits" ON public.hormone_visits FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- lab_orders
DROP POLICY IF EXISTS "Anon insert lab_orders" ON public.lab_orders;
DROP POLICY IF EXISTS "Anon update lab_orders" ON public.lab_orders;
DROP POLICY IF EXISTS "Anon view lab_orders" ON public.lab_orders;
DROP POLICY IF EXISTS "Auth insert lab_orders" ON public.lab_orders;
DROP POLICY IF EXISTS "Auth update lab_orders" ON public.lab_orders;
DROP POLICY IF EXISTS "Auth view lab_orders" ON public.lab_orders;
CREATE POLICY "Staff can view lab_orders" ON public.lab_orders FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert lab_orders" ON public.lab_orders FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update lab_orders" ON public.lab_orders FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- lab_results
DROP POLICY IF EXISTS "Anon insert lab_results" ON public.lab_results;
DROP POLICY IF EXISTS "Anon update lab_results" ON public.lab_results;
DROP POLICY IF EXISTS "Anon view lab_results" ON public.lab_results;
DROP POLICY IF EXISTS "Auth insert lab_results" ON public.lab_results;
DROP POLICY IF EXISTS "Auth update lab_results" ON public.lab_results;
DROP POLICY IF EXISTS "Auth view lab_results" ON public.lab_results;
CREATE POLICY "Staff can view lab_results" ON public.lab_results FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert lab_results" ON public.lab_results FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update lab_results" ON public.lab_results FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- prescriptions
DROP POLICY IF EXISTS "Anon insert prescriptions" ON public.prescriptions;
DROP POLICY IF EXISTS "Anon update prescriptions" ON public.prescriptions;
DROP POLICY IF EXISTS "Anon view prescriptions" ON public.prescriptions;
DROP POLICY IF EXISTS "Auth insert prescriptions" ON public.prescriptions;
DROP POLICY IF EXISTS "Auth update prescriptions" ON public.prescriptions;
DROP POLICY IF EXISTS "Auth view prescriptions" ON public.prescriptions;
CREATE POLICY "Staff can view prescriptions" ON public.prescriptions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert prescriptions" ON public.prescriptions FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update prescriptions" ON public.prescriptions FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- invoices
DROP POLICY IF EXISTS "Anon insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Anon update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Anon view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Auth insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Auth update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Auth view invoices" ON public.invoices;
CREATE POLICY "Staff can view invoices" ON public.invoices FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update invoices" ON public.invoices FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- invoice_items
DROP POLICY IF EXISTS "Anon insert invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Anon update invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Anon view invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Auth insert invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Auth update invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Auth view invoice_items" ON public.invoice_items;
CREATE POLICY "Staff can view invoice_items" ON public.invoice_items FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert invoice_items" ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update invoice_items" ON public.invoice_items FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- payments
DROP POLICY IF EXISTS "Anon insert payments" ON public.payments;
DROP POLICY IF EXISTS "Anon update payments" ON public.payments;
DROP POLICY IF EXISTS "Anon view payments" ON public.payments;
DROP POLICY IF EXISTS "Auth insert payments" ON public.payments;
DROP POLICY IF EXISTS "Auth update payments" ON public.payments;
DROP POLICY IF EXISTS "Auth view payments" ON public.payments;
CREATE POLICY "Staff can view payments" ON public.payments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update payments" ON public.payments FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- providers
DROP POLICY IF EXISTS "Anon insert providers" ON public.providers;
DROP POLICY IF EXISTS "Anon update providers" ON public.providers;
DROP POLICY IF EXISTS "Anon view providers" ON public.providers;
DROP POLICY IF EXISTS "Auth insert providers" ON public.providers;
DROP POLICY IF EXISTS "Auth update providers" ON public.providers;
DROP POLICY IF EXISTS "Auth view providers" ON public.providers;
CREATE POLICY "Staff can view providers" ON public.providers FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin can insert providers" ON public.providers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update providers" ON public.providers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- rooms
DROP POLICY IF EXISTS "Anon insert rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anon update rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anon view rooms" ON public.rooms;
DROP POLICY IF EXISTS "Auth insert rooms" ON public.rooms;
DROP POLICY IF EXISTS "Auth update rooms" ON public.rooms;
DROP POLICY IF EXISTS "Auth view rooms" ON public.rooms;
CREATE POLICY "Staff can view rooms" ON public.rooms FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin can insert rooms" ON public.rooms FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update rooms" ON public.rooms FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- devices
DROP POLICY IF EXISTS "Anon insert devices" ON public.devices;
DROP POLICY IF EXISTS "Anon update devices" ON public.devices;
DROP POLICY IF EXISTS "Anon view devices" ON public.devices;
DROP POLICY IF EXISTS "Auth insert devices" ON public.devices;
DROP POLICY IF EXISTS "Auth update devices" ON public.devices;
DROP POLICY IF EXISTS "Auth view devices" ON public.devices;
CREATE POLICY "Staff can view devices" ON public.devices FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin can insert devices" ON public.devices FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update devices" ON public.devices FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- chart_templates
DROP POLICY IF EXISTS "Anon insert chart_templates" ON public.chart_templates;
DROP POLICY IF EXISTS "Anon update chart_templates" ON public.chart_templates;
DROP POLICY IF EXISTS "Anon view chart_templates" ON public.chart_templates;
DROP POLICY IF EXISTS "Auth insert chart_templates" ON public.chart_templates;
DROP POLICY IF EXISTS "Auth update chart_templates" ON public.chart_templates;
DROP POLICY IF EXISTS "Auth view chart_templates" ON public.chart_templates;
CREATE POLICY "Staff can view chart_templates" ON public.chart_templates FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin can insert chart_templates" ON public.chart_templates FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update chart_templates" ON public.chart_templates FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- chart_template_sections
DROP POLICY IF EXISTS "Anon insert chart_template_sections" ON public.chart_template_sections;
DROP POLICY IF EXISTS "Anon update chart_template_sections" ON public.chart_template_sections;
DROP POLICY IF EXISTS "Anon view chart_template_sections" ON public.chart_template_sections;
DROP POLICY IF EXISTS "Auth insert chart_template_sections" ON public.chart_template_sections;
DROP POLICY IF EXISTS "Auth update chart_template_sections" ON public.chart_template_sections;
DROP POLICY IF EXISTS "Auth view chart_template_sections" ON public.chart_template_sections;
CREATE POLICY "Staff can view chart_template_sections" ON public.chart_template_sections FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin can insert chart_template_sections" ON public.chart_template_sections FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update chart_template_sections" ON public.chart_template_sections FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- chart_template_fields
DROP POLICY IF EXISTS "Anon insert chart_template_fields" ON public.chart_template_fields;
DROP POLICY IF EXISTS "Anon update chart_template_fields" ON public.chart_template_fields;
DROP POLICY IF EXISTS "Anon view chart_template_fields" ON public.chart_template_fields;
DROP POLICY IF EXISTS "Auth insert chart_template_fields" ON public.chart_template_fields;
DROP POLICY IF EXISTS "Auth update chart_template_fields" ON public.chart_template_fields;
DROP POLICY IF EXISTS "Auth view chart_template_fields" ON public.chart_template_fields;
CREATE POLICY "Staff can view chart_template_fields" ON public.chart_template_fields FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin can insert chart_template_fields" ON public.chart_template_fields FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update chart_template_fields" ON public.chart_template_fields FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- chart_template_orders
DROP POLICY IF EXISTS "Anon insert chart_template_orders" ON public.chart_template_orders;
DROP POLICY IF EXISTS "Anon update chart_template_orders" ON public.chart_template_orders;
DROP POLICY IF EXISTS "Anon view chart_template_orders" ON public.chart_template_orders;
DROP POLICY IF EXISTS "Auth insert chart_template_orders" ON public.chart_template_orders;
DROP POLICY IF EXISTS "Auth update chart_template_orders" ON public.chart_template_orders;
DROP POLICY IF EXISTS "Auth view chart_template_orders" ON public.chart_template_orders;
CREATE POLICY "Staff can view chart_template_orders" ON public.chart_template_orders FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin can insert chart_template_orders" ON public.chart_template_orders FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update chart_template_orders" ON public.chart_template_orders FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- chart_review_records
DROP POLICY IF EXISTS "Anon insert chart_review_records" ON public.chart_review_records;
DROP POLICY IF EXISTS "Anon update chart_review_records" ON public.chart_review_records;
DROP POLICY IF EXISTS "Anon view chart_review_records" ON public.chart_review_records;
DROP POLICY IF EXISTS "Auth insert chart_review_records" ON public.chart_review_records;
DROP POLICY IF EXISTS "Auth update chart_review_records" ON public.chart_review_records;
DROP POLICY IF EXISTS "Auth view chart_review_records" ON public.chart_review_records;
CREATE POLICY "Staff can view chart_review_records" ON public.chart_review_records FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert chart_review_records" ON public.chart_review_records FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update chart_review_records" ON public.chart_review_records FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- encounter_field_responses
DROP POLICY IF EXISTS "Anon insert encounter_field_responses" ON public.encounter_field_responses;
DROP POLICY IF EXISTS "Anon update encounter_field_responses" ON public.encounter_field_responses;
DROP POLICY IF EXISTS "Anon view encounter_field_responses" ON public.encounter_field_responses;
DROP POLICY IF EXISTS "Auth insert encounter_field_responses" ON public.encounter_field_responses;
DROP POLICY IF EXISTS "Auth update encounter_field_responses" ON public.encounter_field_responses;
DROP POLICY IF EXISTS "Auth view encounter_field_responses" ON public.encounter_field_responses;
CREATE POLICY "Staff can view encounter_field_responses" ON public.encounter_field_responses FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert encounter_field_responses" ON public.encounter_field_responses FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update encounter_field_responses" ON public.encounter_field_responses FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- protocol_templates
DROP POLICY IF EXISTS "Anon insert protocol_templates" ON public.protocol_templates;
DROP POLICY IF EXISTS "Anon update protocol_templates" ON public.protocol_templates;
DROP POLICY IF EXISTS "Anon view protocol_templates" ON public.protocol_templates;
DROP POLICY IF EXISTS "Auth insert protocol_templates" ON public.protocol_templates;
DROP POLICY IF EXISTS "Auth update protocol_templates" ON public.protocol_templates;
DROP POLICY IF EXISTS "Auth view protocol_templates" ON public.protocol_templates;
CREATE POLICY "Staff can view protocol_templates" ON public.protocol_templates FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin can insert protocol_templates" ON public.protocol_templates FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update protocol_templates" ON public.protocol_templates FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- protocol_enrollments
DROP POLICY IF EXISTS "Anon insert protocol_enrollments" ON public.protocol_enrollments;
DROP POLICY IF EXISTS "Anon update protocol_enrollments" ON public.protocol_enrollments;
DROP POLICY IF EXISTS "Anon view protocol_enrollments" ON public.protocol_enrollments;
DROP POLICY IF EXISTS "Auth insert protocol_enrollments" ON public.protocol_enrollments;
DROP POLICY IF EXISTS "Auth update protocol_enrollments" ON public.protocol_enrollments;
DROP POLICY IF EXISTS "Auth view protocol_enrollments" ON public.protocol_enrollments;
CREATE POLICY "Staff can view protocol_enrollments" ON public.protocol_enrollments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert protocol_enrollments" ON public.protocol_enrollments FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update protocol_enrollments" ON public.protocol_enrollments FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- provider_availability (has DELETE)
DROP POLICY IF EXISTS "Anon delete provider_availability" ON public.provider_availability;
DROP POLICY IF EXISTS "Anon insert provider_availability" ON public.provider_availability;
DROP POLICY IF EXISTS "Anon update provider_availability" ON public.provider_availability;
DROP POLICY IF EXISTS "Anon view provider_availability" ON public.provider_availability;
DROP POLICY IF EXISTS "Auth delete provider_availability" ON public.provider_availability;
DROP POLICY IF EXISTS "Auth insert provider_availability" ON public.provider_availability;
DROP POLICY IF EXISTS "Auth update provider_availability" ON public.provider_availability;
DROP POLICY IF EXISTS "Auth view provider_availability" ON public.provider_availability;
CREATE POLICY "Staff can view provider_availability" ON public.provider_availability FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert provider_availability" ON public.provider_availability FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update provider_availability" ON public.provider_availability FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can delete provider_availability" ON public.provider_availability FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- provider_availability_overrides
DROP POLICY IF EXISTS "Anon insert overrides" ON public.provider_availability_overrides;
DROP POLICY IF EXISTS "Anon update overrides" ON public.provider_availability_overrides;
DROP POLICY IF EXISTS "Anon view overrides" ON public.provider_availability_overrides;
DROP POLICY IF EXISTS "Auth insert overrides" ON public.provider_availability_overrides;
DROP POLICY IF EXISTS "Auth update overrides" ON public.provider_availability_overrides;
DROP POLICY IF EXISTS "Auth view overrides" ON public.provider_availability_overrides;
CREATE POLICY "Staff can view overrides" ON public.provider_availability_overrides FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert overrides" ON public.provider_availability_overrides FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update overrides" ON public.provider_availability_overrides FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- provider_earnings
DROP POLICY IF EXISTS "Anon insert provider_earnings" ON public.provider_earnings;
DROP POLICY IF EXISTS "Anon update provider_earnings" ON public.provider_earnings;
DROP POLICY IF EXISTS "Anon view provider_earnings" ON public.provider_earnings;
DROP POLICY IF EXISTS "Auth insert provider_earnings" ON public.provider_earnings;
DROP POLICY IF EXISTS "Auth update provider_earnings" ON public.provider_earnings;
DROP POLICY IF EXISTS "Auth view provider_earnings" ON public.provider_earnings;
CREATE POLICY "Staff can view provider_earnings" ON public.provider_earnings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert provider_earnings" ON public.provider_earnings FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update provider_earnings" ON public.provider_earnings FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- provider_memberships
DROP POLICY IF EXISTS "Anon insert provider_memberships" ON public.provider_memberships;
DROP POLICY IF EXISTS "Anon update provider_memberships" ON public.provider_memberships;
DROP POLICY IF EXISTS "Anon view provider_memberships" ON public.provider_memberships;
DROP POLICY IF EXISTS "Auth insert provider_memberships" ON public.provider_memberships;
DROP POLICY IF EXISTS "Auth update provider_memberships" ON public.provider_memberships;
DROP POLICY IF EXISTS "Auth view provider_memberships" ON public.provider_memberships;
CREATE POLICY "Staff can view provider_memberships" ON public.provider_memberships FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin can insert provider_memberships" ON public.provider_memberships FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update provider_memberships" ON public.provider_memberships FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- provider_skills (has DELETE)
DROP POLICY IF EXISTS "Anon delete provider_skills" ON public.provider_skills;
DROP POLICY IF EXISTS "Anon insert provider_skills" ON public.provider_skills;
DROP POLICY IF EXISTS "Anon update provider_skills" ON public.provider_skills;
DROP POLICY IF EXISTS "Anon view provider_skills" ON public.provider_skills;
DROP POLICY IF EXISTS "Auth delete provider_skills" ON public.provider_skills;
DROP POLICY IF EXISTS "Auth insert provider_skills" ON public.provider_skills;
DROP POLICY IF EXISTS "Auth update provider_skills" ON public.provider_skills;
DROP POLICY IF EXISTS "Auth view provider_skills" ON public.provider_skills;
CREATE POLICY "Staff can view provider_skills" ON public.provider_skills FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin can insert provider_skills" ON public.provider_skills FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update provider_skills" ON public.provider_skills FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete provider_skills" ON public.provider_skills FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- marketplace_bookings
DROP POLICY IF EXISTS "Anon insert marketplace_bookings" ON public.marketplace_bookings;
DROP POLICY IF EXISTS "Anon update marketplace_bookings" ON public.marketplace_bookings;
DROP POLICY IF EXISTS "Anon view marketplace_bookings" ON public.marketplace_bookings;
DROP POLICY IF EXISTS "Auth insert marketplace_bookings" ON public.marketplace_bookings;
DROP POLICY IF EXISTS "Auth update marketplace_bookings" ON public.marketplace_bookings;
DROP POLICY IF EXISTS "Auth view marketplace_bookings" ON public.marketplace_bookings;
CREATE POLICY "Staff can view marketplace_bookings" ON public.marketplace_bookings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert marketplace_bookings" ON public.marketplace_bookings FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update marketplace_bookings" ON public.marketplace_bookings FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- quotes
DROP POLICY IF EXISTS "Anon insert quotes" ON public.quotes;
DROP POLICY IF EXISTS "Anon update quotes" ON public.quotes;
DROP POLICY IF EXISTS "Anon view quotes" ON public.quotes;
DROP POLICY IF EXISTS "Auth insert quotes" ON public.quotes;
DROP POLICY IF EXISTS "Auth update quotes" ON public.quotes;
DROP POLICY IF EXISTS "Auth view quotes" ON public.quotes;
CREATE POLICY "Staff can view quotes" ON public.quotes FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert quotes" ON public.quotes FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update quotes" ON public.quotes FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- quote_items
DROP POLICY IF EXISTS "Anon insert quote_items" ON public.quote_items;
DROP POLICY IF EXISTS "Anon update quote_items" ON public.quote_items;
DROP POLICY IF EXISTS "Anon view quote_items" ON public.quote_items;
DROP POLICY IF EXISTS "Auth insert quote_items" ON public.quote_items;
DROP POLICY IF EXISTS "Auth update quote_items" ON public.quote_items;
DROP POLICY IF EXISTS "Auth view quote_items" ON public.quote_items;
CREATE POLICY "Staff can view quote_items" ON public.quote_items FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert quote_items" ON public.quote_items FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update quote_items" ON public.quote_items FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- service_packages
DROP POLICY IF EXISTS "Anon insert service_packages" ON public.service_packages;
DROP POLICY IF EXISTS "Anon update service_packages" ON public.service_packages;
DROP POLICY IF EXISTS "Anon view service_packages" ON public.service_packages;
DROP POLICY IF EXISTS "Auth insert service_packages" ON public.service_packages;
DROP POLICY IF EXISTS "Auth update service_packages" ON public.service_packages;
DROP POLICY IF EXISTS "Auth view service_packages" ON public.service_packages;
CREATE POLICY "Staff can view service_packages" ON public.service_packages FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin can insert service_packages" ON public.service_packages FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update service_packages" ON public.service_packages FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- service_package_items
DROP POLICY IF EXISTS "Anon insert service_package_items" ON public.service_package_items;
DROP POLICY IF EXISTS "Anon update service_package_items" ON public.service_package_items;
DROP POLICY IF EXISTS "Anon view service_package_items" ON public.service_package_items;
DROP POLICY IF EXISTS "Auth insert service_package_items" ON public.service_package_items;
DROP POLICY IF EXISTS "Auth update service_package_items" ON public.service_package_items;
DROP POLICY IF EXISTS "Auth view service_package_items" ON public.service_package_items;
CREATE POLICY "Staff can view service_package_items" ON public.service_package_items FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin can insert service_package_items" ON public.service_package_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update service_package_items" ON public.service_package_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- patient_package_purchases
DROP POLICY IF EXISTS "Anon insert patient_package_purchases" ON public.patient_package_purchases;
DROP POLICY IF EXISTS "Anon update patient_package_purchases" ON public.patient_package_purchases;
DROP POLICY IF EXISTS "Anon view patient_package_purchases" ON public.patient_package_purchases;
DROP POLICY IF EXISTS "Auth insert patient_package_purchases" ON public.patient_package_purchases;
DROP POLICY IF EXISTS "Auth update patient_package_purchases" ON public.patient_package_purchases;
DROP POLICY IF EXISTS "Auth view patient_package_purchases" ON public.patient_package_purchases;
CREATE POLICY "Staff can view patient_package_purchases" ON public.patient_package_purchases FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert patient_package_purchases" ON public.patient_package_purchases FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update patient_package_purchases" ON public.patient_package_purchases FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- patient_package_sessions (has DELETE)
DROP POLICY IF EXISTS "Anon delete patient_package_sessions" ON public.patient_package_sessions;
DROP POLICY IF EXISTS "Anon insert patient_package_sessions" ON public.patient_package_sessions;
DROP POLICY IF EXISTS "Anon view patient_package_sessions" ON public.patient_package_sessions;
DROP POLICY IF EXISTS "Auth delete patient_package_sessions" ON public.patient_package_sessions;
DROP POLICY IF EXISTS "Auth insert patient_package_sessions" ON public.patient_package_sessions;
DROP POLICY IF EXISTS "Auth view patient_package_sessions" ON public.patient_package_sessions;
CREATE POLICY "Staff can view patient_package_sessions" ON public.patient_package_sessions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert patient_package_sessions" ON public.patient_package_sessions FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can delete patient_package_sessions" ON public.patient_package_sessions FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- package_notification_rules
DROP POLICY IF EXISTS "Anon insert package_notification_rules" ON public.package_notification_rules;
DROP POLICY IF EXISTS "Anon update package_notification_rules" ON public.package_notification_rules;
DROP POLICY IF EXISTS "Anon view package_notification_rules" ON public.package_notification_rules;
DROP POLICY IF EXISTS "Auth insert package_notification_rules" ON public.package_notification_rules;
DROP POLICY IF EXISTS "Auth update package_notification_rules" ON public.package_notification_rules;
DROP POLICY IF EXISTS "Auth view package_notification_rules" ON public.package_notification_rules;
CREATE POLICY "Staff can view package_notification_rules" ON public.package_notification_rules FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin can insert package_notification_rules" ON public.package_notification_rules FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update package_notification_rules" ON public.package_notification_rules FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- package_notification_log
DROP POLICY IF EXISTS "Anon insert package_notification_log" ON public.package_notification_log;
DROP POLICY IF EXISTS "Anon view package_notification_log" ON public.package_notification_log;
DROP POLICY IF EXISTS "Auth insert package_notification_log" ON public.package_notification_log;
DROP POLICY IF EXISTS "Auth view package_notification_log" ON public.package_notification_log;
CREATE POLICY "Staff can view package_notification_log" ON public.package_notification_log FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- patient_allergies
DROP POLICY IF EXISTS "Anon insert patient_allergies" ON public.patient_allergies;
DROP POLICY IF EXISTS "Anon update patient_allergies" ON public.patient_allergies;
DROP POLICY IF EXISTS "Anon view patient_allergies" ON public.patient_allergies;
DROP POLICY IF EXISTS "Auth insert patient_allergies" ON public.patient_allergies;
DROP POLICY IF EXISTS "Auth update patient_allergies" ON public.patient_allergies;
DROP POLICY IF EXISTS "Auth view patient_allergies" ON public.patient_allergies;
CREATE POLICY "Staff can view patient_allergies" ON public.patient_allergies FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert patient_allergies" ON public.patient_allergies FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update patient_allergies" ON public.patient_allergies FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- patient_contacts
DROP POLICY IF EXISTS "Anon insert patient_contacts" ON public.patient_contacts;
DROP POLICY IF EXISTS "Anon update patient_contacts" ON public.patient_contacts;
DROP POLICY IF EXISTS "Anon view patient_contacts" ON public.patient_contacts;
DROP POLICY IF EXISTS "Auth insert patient_contacts" ON public.patient_contacts;
DROP POLICY IF EXISTS "Auth update patient_contacts" ON public.patient_contacts;
DROP POLICY IF EXISTS "Auth view patient_contacts" ON public.patient_contacts;
CREATE POLICY "Staff can view patient_contacts" ON public.patient_contacts FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert patient_contacts" ON public.patient_contacts FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update patient_contacts" ON public.patient_contacts FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- patient_insurance
DROP POLICY IF EXISTS "Anon insert patient_insurance" ON public.patient_insurance;
DROP POLICY IF EXISTS "Anon update patient_insurance" ON public.patient_insurance;
DROP POLICY IF EXISTS "Anon view patient_insurance" ON public.patient_insurance;
DROP POLICY IF EXISTS "Auth insert patient_insurance" ON public.patient_insurance;
DROP POLICY IF EXISTS "Auth update patient_insurance" ON public.patient_insurance;
DROP POLICY IF EXISTS "Auth view patient_insurance" ON public.patient_insurance;
CREATE POLICY "Staff can view patient_insurance" ON public.patient_insurance FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert patient_insurance" ON public.patient_insurance FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update patient_insurance" ON public.patient_insurance FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- patient_medications
DROP POLICY IF EXISTS "Anon insert patient_medications" ON public.patient_medications;
DROP POLICY IF EXISTS "Anon update patient_medications" ON public.patient_medications;
DROP POLICY IF EXISTS "Anon view patient_medications" ON public.patient_medications;
DROP POLICY IF EXISTS "Auth insert patient_medications" ON public.patient_medications;
DROP POLICY IF EXISTS "Auth update patient_medications" ON public.patient_medications;
DROP POLICY IF EXISTS "Auth view patient_medications" ON public.patient_medications;
CREATE POLICY "Staff can view patient_medications" ON public.patient_medications FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert patient_medications" ON public.patient_medications FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update patient_medications" ON public.patient_medications FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- patient_medical_history
DROP POLICY IF EXISTS "Anon insert patient_medical_history" ON public.patient_medical_history;
DROP POLICY IF EXISTS "Anon update patient_medical_history" ON public.patient_medical_history;
DROP POLICY IF EXISTS "Anon view patient_medical_history" ON public.patient_medical_history;
DROP POLICY IF EXISTS "Auth insert patient_medical_history" ON public.patient_medical_history;
DROP POLICY IF EXISTS "Auth update patient_medical_history" ON public.patient_medical_history;
DROP POLICY IF EXISTS "Auth view patient_medical_history" ON public.patient_medical_history;
CREATE POLICY "Staff can view patient_medical_history" ON public.patient_medical_history FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert patient_medical_history" ON public.patient_medical_history FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update patient_medical_history" ON public.patient_medical_history FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- membership_invoices
DROP POLICY IF EXISTS "Anon insert membership_invoices" ON public.membership_invoices;
DROP POLICY IF EXISTS "Anon update membership_invoices" ON public.membership_invoices;
DROP POLICY IF EXISTS "Anon view membership_invoices" ON public.membership_invoices;
DROP POLICY IF EXISTS "Auth insert membership_invoices" ON public.membership_invoices;
DROP POLICY IF EXISTS "Auth update membership_invoices" ON public.membership_invoices;
DROP POLICY IF EXISTS "Auth view membership_invoices" ON public.membership_invoices;
CREATE POLICY "Staff can view membership_invoices" ON public.membership_invoices FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert membership_invoices" ON public.membership_invoices FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update membership_invoices" ON public.membership_invoices FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

-- proforma_scenarios (has DELETE)
DROP POLICY IF EXISTS "Anon delete proforma_scenarios" ON public.proforma_scenarios;
DROP POLICY IF EXISTS "Anon insert proforma_scenarios" ON public.proforma_scenarios;
DROP POLICY IF EXISTS "Anon update proforma_scenarios" ON public.proforma_scenarios;
DROP POLICY IF EXISTS "Anon view proforma_scenarios" ON public.proforma_scenarios;
DROP POLICY IF EXISTS "Auth delete proforma_scenarios" ON public.proforma_scenarios;
DROP POLICY IF EXISTS "Auth insert proforma_scenarios" ON public.proforma_scenarios;
DROP POLICY IF EXISTS "Auth update proforma_scenarios" ON public.proforma_scenarios;
DROP POLICY IF EXISTS "Auth view proforma_scenarios" ON public.proforma_scenarios;
CREATE POLICY "Staff can view proforma_scenarios" ON public.proforma_scenarios FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert proforma_scenarios" ON public.proforma_scenarios FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update proforma_scenarios" ON public.proforma_scenarios FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can delete proforma_scenarios" ON public.proforma_scenarios FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- treatment_device_requirements
DROP POLICY IF EXISTS "Anon insert treatment_device_requirements" ON public.treatment_device_requirements;
DROP POLICY IF EXISTS "Anon update treatment_device_requirements" ON public.treatment_device_requirements;
DROP POLICY IF EXISTS "Anon view treatment_device_requirements" ON public.treatment_device_requirements;
DROP POLICY IF EXISTS "Auth insert treatment_device_requirements" ON public.treatment_device_requirements;
DROP POLICY IF EXISTS "Auth update treatment_device_requirements" ON public.treatment_device_requirements;
DROP POLICY IF EXISTS "Auth view treatment_device_requirements" ON public.treatment_device_requirements;
CREATE POLICY "Staff can view treatment_device_requirements" ON public.treatment_device_requirements FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin can insert treatment_device_requirements" ON public.treatment_device_requirements FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update treatment_device_requirements" ON public.treatment_device_requirements FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- intake_forms
DROP POLICY IF EXISTS "Anon insert intake_forms" ON public.intake_forms;
DROP POLICY IF EXISTS "Anon update intake_forms" ON public.intake_forms;
DROP POLICY IF EXISTS "Anon view intake_forms" ON public.intake_forms;
DROP POLICY IF EXISTS "Auth insert intake_forms" ON public.intake_forms;
DROP POLICY IF EXISTS "Auth update intake_forms" ON public.intake_forms;
DROP POLICY IF EXISTS "Auth view intake_forms" ON public.intake_forms;
CREATE POLICY "Staff can view intake_forms" ON public.intake_forms FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert intake_forms" ON public.intake_forms FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update intake_forms" ON public.intake_forms FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
-- Also allow anon insert for public intake form submissions
CREATE POLICY "Anon can submit intake_forms" ON public.intake_forms FOR INSERT TO anon WITH CHECK (true);

-- appointment_waitlist
DROP POLICY IF EXISTS "Anon insert waitlist" ON public.appointment_waitlist;
DROP POLICY IF EXISTS "Anon update waitlist" ON public.appointment_waitlist;
DROP POLICY IF EXISTS "Anon view waitlist" ON public.appointment_waitlist;
DROP POLICY IF EXISTS "Auth insert waitlist" ON public.appointment_waitlist;
DROP POLICY IF EXISTS "Auth update waitlist" ON public.appointment_waitlist;
DROP POLICY IF EXISTS "Auth view waitlist" ON public.appointment_waitlist;
CREATE POLICY "Staff can view appointment_waitlist" ON public.appointment_waitlist FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert appointment_waitlist" ON public.appointment_waitlist FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update appointment_waitlist" ON public.appointment_waitlist FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
