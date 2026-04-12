
-- Fix 1: Drop the overly permissive anon SELECT policy on intake_invitations
DROP POLICY IF EXISTS "Public can read invitation by token" ON public.intake_invitations;

-- Fix 2: Remove intake_invitations from Realtime publication to prevent sensitive data broadcast
ALTER PUBLICATION supabase_realtime DROP TABLE public.intake_invitations;
