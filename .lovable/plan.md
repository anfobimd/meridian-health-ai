

# Telehealth Visit Flow — End-to-End Review

## Current Flow Summary

The system implements a complete 6-stage telehealth workflow. Here is the current state of each stage, with identified gaps and recommended fixes.

---

## Stage 1: Patient Receives Intake Link
**Status: Working**

- Staff opens `SendIntakeLinkDialog` from QuickDock (FrontDesk) or PatientRecord header
- Selects focus areas, enters phone, sends via SMS or copies link manually
- `send-intake-invite` edge function generates a token, inserts into `intake_invitations`, sends SMS via Twilio
- `InvitationTracker` on FrontDesk shows realtime status (Sent → Opened → Completed)

**Gap found:** RemoteIntake tries to mark the invitation as "opened" by calling `submit-remote-intake` with `{ _markOpened: true }`, but that edge function has no handler for `_markOpened` — it immediately fails validation ("Name and email are required"). The opened status is never recorded.

**Fix:** Add a `_markOpened` early-return branch in `submit-remote-intake` that updates `intake_invitations` status to `opened` and returns immediately.

---

## Stage 2: Patient Fills Out Intake Form
**Status: Working with minor issues**

- RemoteIntake reads `token`, `ref`, `focus` query params
- Pre-fills demographics from `intake_invitations` join to `patients` table
- 6-step wizard: Welcome → Demographics → Focus/Symptoms → Labs (with AI OCR upload) → History/Contraindications → Goals/Consent/Signature
- On submit, calls `submit-remote-intake` with `invitation_token` + `existing_patient_id`
- Edge function updates the invitation to `completed`, links intake_form_id, skips duplicate patient creation

**Gap found:** The RLS policy "Public can read invitation by token" uses `qual: true` — it allows anonymous SELECT on all rows. This should be scoped to only allow reading by token match, or the query itself limits exposure. Acceptable for now since the query filters by token, but a tighter policy like `token = current_setting('request.headers')::json->>'x-invitation-token'` would be better. Low priority.

---

## Stage 3: Front Desk Books Telehealth Appointment
**Status: Working**

- Appointments booking dialog has visit type selector (In-Person / Telehealth / Phone)
- When telehealth selected, video URL field appears
- Appointment saved with `visit_type`, `video_room_url`, and optionally `intake_form_id`
- Appointment cards show Video/Phone badges

**Gap found:** There is no automated linking between the completed intake invitation and the booking. Front desk must manually note the intake_form_id when booking. The `intake_form_id` field on appointments exists but must be populated by hand.

**Fix:** When front desk books a telehealth appointment for a patient, auto-query for the most recent completed intake form for that patient and pre-fill `intake_form_id`. This is a small UX improvement.

---

## Stage 4: Provider Opens Telehealth Workspace
**Status: Working**

- Provider navigates to `/telehealth/:appointmentId` (from ProviderDay "Join Telehealth" button)
- 3-panel resizable layout loads:
  - **Left:** IntakeReviewPanel — AI patient brief, allergies, intake form responses, lab values, consents
  - **Center:** VideoPanel — Start Call button, timer, mute/camera controls, external video link launcher
  - **Right:** Tabbed Chart (SOAP with per-section AI generation) + Prescribe (TelehealthRx embedded)
- Auto-creates encounter on load with `encounter_type: "telehealth"`

**No gaps.** This stage is solid.

---

## Stage 5: Patient Joins Video Call
**Status: Working with limitation**

- PatientPortal Telehealth tab shows upcoming telehealth appointments
- "Join Video" button activates 15 minutes before scheduled time
- Waiting room with animated pulse indicator when within join window
- Opens `video_room_url` in new tab

**Known limitation (by design):** Video is external link-based (Daily.co/Zoom/Doxy.me). No embedded video. This is documented and intentional.

**Minor gap:** If `video_room_url` is null, the Join Video button is disabled with no clear message. The "Your provider will connect shortly" message only appears when `canJoin` is true AND `video_room_url` is falsy — slightly confusing.

---

## Stage 6: Sign & Close with Aftercare
**Status: Working**

- After provider ends call, "Sign & Close" button appears in top bar
- Signs encounter (`status: signed`, `signed_at`)
- Marks appointment completed
- Runs in parallel:
  - `ai-aftercare-message` with `auto_send: true` — generates aftercare and logs to `patient_communication_log`
  - `ai-checkout-review` with `telehealth_summary` mode — generates visit summary, follow-up recommendation
- Shows follow-up toast, navigates to provider-day

**No gaps.** This stage is complete.

---

## Recommended Fixes (Priority Order)

1. **Fix `_markOpened` handler in `submit-remote-intake`** — Add early-return branch so invitation status updates to "opened" when patient loads the form. Currently this silently fails. Small code change (5 lines).

2. **Auto-link intake form when booking telehealth** — In the Appointments booking dialog, when a patient is selected and visit_type is telehealth, auto-query for their most recent completed intake form and pre-fill `intake_form_id`. Small UX improvement.

3. **Improve "no video URL" messaging in PatientPortal** — Show a clearer message when the appointment has no video link yet (e.g., "Video link will be available shortly before your appointment").

All three fixes are small and can be done in a single batch. No database changes needed.

