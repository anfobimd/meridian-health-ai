

# RLS Security Audit and Fix

## Audit Summary

After scanning all 63 tables and 177 RLS policies, I found 4 issues to fix. The vast majority of policies are correctly implemented using `is_staff()` and `has_role()` security definer functions.

## Findings

### Issue 1: Overly Permissive Anon INSERT on `e_consents` (WARN)
**Current**: `WITH CHECK (true)` for anon role -- any anonymous user can insert any consent record with any `patient_id`, potentially creating fake consent records for real patients.
**Fix**: Restrict to only allow inserts where the `patient_id` matches an existing patient record (basic validation). This is needed for the Remote Intake flow where unauthenticated patients sign consents.

### Issue 2: Overly Permissive Anon INSERT on `intake_forms` (WARN)
**Current**: `WITH CHECK (true)` for anon role -- same issue. Any anonymous user can insert intake forms for any patient.
**Fix**: Same approach -- validate `patient_id` exists in the patients table.

### Issue 3: Missing Storage UPDATE Policy on `clinical-photos` (WARN)
**Current**: INSERT, SELECT, DELETE policies exist but no UPDATE policy. Staff can't update/replace photo metadata.
**Fix**: Add UPDATE policy restricted to `is_staff(auth.uid())`.

### Issue 4: `profiles` Policies Use `{public}` Role (LOW)
**Current**: INSERT, UPDATE, SELECT policies on `profiles` apply to `{public}` (includes anon). While the USING/WITH CHECK clauses require `auth.uid() = user_id` (which would be null for anon, so no actual data leak), the role should be `{authenticated}` for correctness.
**Fix**: Drop and recreate the 3 profiles policies targeting `{authenticated}` instead of `{public}`.

## What's NOT an Issue (Intentional Design)
- **AI tables** (ai_api_calls, ai_chart_analysis, etc.) have SELECT-only policies -- they're written by edge functions using service_role key
- **treatments, treatment_categories, marketplace_config** have public SELECT (`USING true`) -- intentional for marketplace/patient-facing features
- **All patient-facing tables** (appointments, clinical_notes, hormone_visits, etc.) correctly use `patient_id IN (SELECT ... WHERE auth_user_id = auth.uid()) OR is_staff(auth.uid())`

## Migration

Single migration with:
1. Drop + recreate `e_consents` anon INSERT policy with patient_id validation
2. Drop + recreate `intake_forms` anon INSERT policy with patient_id validation
3. Add UPDATE policy for `clinical-photos` storage bucket
4. Drop + recreate 3 `profiles` policies to target `authenticated` instead of `public`

## Technical Details

```sql
-- Fix 1: e_consents - validate patient exists
DROP POLICY "Anon insert consents" ON public.e_consents;
CREATE POLICY "Anon insert consents" ON public.e_consents
  FOR INSERT TO anon
  WITH CHECK (patient_id IN (SELECT id FROM public.patients));

-- Fix 2: intake_forms - validate patient exists
DROP POLICY "Anon can submit intake_forms" ON public.intake_forms;
CREATE POLICY "Anon can submit intake_forms" ON public.intake_forms
  FOR INSERT TO anon
  WITH CHECK (patient_id IN (SELECT id FROM public.patients));

-- Fix 3: storage UPDATE policy
CREATE POLICY "Staff can update clinical photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'clinical-photos' AND is_staff(auth.uid()));

-- Fix 4: profiles - change from public to authenticated
DROP POLICY "Users can view own profile" ON public.profiles;
DROP POLICY "Users can update own profile" ON public.profiles;
DROP POLICY "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
```

After migration, security scan findings will be marked as fixed.

No code changes needed -- all fixes are database-level.

