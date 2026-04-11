
-- Create provider_time_off table
CREATE TABLE public.provider_time_off (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid REFERENCES public.providers(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.provider_time_off ENABLE ROW LEVEL SECURITY;

-- Staff can view all time-off
CREATE POLICY "Staff can view provider_time_off"
ON public.provider_time_off FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

-- Providers can insert their own time-off requests
CREATE POLICY "Providers can insert own time_off"
ON public.provider_time_off FOR INSERT
TO authenticated
WITH CHECK (
  provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

-- Admins can update (approve/reject); providers can update own pending
CREATE POLICY "Staff can update provider_time_off"
ON public.provider_time_off FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()) AND status = 'pending')
);

-- Providers can delete own pending requests
CREATE POLICY "Providers can delete own pending time_off"
ON public.provider_time_off FOR DELETE
TO authenticated
USING (
  provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()) AND status = 'pending'
);

-- Timestamp trigger
CREATE TRIGGER update_provider_time_off_updated_at
BEFORE UPDATE ON public.provider_time_off
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
