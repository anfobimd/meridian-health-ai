---
name: Telehealth Video Visit & Prescribing System
description: 3-batch telehealth video visit + prescribing system — Batches 1 & 2 complete
type: feature
---

## Status: Batch 1 ✅ + Batch 2 ✅ — Batch 3 remaining

### Batch 1 (Complete)
- DB: `visit_type`, `video_room_url`, `intake_form_id` added to appointments
- `Prescriptions.tsx` with `TelehealthRx` component (embedded + standalone)
- AI dosing checks via `ai-hormone-rec`, interaction checks via `ai-catalog-advisor`
- Booking dialog updated with visit type selector + video URL field

### Batch 2 (Complete)
- `TelehealthVisit.tsx` — 3-panel resizable workspace (`/telehealth/:appointmentId`)
  - Left: `IntakeReviewPanel` with AI brief, allergies, intake form, labs, consents
  - Center: `VideoPanel` with call timer, mute/camera controls, external video link
  - Right: Tabbed Chart (SOAP quick chart) + Prescribe (`TelehealthRx` embedded)
- Auto-encounter creation on telehealth visit open
- Sign & Close flow with auto-aftercare sending via `ai-aftercare-message`
- `PatientPortal.tsx` — new Telehealth tab with waiting room, Join Video (15min window)
- `ProviderDay.tsx` — Video/Phone badges, Intake✓ badge, Join Telehealth button, wired aftercare

### Batch 3 (Remaining)
- Extend `ai-checkout-review` with `telehealth_summary` mode
- Extend `ai-hormone-rec` with `prescribe_check` mode (already wired in UI)
- Auto-create front desk task when patient submits RemoteIntake
- Auto-link intake form to appointment on booking
