

# Enhance User & Role Management Panel + Fix Runtime Error

Since the basic panel already exists, this plan covers **enhancements** to make it a more complete admin tool, plus a bug fix.

## 1. Fix Runtime Error (MdOversightDashboard)

**File:** `src/pages/MdOversightDashboard.tsx` (line ~693)

`report.highlights` is not an array in some cases. Add a guard:
```ts
(Array.isArray(report.highlights) ? report.highlights : []).map(...)
```

## 2. Enhance Existing User Management Panel

**File:** `src/components/settings/UserManagement.tsx`

Current gaps worth addressing:

| Enhancement | Detail |
|-------------|--------|
| **Show user email** | Currently only shows `display_name` and `user_id`. Add email from `profiles` if available, or show truncated user ID more clearly. |
| **Bulk role assignment** | Add checkboxes + bulk action bar to assign a role to multiple users at once. |
| **Unlink provider** | Currently can link but not unlink a provider from a user. Add an "Unlink" action. |
| **Confirmation dialogs** | Role changes (especially removing admin) and unlinking should require confirmation to prevent accidental changes. |
| **Pagination** | If user count grows, add simple pagination or virtual scroll. |

## 3. Optionally: Promote to Dedicated Page

If the Settings page is getting crowded, move User Management to its own route `/user-management` with a sidebar nav link visible only to admins.

## Files to Change

| File | Action |
|------|--------|
| `src/pages/MdOversightDashboard.tsx` | Fix `report.highlights.map` crash |
| `src/components/settings/UserManagement.tsx` | Add email display, unlink provider, confirmation dialogs |

No database or migration changes needed — all required RLS policies are already in place.

