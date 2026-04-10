

# Fix Mobile Responsiveness Issues

## Issues Found

1. **MD Oversight stat cards** — Labels like "HORMONE APPROVALS PENDING" and "BATCH-ELIGIBLE (LOW/MED)" clip at 375px inside the `grid-cols-2` layout. The `text-[10px]` labels are too long for narrow cells.

2. **Provider Day "Open Chart" button** — The button with icon + text overflows on small screens when alongside patient info in a `flex justify-between` layout.

3. **Routes** — Not actually broken. `/intake` and `/portal` already exist in `App.tsx` (lines 75-76). The audit tested wrong URLs (`/patient-portal`, `/remote-intake`). No code change needed.

## Fixes

### 1. MD Oversight Stat Cards (`src/pages/MdOversight.tsx`, ~line 250)
- Shorten labels: "Chart Reviews Pending" → "Charts", "Hormone Approvals Pending" → "Hormones", "Batch-Eligible (Low/Med)" → "Batch Ready"
- Add `truncate` to label `<p>` tags as a safety net
- Add a subtle icon to each card for quick visual scanning (Shield, FlaskConical, Clock, CheckCircle)

### 2. Provider Day Button (`src/pages/ProviderDay.tsx`, ~line 219)
- Make the "Open Chart" button responsive: show icon-only on mobile (`sm:inline` on text, icon-only at small sizes)
- Add `shrink-0` to prevent the button from being compressed
- Wrap the top-level `flex justify-between` with `flex-wrap gap-3` so content stacks on narrow screens

### 3. No Router Changes Needed
The routes `/portal` and `/intake` already work. The audit incorrectly tested `/patient-portal` and `/remote-intake`.

## Files Changed
- `src/pages/MdOversight.tsx` — Shorten stat card labels, add icons
- `src/pages/ProviderDay.tsx` — Responsive "Open Chart" button

