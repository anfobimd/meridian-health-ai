
-- marketplace_config
CREATE TABLE IF NOT EXISTS public.marketplace_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT false,
  clinic_name text,
  membership_tiers jsonb NOT NULL DEFAULT '{"founding_all":{"label":"Founding - All Access","monthly":1500,"modalities":["injectables","weight_loss","laser"]},"single":{"label":"Single Modality","monthly":750,"modalities_count":1},"double":{"label":"Double Modality","monthly":1200,"modalities_count":2},"triple":{"label":"Triple / All Access","monthly":1500,"modalities_count":3}}'::jsonb,
  modalities jsonb NOT NULL DEFAULT '[{"key":"injectables","label":"Injectables","description":"Botox, fillers, PRP"},{"key":"weight_loss","label":"Weight Loss","description":"GLP-1, Semaglutide, Tirzepatide"},{"key":"laser","label":"Laser","description":"CO2, IPL, RF Microneedling"}]'::jsonb,
  laser_hourly_rate numeric NOT NULL DEFAULT 150,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.marketplace_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view marketplace_config" ON public.marketplace_config FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert marketplace_config" ON public.marketplace_config FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update marketplace_config" ON public.marketplace_config FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view marketplace_config" ON public.marketplace_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert marketplace_config" ON public.marketplace_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update marketplace_config" ON public.marketplace_config FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_marketplace_config_updated_at BEFORE UPDATE ON public.marketplace_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- provider_skills
CREATE TABLE IF NOT EXISTS public.provider_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  modality text NOT NULL DEFAULT 'injectables',
  certification_level text NOT NULL DEFAULT 'intermediate',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_skills ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='provider_skills' AND policyname='Anon view provider_skills') THEN
    CREATE POLICY "Anon view provider_skills" ON public.provider_skills FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='provider_skills' AND policyname='Anon insert provider_skills') THEN
    CREATE POLICY "Anon insert provider_skills" ON public.provider_skills FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='provider_skills' AND policyname='Anon update provider_skills') THEN
    CREATE POLICY "Anon update provider_skills" ON public.provider_skills FOR UPDATE TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='provider_skills' AND policyname='Auth view provider_skills') THEN
    CREATE POLICY "Auth view provider_skills" ON public.provider_skills FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='provider_skills' AND policyname='Auth insert provider_skills') THEN
    CREATE POLICY "Auth insert provider_skills" ON public.provider_skills FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='provider_skills' AND policyname='Auth update provider_skills') THEN
    CREATE POLICY "Auth update provider_skills" ON public.provider_skills FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='provider_skills' AND policyname='Anon delete provider_skills') THEN
    CREATE POLICY "Anon delete provider_skills" ON public.provider_skills FOR DELETE TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='provider_skills' AND policyname='Auth delete provider_skills') THEN
    CREATE POLICY "Auth delete provider_skills" ON public.provider_skills FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- provider_availability already exists, just ensure RLS + delete policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='provider_availability' AND policyname='Anon delete provider_availability') THEN
    CREATE POLICY "Anon delete provider_availability" ON public.provider_availability FOR DELETE TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='provider_availability' AND policyname='Auth delete provider_availability') THEN
    CREATE POLICY "Auth delete provider_availability" ON public.provider_availability FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- Add room_preference_id to provider_availability if missing
ALTER TABLE public.provider_availability ADD COLUMN IF NOT EXISTS room_preference_id uuid REFERENCES public.rooms(id);

-- marketplace_bookings
CREATE TABLE IF NOT EXISTS public.marketplace_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  provider_id uuid NOT NULL REFERENCES public.providers(id),
  treatment_id uuid REFERENCES public.treatments(id),
  appointment_id uuid REFERENCES public.appointments(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  ai_match_reasoning text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.marketplace_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view marketplace_bookings" ON public.marketplace_bookings FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert marketplace_bookings" ON public.marketplace_bookings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update marketplace_bookings" ON public.marketplace_bookings FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view marketplace_bookings" ON public.marketplace_bookings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert marketplace_bookings" ON public.marketplace_bookings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update marketplace_bookings" ON public.marketplace_bookings FOR UPDATE TO authenticated USING (true);

-- provider_memberships
CREATE TABLE IF NOT EXISTS public.provider_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'single',
  modalities text[] NOT NULL DEFAULT '{}'::text[],
  monthly_rate numeric NOT NULL DEFAULT 750,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon view provider_memberships" ON public.provider_memberships FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert provider_memberships" ON public.provider_memberships FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update provider_memberships" ON public.provider_memberships FOR UPDATE TO anon USING (true);
CREATE POLICY "Auth view provider_memberships" ON public.provider_memberships FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert provider_memberships" ON public.provider_memberships FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update provider_memberships" ON public.provider_memberships FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_provider_memberships_updated_at BEFORE UPDATE ON public.provider_memberships FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Alter providers table
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS marketplace_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS marketplace_bio text;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS modalities text[] DEFAULT '{}'::text[];
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS hourly_rate_override numeric;
