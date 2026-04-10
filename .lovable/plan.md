

# Security Overhaul: Authentication + RLS Lockdown

## Current State
- **236 RLS warnings**: Every table has `USING (true)` / `WITH CHECK (true)` for INSERT and UPDATE on both `anon` and `authenticated` roles. Any anonymous user can read, insert, and modify all patient records, billing data, clinical notes, and AI oversight data.
- **No authentication**: Zero auth code exists in the frontend. No login page, no auth context, no route protection.
- **`user_roles` table exists** with `has_role()` function already built — the infrastructure is ready, just unused.

## Plan (3 batches)

### Batch 1: Authentication System
Build login/signup UI and auth context to gate all internal routes.

**Files to create:**
- `src/pages/Auth.tsx` — Login/signup form (email + password, Google OAuth)
- `src/pages/ResetPassword.tsx` — Password reset page
- `src/contexts/AuthContext.tsx` — Auth provider with `onAuthStateChange`, session state, role loading from `user_roles`
- `src/components/ProtectedRoute.tsx` — Wrapper that redirects unauthenticated users to `/auth`

**Files to modify:**
- `src/App.tsx` — Wrap with `AuthProvider`, protect internal routes with `ProtectedRoute`, add `/auth` and `/reset-password` routes
- `src/components/AppSidebar.tsx` — Add logout button, show current user

**Database migration:**
- Create `profiles` table (id, user_id FK, display_name, avatar_url) with trigger to auto-create on signup
- RLS: users can only read/update their own profile

**Auth config:**
- Enable Google OAuth via `configure_auth`
- Do NOT enable auto-confirm (email verification required)

### Batch 2: RLS Policy Lockdown
Replace all `true` policies with role-scoped rules. Tables fall into 4 tiers:

| Tier | Tables | Rule |
|------|--------|------|
| **Service-only** | `ai_api_calls`, `ai_chart_analysis`, `ai_md_consistency`, `ai_oversight_reports`, `ai_provider_intelligence`, `ai_prompts`, `ai_doc_checklists`, `coaching_actions` | Drop anon policies. Authenticated SELECT only. INSERT/UPDATE restricted to `service_role` (edge functions use service key, so client policies become deny-all for writes). |
| **Staff (admin + provider + front_desk)** | `patients`, `appointments`, `encounters`, `clinical_notes`, `hormone_visits`, `lab_results`, `lab_orders`, `prescriptions`, `invoices`, `invoice_items`, `payments`, `providers`, `treatments`, `rooms`, `devices`, `chart_templates`, `chart_template_*`, `encounter_field_responses`, `protocol_*`, `provider_*`, `marketplace_*`, `package_*`, `service_packages`, `service_package_items`, `proforma_scenarios`, `quotes`, `quote_items`, `membership_invoices` | Drop anon policies. Authenticated users with any `app_role` can SELECT. INSERT/UPDATE scoped to `has_role(auth.uid(), 'admin')` OR `has_role(auth.uid(), 'provider')` OR `has_role(auth.uid(), 'front_desk')` as appropriate per table. |
| **Audit** | `audit_logs` | Authenticated INSERT only (via `auth.uid() = user_id`). SELECT for admin only. No UPDATE/DELETE. |
| **Public-read** | `treatments`, `treatment_categories`, `marketplace_config`, `oversight_config` | Keep SELECT for anon. INSERT/UPDATE admin-only. |

**Single migration** with ~60 `DROP POLICY` + `CREATE POLICY` statements using the existing `has_role()` function.

### Batch 3: Verify + Harden
- Test that unauthenticated users are redirected to `/auth`
- Test that logged-in users can still CRUD on their permitted tables
- Test that edge functions (which use `service_role` key) still work
- Run the security scanner again to confirm 0 warnings
- Public routes (`/intake`, `/portal`) remain accessible without login

## Technical Details

**RLS pattern** (repeated per table):
```sql
DROP POLICY IF EXISTS "Anon insert tablename" ON public.tablename;
DROP POLICY IF EXISTS "Anon update tablename" ON public.tablename;
-- Keep or drop anon SELECT depending on tier
CREATE POLICY "Staff can insert tablename" ON public.tablename
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'provider') OR public.has_role(auth.uid(), 'front_desk'));
```

**Auth context pattern:**
```typescript
// Listen for auth changes, load role from user_roles
const { data: { subscription } } = supabase.auth.onAuthStateChange(
  async (event, session) => { /* set user, fetch role */ }
);
```

**Edge functions are unaffected** — they use `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS entirely.

## Estimated scope
- 1 migration (~200 SQL statements)
- 5 new files, 2 modified files
- ~500 lines of new code

