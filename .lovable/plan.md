

# Clinical Photos: Before/After Gallery with Tagging and Comparison

## What We're Building

A clinical photo management system integrated into the Patient Record page. Staff can upload photos tagged by treatment type and body area, then compare before/after images side-by-side. Photos stored in Lovable Cloud storage.

## Database & Storage Changes

**New storage bucket**: `clinical-photos` (private, staff-only access via RLS)

**New table**: `clinical_photos`
- `id` uuid PK
- `patient_id` uuid NOT NULL
- `uploaded_by` uuid (auth.uid of staff)
- `storage_path` text NOT NULL (path in bucket)
- `treatment_id` uuid nullable (FK to treatments)
- `body_area` text (e.g. "face", "abdomen", "arms", "neck", "legs", "back", "chest")
- `photo_type` text NOT NULL default 'before' (before | after | progress)
- `taken_at` date (date photo was taken)
- `notes` text nullable
- `encounter_id` uuid nullable (link to encounter)
- `created_at` timestamptz default now()

RLS: Staff can SELECT/INSERT/UPDATE. Patients can SELECT own photos.

## UI Components

**1. PhotoUpload component** (`src/components/clinical-photos/PhotoUpload.tsx`)
- Drag-and-drop or click-to-upload (multiple files)
- Tag each photo: treatment (dropdown from treatments table), body area (preset list), photo type (before/after/progress), date taken
- Uploads to `clinical-photos` bucket, inserts metadata row

**2. PhotoGallery component** (`src/components/clinical-photos/PhotoGallery.tsx`)
- Grid of thumbnails filtered by body area and treatment
- Filter bar: body area chips, treatment dropdown, date range
- Click to enlarge in a lightbox dialog

**3. ComparisonView component** (`src/components/clinical-photos/ComparisonView.tsx`)
- Side-by-side layout: left = before, right = after
- Dropdown to select which before/after pair (by body area + treatment)
- Slider overlay option (drag divider left/right over stacked images)

**4. Integration into PatientRecord.tsx**
- New "Photos" tab alongside existing tabs (Appointments, Notes, Labs, etc.)
- Shows PhotoGallery + ComparisonView + upload button

## Files Changed

| Action | File | Purpose |
|--------|------|---------|
| Migration | `clinical_photos` table + storage bucket + RLS | Schema and storage |
| Create | `src/components/clinical-photos/PhotoUpload.tsx` | Upload with tagging |
| Create | `src/components/clinical-photos/PhotoGallery.tsx` | Filterable grid gallery |
| Create | `src/components/clinical-photos/ComparisonView.tsx` | Side-by-side comparison |
| Modify | `src/pages/PatientRecord.tsx` | Add Photos tab |

## Estimated Scope
- 1 migration (table + bucket + RLS)
- 3 new components (~400 lines total)
- 1 page modification
- ~500 lines new/changed code

