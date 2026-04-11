


# Admin UX/UI Redesign — Layout, Button Placement & AI-Native Workflow

## Current UX Problems

1. **ADMIN section is a junk drawer**: 17 flat items. No grouping by task type.
2. **No task-oriented entry points**: Stories define clear workflows but sidebar treats pages as unrelated.
3. **Dashboard doesn't guide daily work**: Doesn't surface actual daily tasks (overdue charts, waitlist matches, coverage gaps).
4. **Scheduling is fragmented**: Split across Appointments, Calendar Grid, Waitlist, Automation Rules.
5. **Oversight buried**: 5 items when admin stories only need 3 views.
6. **PLATFORM section confusing for Clinic Managers**: Super-Admin items shown to all admins.
7. **No AI surfaces on landing**: Briefing button exists but isn't auto-loaded.

## Redesigned Admin Sidebar

```
COMMAND         → Dashboard, Front Desk, Check-In
SCHEDULE        → Appointments, Calendar Grid, Waitlist
PATIENTS        → Patients, Messages, Patient Inbox, Notifications
CLINIC CONFIG   → Treatments, Medications, Packages, Memberships, Templates
OPERATIONS      → Provider Schedules, Clinic Hours, Rooms & Devices, Providers, Automations
OVERSIGHT       → Chart Review (consolidated), MD Status, Churn Risk
FINANCIALS      → Billing, Earnings, Proforma, Reports
PLATFORM ★      → Contracts, MD Coverage, Master Catalog, Benchmarks (Super-Admin only)
ME              → Settings
```

## Implementation — 4 Batches

### Batch 1: Restructured Sidebar + Admin Command Center Dashboard
- Restructure admin nav into 8 logical groups
- Dashboard: auto AI briefing, action items, mini-schedule, provider scoreboard, quick actions

### Batch 2: Clinic Configuration Hub + AI Recommendations
- Treatments: GFE/MD Review toggles, AI template suggestion
- Medications: AI dosing, interactions, credential restrictions
- Pricing: Member/non-member, bulk adjust, AI benchmarks
- Packages: AI bundles, margin calc, performance dashboard
- Providers: Procedure clearance management

### Batch 3: Scheduling Command + Notifications
- Appointments: AI provider matching, contraindication checks
- Calendar Grid: KPI sidebar, AI utilization scores, realtime
- Waitlist: AI ranking, predicted cancellations, AI-drafted notifications
- Automations: AI optimization, fatigue detection

### Batch 4: Oversight Consolidation + Reports + Platform
- Chart Review: consolidate Outstanding + Completeness + MD Status
- Reports: pre-built types, AI summaries, scheduled delivery
- Platform: AI monthly intelligence, cross-clinic benchmarks

## Button Placement Philosophy

| Context | Action | Placement | Rationale |
|---------|--------|-----------|-----------|
| Dashboard - action items | Review / Fill | Primary inline, right | Urgent action |
| Dashboard | Book Appointment | Header CTA | Most common task |
| Calendar - open slot | Promote to Waitlist | Badge-button inline | AI-surfaced |
| Treatments | + Add Procedure | Primary, header right | Creation action |
| Waitlist - match | Send / Book | Primary + outline, right | Time-sensitive |
| Chart Review - overdue | Send Reminder | Warning button, right | Urgency |

## AI Integration Points (Lovable AI Gateway)

1. Clinic Briefing (auto on dashboard)
2. Action Item Detection (auto)
3. Scheduling Intelligence (booking)
4. Calendar Optimization (calendar)
5. Catalog Recommendations (add treatment/med)
6. Pricing Intelligence (pricing)
7. Package Optimization (packages)
8. Chart Prediction (oversight)
9. Report Summaries (reports)
10. Platform Intelligence (Super-Admin)
