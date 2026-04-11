

# Provider UX/UI Redesign — Layout, Button Placement & AI-Native Workflow

## Current UX Problems

1. **Sidebar overload**: All 40+ nav items visible to every role. A provider sees Admin, Platform, Oversight sections they cannot use. This creates cognitive load and hides the 6-8 items they actually need.

2. **No command center**: Provider Day (`/provider-day`) is a flat list of appointments. Missing: stats sidebar, AI Day Brief, overdue chart alerts, MD correction badges. The user story spec (US-008) calls for a rich dashboard with a sidebar of today's KPIs.

3. **Fragmented pages**: Check-In (`/check-in`), My Day (`/provider-day`), MD Feedback (`/md-feedback`), and Profile (`/my-profile`) are separate pages with no contextual links. The provider must navigate 4+ pages for a single patient encounter flow.

4. **Buried AI**: AI Patient Brief requires a manual click per patient. The spec asks for an auto-generated "Day Brief" summary at the top. SOAP AI is good but drug interaction alerts and safety field warnings are missing.

5. **Missing performance dashboard**: US-028 asks for a single-page KPI summary (appointments today, procedures this month, hours, revenue, NPS, overdue charts). Currently no such page exists.

6. **No contextual actions on encounter flow**: From schedule, the provider should: (1) see patient brief, (2) open chart, (3) chart with template, (4) sign, (5) send aftercare. Steps 1, 4-5 lack guided flow.

---

## Redesigned Provider Layout

```text
+------------------+---------------------------------------------------+
|  SIDEBAR (slim)  |  MAIN CONTENT                                     |
|                  |                                                   |
|  [Meridian logo] |  HEADER: "Good morning, Dr. Smith" + date         |
|  [Search ⌘K]     |  ┌─────────────┐  ┌──────────┐  ┌──────────┐     |
|                  |  │ 8 patients  │  │ 3 done   │  │ 2 charts │     |
|  MY WORK         |  │ today       │  │ so far   │  │ overdue  │     |
|  · My Day        |  └─────────────┘  └──────────┘  └──────────┘     |
|  · Schedule      |                                                   |
|  · Encounters    |  ┌─ AI DAY BRIEF ─────────────────────────────┐   |
|  · MD Feedback   |  │ "8 patients today. Patient 3 (Kim) is on   │   |
|                  |  │  aspirin—confirm before filler. Patient 6   │   |
|  PATIENTS        |  │  returning after 120-day lapse. 2 charts    │   |
|  · Patient List  |  │  from yesterday still unsigned."            │   |
|  · Messages      |  └────────────────────────────────────────────┘   |
|                  |                                                   |
|  ME              |  ── CURRENT PATIENT (highlighted) ──              |
|  · My Profile    |  [avatar] Jane D. | Botox | Room 3 | 10:30a     |
|  · Performance   |  [AI Brief inline]  [Open Chart →]               |
|  · Time Off      |                                                   |
|  · Settings      |  ── UP NEXT (3) ──                               |
|                  |  [compact cards with status, allergies, pkgs]     |
|                  |  [sparkle icon = hover for brief] [→ = chart]    |
|                  |                                                   |
|  [User avatar]   |  ── COMPLETED (5) ── collapsed by default        |
|  [Sign out]      |  [compact list with "View Chart" links]          |
+------------------+---------------------------------------------------+
```

---

## Implementation Plan — 4 Batches

### Batch 1: Role-Filtered Sidebar + Provider Command Center
**Stories:** US-008, US-028 (partial)

**Changes:**
- **AppSidebar.tsx**: Add role-based filtering. Provider role sees only: My Day, Schedule, Encounters, MD Feedback, Patients, Messages, My Profile, Performance, Time Off, Settings. Hide Admin, Platform, Oversight, Front Desk sections.
- **ProviderDay.tsx** (full rewrite as command center):
  - Top: greeting + date + 4 stat cards (patients today, completed, overdue charts, MD corrections pending)
  - AI Day Brief card: auto-generates on page load via `ai-provider-coach` edge function (new `mode: "day_brief"`). Shows patient complexity summary, prep notes, alerts.
  - Current Patient section: larger card with inline AI brief (auto-loaded), prominent "Open Chart" button, allergy/medication alerts, room + time display
  - Up Next: compact cards with status badges, allergy warnings, "Returning after lapse" badge (90+ days), hover/click for AI brief, one-click chart open
  - Completed: collapsible section, "View Chart" + "Send Aftercare" buttons
  - Right sidebar (lg screens): today's stats panel (total appointments, procedures completed, estimated revenue, overdue charts count) per US-008 AC#49

**New edge function mode:** Extend `ai-provider-coach` with `day_brief` mode that summarizes the day's schedule, flags drug interactions, lapse patients, and overdue charts.

### Batch 2: Enhanced Encounter Flow + AI Safety
**Stories:** US-010, US-011, US-013, US-014, US-015, US-012

**Changes:**
- **EncounterChart.tsx** enhancements:
  - Add completeness percentage bar at top (% of required fields filled), disable Sign button until 100%
  - Add "Drug Interaction Alert" banner: AI checks patient medications vs procedure at chart open, shows dismissible warning
  - Add "Safety Field Check" on sign attempt: AI scans for blank lot numbers, missing injection sites, etc. and surfaces specific prompts
  - Post-sign flow: after signing, show modal: "Send aftercare to patient?" with pre-filled template, channel selector (SMS/Email), and send button via `ai-aftercare-message`
  - Add photo attach button per template section (not just top-level)
  - Addendum support: on signed encounters, show "Add Addendum" button that opens timestamped text area below locked original (AddendumSection component already exists)
- **VitalsPanel.tsx** improvements:
  - Show prior visit values in grey below each input
  - Auto-calculate BMI with color coding (red >30, amber 25-30, green <25)
  - Weight change delta display
  - For GLP-1 patients: show % total body weight lost since protocol start
  - AI contraindication check (BP >160/100 before filler warns)

### Batch 3: Communication + MD Feedback
**Stories:** US-015 (MD feedback acknowledgment), US-020, US-021, US-022, US-023

**Changes:**
- **MdFeedbackInbox.tsx** (enhance):
  - "Correction Required" items: red banner with "Action Required", "Acknowledge" button that clears flag and notifies MD
  - Reply capability within feedback thread
  - Link directly to encounter chart from each feedback item
  - AI thread summarization for long conversations
  - Unread count badge in sidebar
- **Messages.tsx** (provider-to-MD messaging):
  - When initiated from an encounter, AI pre-drafts the message with patient context
  - AI suggests similar past questions before sending
- **Aftercare integration**: from Completed section in My Day, one-click "Send Aftercare" opens pre-filled message with procedure-specific template, AI personalization based on encounter notes

### Batch 4: Performance Dashboard + Profile
**Stories:** US-024, US-025, US-026, US-027, US-028, US-002, US-005

**Changes:**
- **New ProviderPerformanceDashboard.tsx** (replaces generic ProviderDrillDown for self-view):
  - Hours Worked section: appointment duration sums by day/week/month, manual hour logging, admin vs clinical split, PDF export
  - Procedures section: bar chart by type, drill into encounters, YTD totals, AI highlights top 3 + declining procedures
  - Revenue section: total + by procedure type, trend line, AI run rate vs target projection
  - Product Usage section: lot number log, filter by product/date, CSV export, AI expiration alerts
  - Summary card at top: appointments today, procedures this month, hours, revenue, NPS, trend arrows
- **ProviderProfile.tsx** (enhance):
  - Photo upload with AI headshot detection
  - AI bio draft from credentials/specialty
  - % complete indicator
  - "Request Change" workflow for admin-gated fields (credentials, NPI, procedure clearances)
  - Change history audit trail

---

## Button Placement Philosophy

| Context | Action | Placement | Rationale |
|---------|--------|-----------|-----------|
| My Day - current patient | Open Chart | Primary button, right side of card | Most critical action, always visible |
| My Day - upcoming patient | View Brief / Open Chart | Icon buttons, right of row | Quick access without expanding |
| My Day - completed | View Chart / Send Aftercare | Text buttons, right of row | Secondary actions, compact |
| Encounter - charting | Save Draft | Outline button, header right | Always accessible, non-destructive |
| Encounter - charting | Sign & Lock | Primary button, header right | Gated by completeness %, most important |
| Encounter - post-sign | Send Aftercare | Modal prompt, auto-shown | Natural next step in workflow |
| Encounter - signed | Add Addendum | Ghost button, below locked note | Available but not prominent |
| MD Feedback | Acknowledge | Destructive-styled button, inline | Urgency indicator |
| MD Feedback | Reply | Text button, inline | Quick response |
| Sidebar | Unread badges | Red dot on MD Feedback, Messages | Passive notification |
| Day Brief | Dismiss / Refresh | Ghost button, card corner | Non-blocking |

## AI Integration Points (All Native, No User API Keys)

1. **Day Brief** (auto on page load): summarizes schedule, flags risks
2. **Drug Interaction Alert** (auto on chart open): checks meds vs procedure
3. **Safety Field Check** (on sign attempt): validates required safety fields
4. **SOAP Drafting** (existing, enhanced): pre-fills subjective from intake
5. **Aftercare Personalization** (post-sign prompt): adapts template to encounter notes
6. **Bio Drafting** (profile page): generates professional bio
7. **Performance Insights** (dashboard): trend analysis, run rate projections
8. **MD Message Drafting** (from encounter): pre-fills context

All use `google/gemini-3-flash-preview` via existing Lovable AI Gateway edge functions.

