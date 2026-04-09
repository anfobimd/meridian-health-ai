

# Physician Oversight & Hierarchy System — MD Chart Review (v2.0 AI-Native)

This implements the MD Oversight Specification v2.0 from the uploaded document. Due to the scale (~7-8 week full spec), we will implement in 3 incremental batches. This plan covers **Batch 1: Database Foundation + Chart Review Queue + AI Analysis Pipeline**.

## What We're Building

A Medical Director chart review system where:
- Encounters from NP/RN providers are queued for MD review
- AI analyzes each chart and generates a pre-review brief with risk scores, flags, and recommendations
- MDs review charts sorted by AI-calculated priority (not random)
- Anti-rubber-stamp timer prevents speed-signing
- Super-admin oversight dashboard shows AI intelligence reports, provider patterns, and MD performance

## Batch 1 Scope (this implementation)

### 1. Database Migration — 8 new tables + 1 altered table

| Table | Purpose |
|-------|---------|
| `chart_review_records` | Core review queue — links encounter to MD, tracks status, AI scores, review time |
| `ai_chart_analysis` | AI-generated brief per chart (risk score, flags, documentation score, structured JSON brief) |
| `ai_provider_intelligence` | Rolling provider metrics: correction rate, doc scores, recurring issues, coaching state |
| `ai_oversight_reports` | Monthly AI-generated narrative reports for super-admin |
| `ai_doc_checklists` | Procedure-specific documentation checklists used by AI scoring |
| `ai_md_consistency` | Cross-MD correction rate comparison per clinic per month |
| `ai_api_calls` | Cost tracking and debugging log for all AI calls |
| `ai_prompts` | Versioned system prompts (chart_brief, comment_draft, monthly_report) — editable without deploy |
| Alter `encounters` | Add `encounter_type` column for invasive procedure classification |

All tables get open RLS policies (matching existing pattern — no auth yet).

### 2. AI Edge Function: `ai-chart-review` 

A single edge function using Lovable AI (not Anthropic — adapting the spec to use our gateway) that:
- Accepts an encounter ID
- Reads the encounter's SOAP note, patient context, provider history
- Generates a structured JSON brief with: `procedure_summary`, `documentation_status`, `documentation_score`, `ai_flags[]`, `patient_context`, `risk_score`, `risk_tier`, `recommended_action`, `estimated_review_seconds`
- Stores result in `ai_chart_analysis`
- Logs the call in `ai_api_calls`

### 3. New Page: `/md-oversight` — Medical Director Chart Review

**Queue View (default)**
- Table of encounters awaiting review, sorted by `ai_priority_score` DESC
- Each row: risk tier badge (color-coded border), provider name + days-at-clinic, patient name, procedure, AI flags preview, doc score circle, time remaining
- "Analyzing..." skeleton while AI is pending
- Filter by risk tier, status, provider

**Chart Review Panel (dialog on row click)**
- AI Brief Card at top (dark card with 6 structured fields from the analysis)
- Provider Intelligence Strip (correction rate, recurring issues, coaching flags)
- Document tabs: SOAP Note / Encounter Details with AI-highlighted flags
- MD Action Area at bottom: comment textarea, "Draft AI Comment" button, approve/correction/sign buttons
- Elapsed timer with rubber-stamp threshold display
- Secondary confirmation for CRITICAL charts signed without comment

### 4. New Page: `/md-oversight/dashboard` — Super-Admin Oversight

**Tab 1: AI Intelligence Report** — Monthly AI-generated narrative with alerts, highlights, recommendations
**Tab 2: MD Performance** — Table with review %, avg review time, rubber stamp %, correction rate, consistency score
**Tab 3: Provider Intelligence** — Searchable provider table with issue history drawer
**Tab 4: System Intelligence** — AI API cost, success rates, rubber stamp incidents, sampling recommendations

### 5. Navigation Updates

- Add "MD Oversight" link to sidebar under a new "OVERSIGHT" section (ShieldCheck icon)
- Add to mobile nav

### 6. Seed Data

- Seed `ai_prompts` with 3 initial prompts (chart_brief, comment_draft, monthly_report)
- Seed `ai_doc_checklists` for 5 procedure types (Botox, Filler, GLP-1/Peptide, Hormone Injection, Laser/Energy)

## Files Changed

| File | Change |
|------|--------|
| Migration SQL | 8 new tables, alter encounters |
| `supabase/functions/ai-chart-review/index.ts` | New AI edge function for chart analysis |
| `src/pages/MdOversight.tsx` | New — chart review queue + review panel |
| `src/pages/MdOversightDashboard.tsx` | New — super-admin oversight dashboard (4 tabs) |
| `src/App.tsx` | Add 2 new routes |
| `src/components/AppSidebar.tsx` | Add oversight nav section |
| `src/components/MobileNav.tsx` | Add oversight links |

## Technical Notes

- Uses Lovable AI gateway (`openai/gpt-5`) for all AI analysis, not Anthropic as the spec suggests
- Risk scoring uses the weighted factors from the spec: provider experience (25%), correction history (20%), doc completeness (20%), procedure risk (15%), patient complexity (10%), note similarity (10%)
- Rubber-stamp thresholds: LOW=30s, MEDIUM=90s, HIGH=180s, CRITICAL=300s (floor 15s)
- Charts with `ai_risk_tier` HIGH or CRITICAL are always reviewed regardless of sampling rate
- Providers with <30 reviewed charts get mandatory review

