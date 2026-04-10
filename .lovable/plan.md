

# Patient Portal Auth + Remote Intake Branding + E-Consent

## What We're Building

Three patient-facing improvements that complete the Batch D workflow items:

1. **Patient Portal with real authentication** — Replace the insecure email-lookup with proper login/signup so patients access only their own data
2. **Remote Intake branding & polish** — Make the standalone intake wizard feel like a branded, professional experience
3. **E-consent with signature capture** — Add a proper consent/e-signature step to both intake and portal

---

## 1. Patient Portal Authentication

**Current problem:** Anyone can type any email and see that patient's full medical records, appointments, and labs. No password, no verification.

**Solution:** Add Supabase Auth for patients. When a patient signs up, link their auth account to their `patients` record via email match.

### Database Changes
- Add `auth_user_id` column to `patients` table (nullable UUID, unique) to link a patient record to their auth account
- Add RLS policy: patients can only SELECT their own row (`auth.uid() = auth_user_id`)
- Add RLS policies on `appointments`, `patient_package_purchases`, `clinical_notes`, `hormone_visits` scoped to patient's own `patient_id`

### Frontend Changes (`src/pages/PatientPortal.tsx`)
- Replace email-lookup login with real email/password signup + login (reuse auth patterns from `Auth.tsx`)
- Add Google OAuth option via `lovable.auth.signInWithOAuth`
- On first login, auto-link: match `auth.user.email` to `patients.email`, set `auth_user_id`
- After auth, fetch patient data using the linked `patient_id` — RLS ensures they only see their own records
- Add password reset flow

### UX Flow
```text
/portal → Login/Signup card → Email+Password or Google
  ↓ (first time)
  Auto-link auth account to patient record by email
  ↓
  Dashboard: Appointments | Packages | Records tabs (existing UI)
  ↓
  Sign Out button in header
```

---

## 2. Remote Intake Branding

**Current state:** Functional 5-step wizard but plain. Needs standalone branded feel.

### Changes (`src/pages/RemoteIntake.tsx`)
- Add clinic logo/branding area in header (driven by `?clinic=` query param)
- Add a welcome splash step (Step 0) before demographics: clinic name, what to expect, estimated time
- Add progress percentage indicator alongside step pills
- Add subtle gradient background and branded card styling
- Add "Save & Continue Later" — store partial form in `localStorage` keyed by email
- Mobile-first responsive polish (the stepper already scrolls horizontally)

---

## 3. E-Consent & E-Signature

**Current state:** Two checkboxes ("I consent" + "telehealth consent") with no legal weight or audit trail.

### Database Changes
- Create `e_consents` table: `id`, `patient_id`, `consent_type` (enum: general, telehealth, hipaa), `consent_text`, `signature_data` (text — base64 of canvas), `ip_address`, `user_agent`, `signed_at`, `created_at`
- RLS: patients can INSERT their own consents and SELECT their own; staff can SELECT all

### Frontend Changes
- Create `src/components/SignaturePad.tsx` — HTML5 canvas signature capture component (draw-to-sign)
- Update Remote Intake Step 4 to show full consent text + signature pad instead of checkboxes
- Update Patient Portal Records tab to show signed consents
- Each consent stores: full legal text shown, signature image, timestamp, IP, user agent

### Consent Flow
```text
Step 4 (Goals & Consent):
  ├── Treatment goals (existing)
  ├── General Consent — expandable full text + signature pad
  ├── Telehealth Consent — expandable full text + signature pad
  └── Submit (disabled until both signed)
```

---

## Files Changed

| Action | File |
|--------|------|
| Create | `src/components/SignaturePad.tsx` |
| Create | Migration: `e_consents` table + `patients.auth_user_id` column + patient-scoped RLS |
| Modify | `src/pages/PatientPortal.tsx` — Replace email lookup with real auth |
| Modify | `src/pages/RemoteIntake.tsx` — Branding, welcome step, signature consent |

## Estimated Scope
- 1 migration (~40 SQL statements)
- 1 new component, 2 major page rewrites
- ~600 lines of new/changed code

