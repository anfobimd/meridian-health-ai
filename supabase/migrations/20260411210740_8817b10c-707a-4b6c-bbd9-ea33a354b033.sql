
-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  channel text NOT NULL DEFAULT 'in_app',
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  read_at timestamptz,
  related_type text,
  related_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Staff can view all notifications" ON public.notifications FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins can insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);

-- Provider notification preferences
CREATE TABLE public.provider_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE UNIQUE,
  daily_sms_enabled boolean NOT NULL DEFAULT false,
  daily_sms_time time DEFAULT '07:00',
  phone_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view prefs" ON public.provider_notification_prefs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins can manage prefs" ON public.provider_notification_prefs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_provider_notif_prefs_updated_at BEFORE UPDATE ON public.provider_notification_prefs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
