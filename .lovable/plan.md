

# Facility-Scoped MD Dashboard — Implementation Plan

## Why start here

The contracts and clinics tables exist, and MD coverage assignments link MDs to clinics. But **encounters and appointments have no `clinic_id` column** — so there's no way to scope what an MD sees by facility. This is the structural fix that unlocks everything else.

## What we'll build

### 1. Database: Add `clinic_id` to appointments and encounters

- Add `clinic_id` (uuid, nullable, FK → clinics) to `appointments` and `encounters`
- When booking, front desk selects clinic; encounter inherits from appointment on creation

### 2. Enrich clinics table

- Add `phone`, `timezone`, `city`, `state` columns to `clinics` for better facility cards
- Update `ContractsAdmin.tsx` clinic form to capture these fields

### 3. Clinic selector in booking flow

- Add a clinic dropdown to the appointment booking dialog in `Appointments.tsx`
- Default to the provider's primary clinic if one exists (via `md_coverage_assignments` or a new `provider_clinic_assignments` table — we'll use a simple approach: let front desk pick)

### 4. Encounter inherits clinic_id

- When `TelehealthVisit.tsx` and `EncounterChart.tsx` auto-create encounters, copy `clinic_id` from the appointment

### 5. Facility-scoped MD Oversight views

- **MdOversight.tsx**: On load, fetch the logged-in MD's `md_coverage_assignments` to get their assigned `clinic_id`s. Add a clinic filter dropdown (defaulting to "All My Clinics"). Filter `chart_review_records` and `hormone_visits` queries by joining through encounters → clinic_id.
- **MdOversightDashboard.tsx**: Same clinic scoping for stats, provider intelligence, and reports. Add a facility summary card showing each assigned clinic with pending review counts.

### 6. MD "My Facilities" overview card

- New section at top of MdOversightDashboard showing assigned clinics as cards with: clinic name, contract name, pending charts count, last review date. Clicking a card filters the entire dashboard to that facility.

## Files to create/modify

| File | Change |
|------|--------|
| Migration SQL | Add `clinic_id` to appointments + encounters; add phone/timezone/city/state to clinics |
| `src/pages/Appointments.tsx` | Add clinic selector to booking dialog |
| `src/pages/EncounterChart.tsx` | Copy clinic_id from appointment when creating encounter |
| `src/pages/TelehealthVisit.tsx` | Same — copy clinic_id |
| `src/pages/MdOversight.tsx` | Fetch MD's assigned clinics, add clinic filter, scope all queries |
| `src/pages/MdOversightDashboard.tsx` | Add facility cards, scope stats by clinic |
| `src/pages/ContractsAdmin.tsx` | Add phone/timezone/city/state to clinic form |
| `src/pages/MdCoverage.tsx` | No changes needed (already works) |

## Technical notes

- `clinic_id` is nullable so existing data isn't broken
- MD clinic scoping uses: `SELECT clinic_id FROM md_coverage_assignments WHERE md_provider_id = (SELECT id FROM providers WHERE auth_user_id = current_user_id)`
- No new tables needed — leverages existing `md_coverage_assignments`
- After this batch, the second feature (enriching contracts structure, adding provider-to-clinic assignments for non-MDs) becomes straightforward

