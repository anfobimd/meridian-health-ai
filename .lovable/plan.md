

# Send Intake Link with Full Tracking — Implementation Plan

## Overview
Build a tracked invitation system: staff sends an SMS/email link to a patient, the intake form pre-fills from query params, and submissions auto-link to the existing patient record. A new `intake_invitations` table tracks sent → opened → completed status.

## Database Migration

**New table: `intake_invitations`**
- `id` uuid PK
- `patient_id` uuid REFERENCES patients(id) — existing or null for new patients
- `token` text UNIQUE NOT NULL — short unique token for URL
- `focus_areas` text[] — pre-selected focus (e.g. `['hormone_male']`)
- `channel` text — 'sms', 'email', 'manual'
- `sent_at` timestamptz DEFAULT now()
- `sent_by` uuid REFERENCES auth.users(id) — staff who sent it
- `opened_at` timestamptz — set when patient opens the link
- `completed_at` timestamptz — set when intake submitted
- `intake_form_id` uuid REFERENCES intake_forms(id) — linked after submission
- `status` text DEFAULT 'sent' — sent, opened, completed, expired
- `expires_at` timestamptz — optional expiry
- `phone` text, `email` text — delivery address used

RLS: staff roles (admin, provider, front_desk) can SELECT/INSERT/UPDATE.

Enable realtime so front desk sees status changes live.

## Edge Function: `send-intake-invite`

New edge function that:
1. Accepts `{ patient_id, channel, focus_areas, phone?, email? }`
2. Generates a short token (nanoid or crypto.randomUUID)
3. Inserts row into `intake_invitations`
4. Builds URL: `https://meridian-ai-care.lovable.app/intake?token=<TOKEN>&focus=<FOCUS>`
5. If channel=sms: calls existing `send-sms` logic (Twilio gateway) with a templated message
6. If channel=email: logs to `patient_communication_log` (email sending can be added later)
7. Returns `{ success, token, url }`

## Frontend Changes

### 1. RemoteIntake.tsx — Query Param Pre-fill
- Read `token`, `focus`, `ref` (patient_id) from `searchParams`
- If `token` present: call `supabase.from('intake_invitations').update({ opened_at, status: 'opened' }).eq('token', token)` on mount
- If `ref` present: fetch patient demographics and pre-fill firstName, lastName, email, phone, dob, sex
- If `focus` present: pre-select matching focus areas
- On submission: pass `invitation_token` to `submit-remote-intake`

### 2. submit-remote-intake Edge Function Update
- Accept optional `invitation_token` field
- If provided: update `intake_invitations` set `completed_at`, `status = 'completed'`, `intake_form_id`
- If `ref` patient_id provided: skip creating a new patient — use existing patient_id instead

### 3. SendIntakeLinkDialog Component
Reusable dialog with:
- Patient name + phone pre-filled from patient record
- Focus area multi-select (hormone_male, hormone_female, peptides, etc.)
- Channel toggle: SMS / Copy Link
- Send button → invokes `send-intake-invite`
- Shows generated link for manual copy

### 4. FrontDesk.tsx — "Send Intake Link" Button
- Add to the QuickDock or ActionBar
- Opens SendIntakeLinkDialog with optional patient selector

### 5. PatientRecord.tsx — "Send Intake Link" Button
- Add button in patient header area
- Opens SendIntakeLinkDialog pre-filled with that patient's data

### 6. Invitation Tracking Panel (FrontDesk)
- Small card/section showing recent invitations with status badges (Sent → Opened → Completed)
- Real-time updates via Supabase realtime subscription

## Files to Create/Modify

| File | Action |
|------|--------|
| Migration SQL | Create `intake_invitations` table + RLS + realtime |
| `supabase/functions/send-intake-invite/index.ts` | New edge function |
| `supabase/functions/submit-remote-intake/index.ts` | Add invitation_token + existing patient linking |
| `src/components/front-desk/SendIntakeLinkDialog.tsx` | New component |
| `src/components/front-desk/InvitationTracker.tsx` | New component — status tracker |
| `src/pages/RemoteIntake.tsx` | Read query params, mark opened, pre-fill |
| `src/pages/FrontDesk.tsx` | Add send link button + invitation tracker |
| `src/pages/PatientRecord.tsx` | Add send link button |

## Technical Notes
- Twilio connector already wired (`send-sms` function works via gateway)
- `send-intake-invite` will reuse the same Twilio gateway pattern
- Token-based URL avoids exposing patient UUIDs in links
- The existing `submit-remote-intake` already creates patients — we add a branch to skip creation when `ref` patient exists

