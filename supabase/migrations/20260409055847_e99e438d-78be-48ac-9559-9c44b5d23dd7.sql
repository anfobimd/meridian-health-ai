
-- patients
CREATE POLICY "Anon view patients" ON public.patients FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert patients" ON public.patients FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update patients" ON public.patients FOR UPDATE TO anon USING (true);

-- providers
CREATE POLICY "Anon view providers" ON public.providers FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert providers" ON public.providers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update providers" ON public.providers FOR UPDATE TO anon USING (true);

-- treatments
CREATE POLICY "Anon view treatments" ON public.treatments FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert treatments" ON public.treatments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update treatments" ON public.treatments FOR UPDATE TO anon USING (true);

-- appointments
CREATE POLICY "Anon view appointments" ON public.appointments FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert appointments" ON public.appointments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update appointments" ON public.appointments FOR UPDATE TO anon USING (true);

-- clinical_notes
CREATE POLICY "Anon view clinical_notes" ON public.clinical_notes FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert clinical_notes" ON public.clinical_notes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update clinical_notes" ON public.clinical_notes FOR UPDATE TO anon USING (true);

-- intake_forms
CREATE POLICY "Anon view intake_forms" ON public.intake_forms FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert intake_forms" ON public.intake_forms FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update intake_forms" ON public.intake_forms FOR UPDATE TO anon USING (true);

-- audit_logs
CREATE POLICY "Anon insert audit_logs" ON public.audit_logs FOR INSERT TO anon WITH CHECK (true);
