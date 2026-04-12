

# Telehealth Video Visit & Prescribing Workflow — UX/UI Plan

## Current State

The system has strong building blocks but no end-to-end telehealth workflow:

- **RemoteIntake** (patient-facing, public) collects demographics, symptoms, labs, consents — submits to DB
- **prescriptions table** exists in DB (medication_name, dosage, route, pharmacy, refills) but has zero UI
- **appointments table** has no `visit_type` field to distinguish telehealth from in-person
- **encounters table** has `encounter_type` (free text) but no telehealth flag
- **PatientPortal** shows appointments/packages/records but no video join capability
- **No video call UI** exists anywhere
- **No prescribing page** exists — providers cannot write, review, or manage prescriptions

## Proposed Workflow

```text
PATIENT FLOW                          PROVIDER FLOW
───────────                          ──────────────
1. /intake — fill remote form         
   (demographics, symptoms,          
    labs, consents, signature)        
        ↓                            
2. Submission creates patient +       Front Desk books telehealth apt
   hormone_visit + e_consents         (visit_type = "telehealth")
        ↓                            
3. /portal — patient logs in,         Provider sees apt in queue
   sees "Join Video" button           with "Intake Ready" badge
   in waiting room                            ↓
        ↓                            4. Provider opens Telehealth
4. Video call connects                   Workspace:
   (embedded or external link)           ├─ Left: Intake summary + labs
        ↓                               ├─ Center: Video call
5. Patient stays on call                 └─ Right: Prescribe + chart
        ↓                                       ↓
6. Call ends → patient sees           5. Provider writes Rx from
   aftercare + next steps                AI-suggested protocol
                                             ↓
                                     6. Signs encounter → Rx saved
                                        → aftercare sent
```

## Implementation — 3 Batches

### Batch 1: Schema + Telehealth Appointment Type + Prescribing UI
**Database changes:**
- Add `visit_type text DEFAULT 'in_person'` to `appointments` (values: `in_person`, `telehealth`, `phone`)
- Add `video_room_url text` to `appointments` for external video link storage
- Add `intake_form_id uuid REFERENCES intake_forms(id)` to `appointments` to link intake to appointment

**New page: `TelehealthRx.tsx`** — Prescribing workspace (reusable for both telehealth and in-person)
- Patient medication list from `prescriptions` table
- New Rx form: medication search (against `medications` catalog), dosage, frequency, route, quantity, refills, pharmacy, notes
- AI dosing suggestion button (reuse `ai-hormone-rec` data or new `ai-prescribe-check` mode in existing edge function)
- Drug interaction check against patient's active medications
- E-prescribe action (saves to `prescriptions` table, links to encounter)
- Prescription history view per patient

**Update `Appointments.tsx` booking dialog:**
- Add visit type selector (In-Person / Telehealth / Phone)
- When telehealth selected, auto-generate or accept video room URL
- Show telehealth badge on appointment cards

### Batch 2: Provider Telehealth Workspace + Patient Video Join
**New page: `TelehealthVisit.tsx`** — 3-panel provider workspace for telehealth encounters
- **Left panel**: Auto-loaded intake summary (from `intake_forms` + `hormone_visits` linked to this appointment). Shows demographics, symptoms, goals, lab values, contraindications, consent status. AI Patient Brief auto-loads.
- **Center panel**: Video embed area. For MVP, this renders an iframe or external link launcher (Daily.co, Twilio Video, or Zoom link). Includes call controls (mute, camera, end call), call timer, and a "Start Call" button that transitions the appointment to `in_progress`.
- **Right panel**: Tabbed interface:
  - **Chart tab**: Slimmed EncounterChart (SOAP fields only, no template picker overhead)
  - **Prescribe tab**: Embedded `TelehealthRx` component — write Rx during call
  - **Orders tab**: Lab orders, follow-up scheduling

**Update `PatientPortal.tsx`:**
- Add "Telehealth" tab alongside Appointments/Packages/Records
- Show upcoming telehealth appointments with "Join Video" button (active 15 min before scheduled time)
- Waiting room state: "Your provider will connect shortly" with animated indicator
- Post-call: show aftercare instructions, prescription summary, next appointment

**Update `ProviderDay.tsx`:**
- Telehealth appointments get a distinct icon (Video camera) and "Join Telehealth" action button
- Badge showing "Intake Complete" when linked intake form is submitted

### Batch 3: AI Integration + Workflow Automation
**Extend `ai-checkout-review` edge function** with `telehealth_summary` mode:
- Auto-generate visit summary from SOAP + prescriptions written during call
- Suggest follow-up timing based on medication protocol

**Extend `ai-hormone-rec` edge function** with `prescribe_check` mode:
- Given patient labs + symptoms + selected medication, validate dosing against protocols
- Flag contraindications, suggest monitoring labs
- Recommend titration schedule

**New component: `IntakeReviewPanel.tsx`** — shared component used by:
- TelehealthVisit (left panel)
- EncounterChart (sidebar, when intake form linked)
- Shows structured intake data with AI-highlighted risk flags

**Workflow automation:**
- When patient submits RemoteIntake, auto-create a "pending telehealth" task in front desk queue
- Front desk books telehealth apt → links intake form → patient gets portal notification with video join link
- On encounter sign, auto-trigger aftercare message with Rx summary to patient

## Technical Details

**Video integration approach:** External link model (not embedded video). Provider and patient each click a link to join a third-party video room (Daily.co, Doxy.me, or Zoom). The `video_room_url` field on the appointment stores this link. This avoids WebRTC complexity while delivering the full workflow. Can upgrade to embedded video later.

**Code reuse:**
- `TelehealthRx` prescribing component is used standalone AND embedded in TelehealthVisit
- `IntakeReviewPanel` is used in TelehealthVisit AND EncounterChart sidebar
- Existing edge functions extended with new modes (no new functions needed)
- PatientPortal auth/linking already built — just adding a tab

**New routes:**
- `/telehealth/:appointmentId` — provider telehealth workspace
- PatientPortal gets internal tab (no new route needed)

