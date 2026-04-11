

# Provider User Stories: Memory Save + Implementation Workflow

## Step 1: Save Audit to Project Memory

Write the gap analysis (28 stories, 6 epics — 6 built, 10 partial, 12 missing) to `mem://features/provider-stories-audit` and update `mem://index.md` with a reference.

## Step 2: Implementation Workflow (4 Batches)

### Batch A — Clinical Must-Haves (Legal/HIPAA)
Priority: highest. These are compliance requirements.

1. **Vitals table + UI** (US-012)
   - Migration: `vitals` table (patient_id, encounter_id, bp, hr, temp, weight, height, o2sat, recorded_by, recorded_at)
   - Staff-only RLS policies
   - Vitals capture panel in EncounterChart.tsx

2. **Addendum model** (US-014)
   - Migration: `clinical_note_addenda` table (note_id, author_id, content, created_at)
   - RLS: author can insert, staff can read
   - Addendum UI below signed notes in ClinicalNotes

3. **Photo consent type** (US-019)
   - Add `photo_release` to consent types enum
   - Wire into PhotoUpload flow — require consent before upload

### Batch B — Security & Profile
4. **MFA UI** (US-004)
   - Settings page with TOTP enrollment using Supabase MFA API
   - QR code display, verification step

5. **Provider profile self-edit** (US-002)
   - Profile page for providers to update bio, specialties, credentials, headshot
   - RLS: users can only edit own profile

6. **Template CRUD UI** (US-015)
   - Management page for clinical_note_templates
   - Create, edit, delete, preview templates

### Batch C — Scheduling & Workflow
7. **Time-off blocking** (US-008)
   - Migration: `provider_time_off` table
   - Calendar UI to request/manage blocked dates
   - Conflict detection in scheduling logic

8. **MD feedback inbox** (US-021)
   - Leverage existing `chart_review_items` with status tracking
   - Inbox view filtered to provider's charts with MD comments

9. **Provider check-in view** (US-009)
   - Provider-side panel showing today's patients with check-in status

### Batch D — Communication & Analytics
10. **Secure messaging** (US-020)
    - `messages` table with realtime subscriptions
    - Simple inbox UI between providers and MD

11. **Revenue breakdown** (US-025)
    - Procedure-level earnings in Earnings.tsx

12. **Remaining nice-to-haves** — Photo annotation, waitlist, patient satisfaction, goal tracking (can be scoped later)

## Recommended Approach
Build **Batch A first** (3 items, all clinical compliance), then proceed through B → C → D. Each batch is independently shippable.

Shall I proceed with Batch A?

