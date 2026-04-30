-- Add bookable_via_self_serve flag to treatments.
--
-- Admin per-treatment opt-in for the patient-facing self-serve booking flow.
-- Default false on rollout so nothing becomes self-bookable until ops decides.
-- Patient-facing catalog filter (separate PR) additionally requires
-- requires_gfe = false AND requires_md_review = false — so this toggle alone
-- cannot expose a GFE-required treatment.

ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS bookable_via_self_serve boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.treatments.bookable_via_self_serve IS
  'Admin per-treatment toggle for self-serve booking eligibility. Patient-facing catalog also requires requires_gfe=false AND requires_md_review=false.';

CREATE INDEX IF NOT EXISTS idx_treatments_bookable_self_serve
  ON public.treatments (bookable_via_self_serve, is_active)
  WHERE bookable_via_self_serve = true AND is_active = true;
