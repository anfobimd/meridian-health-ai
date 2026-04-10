

# Scheduling Engine: Slot Generation, Conflict Detection, Availability UI, Booking Calendar

## What We're Building

A deterministic, TypeScript-based scheduling engine that replaces manual date/time entry with a visual calendar showing only valid, bookable slots. No AI/LLM involved -- pure rules and math.

## Existing Foundation

Already in the database:
- `provider_availability` — recurring weekly schedule (day_of_week, start_time, end_time, break_start/end, room_preference_id)
- `provider_availability_overrides` — per-date overrides (PTO, special hours)
- `appointments` — existing bookings with scheduled_at, duration_minutes, provider_id, room_id, device_id
- `rooms` — with room_type and assigned_provider_id
- `devices` — with device_type and room_id
- `treatments` — with duration_minutes

Currently: staff manually types a datetime into an `<input type="datetime-local">` with no validation. AI edge function gives soft suggestions but no hard conflict prevention.

---

## 1. Slot Generation Engine (TypeScript utility)

Create `src/lib/scheduling.ts` with pure functions:

- **`getProviderSlots(providerId, date, treatmentDuration)`** — Cross-references `provider_availability` (for that day_of_week) with `provider_availability_overrides` (for that specific date). Generates 15-minute interval slots within working hours, excluding breaks. Returns array of `{ start: Date, end: Date }`.

- **`getAvailableSlots(providerId, date, treatmentDuration)`** — Takes output of `getProviderSlots`, then filters out slots that overlap with existing `appointments` for that provider on that date. Returns only truly open slots.

- **`checkConflicts(providerId, roomId, deviceId, start, end)`** — Hard validation: queries appointments table to check if provider, room, or device is already booked during the proposed window. Returns `{ hasConflict: boolean, conflicts: { type: 'provider'|'room'|'device', existingAppointment }[] }`.

No database changes needed for this.

---

## 2. Conflict Detection (booking-time validation)

Modify the appointment creation flow in `Appointments.tsx`:

- Before INSERT, call `checkConflicts()` — block submission if any conflict exists
- Show inline conflict warnings: "Dr. Smith is already booked 2:00-2:30" or "Room 3 is in use"
- Also validate on status transitions (rooming) to catch race conditions

---

## 3. Availability Management UI

New page: `src/pages/ProviderSchedule.tsx` (route: `/provider-schedule`)

- **Weekly grid view** per provider: rows = providers, columns = Mon-Sun, cells show shift blocks
- **Edit recurring availability**: click a cell to set start_time, end_time, break_start, break_end, room preference
- **Override management**: add single-date overrides (PTO, half-days, extended hours) with a reason field
- **Bulk actions**: copy one provider's schedule to another, set clinic-wide closures

Uses existing `provider_availability` and `provider_availability_overrides` tables -- no schema changes.

---

## 4. Booking Calendar UI

Replace the datetime-local input in the New Appointment dialog with a visual slot picker:

- **Step 1**: Select patient + treatment (determines duration)
- **Step 2**: Select provider (or "any available")
- **Step 3**: Pick a date from a calendar widget, then see available time slots as clickable chips/buttons
- Slots are color-coded: green = open, gray = unavailable
- If "any provider" selected, show slots across all providers grouped by provider name
- Selecting a slot auto-fills the form; conflict check runs on confirmation

---

## Files Changed

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/lib/scheduling.ts` | Slot generation + conflict detection logic |
| Create | `src/pages/ProviderSchedule.tsx` | Availability management UI |
| Modify | `src/pages/Appointments.tsx` | Replace datetime input with slot picker, add conflict blocking |
| Modify | `src/App.tsx` | Add `/provider-schedule` route |
| Modify | `src/components/AppSidebar.tsx` | Add Provider Schedule nav link |

No database migrations needed -- all tables already exist.

## Estimated Scope
- 1 new utility file (~150 lines)
- 1 new page (~300 lines)
- 1 major page modification
- 2 minor file edits
- ~550 lines total

