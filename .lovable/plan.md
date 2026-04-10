

# Meridian EHR — End-to-End Testing Plan by Avatar Journey

## Current Data State

The database has minimal seed data: 1 patient, 1 provider, 3 appointments, 1 encounter, 2 clinical notes, 42 treatments, 2 hormone visits, 0 rooms, 0 packages, 0 invoices, 0 chart reviews. Most workflows will fail or show empty states without proper seed data. **Step zero is seeding realistic demo data.**

---

## Pre-Requisite: Seed Data

Before any journey can be tested, we need:
- 8-10 patients with varied demographics, emails, allergies, medications
- 3-4 providers with different specialties and credentials
- 2-3 rooms with device associations
- 5-6 service packages (e.g., "Botox 4-Pack", "Laser 6-Session")
- 15-20 appointments spread across today and recent dates, in various statuses
- 4-5 encounters (some signed, some draft) with field responses
- 3-4 clinical notes (signed and unsigned)
- 2-3 hormone visits with lab values and AI recommendations
- 2-3 invoices (paid, pending, overdue)
- Package purchases with session logs
- Chart review records (some pending, some completed)
- Provider skills, availability, and marketplace bookings

---

## Avatar 1: Front Desk Staff — "Maria's Morning"

Maria arrives at 7:45am, opens the Front Desk view, and manages the day's flow.

| # | Test Task | What Must Work |
|---|-----------|----------------|
| 1.1 | Open `/front-desk` — see today's Kanban board | Appointments load in correct status columns; KPI strip shows accurate counts |
| 1.2 | Check in a "booked" patient with one click | Status moves to "checked_in", card moves to Waiting column, `checked_in_at` timestamp set |
| 1.3 | Move a patient from Waiting → Roomed | Status updates, card animates to correct column |
| 1.4 | Move a patient through In Progress → Completed | Full lifecycle works without errors |
| 1.5 | Mark a no-show patient | Status changes to "no_show", card removed from queue |
| 1.6 | Register a walk-in (new patient + appointment in one form) | Patient created in DB, appointment created for today, appears in queue |
| 1.7 | Search/filter the queue by patient name | Search filters cards in real-time |
| 1.8 | Auto-refresh picks up changes | After 15s, externally-changed appointments appear without manual refresh |

---

## Avatar 2: Provider — "Dr. Chen's Clinical Day"

Dr. Chen arrives at 8:30am, opens Provider Day, and sees her schedule.

| # | Test Task | What Must Work |
|---|-----------|----------------|
| 2.1 | Open `/provider-day`, select a provider | Today's appointments load filtered to that provider |
| 2.2 | See patient brief (allergies, meds, packages) | Patient data displays inline on each card |
| 2.3 | Click "AI Brief" on a patient card | Edge function called, brief text renders (or graceful error) |
| 2.4 | Click "Open Chart" on a checked-in patient | Navigates to `/encounters/:id/chart` with encounter pre-created |
| 2.5 | On Encounter Chart: select a template | Template sections and fields load correctly |
| 2.6 | Fill encounter fields and save draft | Field responses persist to `encounter_field_responses` |
| 2.7 | Click "AI Generate SOAP" | Edge function generates SOAP note, populates text area |
| 2.8 | Sign the encounter | `signed_at` set, status changes, chart review auto-queued (trigger fires) |
| 2.9 | Return to Provider Day — completed patient shows green | Status reflects "completed" |

---

## Avatar 3: Clinic Admin — "Jessica's Command Center"

Jessica opens the dashboard at 8am to get her daily operational pulse.

| # | Test Task | What Must Work |
|---|-----------|----------------|
| 3.1 | Open `/` (Dashboard) | KPI cards load: today's patients, MTD revenue, active patients, action items |
| 3.2 | Capacity progress bar reflects today's volume | Shows X/Y with appropriate percentage |
| 3.3 | Action items panel: unsigned notes | Correct count of notes where `status != 'signed'` |
| 3.4 | Action items panel: pending chart reviews | Count matches `chart_review_records` with pending status |
| 3.5 | Action items panel: at-risk packages | Shows packages near expiry or high unused sessions |
| 3.6 | Click "Generate AI Briefing" | Calls `ai-financial-advisor` with `daily_briefing` mode, renders summary |
| 3.7 | Today's schedule list is accurate | Shows appointments with provider/patient/treatment names |
| 3.8 | Click through action items to relevant pages | Navigation links work (e.g., clicking unsigned notes → clinical notes page) |
| 3.9 | Use Cmd+K command palette | Opens, searches patients/providers by name, navigates on select |

---

## Avatar 4: Medical Director — "Dr. Patel's Oversight"

Dr. Patel reviews charts and hormone approvals from `/md-oversight`.

| # | Test Task | What Must Work |
|---|-----------|----------------|
| 4.1 | Open `/md-oversight` — Charts tab loads | Pending chart reviews appear, sorted by AI priority score |
| 4.2 | Filter by risk tier (low/medium/high/critical) | List filters correctly |
| 4.3 | Open a chart review detail | Encounter data, AI analysis, flags display inline |
| 4.4 | Anti-rubber-stamp timer activates | Timer counts up, approve button disabled until threshold met |
| 4.5 | Approve a single chart with comment | Status → approved, MD comment saved, timer logged |
| 4.6 | Request correction on a chart | Status → corrected, comment saved |
| 4.7 | Batch-select multiple low-risk charts and approve | All selected items update to approved simultaneously |
| 4.8 | Switch to Hormone Approvals tab | Pending hormone visits load with recommendation details |
| 4.9 | Approve/modify/reject a hormone recommendation | Status updates, notes saved |
| 4.10 | KPI strip shows accurate pending counts | Numbers match actual DB counts |

---

## Avatar 5: Provider on Marketplace — "Dr. Lee's Profile"

Dr. Lee manages her marketplace presence from `/my-marketplace`.

| # | Test Task | What Must Work |
|---|-----------|----------------|
| 5.1 | Open `/my-marketplace` — profile loads | Provider bio, skills, availability display |
| 5.2 | Edit and save bio text | Updates `providers.marketplace_bio` |
| 5.3 | Click "AI Generate Bio" | Edge function generates bio, populates field |
| 5.4 | Add a new skill with certification level | Row inserted into `provider_skills` |
| 5.5 | Delete a skill | Row removed from `provider_skills` |
| 5.6 | Add/edit availability slots | Rows in `provider_availability` created/updated |
| 5.7 | View booking inbox | `marketplace_bookings` for this provider displayed |
| 5.8 | Accept/decline a booking | Booking status updates |
| 5.9 | Open AI Coach drawer | Calls edge function, renders coaching insights |
| 5.10 | Earnings summary card shows data | Revenue/hourly rate pulled from `provider_earnings` |

---

## Avatar 6: Patient — "Sarah's Portal"

Sarah accesses the patient portal to check her upcoming visit.

| # | Test Task | What Must Work |
|---|-----------|----------------|
| 6.1 | Open `/portal` — login screen appears | Clean branded page, no sidebar |
| 6.2 | Enter email, click "Access Portal" | Looks up patient by email, transitions to portal view |
| 6.3 | Invalid email shows error | Toast: "No patient record found" |
| 6.4 | Appointments tab: see upcoming visits | Queries appointments for this patient, shows future ones |
| 6.5 | Appointments tab: see past visits | Historical appointments display |
| 6.6 | Packages tab: see active packages with session counts | `patient_package_purchases` with usage data |
| 6.7 | Packages tab: expiring package shows warning | Visual alert for packages near expiry |
| 6.8 | Records tab: see signed clinical notes | Only signed notes visible |
| 6.9 | Records tab: see lab history | Lab results in table format |
| 6.10 | Log out returns to login screen | State resets cleanly |

---

## Avatar 7: Remote Patient — "New Patient Intake"

A new patient receives an intake link and completes the wizard.

| # | Test Task | What Must Work |
|---|-----------|----------------|
| 7.1 | Open `/intake` — wizard Step 1 loads | Demographics form, no sidebar, mobile-friendly |
| 7.2 | Fill demographics and advance to Step 2 | Validation: required fields enforced, step progresses |
| 7.3 | Step 2: select treatment focus and symptoms | Symptom options change based on focus selection |
| 7.4 | Step 3: health history + contraindication screening | Absolute contraindications show red warnings |
| 7.5 | Step 4: upload lab PDF | File uploads, AI extraction calls `ai-extract-labs`, values populate |
| 7.6 | Step 4: manually enter lab values | Fields accept input with units displayed |
| 7.7 | Step 5: consent checkboxes + e-signature | All required consents must be checked, signature field required |
| 7.8 | Submit intake | Patient created in `patients`, intake form in `intake_forms`, hormone visit created |
| 7.9 | Success confirmation screen | Shows confirmation with reference info |
| 7.10 | Navigate back shows wizard resets | Clean state for next intake |

---

## Cross-Cutting Tests

| # | Test Task | What Must Work |
|---|-----------|----------------|
| X.1 | Cmd+K palette searches patients by name | Returns matching patients from DB |
| X.2 | Cmd+K palette searches providers | Returns matching providers |
| X.3 | Cmd+K page navigation (type "front desk") | Navigates to `/front-desk` |
| X.4 | Breadcrumbs show on nested pages | e.g., Encounters > Chart shows breadcrumb trail |
| X.5 | Sidebar navigation — all links resolve | Every sidebar item loads its page without 404 |
| X.6 | Mobile responsive: Front Desk on 375px | Queue columns stack or scroll horizontally |
| X.7 | Mobile responsive: Provider Day on 375px | Cards stack vertically, still functional |
| X.8 | Empty states: pages with no data show helpful messages | Not blank screens or crashed queries |

---

## Implementation Plan

To make this testable, we need:

1. **Create a seed data migration** — Insert realistic demo data across all core tables (patients, providers, rooms, treatments, appointments, encounters, notes, packages, reviews, hormone visits, invoices, marketplace bookings)
2. **Fix any broken queries** — Several pages reference tables/columns that may not exist or have no data; verify each query against the actual schema
3. **Test each edge function** — Verify `ai-chart-review`, `ai-soap-note`, `ai-extract-labs`, `ai-financial-advisor`, `ai-provider-coach` all respond correctly
4. **Walk through each avatar journey in the browser** — Navigate each flow, clicking every button, verifying data mutations

The seed data is the critical first step — without it, 90% of these tests will show empty states.

