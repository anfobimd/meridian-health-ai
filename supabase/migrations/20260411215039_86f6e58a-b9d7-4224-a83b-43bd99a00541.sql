
-- Staff notification preferences
CREATE TABLE IF NOT EXISTS public.staff_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  notification_type text NOT NULL,
  channel text NOT NULL DEFAULT 'in_app',
  is_enabled boolean NOT NULL DEFAULT true,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, notification_type, channel)
);

ALTER TABLE public.staff_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification prefs"
  ON public.staff_notification_preferences FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_staff_notif_prefs_updated_at ON public.staff_notification_preferences;
CREATE TRIGGER update_staff_notif_prefs_updated_at
  BEFORE UPDATE ON public.staff_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Aftercare templates
CREATE TABLE IF NOT EXISTS public.aftercare_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  procedure_type text,
  body text NOT NULL,
  auto_send_hours int,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aftercare_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage aftercare templates"
  ON public.aftercare_templates FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP TRIGGER IF EXISTS update_aftercare_templates_updated_at ON public.aftercare_templates;
CREATE TRIGGER update_aftercare_templates_updated_at
  BEFORE UPDATE ON public.aftercare_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add AI fields to patient_communication_log
ALTER TABLE public.patient_communication_log
  ADD COLUMN IF NOT EXISTS ai_intent text,
  ADD COLUMN IF NOT EXISTS ai_draft_reply text,
  ADD COLUMN IF NOT EXISTS is_resolved boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid;
