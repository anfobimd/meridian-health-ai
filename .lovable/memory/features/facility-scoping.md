---
name: Facility-scoped MD dashboard
description: clinic_id on appointments/encounters, clinic filter on MD oversight, facility cards on dashboard, provider-clinic assignments
type: feature
---

- `appointments` and `encounters` have `clinic_id` (uuid, nullable, FK → clinics)
- `clinics` table has phone, timezone, city, state columns
- `provider_clinic_assignments` table links any provider to clinics with role_at_clinic and is_primary
- Booking dialog in Appointments.tsx includes clinic selector
- TelehealthVisit auto-copies clinic_id from appointment to encounter on creation
- MdOversight has a clinic filter dropdown scoped to MD's assigned clinics via md_coverage_assignments
- MdOversightDashboard has "My Facilities" cards showing pending chart counts per clinic
- ContractsAdmin has 3 tabs: Contracts, Clinics & Staff (with inline provider chips), All Assignments
- "Assign Provider" dialog lets admins link providers to clinics with role + primary flag
