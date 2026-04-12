
-- Create intake_invitations table
CREATE TABLE public.intake_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  token text UNIQUE NOT NULL,
  focus_areas text[],
  channel text DEFAULT 'manual',
  sent_at timestamptz DEFAULT now(),
  sent_by uuid,
  opened_at timestamptz,
  completed_at timestamptz,
  intake_form_id uuid REFERENCES public.intake_forms(id) ON DELETE SET NULL,
  status text DEFAULT 'sent',
  expires_at timestamptz,
  phone text,
  email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.intake_invitations ENABLE ROW LEVEL SECURITY;

-- Staff can view all invitations
CREATE POLICY "Staff can view invitations"
  ON public.intake_invitations FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- Staff can create invitations
CREATE POLICY "Staff can create invitations"
  ON public.intake_invitations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

-- Staff can update invitations
CREATE POLICY "Staff can update invitations"
  ON public.intake_invitations FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- Allow anon/public updates for token-based status tracking (opened/completed)
CREATE POLICY "Public can update invitation status by token"
  ON public.intake_invitations FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Allow anon select by token (for pre-fill)
CREATE POLICY "Public can read invitation by token"
  ON public.intake_invitations FOR SELECT
  TO anon
  USING (true);

-- Timestamp trigger
CREATE TRIGGER update_intake_invitations_updated_at
  BEFORE UPDATE ON public.intake_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.intake_invitations;
