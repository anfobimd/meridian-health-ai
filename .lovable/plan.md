

# AI Dashboard Insights — Weekly Narrative Summaries

## What We're Building

A new "AI Weekly Insights" section on the Command Center dashboard that generates rich, narrative summaries of clinic performance covering the past 7 days. It will analyze appointments, revenue, provider utilization, package health, clinical compliance, and patient trends — then surface actionable recommendations.

## Architecture

**Backend**: New `weekly_insights` mode added to the existing `ai-financial-advisor` edge function. It will query the last 7 days of data across multiple tables and feed it to the AI for narrative generation.

**Frontend**: New collapsible card on `Index.tsx` below the existing AI Daily Briefing, with:
- Executive narrative paragraph
- KPI highlight chips (with up/down/stable trend indicators)
- "This Week's Action" — one specific recommendation
- Trend comparison vs prior week
- Auto-cache: store the last generated insight in localStorage with a TTL so it persists across page loads without re-calling AI every time

## Technical Details

### 1. Edge Function Update (`ai-financial-advisor/index.ts`)

Add a `weekly_insights` mode that:
- Accepts no client-side data (queries everything server-side for accuracy)
- Queries last 7 days of: appointments (count, completion rate, no-shows), invoices (revenue), clinical_notes (unsigned count), chart_review_records (corrections), patient_package_purchases (new sales, expirations), patients (new registrations)
- Also queries the prior 7 days for week-over-week comparison
- Sends all metrics to AI with a prompt requesting:
  ```json
  {
    "narrative": "2-3 paragraph executive summary",
    "kpi_highlights": [{ "label": "", "value": "", "trend": "up|down|stable" }],
    "weekly_action": "One specific thing to do this week",
    "trends": [{ "metric": "", "this_week": "", "last_week": "", "change_pct": "" }]
  }
  ```

### 2. Dashboard UI (`Index.tsx`)

New `WeeklyInsights` card with:
- "Generate Weekly Insights" button (similar pattern to existing AI briefing)
- Narrative display with formatted text
- KPI chips using Badge components with trend arrows
- Weekly action highlighted in a distinct callout
- Trend table showing week-over-week comparisons
- Loading state with skeleton/spinner
- Cache in localStorage keyed by ISO week number, TTL 4 hours

### 3. Files Changed

| File | Change |
|------|--------|
| `supabase/functions/ai-financial-advisor/index.ts` | Add `weekly_insights` mode with server-side data gathering |
| `src/pages/Index.tsx` | Add Weekly Insights card below Daily Briefing |

No database migrations needed — this reads existing tables only.

