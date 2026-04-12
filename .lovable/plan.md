

# Admin User & Role Management Panel

## Overview
Add a "User Management" tab/section to the Settings page (visible only to admins) where admins can:
1. View all registered users with their current roles
2. Assign/change roles (admin, provider, front_desk)
3. Link a user to a provider record

## Database Changes
**No schema changes needed.** Tables `profiles`, `user_roles`, and `providers` already have the required columns. The `providers` table has a `user_id` column for linking.

**One new RLS policy needed:** Allow admins to read all profiles (currently profiles may be restricted). We'll use the existing `has_role()` security-definer function.

```sql
-- Allow admins to read all profiles
CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to read all user_roles
CREATE POLICY "Admins can read all user_roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to insert/update/delete user_roles
CREATE POLICY "Admins can manage user_roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update provider.user_id for linking
CREATE POLICY "Admins can update providers"
  ON public.providers FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
```

## New Component: `src/components/settings/UserManagement.tsx`

A panel that:
- **User list table**: Fetches `profiles` joined with `user_roles` to show display_name, email (from auth metadata in profile), current role, and linked provider status
- **Role assignment**: Dropdown per user to set role → upserts into `user_roles`
- **Link to provider**: Dropdown of unlinked providers → updates `providers.user_id`
- **Search/filter**: Text filter on name/email

## Changes to `src/pages/Settings.tsx`

- Import `UserManagement` component
- Add a conditional section at the top (only when `role === 'admin'`) with a card containing the user management panel
- Guard with `useAuth().role === 'admin'`

## File Summary

| File | Action |
|------|--------|
| Migration SQL | Add RLS policies for admin access to profiles, user_roles, providers |
| `src/components/settings/UserManagement.tsx` | **New** — user table with role assignment and provider linking |
| `src/pages/Settings.tsx` | Add admin-only User Management section |

