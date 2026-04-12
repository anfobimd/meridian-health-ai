

# Front Desk UX Redesign — Updated Plan (2 Modifications + 3 Batches)

## Changes from Original Plan

### 1. Read-Only Chart Access for Front Desk
Front desk staff **can** view encounter charts but **cannot** edit clinical fields (SOAP, vitals, treatment data). Implementation:
- Add `front_desk` to the `CLINICAL` sidebar section's roles (currently `admin, provider` only)
- In `EncounterChart.tsx`, detect `front_desk` role and render all clinical fields as **read-only** (disabled inputs, hidden Save/Sign buttons)
- Keep existing addendum section visible but restricted to admin notes only

### 2. Admin Notes on Encounters
A new feature allowing front desk (and admin) to attach **administrative notes** to patient encounters — recording phone calls, scheduling discussions, patient requests, billing conversations, etc.

**New table: `encounter_admin_notes`**
```sql
CREATE TABLE encounter_admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid REFERENCES encounters(id) ON DELETE CASCADE NOT NULL,
  patient_id uuid REFERENCES patients(id) NOT NULL,
  author_id uuid REFERENCES auth.users(id) NOT NULL,
  note_type text NOT NULL DEFAULT 'general', -- general, phone_call, billing, scheduling, patient_request
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE encounter_admin_notes ENABLE ROW LEVEL SECURITY;
-- Staff can read/write
CREATE POLICY "Staff can manage admin notes" ON encounter_admin_notes
  FOR ALL TO authenticated USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
```

**New component: `AdminNotesPanel.tsx`** — displayed on encounter chart for front_desk/admin roles with:
- Note type selector (Phone Call, Scheduling, Billing, Patient Request, General)
- Text area + submit
- Chronological list of existing admin notes with author and timestamp

---

## 3-Batch Implementation (unchanged structure, updated scope)

### Batch 1: Sidebar + FrontDesk Layout + Chart Access
- Filter sidebar to show COMMAND/SCHEDULE/PATIENTS/CLINICAL/ME for `front_desk` (add `front_desk` to CLINICAL roles)
- Build `ActionBar.tsx` — auto-loading AI alerts via `ai-clinic-briefing` `front_desk_actions` mode
- Build `QuickDock.tsx` — sticky bottom bar with Walk-In, Book, Quote, Package, Register
- Enhance `QueueCard.tsx` with AI badges (no-show risk, package credits, consent status)
- Make `EncounterChart.tsx` read-only for `front_desk` role
- Create `encounter_admin_notes` table + `AdminNotesPanel.tsx` component
- Extend `ai-clinic-briefing` edge function with `front_desk_actions` mode

### Batch 2: Check-In/Check-Out AI Maximization
- CheckInPanel: clearance checks, package credit detection, AI Patient Brief auto-load
- CheckoutPanel: payment flow, package credit application, follow-up booking, aftercare trigger
- Walk-in: AI provider recommendation via `ai-schedule-optimizer`
- PaymentPanel + FollowUpBooker components

### Batch 3: Communication + Packages/Pricing
- PatientInbox: patient context sidebar
- PricingQuoteTool: AI package alternative suggestions
- PackageSalePanel: AI recommendation from procedure history
- MembershipEnrollPanel: AI tier recommendation

### Edge Function Changes
| Function | Change |
|----------|--------|
| `ai-clinic-briefing` | Add `front_desk_actions` mode |
| All others | Reuse existing — no new functions needed |

