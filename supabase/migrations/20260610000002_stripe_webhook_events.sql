-- Job B · Phase 2 — Stripe webhook idempotency ledger.
-- The webhook is the single source of truth for captured/failed/refunded; this
-- table dedupes event replays (Stripe re-delivers on any non-2xx).
create table if not exists public.stripe_webhook_events (
  id text primary key,            -- Stripe event id (evt_...)
  type text not null,
  payload jsonb,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
-- Service-role only (the webhook uses the service key). No client policies =
-- no client access, which is correct for a server-internal ledger.
