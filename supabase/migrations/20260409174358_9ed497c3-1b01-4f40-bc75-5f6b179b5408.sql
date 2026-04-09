
-- Create rooms table
CREATE TABLE public.rooms (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  room_type text NOT NULL DEFAULT 'exam',
  assigned_provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon view rooms" ON public.rooms FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert rooms" ON public.rooms FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update rooms" ON public.rooms FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view rooms" ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert rooms" ON public.rooms FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update rooms" ON public.rooms FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create devices table
CREATE TABLE public.devices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  device_type text NOT NULL DEFAULT 'laser',
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  maintenance_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon view devices" ON public.devices FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert devices" ON public.devices FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update devices" ON public.devices FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view devices" ON public.devices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert devices" ON public.devices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update devices" ON public.devices FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create treatment_device_requirements table
CREATE TABLE public.treatment_device_requirements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  treatment_id uuid NOT NULL REFERENCES public.treatments(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  is_required boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(treatment_id, device_id)
);

ALTER TABLE public.treatment_device_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon view treatment_device_requirements" ON public.treatment_device_requirements FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert treatment_device_requirements" ON public.treatment_device_requirements FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update treatment_device_requirements" ON public.treatment_device_requirements FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view treatment_device_requirements" ON public.treatment_device_requirements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert treatment_device_requirements" ON public.treatment_device_requirements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update treatment_device_requirements" ON public.treatment_device_requirements FOR UPDATE TO authenticated USING (true);

-- Add roomed status to appointment_status enum
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'roomed' AFTER 'checked_in';

-- Add room_id, device_id, roomed_at to appointments
ALTER TABLE public.appointments
  ADD COLUMN room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  ADD COLUMN device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  ADD COLUMN roomed_at timestamp with time zone;
