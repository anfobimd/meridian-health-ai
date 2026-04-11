

# AI Maximization Audit — Admin Plan vs. 80 Specified AI Features

## Assessment: The current plan captures ~35 of 80 AI features (44%)

The plan lists 10 high-level AI integration points but treats many as single items when the stories specify 3-5 distinct AI behaviors each. Here is the gap analysis and an upgraded plan.

---

## What the Current Plan Covers Well
- Clinic Briefing (dashboard auto-load) -- maps to US-A012, US-A019
- Scheduling intelligence (provider matching) -- maps to US-A010 partially
- Pricing benchmarks -- maps to US-A006 partially
- Package optimization -- maps to US-A007 partially
- Chart prediction -- maps to US-A016 partially
- Report summaries -- maps to US-A022 partially

## What's Missing or Underspecified (45 AI features)

### EP-A01: Security (6 AI features missing)
- **Password strength scoring** with crack-time estimate (US-A001)
- **Pattern detection** for name/clinic-name passwords (US-A001)
- **Unusual login detection** triggering MFA re-challenge (US-A002)
- **Repeated reset flagging** -- 3+ resets in 30 days = account-sharing alert (US-A003)

### EP-A02: Catalog Config (18 AI features, plan covers ~5)
- **Template matching** on procedure add -- AI suggests best chart template (US-A004)
- **Deactivation impact** -- flag open appointments in next 30 days (US-A004)
- **GFE auto-recommendation** based on invasive procedure patterns (US-A004)
- **Dosing auto-suggest** with credential restrictions on medication add (US-A005)
- **Formulary interaction check** -- new med vs existing formulary (US-A005)
- **Monitoring requirement detection** -- e.g., "Tirzepatide requires quarterly HbA1c" (US-A005)
- **Revenue impact projection** for price changes (US-A006)
- **Below-cost alert** on pricing (US-A006)
- **Package expiration alerts** for patients with unredeemed credits (US-A007)
- **Underutilized window detection** for clinic hours (US-A008)
- **Coverage gap detection** -- demand vs availability (US-A008)
- **Closure bottleneck warning** (US-A008)
- **High-risk clearance flagging** -- <30 charts for filler/hormone (US-A009)
- **Credentialing readiness check** -- supervised session counts vs platform average (US-A009)

### EP-A03: Scheduling (15 AI features, plan covers ~4)
- **No-show history warning** with deposit recommendation (US-A010)
- **Duration auto-selection** -- new vs returning patient (US-A010)
- **Medication contraindication check** at booking time (US-A010)
- **Third-reminder auto-scheduling** for no-show-risk patients (US-A011)
- **Personalized reminder tone** based on engagement history (US-A011)
- **Optimal send-time** per patient's historical response pattern (US-A011)
- **"We missed you" draft** for no-shows, 2hr after (US-A011)
- **Day Brief in morning notification** with complexity + prep notes (US-A012)
- **Over-scheduling detection** with move suggestions (US-A012)
- **Back-to-back complexity detection** (US-A012)
- **Running-behind detection** with buffer adjustment (US-A013)
- **Provider move suggestion** for overrunning appointments (US-A013)
- **Waitlist ranking by fill probability** (US-A014)
- **Predicted cancellation surfacing** (US-A014)
- **Re-engagement message drafting** for no-shows (US-A015)

### EP-A04: Oversight (8 AI features, plan covers ~2)
- **Overdue charting prediction** per provider (US-A016)
- **Template usability detection** -- specific procedures with systemic late charting (US-A016)
- **Weekly chart completion digest** with trend comparison (US-A016)
- **Administrative completeness scoring** 0-100 (US-A017)
- **Pattern detection** -- "Missing consent most common Friday PM" (US-A017)
- **ICD-10/CPT consistency check** against documented procedure (US-A017)

### EP-A05: Analytics (8 AI features, plan covers ~2)
- **AI coaching summary** per provider for 1:1s (US-A020)
- **Correction rate trending** with documentation check-in recommendation (US-A020)
- **Duration anomaly detection** -- significantly longer/shorter than peers (US-A020)
- **Revenue growth/decline identification** by procedure (US-A021)
- **Hours discrepancy flagging** -- reported vs appointment-based (US-A022)
- **Revenue end-of-month prediction** (US-A019)

### EP-A06: Platform (10 AI features, plan covers ~2)
- **No-MD compliance gap** flagging per clinic (US-A023)
- **Contract expiration prompts** (US-A023)
- **Optimal sampling rate recommendation** per clinic (US-A024)
- **MD review velocity alert** with redistribution suggestion (US-A024)
- **No-backup-MD contingency risk** (US-A024)
- **Full monthly intelligence report** -- narrative, named, actionable (US-A025)
- **Duplicate catalog item detection** (US-A026)
- **Systemic documentation score monitoring** per catalog item (US-A026)
- **Per-clinic highest-leverage improvement** identification (US-A027)
- **Best-practice clinic identification** per metric category (US-A027)
- **Automation rule optimization** suggestions (US-A028)
- **Message fatigue detection** -- overlapping rules within 2hrs (US-A028)

---

## Upgraded Plan: AI-Maximized Admin Redesign

The batch structure stays the same but each batch now explicitly includes all specified AI behaviors.

### Batch 1: Sidebar + Command Center (10 AI features)
Same sidebar restructure, plus dashboard AI:
1. Auto-loading Clinic Briefing with Day Brief
2. Action Item Detection (overdue charts, waitlist matches, coverage gaps, contract expirations)
3. Revenue end-of-month prediction on dashboard
4. Provider scoreboard with AI coaching summaries
5. Unusual login detection banner (security)
6. Password strength scoring in Settings (when changing)
7. Repeated reset flagging in User Management
8. No-MD compliance gap alert card
9. Contract expiration alert card
10. No-backup-MD contingency risk card

### Batch 2: Clinic Configuration (18 AI features)
- **Treatments page**: Template matching on add, deactivation impact scan, GFE auto-recommendation
- **Medications page**: Dosing auto-suggest, formulary interaction check, monitoring requirement detection
- **Pricing page**: Platform benchmark comparison, revenue impact projection, below-cost alert
- **Packages page**: Bundle recommendation from booking history, optimal margin calculator, performance dashboard, patient expiration alerts
- **Clinic Hours page**: Underutilized window detection, coverage gap analysis, closure bottleneck warning
- **Provider Clearances**: High-risk clearance flagging, credentialing readiness check

### Batch 3: Scheduling Command (19 AI features)
- **Booking flow**: Provider matching, no-show warning + deposit recommendation, duration auto-select, medication contraindication check
- **Notifications**: Third-reminder auto-scheduling, personalized tone, optimal send-time, "We missed you" draft
- **Provider daily notify**: Day Brief with complexity/prep, over-scheduling detection, back-to-back complexity flag
- **Calendar Grid**: Running-behind detection, utilization scores, provider move suggestion, open-slot waitlist promotion
- **Waitlist**: Fill probability ranking, predicted cancellation surfacing, AI-drafted slot notifications
- **Cancellations**: Re-engagement message drafting, no-show deposit recommendation (3+ no-shows)

### Batch 4: Oversight + Analytics + Platform (23 AI features)
- **Chart Review**: Overdue prediction, template usability detection, weekly digest, admin completeness 0-100 scoring, pattern detection (Friday PM consent gaps), ICD-10/CPT consistency check
- **Analytics Dashboard**: AI coaching summary per provider, correction rate trending, duration anomaly detection, revenue growth/decline, hours discrepancy flagging
- **Reports**: Executive summary per report, prior-period comparison, anomaly detection
- **Platform Intelligence**: Full monthly narrative report, duplicate catalog detection, systemic doc score monitoring, per-clinic leverage identification, best-practice surfacing, sampling rate optimization, MD velocity alerts, automation rule optimization, message fatigue detection

### Edge Functions Required (new or extended)
| Function | Modes Added |
|----------|-------------|
| `ai-clinic-briefing` (new) | `daily_brief`, `action_items`, `revenue_forecast` |
| `ai-provider-coach` (extend) | `coaching_summary`, `duration_anomaly`, `correction_trend` |
| `ai-catalog-advisor` (new) | `template_match`, `interaction_check`, `gfe_recommend`, `dosing_suggest`, `monitoring_req` |
| `ai-schedule-optimizer` (new) | `provider_match`, `contraindication_check`, `duration_estimate`, `no_show_risk`, `running_behind`, `waitlist_rank`, `cancel_predict` |
| `ai-notification-engine` (new) | `personalize_tone`, `optimal_time`, `re_engage_draft`, `slot_available_draft` |
| `ai-chart-review` (extend) | `admin_completeness_score`, `pattern_detect`, `code_consistency`, `overdue_predict`, `template_usability` |
| `ai-monthly-report` (extend) | `full_narrative`, `clinic_leverage`, `best_practice`, `sampling_recommend` |
| `ai-financial-advisor` (extend) | `revenue_impact`, `below_cost`, `growth_decline`, `hours_discrepancy` |
| `ai-password-strength` (exists) | Already built |
| `ai-automation-advisor` (new) | `rule_optimize`, `fatigue_detect`, `rule_suggest` |

### Implementation Approach
All AI calls go through Lovable AI Gateway via edge functions using `google/gemini-3-flash-preview`. Each AI feature is a mode within a domain-specific edge function. Client-side code calls `supabase.functions.invoke()` and renders results. AI panels degrade gracefully -- if the call fails, hide the panel and show the non-AI workflow.

---

## Summary

The current plan is a solid structural redesign but only surfaces ~44% of the 80 AI features specified in the stories. The upgraded plan ensures every AI feature from every story has a specific implementation point, edge function mode, and UI surface. The batch structure is unchanged -- only the density of AI integration per batch increases.

Approve to begin Batch 1 with the expanded AI feature set?

