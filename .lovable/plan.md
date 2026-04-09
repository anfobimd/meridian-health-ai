

# Meridian EHR — AI-Native Electronic Health Record

## Vision
A medspa EHR where AI handles the busywork — auto-generating clinical notes, pre-filling intake forms, scoring patient risk, and sending personalized communications — so staff focus on patient care, not paperwork.

---

## Phase 1: EHR Foundation (Core Data & UI)

### Database Schema (Lovable Cloud / Supabase)
- **patients** — demographics, contact info, insurance, preferences
- **providers** — staff profiles, specialties, credentials, schedules
- **appointments** — scheduling with status lifecycle (booked → checked-in → in-progress → completed → no-show)
- **treatments** — service catalog (laser, injectables, facials, hormone therapy, etc.)
- **clinical_notes** — SOAP notes linked to appointments (subjective, objective, assessment, plan)
- **intake_forms** — patient intake responses (medical history, allergies, medications, consent)
- **audit_logs** — HIPAA-compliant access tracking on all patient data
- **user_roles** — role-based access (admin, provider, front-desk)

### UI Pages
- **Dashboard** — Today's appointments, pending tasks, AI alerts
- **Patient Directory** — Searchable patient list with quick-view cards
- **Patient Record** — Tabbed view: Demographics | Appointments | Clinical Notes | Intake | Hormone Protocols
- **Appointment Calendar** — Day/week view with drag scheduling
- **Provider Directory** — Staff management

---

## Phase 2: Hormone & Peptide Protocol Tracking

### Database Additions
- **hormone_protocols** — prescribed treatment plans (compound, dose, frequency, route, cycle length)
- **protocol_entries** — individual dose/injection records per visit
- **protocol_templates** — reusable protocol blueprints (e.g., "TRT Standard", "BPC-157 Healing")

### UI
- **Protocol tab** on patient record — active protocols with visual timeline
- **Protocol builder** — Admin creates templates; providers assign to patients with customization
- **Dosage log** — Track each administration with provider, date, lot number, site

---

## Phase 3: AI Automation Layer

All AI powered by **Lovable AI Gateway** (via edge functions).

### 3a. Clinical Note Generation
- After appointment completion, AI generates a draft SOAP note from:
  - Treatment performed, provider, patient history, prior notes
  - Provider reviews, edits, and signs off
- One-click "Generate Note" button on appointment view

### 3b. Smart Intake & Scheduling
- AI pre-fills follow-up intake forms based on patient history
- AI suggests optimal next appointment timing based on treatment type and protocol schedule
- Auto-generate patient-facing appointment prep instructions

### 3c. Risk Scoring & Insights
- AI analyzes patient engagement patterns (missed appointments, lapsed protocols, overdue labs)
- Dashboard widget: "At-Risk Patients" with risk score, reason, and suggested action
- Weekly AI-generated narrative summary for admin: "3 hormone patients overdue for follow-up, 2 patients haven't completed their protocol..."

### 3d. Smart Patient Notifications (edge function + cron)
- AI-personalized appointment reminders, follow-up nudges, protocol adherence messages
- Configurable notification rules (similar to the package tracker design)
- Each message generated with patient context — not generic templates

---

## Phase 4: Package Tracker Integration (future)
- Bring in the full package tracker (service bundles, session redemption, deferred revenue) per your planning documents
- Embedded within the EHR patient record as a "Packages" tab
- AI-powered package recommendations and abandonment risk scoring

---

## Key Design Decisions
- **Auth**: Lovable Cloud built-in auth with role-based access (admin, provider, front-desk)
- **HIPAA**: Audit logging on all patient data access, RLS policies restricting data by role
- **AI Model**: Lovable AI Gateway (Gemini 3 Flash) for all AI features
- **UX**: Clean, professional medical UI — card-based layouts, muted color palette

