

# Front Desk & Scheduler User Stories — Implementation Plan

## Gap Analysis: 23 Stories, 6 Epics

### EP-FD01: Account & Security (3 stories)
| Story | Title | Status | Gap |
|-------|-------|--------|-----|
| US-FD001 | Change My Password | **PARTIAL** | Settings has basic form; needs AI password strength scoring, lockout, session invalidation |
| US-FD002 | Set Up Two-Factor Authentication | **PARTIAL** | Settings has MFA toggle; needs TOTP QR, backup codes, trusted devices |
| US-FD003 | Configure Notification Preferences | **MISSING** | No per-user notification preference UI with channel/type toggles + AI suggestions |

### EP-FD02: Patient Registration & Identity (4 stories)
| Story | Title | Status | Gap |
|-------|-------|--------|-----|
| US-FD004 | Register a New Patient | **PARTIAL** | Basic add form exists; needs AI duplicate detection, email/phone validation, referral source, emergency contact, shell records |
| US-FD005 | Verify Patient Identity at Arrival | **MISSING** | No identity verification flow with photo ID check |
| US-FD006 | Collect Digital Consent Forms | **MISSING** | No consent_templates / patient_consents tables, no digital signature flow |
| US-FD007 | Verify Insurance Eligibility | **PARTIAL** | patient_insurance table exists; no eligibility check UI or AI cost estimation |

### EP-FD03: Check-In & Check-Out (4 stories)
| Story | Title | Status | Gap |
|-------|-------|--------|-----|
| US-FD008 | Check Patient In | **PARTIAL** | FrontDesk.tsx has basic check-in button; needs pre-check validation, AI Patient Brief, room assignment, consent gating |
| US-FD009 | Handle Walk-In Patients | **PARTIAL** | Walk-in dialog exists; needs AI provider recommendation, capacity check, walk-in badge |
| US-FD010 | Check Patient Out | **MISSING** | No checkout flow — checklist, follow-up booking, package credit, AI open-items check |
| US-FD011 | Process Payment at Checkout | **PARTIAL** | Invoices/payments tables exist; no checkout payment UI with package credits, discounts, payment plans |

### EP-FD04: Scheduling (5 stories — shared with admin)
| Story | Title | Status | Gap |
|-------|-------|--------|-----|
| US-FD012 | Book Appointment | **BUILT** | Appointments.tsx has full booking with AI |
| US-FD013 | View Full Clinic Schedule | **BUILT** | MultiProviderCalendar.tsx exists |
| US-FD014 | Handle Cancellations & Reschedules | **PARTIAL** | Cancel exists; needs AI waitlist match, no-show counter, re-engagement draft |
| US-FD015 | Manage Patient Waitlist | **PARTIAL** | Waitlist.tsx exists; needs AI ranking, slot-available SMS, auto-cancel |
| US-FD016 | Send Appointment Reminders | **PARTIAL** | NotificationCenter exists; needs per-appointment reminder send, AI no-show risk badge |

### EP-FD05: Patient Communication (3 stories)
| Story | Title | Status | Gap |
|-------|-------|--------|-----|
| US-FD017 | Handle Inbound Patient Inquiries | **MISSING** | No patient-facing unified inbox with AI intent classification and draft replies |
| US-FD018 | View Patient Communication History | **MISSING** | No communication timeline in patient record |
| US-FD019 | Send Aftercare/Follow-Up Messages | **MISSING** | No aftercare message templates or post-visit automation |

### EP-FD06: Packages, Pricing & Point of Sale (4 stories)
| Story | Title | Status | Gap |
|-------|-------|--------|-----|
| US-FD020 | Present & Sell a Package | **PARTIAL** | Packages page exists; needs patient-facing sale flow, AI recommendation, savings display |
| US-FD021 | Apply Package Credits at Checkout | **MISSING** | No credit application in checkout |
| US-FD022 | Answer Patient Pricing Questions | **MISSING** | No pricing reference/quoting tool with AI package suggestion |
| US-FD023 | Enroll Patient in Membership | **PARTIAL** | MembershipBilling page exists; needs front-desk enrollment flow, AI tier recommendation |

### Summary: 2 Built | 10 Partial | 11 Missing

---

## Implementation Batches

### Batch A — Check-In/Check-Out Core + AI (Highest value)
**Stories:** US-FD008, US-FD009, US-FD010, US-FD011

**Database:**
- `consent_templates` table (name, body, procedure_types, is_active)
- `patient_consents` table (patient_id, template_id, encounter_id, signed_at, signature_data, status)
- `patient_communication_log` table (patient_id, channel, direction, content, template_used, delivery_status, staff_user_id)
- Add `no_show_count`, `late_cancel_count` to patients table

**Edge Functions:**
- `ai-patient-brief` — Lovable AI generates a one-paragraph patient brief at check-in (last visit, protocol status, churn risk, key notes)
- `ai-checkout-review` — AI checks for open items (unsigned notes, missing consent) before checkout closes

**UI Changes:**
- Enhance FrontDesk.tsx check-in flow: pre-check validation panel (consent status, clearance), room assignment dropdown, AI Patient Brief card, check-in notes
- Walk-in enhancement: AI provider recommendation based on capacity/expertise, walk-in badge on cards
- New checkout panel: checklist (payment, follow-up, package credits), AI follow-up date suggestion, "Complete Checkout" action
- Checkout payment: invoice display, apply package credit, apply discount code, record payment method, receipt send

### Batch B — Patient Registration & Consent (EP-FD02)
**Stories:** US-FD004, US-FD005, US-FD006, US-FD007

**Database:**
- Add `emergency_contact_name`, `emergency_contact_phone`, `emergency_contact_relationship`, `referral_source`, `preferred_contact_channel`, `preferred_name`, `sex_at_birth`, `gender_identity` to patients table

**Edge Functions:**
- `ai-patient-registration` — AI validates input (email typo detection, phone formatting, DOB plausibility), checks duplicates, suggests intake forms based on booked procedure

**UI Changes:**
- Enhanced patient registration dialog: full fields per spec, duplicate detection before save, shell record option, referral source picker
- Identity verification panel at check-in: photo ID match confirmation, DOB verification
- Consent form workflow: template list by procedure, one-click send (SMS/email via Twilio), digital signature pad, consent status badges on appointment cards
- Insurance eligibility panel: trigger check, display results, AI cost estimation, manual notes

### Batch C — Communication & Messaging (EP-FD05)
**Stories:** US-FD017, US-FD018, US-FD019, US-FD003

**Edge Functions:**
- `ai-message-classifier` — Lovable AI classifies inbound messages by intent (Appointment Request, Pricing, Complaint, Cancellation, General) and drafts responses
- `ai-aftercare-message` — AI generates personalized aftercare instructions based on procedure type

**Database:**
- `staff_notification_preferences` table (user_id, notification_type, channel, is_enabled, quiet_hours_start, quiet_hours_end)

**UI Changes:**
- Patient Inbox: unified view of SMS/email/portal messages, AI intent badges, AI draft replies, escalation to manager, resolve/archive
- Patient Communication History tab on PatientRecord: timeline of all messages with delivery status
- Aftercare message templates: post-visit auto-send config, manual send with AI personalization
- Notification preferences panel in Settings: per-type channel toggles, quiet hours, AI role-based suggestions

### Batch D — Scheduling Enhancements + POS (EP-FD04 gaps + EP-FD06)
**Stories:** US-FD014, US-FD015, US-FD016, US-FD020, US-FD021, US-FD022, US-FD023

**Edge Functions:**
- `ai-waitlist-rank` — AI ranks waitlisted patients by fill probability
- `ai-package-recommend` — AI recommends packages based on patient history and calculates savings vs. a la carte

**UI Changes:**
- Cancel/reschedule enhancements: AI waitlist match on cancellation, no-show counter display, AI re-engagement message draft
- Waitlist enhancements: AI ranking, slot-available SMS send, auto-expire stale entries
- Per-appointment reminder send button with AI no-show risk badge and personalized message
- Package sale flow from patient record: AI recommendation, savings display, one-click sell
- Pricing reference/quoting tool: search treatments, build multi-item quote, member vs. non-member pricing, email/SMS quote
- Membership enrollment from front desk: tier comparison, AI optimal tier recommendation, projected savings

### Batch E — Security Hardening (EP-FD01 remaining)
**Stories:** US-FD001, US-FD002

**Edge Functions:**
- `ai-password-strength` — AI scores password and flags name/clinic patterns

**UI Changes:**
- Enhanced password change: AI real-time strength scoring, lockout after 3 failures, session invalidation
- MFA setup: TOTP QR code enrollment, backup codes display, trusted devices list

---

## Technical Notes

- All AI features use Lovable AI Gateway (`google/gemini-3-flash-preview` default) via edge functions
- AI degrades gracefully — all workflows function without AI if gateway is unavailable
- Twilio (already connected) used for SMS consent links, reminders, and patient communication
- All patient-facing actions logged to `patient_communication_log` and audit trail
- Role enforcement: front_desk role cannot access clinical chart content, pricing config, or provider analytics

## Batch Order Rationale

Batch A first because check-in/check-out is the front desk's most time-critical workflow and delivers the AI Patient Brief — the most impactful AI feature. Batch B follows with registration (the patient's first touchpoint). Batch C adds communication tools. Batch D enhances existing scheduling and adds POS. Batch E hardens security last since basic auth already works.

