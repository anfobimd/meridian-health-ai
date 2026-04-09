

# Service Package Tracker — AI-Native Implementation Plan

## Overview

A full package management system that lets clinics create, sell, and track pre-paid treatment bundles. AI drives four profit-maximizing functions: personalized re-engagement notifications, synergistic treatment recommendations, abandonment risk scoring, and dashboard insights. This is built in two batches to keep each implementation manageable.

## Batch 1: Database + Package CRUD + Session Tracking + Patient Integration

### Database Migration (6 new tables, 2 functions, 1 trigger)

| Table | Purpose |
|-------|---------|
| `service_packages` | Package templates (name, type, price, session count, valid_days, individual_price for savings display) |
| `service_package_items` | Treatment breakdown per package (supports multi-treatment bundles) |
| `patient_package_purchases` | Per-patient purchase record with session counters, deferred revenue tracking, status lifecycle |
| `patient_package_sessions` | Individual session redemptions linked to appointments, with revenue recognition per session |
| `package_notification_rules` | Configurable trigger rules (16 seeded defaults: purchase confirmation through win-back campaigns) |
| `package_notification_log` | Audit trail of every notification sent per purchase |

**Trigger**: `sync_package_session_count` — on INSERT/DELETE to `patient_package_sessions`, automatically updates `sessions_used`, `deferred_revenue_amount`, `revenue_recognized_amount`, and flips status to `completed` when all sessions used.

**Function**: `expire_stale_packages()` — marks active packages as expired when `expires_at` passes.

### New Page: `/packages` — Package Management (3 tabs)

**Tab 1: Package Templates** — CRUD for creating packages (single-treatment, multi-treatment, unlimited). Set price, session count, expiry, treatment items. Shows savings % vs a-la-carte pricing.

**Tab 2: Active Purchases** — Table of all patient purchases with status badges, progress bars (sessions used/total), expiry countdown, deferred revenue. Filter by status/patient. Actions: redeem session, pause, cancel. At-risk highlight for packages with low utilization + approaching expiry.

**Tab 3: Notification Rules** — Manage the 16 default trigger rules. Toggle active/inactive, edit tone, preview AI-generated copy.

### Patient Record Integration

Add a "Packages" tab to `PatientRecord.tsx` showing:
- Active packages with punch-card progress bar (filled/empty dots)
- Sessions remaining, expiry date, assigned provider
- "Book Session" and "Redeem Session" buttons
- Completed/expired package history
- AI recommendation card: "Based on this patient's history, suggest Package X — they'd save $Y"

### AI Edge Function: `ai-package-engine`

A single edge function with multiple modes:

- **`recommend_package`**: Given a patient's appointment history and available packages, ranks best package matches with savings rationale and synergistic treatment suggestions (e.g., "Patients who do Laser Hair Removal often add Chemical Peels — consider the Glow Bundle")
- **`generate_notification`**: Given patient context + trigger type + tone, generates personalized email/SMS copy (subject + body JSON)
- **`risk_score`**: Given active purchases with usage patterns, returns ranked at-risk list with scores and suggested actions
- **`dashboard_insights`**: Generates weekly narrative summary of package performance, revenue trends, and at-risk alerts

### Navigation

- Add "Packages" link to sidebar under ADMIN section (Package icon)

## Batch 2: Notification Engine + Dashboard + Checkout Integration (future)

- Notification job edge function (evaluates rules, generates AI copy, logs sends)
- Full admin dashboard with KPI cards (active packages, deferred revenue, completion rate, at-risk count)
- Revenue charts (deferred vs recognized per month)
- Appointment checkout integration (prompt to redeem package session)
- Booking upsell integration (AI suggests packages at booking confirmation)

## Files Changed (Batch 1)

| File | Change |
|------|--------|
| Migration SQL | 6 tables, 1 trigger function, 1 expiry function, seed 16 notification rules |
| `src/pages/Packages.tsx` | New — 3-tab package management page |
| `supabase/functions/ai-package-engine/index.ts` | New — multi-mode AI function for recommendations, notifications, risk scoring |
| `src/pages/PatientRecord.tsx` | Add "Packages" tab with progress bars and AI recommendations |
| `src/App.tsx` | Add `/packages` route |
| `src/components/AppSidebar.tsx` | Add nav link |
| `src/components/MobileNav.tsx` | Add nav link |

## AI Strategy — Profit Maximization

1. **Upsell at the right moment**: AI recommends packages when a patient's visit pattern shows they'd save money on a bundle — shown on patient record and at checkout
2. **Synergistic cross-sell**: AI identifies treatment combinations that complement each other (e.g., "Botox patients often add HydraFacials") and suggests bundles
3. **Prevent abandonment**: AI scores at-risk packages daily and auto-generates personalized re-engagement messages before sessions expire unused
4. **Win-back expired patients**: Post-expiry notifications with AI-crafted offers to re-purchase
5. **Supply tracking**: When sessions drop below threshold, AI crafts "running low" messages mentioning exact remaining count and suggesting renewal
6. **Historical purchase intelligence**: AI analyzes past package buyers to identify patterns (who buys, what they buy next, optimal renewal timing) and surfaces these as admin insights

