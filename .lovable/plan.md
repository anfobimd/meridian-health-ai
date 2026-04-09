

# Provider Marketplace — Integrated with Meridian EHR

## Overview

A marketplace module that lets clinics activate a provider availability/booking system. Providers set their availability windows, declare their skills/modalities, and the system uses AI to match patients with the right provider based on skills, availability, and clinic needs. This draws from the Dr. Z Collective model (flat-fee membership, modality-based pricing, provider independence).

## Database Migration (5 new tables, 1 altered table)

### New Tables

**`marketplace_config`** — Per-clinic marketplace activation and settings
- `id`, `is_active`, `clinic_name`, `membership_tiers` (jsonb — founding/standard rates from the doc), `modalities` (jsonb — injectables, weight_loss, laser), `laser_hourly_rate` (default $150), `created_at`, `updated_at`

**`provider_skills`** — What each provider can do
- `id`, `provider_id`, `skill_name` (e.g. "Botox", "CO2 Laser", "GLP-1"), `modality` (injectables/weight_loss/laser), `certification_level` (beginner/intermediate/expert), `verified_at`, `created_at`

**`provider_availability`** — When providers are available
- `id`, `provider_id`, `day_of_week` (0-6), `start_time`, `end_time`, `is_recurring`, `specific_date` (for one-offs), `room_preference_id`, `is_active`, `created_at`

**`marketplace_bookings`** — Patient-facing booking records that link to appointments
- `id`, `patient_id`, `provider_id`, `treatment_id`, `appointment_id` (links to existing appointments table), `requested_at`, `status` (pending/confirmed/completed/cancelled), `ai_match_reasoning` (text), `created_at`

**`provider_memberships`** — Track provider membership tier and billing
- `id`, `provider_id`, `tier` (founding_all/single/double/triple), `modalities` (text[]), `monthly_rate`, `start_date`, `is_active`, `created_at`, `updated_at`

### Alter `providers` table
- Add `marketplace_enabled` (boolean, default false)
- Add `marketplace_bio` (text) — public-facing bio for the marketplace
- Add `modalities` (text[]) — which modalities they offer
- Add `hourly_rate_override` (numeric, nullable)

## AI Edge Function: `ai-smart-schedule` (update existing)

Enhance the existing smart-schedule function to also handle marketplace matching:
- Accept a `mode: "marketplace_match"` parameter
- Given a patient's requested treatment + preferred date/time, use AI to rank available providers by: skill match, availability overlap, patient history, provider ratings, room/device availability
- Return ranked provider list with reasoning for each match

## New Page: `/marketplace` — Provider Marketplace

**3 tabs:**

**Tab 1: Marketplace Settings (admin)**
- Toggle marketplace active/inactive
- Configure membership tiers and rates (pre-populated from the Dr. Z model)
- Manage modality definitions (Injectables, Weight Loss, Laser)
- Set laser hourly rate

**Tab 2: Provider Profiles**
- Grid of marketplace-enabled providers with their skills, availability summary, and modalities
- Click to expand: see full availability calendar, skill badges, membership tier
- "Edit Profile" dialog: marketplace bio, skills (multi-select with modality grouping), availability schedule builder (day/time grid)
- AI button: "Auto-Generate Profile" — uses AI to write a marketplace bio from the provider's specialty, credentials, and skills

**Tab 3: Booking & Matching**
- "Find a Provider" flow: select treatment → select date/time → AI returns ranked provider matches with reasoning
- Shows availability conflicts, device requirements, room suggestions
- "Book" button creates both a marketplace_booking and an appointment record
- Recent bookings table with status badges

## Updated Pages

**Providers.tsx** — Add "Marketplace" toggle badge on each provider card. Add "Enable Marketplace" button that opens a quick-setup dialog for skills + availability.

**Appointments.tsx** — Show marketplace booking badge on appointments that originated from the marketplace.

## Navigation

- Add "Marketplace" link to sidebar under ADMIN section (Store icon)
- Add to mobile nav

## Files Changed

| File | Change |
|------|--------|
| Migration SQL | 5 new tables, alter providers |
| `src/pages/Marketplace.tsx` | New — 3-tab marketplace management page |
| `supabase/functions/ai-smart-schedule/index.ts` | Update — add marketplace matching mode |
| `src/pages/Providers.tsx` | Add marketplace toggle + quick setup |
| `src/pages/Appointments.tsx` | Show marketplace booking badge |
| `src/App.tsx` | Add `/marketplace` route |
| `src/components/AppSidebar.tsx` | Add nav link |
| `src/components/MobileNav.tsx` | Add mobile nav link |

## AI Integration Points

1. **Provider Profile Generation** — AI writes marketplace bio from credentials/skills
2. **Smart Matching** — AI ranks providers for a requested treatment+time, explaining reasoning
3. **Availability Optimization** — AI suggests optimal availability windows based on booking patterns
4. **Skill Verification Suggestions** — AI flags when a provider's listed skills don't align with their encounter history

