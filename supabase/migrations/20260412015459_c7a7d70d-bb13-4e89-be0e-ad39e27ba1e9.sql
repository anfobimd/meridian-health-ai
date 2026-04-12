
-- Drop the overly permissive anon update policy
DROP POLICY "Public can update invitation status by token" ON public.intake_invitations;

-- Re-create with column restriction: anon can only update status-tracking fields
CREATE POLICY "Public can update invitation status by token"
  ON public.intake_invitations FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Note: Postgres RLS cannot restrict columns directly in policies.
-- The actual column restriction will be enforced in the edge function (service role).
-- The anon policy remains but the frontend only calls the edge function, not direct updates.
-- For defense-in-depth, we revoke direct anon UPDATE and handle via edge function instead.

-- Actually, let's remove anon UPDATE entirely and handle via edge function with service role
DROP POLICY "Public can update invitation status by token" ON public.intake_invitations;
