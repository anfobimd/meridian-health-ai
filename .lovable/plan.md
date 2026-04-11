

# Admin User Stories Audit & Implementation Workflow

## Gap Analysis: 28 Stories, 6 Epics

### EP-A01: Account & Security Management (3 stories)

| Story | Title | Status | Notes |
|-------|-------|--------|-------|
| US-A001 | Change My Password | **Partial** | Settings page has MFA but no password change form with strength validation, lockout, or session invalidation |
| US-A002 | Enable/Manage MFA | **Built** | TOTP enrollment, QR code, verify, unenroll all in Settings.tsx |
| US-A003 | Reset Another User's Password | **Missing** | No user management page for admins to reset other users' passwords |

### EP-A02: Clinic & Catalog Configuration (6 stories)

| Story | Title | Status | Notes |
|-------|-------|--------|-------|
| US-A004 | Add/Remove Procedures (Catalog) | **Partial** | Treatments.tsx has basic CRUD but missing: Requires GFE flag, Requires MD Review flag, template association, role restrictions, active/inactive toggle, audit logging |
| US-A005 | Add/Remove Medications & Hormones | **Missing** | No medications/formulary management page |
| US-A006 | Configure Procedure Pricing | **Partial** | Treatments has price field but no member vs non-member pricing, bulk adjustments, price history, effective dates |
| US-A007 | Create/Manage Treatment Packages | **Built** | Packages.tsx has full CRUD, AI insights, package sales, session tracking |
| US-A008 | Configure Clinic Hours & Schedules | **Partial** | ProviderSchedule.tsx exists for provider availability but no clinic-level operating hours, holiday closures, or coverage management |
| US-A009 | Manage Provider Roles & Clearances | **Missing** | No procedure clearance management per provider |

### EP-A03: Patient Scheduling & Notifications (6 stories)

| Story | Title | Status | Notes |
|-------|-------|--------|-------|
| US-A010 | Book an Appointment | **Built** | Appointments.tsx has multi-step booking with AI suggestions, conflict detection, slot picker |
| US-A011 | Automated/Manual Notifications | **Missing** | No notification system (SMS/email reminders, confirm/cancel links) |
| US-A012 | Notify Providers Daily Schedule | **Missing** | Provider Day page exists but no automated morning notification system |
| US-A013 | View/Manage Full Clinic Schedule | **Partial** | Appointments page has list view but no multi-provider column calendar, drag-drop, or real-time KPI sidebar |
| US-A014 | Manage Patient Waitlist | **Partial** | `appointment_waitlist` table exists but no dedicated waitlist UI with matching/notification |
| US-A015 | Handle Cancellations & Reschedules | **Partial** | Status changes exist but no cancellation reason tracking, no-show counter, or re-engagement automation |

### EP-A04: Chart Review & Documentation Oversight (3 stories)

| Story | Title | Status | Notes |
|-------|-------|--------|-------|
| US-A016 | Monitor Outstanding Charts | **Partial** | MdOversightDashboard has some metrics but no admin-specific unsigned chart tracker with provider charting lag |
| US-A017 | Review Charts for Admin Completeness | **Missing** | No administrative completeness checklist (consent, GFE, ICD-10, CPT verification) |
| US-A018 | View MD Oversight Status | **Built** | MdOversight + MdOversightDashboard cover review status, compliance %, and AI analysis |

### EP-A05: Productivity, Analytics & Reporting (4 stories)

| Story | Title | Status | Notes |
|-------|-------|--------|-------|
| US-A019 | Clinic-Wide Productivity Dashboard | **Partial** | Index.tsx has KPIs and AI briefing but missing provider utilization %, procedure mix chart, provider performance table |
| US-A020 | Provider-Level Productivity Metrics | **Partial** | Earnings has per-provider data but no individual drill-down with 6-month trends, schedule fill rate, or PDF export |
| US-A021 | Revenue by Procedure/Provider/Package | **Partial** | Earnings.tsx has procedure-level revenue; Proforma exists; but no A/R aging or package revenue split |
| US-A022 | Generate/Export Reports | **Missing** | No report generator with payroll hours, PDF/CSV export, or scheduled auto-send |

### EP-A06: Super-Admin & Application Administration (6 stories)

| Story | Title | Status | Notes |
|-------|-------|--------|-------|
| US-A023 | Manage Contracts & Clinic Managers | **Missing** | No contracts/multi-clinic hierarchy management |
| US-A024 | Assign MD Coverage | **Partial** | oversight_config table exists with sampling rates but no MD coverage matrix UI |
| US-A025 | Platform-Wide AI Intelligence Report | **Built** | ai_oversight_reports table + AI monthly report edge function exist |
| US-A026 | Master Procedure/Medication Catalog | **Missing** | No platform-level master catalog (only clinic-level treatments) |
| US-A027 | Cross-Clinic Performance Benchmarks | **Missing** | No cross-clinic comparison view |
| US-A028 | Platform Notification/Automation Rules | **Missing** | No automation rules engine |

### Summary: 4 Built, 12 Partial, 12 Missing

---

## Implementation Workflow (5 Batches)

### Batch A -- Core Admin Config (Must-haves, highest impact)
1. **Password Change UI** (US-A001) -- Add password change form to Settings with strength meter, lockout, session invalidation
2. **Enhanced Treatment Catalog** (US-A004) -- Add GFE/MD Review flags, template association, active/inactive, audit logging to Treatments.tsx
3. **Medications & Formulary** (US-A005) -- New page: medication management with categories, dosing, credential restrictions, controlled substance tracking
4. **Provider Clearances** (US-A009) -- New section in Providers page: procedure clearance management per provider with expiration dates

### Batch B -- Scheduling & Calendar (Critical operational)
5. **Clinic Hours & Closures** (US-A008) -- New clinic hours config with holidays, provider schedule overrides
6. **Full Clinic Schedule View** (US-A013) -- Multi-provider calendar grid with day/week views, drag-drop, KPI sidebar
7. **Waitlist Management** (US-A014) -- Waitlist UI with cancellation-slot matching, SMS-ready notification drafts
8. **Cancellation & Reschedule Flow** (US-A015) -- Cancellation reason tracking, no-show counter, re-engagement workflow

### Batch C -- Analytics & Oversight
9. **Pricing Management** (US-A006) -- Member/non-member pricing, bulk adjustments, price history, effective dates
10. **Outstanding Charts Monitor** (US-A016) -- Admin chart completion tracker with provider charting lag, reminder actions
11. **Admin Completeness Review** (US-A017) -- Checklist view for consent, GFE, ICD-10, CPT verification on signed encounters
12. **Productivity Dashboard Enhancement** (US-A019) -- Provider utilization %, procedure mix chart, performance table

### Batch D -- Reporting & Provider Analytics
13. **Provider Drill-Down Metrics** (US-A020) -- Individual provider detail view with trends, fill rate, exportable PDF
14. **Revenue Breakdown Enhancement** (US-A021) -- A/R aging, package revenue split, provider revenue per hour
15. **Report Generator** (US-A022) -- Payroll, productivity, revenue reports with PDF/CSV export and scheduling

### Batch E -- Super-Admin Platform Management
16. **Contracts & Clinic Hierarchy** (US-A023) -- Multi-clinic contract management with assignments
17. **MD Coverage Matrix** (US-A024) -- Visual MD-to-clinic assignment grid with sampling rates
18. **Master Catalog** (US-A026) -- Platform-level procedure/medication catalog that clinics select from
19. **Cross-Clinic Benchmarks** (US-A027) -- Side-by-side clinic comparison dashboard
20. **Automation Rules Engine** (US-A028) -- Trigger/condition/action rule builder for notifications

Notifications (US-A011, US-A012) require external services (Twilio/SendGrid) and are deferred until those connectors are configured. User management password reset (US-A003) depends on Supabase admin API access.

---

## Step 1: Save Audit to Memory

Write the full gap analysis to `mem://features/admin-stories-audit` and update the index.

## Step 2: Build Batch A First

Batch A delivers the most critical admin configuration capabilities. Each subsequent batch is independently shippable.

Shall I proceed?
