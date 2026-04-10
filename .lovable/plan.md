

# Meridian EHR — Full UX Workflow Audit & AI-Native Optimization Plan

## Summary

A systematic audit of every user persona's workflow through the Meridian EHR, identifying UX gaps, friction points, and opportunities to inject AI-native intelligence. We will work through 7 persona workflows in order, optimizing each before moving to the next.

---

## The 7 Persona Workflows

```text
┌─────────────────────────────────────────────────────────┐
│  1. PATIENT (self-service / remote)                     │
│  2. INTAKE DESK (front desk staff)                      │
│  3. CLINIC ADMIN (owner / operations)                   │
│  4. PROVIDER (in-clinic clinical day)                   │
│  5. PROVIDER (marketplace / business)                   │
│  6. MEDICAL DIRECTOR (oversight + approvals)            │
│  7. REMOTE / VIDEO INTAKE (out-of-clinic patient)       │
└─────────────────────────────────────────────────────────┘
```

---

## Workflow 1: Patient (Self-Service Portal)

**Current state**: No patient-facing UI exists. All actions require staff.

**What to build**:
- Patient portal page (public route, no sidebar) with auth
- Pre-visit intake form (reuses HormoneIntake logic but patient-facing, simplified)
- Package dashboard: view active packages, session count, expiry
- Appointment history and upcoming visits
- AI: Pre-populate intake answers from prior visits, surface "what to expect" guidance
- AI: Post-visit summary generator (plain-language version of SOAP note)

---

## Workflow 2: Intake Desk (Front Desk)

**Current state**: Appointments page handles scheduling but lacks a front-desk-optimized view. No check-in flow, no queue management.

**What to build**:
- **Today View**: A dedicated front-desk dashboard showing today's schedule as a timeline/queue, not a list of all appointments
- **Quick Check-In**: One-click check-in from the queue with auto-print/display of intake forms
- **Walk-in Flow**: Rapid patient creation + appointment in a single form (currently 2 separate dialogs)
- **Queue Board**: Real-time status board (Waiting → Roomed → In Progress → Complete) with color-coded cards and wait-time display
- AI: Smart scheduling conflict detection on check-in (already partially built, surface it more prominently)
- AI: Auto-suggest next available slot for rescheduling no-shows
- AI: Predict wait times based on provider pace history

---

## Workflow 3: Clinic Admin (Operations)

**Current state**: Dashboard is basic (4 stat cards + 2 lists). Financial pages exist but are disconnected. No unified operational view.

**What to build**:
- **Command Center Dashboard**: Replace current dashboard with role-aware home — admin sees revenue KPIs, at-risk packages, provider utilization, today's capacity %
- **Unified Search**: Global command palette (Cmd+K) to find any patient, appointment, provider, package instantly
- **Alerts Panel**: Aggregate all action items — pending approvals, at-risk packages, overdue invoices, unsigned notes — into a single notification center
- AI: Daily briefing card — AI-generated morning summary of what needs attention
- AI: Revenue anomaly alerts (already in ai-financial-advisor, surface in dashboard)
- AI: Staff scheduling recommendations based on appointment volume patterns

---

## Workflow 4: Provider (In-Clinic Clinical Day)

**Current state**: Encounter chart is well-built with templates, SOAP generation, and AI. Appointments page has status progression. But the provider has no "my day" view.

**What to build**:
- **Provider Day View**: Filtered view showing only the logged-in provider's patients for today, in visit order, with one-click chart access
- **Quick Charting Toolbar**: Sticky bottom bar during encounter with Save Draft / AI Generate / Sign shortcuts
- **Between-Patient Summary**: When opening next patient, AI pre-loads a 30-second brief (last visit, active packages, any flags)
- **Photo Documentation**: Before/after photo capture attached to encounters (important for aesthetics)
- AI: Auto-complete encounter fields based on treatment type + patient history (partially exists, make more aggressive)
- AI: Real-time clinical decision support alerts during charting (drug interactions, contraindication flags)
- Improve encounter flow: reduce clicks from "open encounter → select template → fill fields → generate SOAP → sign" to a more linear, wizard-like experience

---

## Workflow 5: Provider on Marketplace

**Current state**: Marketplace page exists with provider profiles, skills, availability, and AI bio generation. Functional but admin-focused.

**What to build**:
- **Provider Self-Service Profile**: Let providers edit their own bio, skills, availability from their view (currently admin-only)
- **Booking Request Inbox**: Providers see incoming marketplace booking requests and accept/decline
- **Earnings Summary Card**: Quick view of their membership tier, month-to-date earnings, and modality breakdown (data exists in Earnings page, surface in provider context)
- AI: "Coach" mode — AI analyzes the provider's booking patterns and suggests how to increase utilization (ai-provider-coach exists, surface it)
- AI: Auto-suggest skill certifications to add based on treatment volume trends

---

## Workflow 6: Medical Director (Oversight + Approvals)

**Current state**: MD Oversight is well-built (risk-tiered queue, AI analysis, anti-rubber-stamp timer). Physician Approval handles hormone recs. But these are separate workflows.

**What to build**:
- **Unified Oversight Hub**: Merge chart reviews + hormone approvals into a single queue with smart filtering
- **Batch Actions**: Allow MD to approve multiple low-risk items at once (with individual attestation)
- **Delegation Rules**: MD can set auto-approve rules for specific providers or low-risk tiers
- AI: Priority sorting with reasoning — "Review this first because..." explanations
- AI: Trend analysis across providers — "Dr. X's chart quality has declined 15% this month"
- Improve the review detail panel — show encounter data inline without needing to navigate away

---

## Workflow 7: Remote / Video Intake (Out-of-Clinic)

**Current state**: No remote/telemedicine workflow exists.

**What to build**:
- **Remote Intake Link Generator**: Admin creates a unique intake URL, sends to patient
- **Patient-Facing Intake Wizard**: Reuses HormoneIntake but runs standalone (no sidebar, branded, mobile-optimized)
- **Lab Upload Flow**: Patient uploads lab PDF → AI extracts values (this logic exists in HormoneIntake, expose it standalone)
- **Video Consult Integration**: Embed or link to video call, with encounter auto-created and pre-populated from remote intake
- **Consent & E-Signature**: Digital consent forms with timestamp + IP logging
- AI: Pre-visit triage — based on intake answers, AI categorizes urgency and routes to appropriate provider
- AI: Auto-generate pre-visit summary for the provider reviewing the remote intake

---

## Cross-Cutting UX Improvements (Apply to All Workflows)

| Improvement | Details |
|---|---|
| **Global Command Palette** | Cmd+K search across patients, appointments, encounters, packages |
| **Breadcrumb Navigation** | Show context path (Patient → Encounter → Chart) for deep pages |
| **Skeleton Loading States** | Replace blank states with proper shimmer loading (some pages already do this) |
| **Toast → Action Toasts** | After save actions, offer "Undo" or "View" in the toast |
| **Mobile Responsiveness Audit** | Several pages use desktop-only layouts (tables, multi-column grids) |
| **Keyboard Shortcuts** | N for new, S for save, arrow keys for queue navigation |
| **Dark Mode Polish** | Ensure all custom colors work in dark mode |

---

## Implementation Order

We tackle these in batches, each batch is 1-2 implementation sessions:

| Batch | Workflows | Key Deliverables |
|---|---|---|
| **A** | 2 (Intake Desk) + 4 (Provider Day) | Today View, Queue Board, Provider Day View, Quick Charting |
| **B** | 3 (Admin) + Cross-cutting | Command Center Dashboard, Cmd+K palette, Alert Center |
| **C** | 6 (MD unified) + 5 (Provider marketplace self-service) | Unified Oversight Hub, Provider Self-Service |
| **D** | 7 (Remote Intake) + 1 (Patient Portal) | Remote intake wizard, patient portal, e-consent |

---

## Technical Approach

- All AI features use existing Lovable AI Gateway edge functions or new modes added to existing functions
- No new backend framework — everything stays Supabase + edge functions
- New pages follow existing patterns (React Query, Supabase client, shadcn/ui components)
- Auth-gated views will use Supabase Auth with role-based rendering (admin/provider/front_desk roles already exist in user_roles table)

**Shall I begin with Batch A (Intake Desk Today View + Provider Day View)?**

