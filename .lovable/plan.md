

# Rooms, Devices & Provider Assignment System

## What Exists Today
Nothing. There are no `rooms` or `devices` tables, no room assignment on appointments, and no provider-to-room mapping. The previous plan was proposed but not approved or built.

## What We Will Build

### 1. Database Migration (3 new tables, 1 altered table)

**`rooms`** — Physical treatment rooms
- `id`, `name` (e.g. "Room 1", "Laser Suite A"), `room_type` (exam / procedure / consult), `is_active`, `sort_order`
- `assigned_provider_id` (uuid, nullable) — default provider assigned to this room

**`devices`** — Equipment and lasers (exclusive-use resources)
- `id`, `name` (e.g. "PicoSure Laser"), `device_type`, `is_active`, `maintenance_notes`
- `room_id` (uuid, nullable) — which room this device lives in

**`treatment_device_requirements`** — Which treatments need which devices
- `id`, `treatment_id`, `device_id`, `is_required` (hard vs. preferred)

**Alter `appointments`** — Add `room_id`, `device_id`, `roomed_at` columns. Add `roomed` value to the `appointment_status` enum (between `checked_in` and `in_progress`).

RLS: open read/write for anon + authenticated (matching existing pattern).

### 2. New Page: Rooms & Devices (`/rooms-devices`)

A management page with two tabs:

**Rooms Tab**
- List all rooms with name, type, assigned provider, and devices in that room
- Create / edit room dialog: name, type, assign a default provider (dropdown from providers table)
- Toggle active/inactive

**Devices Tab**
- List all devices with name, type, assigned room
- Create / edit device dialog: name, type, assign to a room, maintenance notes
- Toggle active/inactive
- Link treatments to required devices (multi-select)

### 3. AI Smart-Schedule Edge Function (`ai-smart-schedule`)

Called when booking or rooming a patient. Uses Lovable AI to:
- **Detect device conflicts**: Block double-booking a laser across overlapping appointments
- **Recommend a room**: Based on treatment requirements, device location, and availability
- **Auto-assign provider**: If no provider selected, pick best match by specialty, room assignment, and current load

### 4. Updated Appointments Page

- Booking dialog: after selecting a treatment, show required devices and auto-suggest room + provider via AI
- Check-in flow: "Room Patient" button appears at `checked_in` status, opens AI-powered room picker showing available rooms with reasoning
- Status flow becomes: `booked → checked_in → roomed → in_progress → completed`
- Room and device badges shown on appointment cards

### 5. Navigation

- Add "Rooms & Devices" link to sidebar (under ADMIN section) and mobile nav

### Files Changed

| File | Change |
|------|--------|
| New migration SQL | Create 3 tables, alter appointments, update enum |
| `src/pages/RoomsDevices.tsx` | New CRUD page for rooms and devices |
| `supabase/functions/ai-smart-schedule/index.ts` | New AI edge function |
| `src/pages/Appointments.tsx` | Room/device selection, rooming flow, AI suggestions |
| `src/App.tsx` | Add `/rooms-devices` route |
| `src/components/AppSidebar.tsx` | Add nav link |
| `src/components/MobileNav.tsx` | Add mobile nav link |

