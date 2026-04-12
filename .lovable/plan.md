

# Labs + AI Hormone/Peptide Recommendations for Doctors — Implementation Plan

## Current State

The intake → labs → doctor review pipeline is **mostly wired** but has these gaps:

1. **`_markOpened` bug**: `RemoteIntake.tsx` sends `{ _markOpened: true, invitation_token: token }` but the edge function checks `body.token`, not `body.invitation_token`. Invitation never gets marked "opened."

2. **Intake form lab data not visible to MD on the Hormone Approvals tab**: When a remote intake creates a `hormone_visit`, the MD Oversight "Hormone Approvals" tab shows it — but only if someone manually triggers "AI Rec" first (since the query filters `NOT ai_recommendation IS NULL`). Remote intakes don't auto-generate the AI recommendation.

3. **No AI recommendation auto-triggered on intake submission**: The `submit-remote-intake` edge function creates a `hormone_visit` with lab values, symptoms, goals, and focus areas — but never calls `ai-hormone-rec`. The doctor has to manually click "AI Rec" on the HormoneVisits page first.

4. **Intake lab values use different key mapping**: The `ai-extract-labs` function returns keys like `tt`, `ft`, `e2` — the intake form maps them to `lab_tt`, `lab_ft`, etc. The `submit-remote-intake` function stores them correctly in `hormone_visits`. This works.

5. **MD Oversight hormone tab doesn't show intake context**: The hormone review dialog shows AI recommendation sections (summary, treatment, monitoring, risk flags) but doesn't show the intake form's focus areas, symptoms, goals, or contraindications — critical for peptide/hormone review.

## What We'll Build

### Fix 1: Fix `_markOpened` token field mismatch
- In `RemoteIntake.tsx`, change `invitation_token` to `token` in the markOpened call to match the edge function's expected field.

### Fix 2: Auto-trigger AI recommendation on remote intake submission
- In `submit-remote-intake` edge function, after creating the `hormone_visit`, call `ai-hormone-rec` with the patient data, visit labs, symptoms, goals, and focus areas.
- Save the AI response to `hormone_visits.ai_recommendation` and `ai_sections`.
- This means the visit immediately appears in the MD's Hormone Approvals queue with a recommendation ready for review.

### Fix 3: Show intake context in MD hormone review
- In `MdOversight.tsx` hormone review dialog, add a section showing:
  - Focus areas (e.g., "Male TRT", "GLP-1", "BPC-157")
  - Reported symptoms
  - Patient goals
  - Contraindication flags (with severity highlighting for absolute contraindications)
  - Medications and prior therapy
- These fields already exist on `hormone_visits` (`intake_symptoms`, `intake_goals`, `intake_focus`, `peptide_categories`, `peptide_contraindications`).

### Fix 4: Show all lab values in MD review (not just TT/E2/TSH)
- The hormone review dialog currently shows the AI sections but not the actual lab values. Add a collapsible lab panel showing all non-null lab values with reference range flags (using the same `LAB_REFS` from the edge function).

### Fix 5: Remove `NOT ai_recommendation IS NULL` filter
- Update the hormone approvals query in `MdOversight.tsx` to also show visits that have no AI recommendation yet (in case the auto-trigger fails), with a "Generate AI Rec" button inline.

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/RemoteIntake.tsx` | Fix `_markOpened` call: send `token` not `invitation_token` |
| `supabase/functions/submit-remote-intake/index.ts` | After creating hormone_visit, call `ai-hormone-rec` and save result |
| `src/pages/MdOversight.tsx` | Add intake context, lab values panel, remove null-recommendation filter, add inline AI Rec button |

## Technical Notes
- The `submit-remote-intake` edge function already has `SUPABASE_URL` and `LOVABLE_API_KEY` available, so it can call `ai-hormone-rec` internally via fetch.
- No database changes needed — all fields already exist on `hormone_visits`.
- The auto-AI-rec call is fire-and-forget (non-blocking) so the patient's submission response isn't delayed.

