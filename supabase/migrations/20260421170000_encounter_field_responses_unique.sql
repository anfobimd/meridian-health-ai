-- 20260421170000 — Add missing unique constraint
--
-- encounter_field_responses has no UNIQUE(encounter_id, field_id), so the
-- upsert({ onConflict: "encounter_id,field_id" }) calls in EncounterChart.tsx
-- silently inserted duplicates every time a provider hit Save, bloating the
-- chart history and causing merge conflicts later.
--
-- Deduplicate first (keep the most recently updated row per encounter+field),
-- then add the constraint.

WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY encounter_id, field_id ORDER BY updated_at DESC NULLS LAST, id DESC) AS rn
  FROM public.encounter_field_responses
)
DELETE FROM public.encounter_field_responses
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE public.encounter_field_responses
  ADD CONSTRAINT encounter_field_responses_encounter_field_key
  UNIQUE (encounter_id, field_id);
