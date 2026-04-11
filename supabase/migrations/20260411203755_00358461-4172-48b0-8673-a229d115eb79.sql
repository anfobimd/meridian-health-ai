
-- Add member pricing columns to treatments
ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS member_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effective_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS is_member_pricing_enabled boolean DEFAULT false;

-- Price history table
CREATE TABLE public.treatment_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_id uuid REFERENCES public.treatments(id) ON DELETE CASCADE NOT NULL,
  old_price numeric,
  new_price numeric,
  old_member_price numeric,
  new_member_price numeric,
  changed_by uuid,
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.treatment_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view price history"
  ON public.treatment_price_history FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can insert price history"
  ON public.treatment_price_history FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));
