
-- 1. Clinic hours (weekly schedule)
CREATE TABLE public.clinic_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  open_time time NOT NULL DEFAULT '09:00',
  close_time time NOT NULL DEFAULT '17:00',
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(day_of_week)
);

ALTER TABLE public.clinic_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view clinic_hours" ON public.clinic_hours FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "Admin can insert clinic_hours" ON public.clinic_hours FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can update clinic_hours" ON public.clinic_hours FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can delete clinic_hours" ON public.clinic_hours FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER set_clinic_hours_updated_at BEFORE UPDATE ON public.clinic_hours FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed default Mon-Fri 9-5, Sat-Sun closed
INSERT INTO public.clinic_hours (day_of_week, open_time, close_time, is_closed) VALUES
  (0, '09:00', '17:00', true),
  (1, '09:00', '17:00', false),
  (2, '09:00', '17:00', false),
  (3, '09:00', '17:00', false),
  (4, '09:00', '17:00', false),
  (5, '09:00', '17:00', false),
  (6, '09:00', '17:00', true);

-- 2. Clinic holidays
CREATE TABLE public.clinic_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  holiday_date date NOT NULL,
  is_full_day boolean NOT NULL DEFAULT true,
  open_time time,
  close_time time,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(holiday_date)
);

ALTER TABLE public.clinic_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view clinic_holidays" ON public.clinic_holidays FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "Admin can insert clinic_holidays" ON public.clinic_holidays FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can update clinic_holidays" ON public.clinic_holidays FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can delete clinic_holidays" ON public.clinic_holidays FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. Add cancellation tracking to appointments
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
