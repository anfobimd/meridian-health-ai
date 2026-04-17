
-- ============================================================
-- SEED DATA MIGRATION — All 7 Avatar Journeys (idempotent)
-- ============================================================

-- PROVIDERS
INSERT INTO providers (id, first_name, last_name, specialty, credentials, email, phone, is_active, marketplace_enabled, marketplace_bio, modalities, hourly_rate_override, license_number, npi) VALUES
('b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'Emily', 'Chen', 'Aesthetics & Hormone Therapy', 'NP', 'emily.chen@meridian.dev', '555-201-0001', true, true, 'Board-certified NP specializing in aesthetic injectables and hormone optimization with 8 years of experience.', ARRAY['injectables','laser','hormone_therapy'], 185, 'NP-2024-1001', '1234567890'),
('b1a2c3d4-e5f6-4789-abcd-aaa222222222', 'Marcus', 'Rivera', 'Body Contouring & Regenerative', 'PA-C', 'marcus.rivera@meridian.dev', '555-201-0002', true, true, 'PA-C with expertise in body sculpting, regenerative medicine, and peptide therapy.', ARRAY['body_contouring','regenerative','peptides'], 165, 'PA-2024-2002', '2345678901'),
('b1a2c3d4-e5f6-4789-abcd-aaa333333333', 'Anita', 'Patel', 'Medical Director', 'MD', 'anita.patel@meridian.dev', '555-201-0003', true, false, NULL, ARRAY['oversight','hormone_therapy','injectables'], 250, 'MD-2024-3003', '3456789012')
ON CONFLICT (id) DO NOTHING;

-- ROOMS & DEVICES
INSERT INTO rooms (id, name, room_type, is_active) VALUES
('aaaa1111-bbbb-cccc-dddd-eeee11111111', 'Suite A — Injectables', 'treatment', true),
('aaaa1111-bbbb-cccc-dddd-eeee22222222', 'Suite B — Laser/Body', 'treatment', true),
('aaaa1111-bbbb-cccc-dddd-eeee33333333', 'Consultation Room', 'consultation', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO devices (id, name, device_type, is_active, room_id) VALUES
('dddd1111-bbbb-cccc-aaaa-eeee11111111', 'Sciton BBL', 'laser', true, 'aaaa1111-bbbb-cccc-dddd-eeee22222222'),
('dddd1111-bbbb-cccc-aaaa-eeee22222222', 'CoolSculpting Elite', 'body_contouring', true, 'aaaa1111-bbbb-cccc-dddd-eeee22222222'),
('dddd1111-bbbb-cccc-aaaa-eeee33333333', 'Morpheus8 RF', 'laser', true, 'aaaa1111-bbbb-cccc-dddd-eeee22222222')
ON CONFLICT (id) DO NOTHING;

-- PATIENTS
INSERT INTO patients (id, first_name, last_name, date_of_birth, gender, email, phone, city, state, zip, allergies, medications, is_active) VALUES
('aaaa2222-bbbb-cccc-dddd-eeee11111111', 'Sarah', 'Johnson', '1985-03-15', 'Female', 'sarah.johnson@test.com', '555-100-0001', 'Austin', 'TX', '78701', ARRAY['Penicillin'], ARRAY['Levothyroxine 50mcg'], true),
('aaaa2222-bbbb-cccc-dddd-eeee22222222', 'Michael', 'Thompson', '1978-07-22', 'Male', 'michael.t@test.com', '555-100-0002', 'Austin', 'TX', '78702', ARRAY[]::text[], ARRAY['Testosterone Cypionate 200mg/mL'], true),
('aaaa2222-bbbb-cccc-dddd-eeee33333333', 'Lisa', 'Martinez', '1990-11-08', 'Female', 'lisa.m@test.com', '555-100-0003', 'Round Rock', 'TX', '78664', ARRAY['Lidocaine'], ARRAY[]::text[], true),
('aaaa2222-bbbb-cccc-dddd-eeee44444444', 'David', 'Kim', '1982-01-30', 'Male', 'david.kim@test.com', '555-100-0004', 'Austin', 'TX', '78703', ARRAY[]::text[], ARRAY['Semaglutide 0.5mg'], true),
('aaaa2222-bbbb-cccc-dddd-eeee55555555', 'Jennifer', 'Williams', '1975-06-12', 'Female', 'jennifer.w@test.com', '555-100-0005', 'Cedar Park', 'TX', '78613', ARRAY['Sulfa drugs','Latex'], ARRAY['Estradiol patch 0.05mg','Progesterone 100mg'], true),
('aaaa2222-bbbb-cccc-dddd-eeee66666666', 'Robert', 'Davis', '1968-09-25', 'Male', 'robert.d@test.com', '555-100-0006', 'Austin', 'TX', '78704', ARRAY[]::text[], ARRAY[]::text[], true),
('aaaa2222-bbbb-cccc-dddd-eeee77777777', 'Amanda', 'Garcia', '1992-04-18', 'Female', 'amanda.g@test.com', '555-100-0007', 'Pflugerville', 'TX', '78660', ARRAY['Aspirin'], ARRAY[]::text[], true),
('aaaa2222-bbbb-cccc-dddd-eeee88888888', 'Thomas', 'Wilson', '1988-12-03', 'Male', 'thomas.w@test.com', '555-100-0008', 'Austin', 'TX', '78705', ARRAY[]::text[], ARRAY['BPC-157 500mcg'], true),
('aaaa2222-bbbb-cccc-dddd-eeee99999999', 'Nicole', 'Anderson', '1995-08-20', 'Female', 'nicole.a@test.com', '555-100-0009', 'Georgetown', 'TX', '78626', ARRAY[]::text[], ARRAY[]::text[], true)
ON CONFLICT (id) DO NOTHING;

-- SERVICE PACKAGES
INSERT INTO service_packages (id, name, description, package_type, category, session_count, price, individual_price, valid_days, is_active) VALUES
('aaaa3333-bbbb-cccc-dddd-eeee11111111', 'Botox 4-Pack', '4 sessions of Botox with 10% savings', 'bundle', 'injectables', 4, 1800, 500, 365, true),
('aaaa3333-bbbb-cccc-dddd-eeee22222222', 'Laser 6-Session', '6 IPL or BBL treatments', 'bundle', 'laser', 6, 3000, 550, 365, true),
('aaaa3333-bbbb-cccc-dddd-eeee33333333', 'CoolSculpting Duo', '2-area CoolSculpting plan', 'bundle', 'body_contouring', 4, 3200, 900, 180, true),
('aaaa3333-bbbb-cccc-dddd-eeee44444444', 'HRT Quarterly', 'Quarterly hormone therapy with labs', 'subscription', 'hormone_therapy', 4, 1200, 350, 120, true),
('aaaa3333-bbbb-cccc-dddd-eeee55555555', 'HydraFacial Membership', 'Monthly HydraFacial at member price', 'membership', 'skin', 12, 2400, 250, 365, true),
('aaaa3333-bbbb-cccc-dddd-eeee66666666', 'Weight Loss Program', '12-week Semaglutide program', 'bundle', 'weight_loss', 12, 4800, 500, 120, true)
ON CONFLICT (id) DO NOTHING;

-- APPOINTMENTS
INSERT INTO appointments (id, patient_id, provider_id, treatment_id, scheduled_at, status, duration_minutes, room_id, notes, checked_in_at, roomed_at) VALUES
('aaaa4444-bbbb-cccc-dddd-eeee11111111', 'aaaa2222-bbbb-cccc-dddd-eeee11111111', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', '1472c7b7-7d8b-471d-9376-92f2ae80d850', NOW()::date + INTERVAL '9 hours', 'booked', 30, 'aaaa1111-bbbb-cccc-dddd-eeee11111111', 'Returning for follow-up Botox', NULL, NULL),
('aaaa4444-bbbb-cccc-dddd-eeee22222222', 'aaaa2222-bbbb-cccc-dddd-eeee22222222', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'f61bacb3-8759-4793-81fa-2414329980dd', NOW()::date + INTERVAL '10 hours', 'booked', 45, 'aaaa1111-bbbb-cccc-dddd-eeee33333333', 'TRT follow-up', NULL, NULL),
('aaaa4444-bbbb-cccc-dddd-eeee33333333', 'aaaa2222-bbbb-cccc-dddd-eeee33333333', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', '622027d0-bcb3-493f-9b94-3eb3eda7c509', NOW()::date + INTERVAL '8 hours 30 minutes', 'checked_in', 45, 'aaaa1111-bbbb-cccc-dddd-eeee11111111', 'Microneedling session 2 of 4', NOW()::date + INTERVAL '8 hours 20 minutes', NULL),
('aaaa4444-bbbb-cccc-dddd-eeee44444444', 'aaaa2222-bbbb-cccc-dddd-eeee44444444', 'b1a2c3d4-e5f6-4789-abcd-aaa222222222', 'baab9466-daf2-4ead-a788-6d56b5a82fd6', NOW()::date + INTERVAL '9 hours', 'checked_in', 30, 'aaaa1111-bbbb-cccc-dddd-eeee33333333', 'Weight loss check-in week 6', NOW()::date + INTERVAL '8 hours 50 minutes', NULL),
('aaaa4444-bbbb-cccc-dddd-eeee55555555', 'aaaa2222-bbbb-cccc-dddd-eeee55555555', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'c5e0ab55-bf98-42a2-aae2-dd29df370a44', NOW()::date + INTERVAL '8 hours', 'roomed', 60, 'aaaa1111-bbbb-cccc-dddd-eeee33333333', 'HRT consult — review latest labs', NOW()::date + INTERVAL '7 hours 45 minutes', NOW()::date + INTERVAL '7 hours 55 minutes'),
('aaaa4444-bbbb-cccc-dddd-eeee66666666', 'aaaa2222-bbbb-cccc-dddd-eeee66666666', 'b1a2c3d4-e5f6-4789-abcd-aaa222222222', '508c0e49-0c99-4bf9-9869-0cbd2bef7fb1', NOW()::date + INTERVAL '7 hours 30 minutes', 'in_progress', 60, 'aaaa1111-bbbb-cccc-dddd-eeee22222222', 'CoolSculpting abdomen', NOW()::date + INTERVAL '7 hours 15 minutes', NOW()::date + INTERVAL '7 hours 25 minutes'),
('aaaa4444-bbbb-cccc-dddd-eeee77777777', 'aaaa2222-bbbb-cccc-dddd-eeee77777777', '4797cc91-aa9a-4017-97db-0b6b07336652', '8c4911a6-89da-4af1-8908-e9f96e3dcce9', NOW()::date + INTERVAL '7 hours', 'completed', 45, 'aaaa1111-bbbb-cccc-dddd-eeee11111111', NULL, NOW()::date + INTERVAL '6 hours 50 minutes', NOW()::date + INTERVAL '6 hours 55 minutes'),
('aaaa4444-bbbb-cccc-dddd-eeee88888888', 'aaaa2222-bbbb-cccc-dddd-eeee88888888', 'b1a2c3d4-e5f6-4789-abcd-aaa222222222', 'e9394f43-2c8a-4d7c-be7d-314be80b3c57', NOW()::date + INTERVAL '13 hours', 'booked', 30, 'aaaa1111-bbbb-cccc-dddd-eeee11111111', 'BPC-157 follow-up', NULL, NULL),
('aaaa4444-bbbb-cccc-dddd-eeee99999999', 'aaaa2222-bbbb-cccc-dddd-eeee99999999', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', '10d79ae1-825e-47b7-ad2d-9ae1fb76a90e', NOW()::date + INTERVAL '14 hours', 'booked', 60, 'aaaa1111-bbbb-cccc-dddd-eeee22222222', 'First Morpheus8', NULL, NULL),
('aaaa5555-bbbb-cccc-dddd-eeee11111111', 'aaaa2222-bbbb-cccc-dddd-eeee11111111', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', '1472c7b7-7d8b-471d-9376-92f2ae80d850', NOW() - INTERVAL '30 days', 'completed', 30, NULL, 'Botox glabella + forehead', NULL, NULL),
('aaaa5555-bbbb-cccc-dddd-eeee22222222', 'aaaa2222-bbbb-cccc-dddd-eeee22222222', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'f61bacb3-8759-4793-81fa-2414329980dd', NOW() - INTERVAL '60 days', 'completed', 45, NULL, 'Initial TRT consult', NULL, NULL),
('aaaa5555-bbbb-cccc-dddd-eeee33333333', 'aaaa2222-bbbb-cccc-dddd-eeee55555555', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'c5e0ab55-bf98-42a2-aae2-dd29df370a44', NOW() - INTERVAL '90 days', 'completed', 60, NULL, 'HRT initiation visit', NULL, NULL),
('aaaa5555-bbbb-cccc-dddd-eeee44444444', 'aaaa2222-bbbb-cccc-dddd-eeee11111111', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', '1472c7b7-7d8b-471d-9376-92f2ae80d850', NOW() + INTERVAL '14 days', 'booked', 30, 'aaaa1111-bbbb-cccc-dddd-eeee11111111', 'Next Botox', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ENCOUNTERS
INSERT INTO encounters (id, patient_id, provider_id, appointment_id, encounter_type, status, chief_complaint, started_at, signed_at, signed_by) VALUES
('aaaa6666-bbbb-cccc-dddd-eeee11111111', 'aaaa2222-bbbb-cccc-dddd-eeee77777777', '4797cc91-aa9a-4017-97db-0b6b07336652', 'aaaa4444-bbbb-cccc-dddd-eeee77777777', 'hydrafacial', 'signed', 'Monthly HydraFacial maintenance', NOW()::date + INTERVAL '7 hours', NOW()::date + INTERVAL '7 hours 40 minutes', '4797cc91-aa9a-4017-97db-0b6b07336652'),
('aaaa6666-bbbb-cccc-dddd-eeee22222222', 'aaaa2222-bbbb-cccc-dddd-eeee66666666', 'b1a2c3d4-e5f6-4789-abcd-aaa222222222', 'aaaa4444-bbbb-cccc-dddd-eeee66666666', 'body_contouring', 'in_progress', 'CoolSculpting abdomen', NOW()::date + INTERVAL '7 hours 30 minutes', NULL, NULL),
('aaaa6666-bbbb-cccc-dddd-eeee33333333', 'aaaa2222-bbbb-cccc-dddd-eeee11111111', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'aaaa5555-bbbb-cccc-dddd-eeee11111111', 'injectables', 'signed', 'Botox glabella + forehead lines', NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days' + INTERVAL '35 minutes', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111'),
('aaaa6666-bbbb-cccc-dddd-eeee44444444', 'aaaa2222-bbbb-cccc-dddd-eeee22222222', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'aaaa5555-bbbb-cccc-dddd-eeee22222222', 'hormone_therapy', 'signed', 'Initial TRT evaluation', NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days' + INTERVAL '50 minutes', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111')
ON CONFLICT (id) DO NOTHING;

-- CLINICAL NOTES
INSERT INTO clinical_notes (id, patient_id, provider_id, appointment_id, status, ai_generated, subjective, objective, assessment, plan, signed_at) VALUES
('aaaa7777-bbbb-cccc-dddd-eeee11111111', 'aaaa2222-bbbb-cccc-dddd-eeee77777777', '4797cc91-aa9a-4017-97db-0b6b07336652', 'aaaa4444-bbbb-cccc-dddd-eeee77777777', 'signed', true, 'Monthly HydraFacial. Skin dry after travel.', 'Mild dehydration, enlarged pores T-zone.', 'Mild dehydration, skin type II.', 'HydraFacial with Dermabuilder. Continue monthly. SPF 30+.', NOW()::date + INTERVAL '7 hours 40 minutes'),
('aaaa7777-bbbb-cccc-dddd-eeee22222222', 'aaaa2222-bbbb-cccc-dddd-eeee11111111', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'aaaa5555-bbbb-cccc-dddd-eeee11111111', 'signed', true, 'Follow-up Botox. Previous lasted 3.5 months.', 'Dynamic rhytids glabella moderate, frontalis mild.', 'Good response to neuromodulator therapy.', 'Botox: 20u glabella, 12u frontalis. Follow up 3-4 months.', NOW() - INTERVAL '30 days' + INTERVAL '35 minutes'),
('aaaa7777-bbbb-cccc-dddd-eeee33333333', 'aaaa2222-bbbb-cccc-dddd-eeee66666666', 'b1a2c3d4-e5f6-4789-abcd-aaa222222222', 'aaaa4444-bbbb-cccc-dddd-eeee66666666', 'draft', false, 'CoolSculpting abdomen.', NULL, NULL, NULL, NULL),
('aaaa7777-bbbb-cccc-dddd-eeee44444444', 'aaaa2222-bbbb-cccc-dddd-eeee22222222', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'aaaa5555-bbbb-cccc-dddd-eeee22222222', 'draft', true, 'TRT follow-up. Improved energy and mood.', 'Vitals stable. No injection site issues.', 'Adequate TRT response.', 'Continue TRT. Recheck labs 4 weeks.', NULL)
ON CONFLICT (id) DO NOTHING;

-- CHART REVIEW RECORDS
INSERT INTO chart_review_records (id, encounter_id, patient_id, provider_id, status, ai_priority_score, ai_risk_tier, rubber_stamp_threshold_seconds) VALUES
('aaaa8888-bbbb-cccc-dddd-eeee11111111', 'aaaa6666-bbbb-cccc-dddd-eeee11111111', 'aaaa2222-bbbb-cccc-dddd-eeee77777777', '4797cc91-aa9a-4017-97db-0b6b07336652', 'pending_review', 45, 'low', 15),
('aaaa8888-bbbb-cccc-dddd-eeee22222222', 'aaaa6666-bbbb-cccc-dddd-eeee33333333', 'aaaa2222-bbbb-cccc-dddd-eeee11111111', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'pending_review', 72, 'medium', 30),
('aaaa8888-bbbb-cccc-dddd-eeee33333333', 'aaaa6666-bbbb-cccc-dddd-eeee44444444', 'aaaa2222-bbbb-cccc-dddd-eeee22222222', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'pending_review', 88, 'high', 45)
ON CONFLICT (id) DO NOTHING;

-- HORMONE VISITS
INSERT INTO hormone_visits (id, patient_id, provider_id, visit_date, intake_symptoms, intake_goals, intake_focus, lab_tt, lab_ft, lab_e2, lab_tsh, lab_ft3, lab_ft4, lab_hgb, lab_hct, lab_psa, lab_shbg, approval_status, ai_recommendation) VALUES
('aaaa9999-bbbb-cccc-dddd-eeee11111111', 'aaaa2222-bbbb-cccc-dddd-eeee22222222', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', NOW()::date, ARRAY['fatigue','low_libido','brain_fog'], ARRAY['energy','muscle','libido'], ARRAY['testosterone'], 380, 8.2, 28, 2.1, 3.2, 1.1, 15.5, 45.2, 0.8, 42, 'pending', 'Suboptimal TT (380) and FT (8.2). Recommend TRT Cypionate 200mg/mL, 0.5mL IM weekly.'),
('aaaa9999-bbbb-cccc-dddd-eeee22222222', 'aaaa2222-bbbb-cccc-dddd-eeee55555555', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', (NOW() - INTERVAL '7 days')::date, ARRAY['hot_flashes','insomnia','mood_swings'], ARRAY['sleep','mood','bone_health'], ARRAY['estrogen','progesterone'], NULL, NULL, 18, 3.5, 2.8, 0.9, 13.2, 39.1, NULL, 35, 'pending', 'Perimenopausal with low E2. Recommend estradiol patch 0.05mg 2x/week plus progesterone 100mg nightly.')
ON CONFLICT (id) DO NOTHING;

-- PACKAGE PURCHASES
INSERT INTO patient_package_purchases (id, patient_id, package_id, provider_id, status, sessions_total, sessions_used, price_paid, purchased_at, expires_at) VALUES
('aabb1111-bbbb-cccc-dddd-eeee11111111', 'aaaa2222-bbbb-cccc-dddd-eeee11111111', 'aaaa3333-bbbb-cccc-dddd-eeee11111111', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'active', 4, 2, 1800, NOW() - INTERVAL '60 days', NOW() + INTERVAL '305 days'),
('aabb1111-bbbb-cccc-dddd-eeee22222222', 'aaaa2222-bbbb-cccc-dddd-eeee33333333', 'aaaa3333-bbbb-cccc-dddd-eeee22222222', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'active', 6, 1, 3000, NOW() - INTERVAL '30 days', NOW() + INTERVAL '335 days'),
('aabb1111-bbbb-cccc-dddd-eeee33333333', 'aaaa2222-bbbb-cccc-dddd-eeee44444444', 'aaaa3333-bbbb-cccc-dddd-eeee66666666', 'b1a2c3d4-e5f6-4789-abcd-aaa222222222', 'active', 12, 6, 4800, NOW() - INTERVAL '42 days', NOW() + INTERVAL '78 days'),
('aabb1111-bbbb-cccc-dddd-eeee44444444', 'aaaa2222-bbbb-cccc-dddd-eeee66666666', 'aaaa3333-bbbb-cccc-dddd-eeee33333333', 'b1a2c3d4-e5f6-4789-abcd-aaa222222222', 'active', 4, 1, 3200, NOW() - INTERVAL '170 days', NOW() + INTERVAL '10 days'),
('aabb1111-bbbb-cccc-dddd-eeee55555555', 'aaaa2222-bbbb-cccc-dddd-eeee77777777', 'aaaa3333-bbbb-cccc-dddd-eeee55555555', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'active', 12, 3, 2400, NOW() - INTERVAL '90 days', NOW() + INTERVAL '275 days')
ON CONFLICT (id) DO NOTHING;

-- INVOICES
INSERT INTO invoices (id, patient_id, appointment_id, status, subtotal, tax_amount, total, amount_paid, balance_due, due_date) VALUES
('aabb2222-bbbb-cccc-dddd-eeee11111111', 'aaaa2222-bbbb-cccc-dddd-eeee77777777', 'aaaa4444-bbbb-cccc-dddd-eeee77777777', 'paid', 250, 20.63, 270.63, 270.63, 0, NOW()::date),
('aabb2222-bbbb-cccc-dddd-eeee22222222', 'aaaa2222-bbbb-cccc-dddd-eeee66666666', NULL, 'sent', 900, 74.25, 974.25, 0, 974.25, NOW()::date + 30),
('aabb2222-bbbb-cccc-dddd-eeee33333333', 'aaaa2222-bbbb-cccc-dddd-eeee22222222', 'aaaa5555-bbbb-cccc-dddd-eeee22222222', 'overdue', 350, 28.88, 378.88, 0, 378.88, NOW()::date - 15)
ON CONFLICT (id) DO NOTHING;

INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, total, treatment_id) VALUES
('aabb4444-bbbb-cccc-dddd-eeee11111111', 'aabb2222-bbbb-cccc-dddd-eeee11111111', 'HydraFacial Signature', 1, 250, 250, '8c4911a6-89da-4af1-8908-e9f96e3dcce9'),
('aabb4444-bbbb-cccc-dddd-eeee22222222', 'aabb2222-bbbb-cccc-dddd-eeee22222222', 'CoolSculpting Abdomen', 1, 900, 900, '508c0e49-0c99-4bf9-9869-0cbd2bef7fb1'),
('aabb4444-bbbb-cccc-dddd-eeee33333333', 'aabb2222-bbbb-cccc-dddd-eeee33333333', 'TRT Initial Consultation', 1, 350, 350, 'f61bacb3-8759-4793-81fa-2414329980dd')
ON CONFLICT (id) DO NOTHING;

-- PROVIDER SKILLS
INSERT INTO provider_skills (id, provider_id, skill_name, modality, certification_level) VALUES
('aabb5555-bbbb-cccc-dddd-eeee11111111', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'Botox/Dysport', 'injectables', 'advanced'),
('aabb5555-bbbb-cccc-dddd-eeee22222222', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'Dermal Fillers', 'injectables', 'advanced'),
('aabb5555-bbbb-cccc-dddd-eeee33333333', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'Morpheus8 RF', 'laser', 'intermediate'),
('aabb5555-bbbb-cccc-dddd-eeee44444444', 'b1a2c3d4-e5f6-4789-abcd-aaa222222222', 'CoolSculpting', 'body_contouring', 'advanced'),
('aabb5555-bbbb-cccc-dddd-eeee55555555', 'b1a2c3d4-e5f6-4789-abcd-aaa222222222', 'PRP Therapy', 'regenerative', 'advanced'),
('aabb5555-bbbb-cccc-dddd-eeee66666666', 'b1a2c3d4-e5f6-4789-abcd-aaa222222222', 'Peptide Protocols', 'peptides', 'intermediate')
ON CONFLICT (id) DO NOTHING;

-- PROVIDER AVAILABILITY
INSERT INTO provider_availability (id, provider_id, day_of_week, start_time, end_time, break_start, break_end, is_active, room_preference_id) VALUES
('aabb6666-bbbb-cccc-dddd-eeee11111111', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 1, '08:00', '17:00', '12:00', '13:00', true, 'aaaa1111-bbbb-cccc-dddd-eeee11111111'),
('aabb6666-bbbb-cccc-dddd-eeee22222222', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 3, '08:00', '17:00', '12:00', '13:00', true, 'aaaa1111-bbbb-cccc-dddd-eeee11111111'),
('aabb6666-bbbb-cccc-dddd-eeee33333333', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 4, '09:00', '15:00', NULL, NULL, true, 'aaaa1111-bbbb-cccc-dddd-eeee11111111'),
('aabb6666-bbbb-cccc-dddd-eeee44444444', 'b1a2c3d4-e5f6-4789-abcd-aaa222222222', 1, '09:00', '18:00', '12:30', '13:30', true, 'aaaa1111-bbbb-cccc-dddd-eeee22222222'),
('aabb6666-bbbb-cccc-dddd-eeee55555555', 'b1a2c3d4-e5f6-4789-abcd-aaa222222222', 2, '09:00', '18:00', '12:30', '13:30', true, 'aaaa1111-bbbb-cccc-dddd-eeee22222222'),
('aabb6666-bbbb-cccc-dddd-eeee66666666', 'b1a2c3d4-e5f6-4789-abcd-aaa222222222', 4, '09:00', '18:00', '12:30', '13:30', true, 'aaaa1111-bbbb-cccc-dddd-eeee22222222')
ON CONFLICT (id) DO NOTHING;

-- MARKETPLACE BOOKINGS
INSERT INTO marketplace_bookings (id, patient_id, provider_id, treatment_id, status, ai_match_reasoning) VALUES
('aabb7777-bbbb-cccc-dddd-eeee11111111', 'aaaa2222-bbbb-cccc-dddd-eeee99999999', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', '10d79ae1-825e-47b7-ad2d-9ae1fb76a90e', 'pending', 'Matched for Morpheus8. Provider has intermediate RF certification.'),
('aabb7777-bbbb-cccc-dddd-eeee22222222', 'aaaa2222-bbbb-cccc-dddd-eeee88888888', 'b1a2c3d4-e5f6-4789-abcd-aaa222222222', 'e9394f43-2c8a-4d7c-be7d-314be80b3c57', 'pending', 'BPC-157 peptide therapy. Provider specializes in peptides.'),
('aabb7777-bbbb-cccc-dddd-eeee33333333', 'aaaa2222-bbbb-cccc-dddd-eeee44444444', 'b1a2c3d4-e5f6-4789-abcd-aaa222222222', 'baab9466-daf2-4ead-a788-6d56b5a82fd6', 'accepted', 'Weight loss patient matched for complementary care.')
ON CONFLICT (id) DO NOTHING;

-- PROVIDER EARNINGS
INSERT INTO provider_earnings (id, provider_id, patient_id, treatment_id, modality, gross_revenue, cogs, net_revenue, units_used, time_minutes, service_date) VALUES
('aabb8888-bbbb-cccc-dddd-eeee11111111', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'aaaa2222-bbbb-cccc-dddd-eeee11111111', '1472c7b7-7d8b-471d-9376-92f2ae80d850', 'injectables', 500, 120, 380, 32, 30, NOW() - INTERVAL '30 days'),
('aabb8888-bbbb-cccc-dddd-eeee22222222', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'aaaa2222-bbbb-cccc-dddd-eeee33333333', 'a2f96fac-400f-4af4-a085-962f45ec365a', 'laser', 550, 50, 500, 1, 45, NOW() - INTERVAL '14 days'),
('aabb8888-bbbb-cccc-dddd-eeee33333333', 'b1a2c3d4-e5f6-4789-abcd-aaa222222222', 'aaaa2222-bbbb-cccc-dddd-eeee44444444', 'baab9466-daf2-4ead-a788-6d56b5a82fd6', 'weight_loss', 500, 200, 300, 1, 30, NOW() - INTERVAL '7 days'),
('aabb8888-bbbb-cccc-dddd-eeee44444444', 'b1a2c3d4-e5f6-4789-abcd-aaa222222222', 'aaaa2222-bbbb-cccc-dddd-eeee66666666', '508c0e49-0c99-4bf9-9869-0cbd2bef7fb1', 'body_contouring', 900, 100, 800, 1, 60, NOW() - INTERVAL '3 days'),
('aabb8888-bbbb-cccc-dddd-eeee55555555', '4797cc91-aa9a-4017-97db-0b6b07336652', 'aaaa2222-bbbb-cccc-dddd-eeee77777777', '8c4911a6-89da-4af1-8908-e9f96e3dcce9', 'skin', 250, 30, 220, 1, 45, NOW())
ON CONFLICT (id) DO NOTHING;

-- LAB ORDERS & RESULTS
INSERT INTO lab_orders (id, patient_id, provider_id, encounter_id, order_date, status, tests_ordered, lab_name) VALUES
('aabb3333-bbbb-cccc-dddd-eeee11111111', 'aaaa2222-bbbb-cccc-dddd-eeee22222222', 'b1a2c3d4-e5f6-4789-abcd-aaa111111111', 'aaaa6666-bbbb-cccc-dddd-eeee44444444', (NOW() - INTERVAL '65 days')::date, 'resulted', ARRAY['CBC','CMP','Testosterone Panel','PSA'], 'Quest Diagnostics')
ON CONFLICT (id) DO NOTHING;

INSERT INTO lab_results (id, lab_order_id, patient_id, test_name, value, unit, reference_low, reference_high, is_abnormal, resulted_at) VALUES
('aabb9999-bbbb-cccc-dddd-eeee11111111', 'aabb3333-bbbb-cccc-dddd-eeee11111111', 'aaaa2222-bbbb-cccc-dddd-eeee22222222', 'Total Testosterone', 380, 'ng/dL', 300, 1000, false, NOW() - INTERVAL '63 days'),
('aabb9999-bbbb-cccc-dddd-eeee22222222', 'aabb3333-bbbb-cccc-dddd-eeee11111111', 'aaaa2222-bbbb-cccc-dddd-eeee22222222', 'Free Testosterone', 8.2, 'pg/mL', 9, 30, true, NOW() - INTERVAL '63 days'),
('aabb9999-bbbb-cccc-dddd-eeee33333333', 'aabb3333-bbbb-cccc-dddd-eeee11111111', 'aaaa2222-bbbb-cccc-dddd-eeee22222222', 'PSA', 0.8, 'ng/mL', 0, 4, false, NOW() - INTERVAL '63 days'),
('aabb9999-bbbb-cccc-dddd-eeee44444444', 'aabb3333-bbbb-cccc-dddd-eeee11111111', 'aaaa2222-bbbb-cccc-dddd-eeee22222222', 'Hemoglobin', 15.5, 'g/dL', 13.5, 17.5, false, NOW() - INTERVAL '63 days'),
('aabb9999-bbbb-cccc-dddd-eeee55555555', 'aabb3333-bbbb-cccc-dddd-eeee11111111', 'aaaa2222-bbbb-cccc-dddd-eeee22222222', 'Hematocrit', 45.2, '%', 38.3, 48.6, false, NOW() - INTERVAL '63 days')
ON CONFLICT (id) DO NOTHING;

-- OVERSIGHT CONFIG
INSERT INTO oversight_config (config_key, config_value, description) VALUES
('sampling_rates', '{"low":0.1,"medium":0.5,"high":1.0,"critical":1.0}'::jsonb, 'Chart sampling rates per risk tier'),
('rubber_stamp_thresholds', '{"low":15,"medium":30,"high":45,"critical":60}'::jsonb, 'Min review seconds per risk tier'),
('coaching_thresholds', '{"monitoring":0.15,"probation":0.25}'::jsonb, 'Correction rate thresholds'),
('mandatory_review_chart_count', '30'::jsonb, 'Charts before sampling kicks in')
ON CONFLICT (config_key) DO NOTHING;

-- INTAKE FORM
INSERT INTO intake_forms (id, patient_id, form_type, responses, submitted_at) VALUES
('aabbbbbb-bbbb-cccc-dddd-eeee11111111', 'aaaa2222-bbbb-cccc-dddd-eeee22222222', 'hormone_intake', '{"chief_complaint":"Low energy and libido","duration":"6 months","prior_therapy":"None","supplements":["Vitamin D","Zinc"]}'::jsonb, NOW() - INTERVAL '60 days')
ON CONFLICT (id) DO NOTHING;
