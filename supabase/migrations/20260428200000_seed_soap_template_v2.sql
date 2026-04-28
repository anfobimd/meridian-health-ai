-- Seed Standard SOAP Note chart template (v2: plain SQL, idempotent)
INSERT INTO public.chart_templates (id, name, description, category, keywords, is_system, is_active)
SELECT '00000000-0000-0000-0000-00005a0a7001'::uuid, 'Standard SOAP Note',
  'General-purpose SOAP note for ambulatory and follow-up visits.', 'general',
  ARRAY['soap','general','follow-up'], true, true
WHERE NOT EXISTS (SELECT 1 FROM public.chart_templates WHERE name = 'Standard SOAP Note');

INSERT INTO public.chart_template_sections (id, template_id, title, sort_order, is_required)
SELECT '00000000-0000-0000-0000-00005a0a7011'::uuid, '00000000-0000-0000-0000-00005a0a7001'::uuid, 'Subjective', 1, true
WHERE NOT EXISTS (SELECT 1 FROM public.chart_template_sections WHERE id = '00000000-0000-0000-0000-00005a0a7011');

INSERT INTO public.chart_template_sections (id, template_id, title, sort_order, is_required)
SELECT '00000000-0000-0000-0000-00005a0a7012'::uuid, '00000000-0000-0000-0000-00005a0a7001'::uuid, 'Objective', 2, true
WHERE NOT EXISTS (SELECT 1 FROM public.chart_template_sections WHERE id = '00000000-0000-0000-0000-00005a0a7012');

INSERT INTO public.chart_template_sections (id, template_id, title, sort_order, is_required)
SELECT '00000000-0000-0000-0000-00005a0a7013'::uuid, '00000000-0000-0000-0000-00005a0a7001'::uuid, 'Assessment', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.chart_template_sections WHERE id = '00000000-0000-0000-0000-00005a0a7013');

INSERT INTO public.chart_template_sections (id, template_id, title, sort_order, is_required)
SELECT '00000000-0000-0000-0000-00005a0a7014'::uuid, '00000000-0000-0000-0000-00005a0a7001'::uuid, 'Plan', 4, true
WHERE NOT EXISTS (SELECT 1 FROM public.chart_template_sections WHERE id = '00000000-0000-0000-0000-00005a0a7014');

INSERT INTO public.chart_template_fields (id, section_id, label, field_type, is_required, sort_order)
SELECT '00000000-0000-0000-0000-00005a0a7021'::uuid, '00000000-0000-0000-0000-00005a0a7011'::uuid, 'Chief Complaint', 'text', true, 1
WHERE NOT EXISTS (SELECT 1 FROM public.chart_template_fields WHERE id = '00000000-0000-0000-0000-00005a0a7021');

INSERT INTO public.chart_template_fields (id, section_id, label, field_type, is_required, sort_order)
SELECT '00000000-0000-0000-0000-00005a0a7022'::uuid, '00000000-0000-0000-0000-00005a0a7011'::uuid, 'History of Present Illness', 'text', false, 2
WHERE NOT EXISTS (SELECT 1 FROM public.chart_template_fields WHERE id = '00000000-0000-0000-0000-00005a0a7022');

INSERT INTO public.chart_template_fields (id, section_id, label, field_type, is_required, sort_order)
SELECT '00000000-0000-0000-0000-00005a0a7023'::uuid, '00000000-0000-0000-0000-00005a0a7012'::uuid, 'Physical Exam', 'text', false, 1
WHERE NOT EXISTS (SELECT 1 FROM public.chart_template_fields WHERE id = '00000000-0000-0000-0000-00005a0a7023');

INSERT INTO public.chart_template_fields (id, section_id, label, field_type, is_required, sort_order)
SELECT '00000000-0000-0000-0000-00005a0a7024'::uuid, '00000000-0000-0000-0000-00005a0a7013'::uuid, 'Assessment', 'text', true, 1
WHERE NOT EXISTS (SELECT 1 FROM public.chart_template_fields WHERE id = '00000000-0000-0000-0000-00005a0a7024');

INSERT INTO public.chart_template_fields (id, section_id, label, field_type, is_required, sort_order)
SELECT '00000000-0000-0000-0000-00005a0a7025'::uuid, '00000000-0000-0000-0000-00005a0a7014'::uuid, 'Plan', 'text', true, 1
WHERE NOT EXISTS (SELECT 1 FROM public.chart_template_fields WHERE id = '00000000-0000-0000-0000-00005a0a7025');
