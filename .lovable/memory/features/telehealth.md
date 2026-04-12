---
name: Telehealth Video Visit & Prescribing System
description: 3-batch telehealth video visit + prescribing system + intake invitation tracking — All complete
type: feature
---

## Status: All 3 Batches + Intake Invitations Complete ✅

### Batch 1
- DB: `visit_type`, `video_room_url`, `intake_form_id` on appointments
- `Prescriptions.tsx` with `TelehealthRx` component (embedded + standalone)
- AI dosing checks via `ai-hormone-rec`, interaction checks via `ai-catalog-advisor`
- Booking dialog with visit type selector + video URL field

### Batch 2
- `TelehealthVisit.tsx` — 3-panel resizable workspace at `/telehealth/:appointmentId`
  - Left: `IntakeReviewPanel` with AI brief, allergies, intake form, labs, consents
  - Center: `VideoPanel` with call timer, mute/camera controls, external video link
  - Right: Tabbed Chart (SOAP) + Prescribe (`TelehealthRx` embedded)
- Auto-encounter creation, Sign & Close with auto-aftercare
- `PatientPortal.tsx` — Telehealth tab with waiting room, Join Video (15min window)
- `ProviderDay.tsx` — Video/Phone/Intake✓ badges, Join Telehealth button, wired aftercare

### Batch 3
- `ai-hormone-rec` extended with `prescribe_check` mode — validates dosing, contraindications, titration, monitoring labs
- `ai-checkout-review` extended with `telehealth_summary` mode — generates visit summary, follow-up recommendation, patient instructions
- `ai-aftercare-message` updated with `auto_send` mode — logs to `patient_communication_log` automatically
- `submit-remote-intake` auto-creates front desk notification in `patient_communication_log` for telehealth booking
- Sign & Close now runs aftercare + telehealth summary in parallel, shows follow-up toast

### Intake Invitations (Send Link Feature)
- `intake_invitations` table with token, status tracking (sent→opened→completed), realtime enabled
- `send-intake-invite` edge function — generates token, builds URL, sends SMS via Twilio gateway, logs to comm timeline
- `submit-remote-intake` updated — accepts `invitation_token` + `existing_patient_id` to skip patient creation and mark invitation completed
- `SendIntakeLinkDialog` — focus area picker, SMS/Copy Link channel, shows generated URL
- `InvitationTracker` — realtime status panel on FrontDesk showing recent invitations
- `RemoteIntake.tsx` — reads `token`, `ref`, `focus` query params; pre-fills demographics from patient record
- "Send Intake Link" button on QuickDock (FrontDesk) with patient picker + PatientRecord header
