---
name: Facility-scoped MD dashboard
description: clinic_id on appointments/encounters, clinic filter on MD oversight, facility cards on dashboard
type: feature
---

- `appointments` and `encounters` have `clinic_id` (uuid, nullable, FK → clinics)
- `clinics` table has phone, timezone, city, state columns
- Booking dialog in Appointments.tsx includes clinic selector
- TelehealthVisit auto-copies clinic_id from appointment to encounter on creation
- MdOversight has a clinic filter dropdown scoped to MD's assigned clinics via md_coverage_assignments
- MdOversightDashboard has "My Facilities" cards showing pending chart counts per clinic
- ContractsAdmin clinic form captures phone, city, state, timezone
