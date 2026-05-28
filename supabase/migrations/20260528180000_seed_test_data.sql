-- Seed deterministic test data so the full booking → checkout flow can be
-- exercised end-to-end. Everything is named "Test ___ N" so it's easy to
-- spot (and easy to delete later). All rows use fixed UUIDs and
-- ON CONFLICT DO NOTHING, so this migration is idempotent.

-- ── 5 Providers ────────────────────────────────────────────────────────────
INSERT INTO public.providers (id, first_name, last_name, email, specialty, credentials, is_active)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','Test','Provider 1','test.provider1@example.com','Aesthetics','MD',true),
  ('aaaaaaaa-0000-0000-0000-000000000002','Test','Provider 2','test.provider2@example.com','Hormone Therapy','NP',true),
  ('aaaaaaaa-0000-0000-0000-000000000003','Test','Provider 3','test.provider3@example.com','Wellness','PA',true),
  ('aaaaaaaa-0000-0000-0000-000000000004','Test','Provider 4','test.provider4@example.com','Injectables','RN',true),
  ('aaaaaaaa-0000-0000-0000-000000000005','Test','Provider 5','test.provider5@example.com','Med Spa','MD',true)
ON CONFLICT (id) DO NOTHING;

-- ── 5 Patients ─────────────────────────────────────────────────────────────
INSERT INTO public.patients (id, first_name, last_name, email, phone, date_of_birth, gender, is_active)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001','Test','Patient 1','test.patient1@example.com','555-0101','1985-01-15','female',true),
  ('bbbbbbbb-0000-0000-0000-000000000002','Test','Patient 2','test.patient2@example.com','555-0102','1990-03-22','male',true),
  ('bbbbbbbb-0000-0000-0000-000000000003','Test','Patient 3','test.patient3@example.com','555-0103','1978-07-09','female',true),
  ('bbbbbbbb-0000-0000-0000-000000000004','Test','Patient 4','test.patient4@example.com','555-0104','1995-11-30','nonbinary',true),
  ('bbbbbbbb-0000-0000-0000-000000000005','Test','Patient 5','test.patient5@example.com','555-0105','1982-05-04','male',true)
ON CONFLICT (id) DO NOTHING;

-- ── 5 Treatments / Procedures with prices ──────────────────────────────────
INSERT INTO public.treatments (id, name, description, category, price, member_price, duration_minutes, is_active, requires_gfe, requires_md_review)
VALUES
  ('cccccccc-0000-0000-0000-000000000001','Test Procedure 1 — Consult','Initial consultation visit','consult',100,90,30,true,false,false),
  ('cccccccc-0000-0000-0000-000000000002','Test Procedure 2 — Botox','Neuromodulator treatment','injectable',200,180,30,true,true,false),
  ('cccccccc-0000-0000-0000-000000000003','Test Procedure 3 — Filler','Dermal filler treatment','injectable',300,270,45,true,true,false),
  ('cccccccc-0000-0000-0000-000000000004','Test Procedure 4 — Laser','Laser resurfacing','laser',400,360,60,true,true,true),
  ('cccccccc-0000-0000-0000-000000000005','Test Procedure 5 — IV Therapy','Vitamin IV drip','wellness',500,450,60,true,false,false)
ON CONFLICT (id) DO NOTHING;

-- ── 5 Rooms ────────────────────────────────────────────────────────────────
INSERT INTO public.rooms (id, name, room_type, is_active, sort_order)
VALUES
  ('dddddddd-0000-0000-0000-000000000001','Test Room 1','exam',true,1),
  ('dddddddd-0000-0000-0000-000000000002','Test Room 2','exam',true,2),
  ('dddddddd-0000-0000-0000-000000000003','Test Room 3','procedure',true,3),
  ('dddddddd-0000-0000-0000-000000000004','Test Room 4','procedure',true,4),
  ('dddddddd-0000-0000-0000-000000000005','Test Room 5','iv',true,5)
ON CONFLICT (id) DO NOTHING;

-- ── Provider availability: Mon–Fri 09:00–17:00, lunch 12:00–13:00 ─────────
INSERT INTO public.provider_availability (id, provider_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
SELECT
  md5(p.id::text || dow::text)::uuid,
  p.id,
  dow,
  '09:00'::time,
  '17:00'::time,
  '12:00'::time,
  '13:00'::time,
  true
FROM public.providers p
CROSS JOIN generate_series(1,5) AS dow
WHERE p.id IN (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000004',
  'aaaaaaaa-0000-0000-0000-000000000005'
)
ON CONFLICT (id) DO NOTHING;

-- ── 5 Appointments TODAY at 9, 10, 11, 13, 14 (booked status) ─────────────
INSERT INTO public.appointments (id, patient_id, provider_id, treatment_id, room_id, scheduled_at, duration_minutes, status, visit_type, notes)
VALUES
  ('eeeeeeee-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   (CURRENT_DATE + TIME '09:00')::timestamptz, 30, 'booked','in_person','Test appointment 1'),
  ('eeeeeeee-0000-0000-0000-000000000002',
   'bbbbbbbb-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000002',
   'cccccccc-0000-0000-0000-000000000002',
   'dddddddd-0000-0000-0000-000000000002',
   (CURRENT_DATE + TIME '10:00')::timestamptz, 30, 'booked','in_person','Test appointment 2'),
  ('eeeeeeee-0000-0000-0000-000000000003',
   'bbbbbbbb-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000003',
   'cccccccc-0000-0000-0000-000000000003',
   'dddddddd-0000-0000-0000-000000000003',
   (CURRENT_DATE + TIME '11:00')::timestamptz, 45, 'booked','in_person','Test appointment 3'),
  ('eeeeeeee-0000-0000-0000-000000000004',
   'bbbbbbbb-0000-0000-0000-000000000004',
   'aaaaaaaa-0000-0000-0000-000000000004',
   'cccccccc-0000-0000-0000-000000000004',
   'dddddddd-0000-0000-0000-000000000004',
   (CURRENT_DATE + TIME '13:00')::timestamptz, 60, 'booked','in_person','Test appointment 4'),
  ('eeeeeeee-0000-0000-0000-000000000005',
   'bbbbbbbb-0000-0000-0000-000000000005',
   'aaaaaaaa-0000-0000-0000-000000000005',
   'cccccccc-0000-0000-0000-000000000005',
   'dddddddd-0000-0000-0000-000000000005',
   (CURRENT_DATE + TIME '14:00')::timestamptz, 60, 'booked','in_person','Test appointment 5')
ON CONFLICT (id) DO NOTHING;
