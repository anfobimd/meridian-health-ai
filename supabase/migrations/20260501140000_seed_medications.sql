-- 20260501140000 — Seed starter formulary (QA #60)
--
-- The medications catalog is empty in production, which made the prescription
-- search return zero results — the original UI required a formulary pick
-- before the Save button activated, so providers couldn't write scripts at
-- all. The UI now also has a free-text fallback (no formulary needed), but
-- having a reasonable starter list still makes the autocomplete useful out
-- of the box.
--
-- Idempotent: only inserts when the name is not already present (no unique
-- constraint on medications.name in the existing schema, so we use a
-- WHERE NOT EXISTS guard instead of ON CONFLICT).

INSERT INTO public.medications (name, generic_name, category, route, default_dose, default_unit, is_controlled, schedule_class)
SELECT v.name, v.generic_name, v.category, v.route, v.default_dose, v.default_unit, v.is_controlled, v.schedule_class
FROM (VALUES
  ('Amoxicillin', 'Amoxicillin', 'antibiotic', 'oral', '500', 'mg', false, NULL::text),
  ('Azithromycin', 'Azithromycin', 'antibiotic', 'oral', '250', 'mg', false, NULL),
  ('Doxycycline', 'Doxycycline', 'antibiotic', 'oral', '100', 'mg', false, NULL),
  ('Cephalexin', 'Cephalexin', 'antibiotic', 'oral', '500', 'mg', false, NULL),
  ('Estradiol', 'Estradiol', 'hormone', 'transdermal', '0.05', 'mg/day', false, NULL),
  ('Progesterone', 'Progesterone', 'hormone', 'oral', '100', 'mg', false, NULL),
  ('Testosterone Cypionate', 'Testosterone', 'hormone', 'intramuscular', '200', 'mg/mL', true, 'III'),
  ('Levothyroxine', 'Levothyroxine', 'hormone', 'oral', '50', 'mcg', false, NULL),
  ('Sermorelin', 'Sermorelin', 'peptide', 'subcutaneous', '0.3', 'mg', false, NULL),
  ('Tirzepatide', 'Tirzepatide', 'GLP-1', 'subcutaneous', '2.5', 'mg', false, NULL),
  ('Semaglutide', 'Semaglutide', 'GLP-1', 'subcutaneous', '0.25', 'mg', false, NULL),
  ('Ibuprofen', 'Ibuprofen', 'NSAID', 'oral', '400', 'mg', false, NULL),
  ('Naproxen', 'Naproxen', 'NSAID', 'oral', '500', 'mg', false, NULL),
  ('Acetaminophen', 'Acetaminophen', 'analgesic', 'oral', '500', 'mg', false, NULL),
  ('Cetirizine', 'Cetirizine', 'antihistamine', 'oral', '10', 'mg', false, NULL),
  ('Loratadine', 'Loratadine', 'antihistamine', 'oral', '10', 'mg', false, NULL),
  ('Omeprazole', 'Omeprazole', 'PPI', 'oral', '20', 'mg', false, NULL),
  ('Metformin', 'Metformin', 'antidiabetic', 'oral', '500', 'mg', false, NULL)
) AS v(name, generic_name, category, route, default_dose, default_unit, is_controlled, schedule_class)
WHERE NOT EXISTS (
  SELECT 1 FROM public.medications m WHERE m.name = v.name
);
