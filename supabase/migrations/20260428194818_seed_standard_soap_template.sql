-- Seed a Standard SOAP Note chart template so providers can chart visits
-- and the QuickTextExpander can be tested in the encounter UI.
DO $$
DECLARE
  v_template_id uuid;
  v_subjective_id uuid;
  v_objective_id uuid;
  v_assessment_id uuid;
  v_plan_id uuid;
BEGIN
  SELECT id INTO v_template_id
  FROM public.chart_templates
  WHERE name = 'Standard SOAP Note' AND is_system = true
  LIMIT 1;

  IF v_template_id IS NOT NULL THEN
    RAISE NOTICE 'Standard SOAP Note already seeded (id=%), skipping.', v_template_id;
    RETURN;
  END IF;

  INSERT INTO public.chart_templates (name, description, category, keywords, is_system, is_active)
  VALUES (
    'Standard SOAP Note',
    'General-purpose SOAP note for ambulatory and follow-up visits.',
    'general',
    ARRAY['soap', 'general', 'follow-up'],
    true,
    true
  )
  RETURNING id INTO v_template_id;

  INSERT INTO public.chart_template_sections (template_id, title, sort_order, is_required)
  VALUES (v_template_id, 'Subjective', 1, true) RETURNING id INTO v_subjective_id;

  INSERT INTO public.chart_template_sections (template_id, title, sort_order, is_required)
  VALUES (v_template_id, 'Objective', 2, true) RETURNING id INTO v_objective_id;

  INSERT INTO public.chart_template_sections (template_id, title, sort_order, is_required)
  VALUES (v_template_id, 'Assessment', 3, true) RETURNING id INTO v_assessment_id;

  INSERT INTO public.chart_template_sections (template_id, title, sort_order, is_required)
  VALUES (v_template_id, 'Plan', 4, true) RETURNING id INTO v_plan_id;

  INSERT INTO public.chart_template_fields (section_id, label, field_type, is_required, sort_order)
  VALUES
    (v_subjective_id, 'Chief Complaint', 'text', true, 1),
    (v_subjective_id, 'History of Present Illness', 'text', false, 2),
    (v_objective_id,  'Physical Exam', 'text', false, 1),
    (v_assessment_id, 'Assessment', 'text', true, 1),
    (v_plan_id,       'Plan', 'text', true, 1);
END $$;
