

# Meridian EHR — Full Integration Strategy

## What We Have vs. What's Missing

### Currently Built (8 tables, basic CRUD UI)
- patients, providers, appointments, treatments, clinical_notes, intake_forms, audit_logs, user_roles, hormone_visits
- Basic pages: Dashboard, Patients, Patient Record, Appointments, Treatments, Clinical Notes, Providers, Hormone Labs

### Missing from Source Archives — Organized by Priority

---

## Build Order (10 Phases)

### Phase 1: Enriched Schema Migration (~25 new tables from Meridian schema)
Port the full Meridian PostgreSQL schema that's not yet in place:

**Patient sub-tables:** `patient_allergies`, `patient_medications`, `patient_medical_history`, `patient_insurance`, `patient_contacts`

**Encounters & Charting:** `encounters`, `encounter_notes`, `chart_templates`, `chart_template_sections`, `chart_template_fields`, `encounter_field_responses`, `chart_template_orders`

**Protocols:** `protocol_templates`, `protocol_enrollments` (GLP-1, TRT, HRT tracking from Meridian schema — replaces the simpler "hormone_protocols" from the original plan)

**Treatment Catalog:** `treatment_categories` (parent categories with vertical tagging)

**Revenue Cycle:** `quotes`, `quote_items`, `invoices`, `invoice_items`, `payments`, `insurance_claims` (full billing from Meridian schema)

**Scheduling:** `provider_availability`, `provider_availability_overrides`, `appointment_waitlist`

**Lab System:** `lab_orders`, `lab_results`, `prescriptions`

### Phase 2: AI SOAP Note Generation (Edge Function)
Port the HCDSS `routes/ai.js` logic, replacing Anthropic with Lovable AI Gateway:
- **Edge function `ai-soap-note`**: Takes appointment context (patient history, treatment, provider, prior notes) and generates structured SOAP note
- **Edge function `ai-extract-labs`**: Takes base64 image/PDF of lab results, extracts 21 lab values into structured JSON (ported from HCDSS extract-labs route)
- "Generate SOAP Note" button on completed appointments
- Provider review/edit/sign-off workflow (draft → review → signed)

### Phase 3: Charting Template Engine
Port the full Meridian charting system (`routes/charting.js`):
- Template CRUD: create/edit reusable chart templates with sections and fields
- Chief-complaint keyword auto-suggest (type "botox" → suggests Botox template)
- Field types: text, measurement, scale, select, checkbox, computed
- Sign cascade: encounter → note → orders generated
- **AI-assisted field population**: after template selection, AI pre-fills fields from patient history
- Seed 5 system templates: Weight Loss, HRT, Medspa Botox, HydraFacial, IV Therapy

### Phase 4: Scheduling Engine
Port Meridian `routes/scheduling.js` + marketplace `slotEngine.js`:
- Provider availability rules (weekly schedule with breaks per day-of-week)
- Override system (time-off, modified hours)
- Slot generation algorithm: intersect availability rules, overrides, and existing appointments → return bookable slots
- Next-available finder: scan ahead up to 60 days
- Waitlist management
- Calendar UI: day/week view with provider columns, drag-to-book

### Phase 5: Package Tracker (from PACKAGE_TRACKER_PLAN.md)
6 new tables: `service_packages`, `service_package_items`, `patient_package_purchases`, `patient_package_sessions`, `package_notification_rules`, `package_notification_log`

- Triggers: `sync_package_session_count()` auto-updates sessions_used and deferred revenue on redemption
- `expire_stale_packages()` function for cron
- Admin UI: package template CRUD, purchase management, session redemption
- Patient Record "Packages" tab with progress bars (6/10 sessions used)
- Deferred revenue tracking (GAAP accrual)

### Phase 6: AI Notification System
Port HCDSS `config/notifications.js` + Package Tracker notification cadence:
- Edge function `ai-notifications`: generates personalized copy per patient using Lovable AI
- 16 seeded notification rules (purchase confirmation, milestone celebrations, expiry warnings, win-back)
- Notification job (edge function on cron): evaluates all active purchases against rules, sends via configured channel
- Notification log and admin preview

### Phase 7: AI Risk Scoring & Dashboard Intelligence
- Edge function `ai-risk-scoring`: analyzes patient engagement patterns (missed appointments, lapsed protocols, overdue labs, package abandonment)
- Dashboard "At-Risk Patients" widget with risk score, reason, and suggested action
- AI-generated weekly narrative summary
- Package abandonment risk scoring from PACKAGE_TRACKER_PLAN Section 6.3
- Dashboard insights narrative (cached, daily refresh)

### Phase 8: Revenue Cycle & Financial
Port the invoicing/payment system from Meridian schema:
- Quote generation (AI-assisted treatment recommendations with pricing)
- Invoice creation from appointments/quotes
- Payment recording (multiple payment methods)
- Package revenue: deferred vs. recognized tracking
- Revenue dashboard with monthly charts

### Phase 9: Patient Photos & Before/After
Port Meridian photo schema:
- Supabase Storage bucket for patient photos
- Photo upload with clinical metadata (category, treatment area, view angle)
- Before/after pairing and photo series
- Consent tracking
- Photo gallery in patient record

### Phase 10: Authentication & Multi-Clinic
- Auth with login/signup (email + Google OAuth)
- Role-based access: admin, provider, front_desk
- Tighten RLS policies from anon → authenticated
- Multi-clinic support from Meridian schema (clinics, clinic_staff, clinic_id isolation)

---

## AI Integration Points Summary

Every AI feature uses **Lovable AI Gateway** (Gemini 3 Flash) via edge functions:

| Feature | Edge Function | Source Logic |
|---|---|---|
| SOAP Note Generation | `ai-soap-note` | HCDSS `routes/ai.js` → `/ai/recommend` |
| Lab Value Extraction | `ai-extract-labs` | HCDSS `routes/ai.js` → `/ai/extract-labs` |
| Chart Field Pre-fill | `ai-chart-assist` | Meridian charting template + patient context |
| Hormone Recommendation | `ai-hormone-rec` | HCDSS system prompt + lab values |
| Package Notifications | `ai-notifications` | Package Tracker Plan Section 6.1 |
| Risk Scoring | `ai-risk-scoring` | Meridian churn logic + Package Plan Section 6.3 |
| Dashboard Narrative | `ai-insights` | Package Plan Section 6.4 |
| Package Recommendation | `ai-package-rec` | Package Plan Section 6.2 |
| Smart Scheduling | `ai-scheduling` | Next-appointment suggestion from protocol data |

---

## Implementation Approach

Each phase will be implemented as a self-contained increment:
1. Database migration (new tables/triggers)
2. Edge function(s) for AI features
3. React UI pages and components
4. Wire up to existing navigation and patient record tabs

The Dr. Z's Collective project summary provides pricing benchmarks and business model context that will be used to seed treatment catalog pricing and inform package template defaults.

