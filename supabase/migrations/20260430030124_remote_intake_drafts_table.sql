-- Phase 3 #7: server-side storage for remote intake drafts.
-- Replaces localStorage persistence of patient PII (name, email, phone, DOB).
-- Access is service-role only; clients reach this table exclusively through
-- the submit-remote-intake edge function with token-based authorization.
CREATE TABLE public.remote_intake_drafts (
  token text PRIMARY KEY,
  draft_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Auto-expiry: drafts older than 30 days will be eligible for cleanup
  -- via a future scheduled job. We don't enforce on read here, but the
  -- column is set so that ops can run a periodic DELETE.
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

-- The token must reference an actual invitation. This prevents drafts being
-- written with random or fabricated tokens, which would let attackers fill
-- the table and exfiltrate via timing attacks.
ALTER TABLE public.remote_intake_drafts
  ADD CONSTRAINT remote_intake_drafts_token_fk
  FOREIGN KEY (token) REFERENCES public.intake_invitations(token)
  ON DELETE CASCADE;

-- RLS on, no policies. The only path to this table is via the
-- submit-remote-intake edge function (service role).
ALTER TABLE public.remote_intake_drafts ENABLE ROW LEVEL SECURITY;

-- Index for cleanup job
CREATE INDEX remote_intake_drafts_expires_at_idx
  ON public.remote_intake_drafts(expires_at);

-- updated_at auto-bumps on UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER remote_intake_drafts_set_updated_at
  BEFORE UPDATE ON public.remote_intake_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
