

# Make Sign-Out Button More Visible

## Change
In `src/components/AppSidebar.tsx`, replace the small icon-only logout button with a full-width "Sign Out" button that has a text label, higher contrast, and more padding.

## Details
- Replace the current tiny `LogOut` icon button (14px, 30% opacity) with a styled button showing the icon + "Sign Out" text
- Increase contrast: `text-sidebar-foreground/70` default, brighter on hover
- Add `gap-2`, proper padding, and `w-full` so it's unmissable
- Keep it in the same footer area next to the user info, but give it its own row below the user details

### File: `src/components/AppSidebar.tsx` (bottom user section ~lines 170-185)

Replace the current compact layout with:
```
<div className="px-3 py-3 border-t border-sidebar-border space-y-2">
  <div className="flex items-center gap-2.5">
    <avatar>{initials}</avatar>
    <div>
      <p>{displayName}</p>
      <p>{email}</p>
    </div>
  </div>
  <button onClick={signOut} className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-[12px] text-sidebar-foreground/70 hover:bg-white/10 hover:text-white transition-colors">
    <LogOut className="h-4 w-4" />
    <span>Sign Out</span>
  </button>
</div>
```

