---
name: hci-review-skill
description: Audit a React/Tailwind/shadcn UI for HCI quality — heuristics, accessibility (WCAG 2.2 AA), information architecture, visual hierarchy, motion, and healthcare-specific UX concerns. Use when the user asks for a "design audit", "HCI review", "UX review", "a11y review", or `/hci-review-skill`.
---

# HCI Review Skill

Run a structured human-computer-interaction audit against changed or specified UI surfaces in this Vite + React + Tailwind + shadcn/ui codebase. Produce a prioritized, actionable report — not a generic checklist dump.

## When to use

- The user asks for a design / UX / HCI / accessibility audit on a route, page, component, or PR.
- The user invokes `/hci-review-skill` (with or without an argument naming the target).
- After a substantial UI change in `src/pages/**` or `src/components/**`, when reviewing.

## Scope resolution

1. If the user named a target (route, file, component), audit that.
2. Else, audit the diff vs. `main` (`git diff --name-only main...HEAD -- 'src/**'`).
3. Else, ask which surface to review — do not audit the whole app silently.

## Method

Work through these passes in order. Skip a pass only if it is clearly irrelevant to the surface, and say so.

### 1. Heuristic pass (Nielsen + Norman)
- Visibility of system status (loading, optimistic UI, toasts via `sonner`).
- Match between system and real world (medical terminology, plain language for patients).
- User control and freedom (cancel, undo, back, escape closes dialogs).
- Consistency and standards (shadcn variants, spacing scale, iconography from `lucide-react`).
- Error prevention (destructive confirmations, form validation via `zod` + `react-hook-form`).
- Recognition over recall (labeled inputs, visible affordances, breadcrumbs).
- Flexibility and efficiency (keyboard shortcuts, command palette via `cmdk`).
- Aesthetic and minimalist design (signal-to-noise, dense vs. roomy).
- Help users recover from errors (clear error copy, next action).
- Help and documentation (empty states, inline hints).

### 2. Accessibility pass (WCAG 2.2 AA)
- Semantic landmarks: `<main>`, `<nav>`, `<header>`, headings in order.
- Interactive elements are real buttons/links, not click-handlered `div`s.
- Focus: visible ring, logical tab order, focus trap in dialogs (Radix handles this — verify it's not overridden).
- Labels: every input has a `<Label htmlFor>` or `aria-label`; icon-only buttons have `aria-label` or `sr-only` text.
- Color contrast ≥ 4.5:1 for text, 3:1 for UI; check against `tailwind.config.ts` tokens and any hardcoded colors.
- Motion: respect `prefers-reduced-motion`; `tailwindcss-animate` does not do this for you.
- Forms: errors associated with inputs (`aria-describedby`, `aria-invalid`).
- Live regions for async results and toasts.
- Images: `alt` text; decorative images `alt=""`.

### 3. Information architecture & flow
- Is the primary task obvious within 3 seconds?
- Are secondary actions visually demoted?
- Is navigation depth shallow? (`react-router-dom` routes — check `App.tsx`).
- Are empty / loading / error / success states all designed?

### 4. Visual hierarchy & typography
- One H1 per page, consistent type scale.
- Whitespace conveys grouping (proximity).
- Contrast directs attention to the primary CTA.
- Tabular data uses tabular numerals; alignment matches data type.

### 5. Healthcare-specific concerns (Meridian Health AI)
- PHI handling visible in UI: don't surface IDs/SSNs unnecessarily; mask by default with reveal.
- Clinical safety: confirm destructive or high-stakes actions (delete record, send to provider).
- Data freshness: show timestamps and source for any AI-generated content.
- AI provenance: clearly label model output as such; provide a way to flag/correct.
- Reading level: aim for ≤ 8th grade for patient-facing copy.
- Numeric units: always show units (mg, mL, bpm); avoid ambiguous abbreviations (use "mcg" not "µg" in patient views).

### 6. Performance & perceived performance
- Route-level code splitting (`React.lazy` + `Suspense`) for heavy pages (e.g. `pdfjs-dist`, `recharts`).
- Skeletons over spinners for content-shaped loading.
- `@tanstack/react-query` cache keys are stable; no waterfalls.

## Output format

Return a single markdown report with this structure:

```
# HCI Review — <surface>

## Summary
<2–4 sentences: overall verdict + biggest risk.>

## Findings

### P0 — Blocking (a11y violations, clinical-safety, broken flows)
- **<Title>** — <file:line>
  - Problem: ...
  - Impact: ...
  - Fix: ...

### P1 — Should fix (heuristic violations, IA confusion)
...

### P2 — Polish (visual hierarchy, micro-copy, motion)
...

## What's done well
- ...

## Suggested next step
<One concrete change to ship first.>
```

Rules:
- Cite `file:line` for every finding.
- Each finding has Problem / Impact / Fix — no vague "improve UX" notes.
- Prefer P0 < 5 items. If you have 20 P0s you have miscategorized.
- Do not write code in the report — describe the fix. The user will request implementation separately.

## Anti-patterns to avoid

- Generic checklist regurgitation with no file references.
- Speculation about screens you haven't read. Read the file before commenting on it.
- Recommending libraries already in `package.json` as if they were missing — check first.
- Re-reviewing shadcn/Radix internals; trust the primitives unless they're misused.
- Suggesting a redesign when the ask was an audit.
