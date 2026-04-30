-- Phase 3 #7 follow-up: harden the set_updated_at trigger function with an
-- explicit search_path. Without this, a malicious schema in the search_path
-- could shadow the now() function and inject behavior. Best practice for
-- SECURITY-INVOKER trigger functions.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
