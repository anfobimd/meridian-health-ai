-- ============================================================================
-- Job B · Phase 1 — Clinic-scoped pricing foundation
-- ============================================================================
-- Adds per-clinic pricing (Option B: clinic_item_pricing as its own record),
-- clinic-owned catalog items, configurable deposits, and the Stripe Connect /
-- payment columns the later phases write to. Idempotent — safe to re-run and
-- to apply by hand in the SQL editor.
-- ============================================================================

-- ── pricing_basis enum (per the locked PRD set) ─────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'pricing_basis') then
    create type public.pricing_basis as enum
      ('per_unit', 'syringe', 'vial', 'thread', 'cycle', 'session', 'flat');
  end if;
end $$;

-- ── master_catalog_items: clinic ownership + seedable pricing/compliance ─────
alter table public.master_catalog_items
  add column if not exists owner_clinic_id uuid references public.clinics(id) on delete cascade,
  add column if not exists suggested_price numeric(10,2),
  add column if not exists pricing_basis public.pricing_basis not null default 'flat',
  add column if not exists requires_gfe boolean not null default false,
  add column if not exists requires_md_review boolean not null default false;

comment on column public.master_catalog_items.owner_clinic_id is
  'NULL = network (platform) item; set = clinic-owned item visible only to that clinic.';

-- ── clinics: Stripe Connect status + platform fee + deposit + tax config ─────
alter table public.clinics
  add column if not exists stripe_account_id text,
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false,
  add column if not exists stripe_onboarding_status text not null default 'not_started',
  add column if not exists stripe_requirements_due jsonb,
  -- Platform (USMD) application fee. VALUE is a business decision — default 0
  -- so no fee is taken until configured. Overridable per contract later.
  add column if not exists platform_fee_percent numeric(5,2) not null default 0,
  -- Deposit policy (clinic default; per-item override lives on clinic_item_pricing).
  add column if not exists deposit_enabled boolean not null default false,
  add column if not exists deposit_type text not null default 'percent',  -- 'percent' | 'flat'
  add column if not exists deposit_value numeric(10,2) not null default 0,
  add column if not exists tax_rate numeric(5,2) not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clinics_deposit_type_chk') then
    alter table public.clinics add constraint clinics_deposit_type_chk
      check (deposit_type in ('percent', 'flat'));
  end if;
end $$;

-- ── clinic_item_pricing (Option B) ──────────────────────────────────────────
-- Keyed on (clinic_id, treatment_id): the operational price-read path (booking,
-- checkout, quotes, portal) all carry a treatment_id, so resolving here makes
-- the clinic price authoritative everywhere. master_item_id is kept for catalog
-- provenance when the price originated from a network/clinic catalog item.
create table if not exists public.clinic_item_pricing (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  treatment_id uuid references public.treatments(id) on delete cascade,
  master_item_id uuid references public.master_catalog_items(id) on delete set null,
  price numeric(10,2) not null,
  member_price numeric(10,2),
  is_member_pricing_enabled boolean not null default false,
  pricing_basis public.pricing_basis not null default 'flat',
  -- Per-item deposit override; NULL falls back to the clinic default.
  deposit_type text check (deposit_type in ('percent', 'flat')),
  deposit_value numeric(10,2),
  effective_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists clinic_item_pricing_clinic_treatment_uq
  on public.clinic_item_pricing(clinic_id, treatment_id)
  where treatment_id is not null;
create index if not exists clinic_item_pricing_clinic_idx
  on public.clinic_item_pricing(clinic_id);

-- ── clinic-aware price history ──────────────────────────────────────────────
create table if not exists public.clinic_item_price_history (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  treatment_id uuid references public.treatments(id) on delete set null,
  pricing_id uuid references public.clinic_item_pricing(id) on delete set null,
  old_price numeric(10,2),
  new_price numeric(10,2),
  old_member_price numeric(10,2),
  new_member_price numeric(10,2),
  changed_by uuid references auth.users(id),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists clinic_item_price_history_clinic_idx
  on public.clinic_item_price_history(clinic_id, treatment_id);

-- ── payments: Stripe reconciliation columns (webhook is source of truth) ─────
alter table public.payments
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists application_fee_amount numeric(10,2),
  add column if not exists status text not null default 'completed';
-- Deposits are collected before any invoice exists, so invoice_id must be optional.
alter table public.payments alter column invoice_id drop not null;
create index if not exists payments_stripe_pi_idx on public.payments(stripe_payment_intent_id);
create unique index if not exists payments_stripe_pi_uq
  on public.payments(stripe_payment_intent_id) where stripe_payment_intent_id is not null;

-- ── appointments: deposit tracking (read by intake-clearance auto-refund) ────
alter table public.appointments
  add column if not exists deposit_amount numeric(10,2),
  add column if not exists deposit_payment_intent_id text,
  add column if not exists deposit_status text not null default 'none';  -- none|pending|paid|refunded|failed

-- ── invoices: invoice-level discount + audit ────────────────────────────────
alter table public.invoices
  add column if not exists invoice_discount_type text check (invoice_discount_type in ('percent', 'flat')),
  add column if not exists invoice_discount_value numeric(10,2) not null default 0,
  add column if not exists discount_reason text,
  add column if not exists clinic_id uuid references public.clinics(id) on delete set null;

-- ── helper: can the current user manage pricing/config for a clinic? ─────────
create or replace function public.user_can_manage_clinic(p_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- platform admin
    public.has_role(auth.uid(), 'admin')
    -- clinic manager
    or exists (select 1 from public.clinics c
               where c.id = p_clinic_id and c.manager_user_id = auth.uid())
    -- provider assigned to the clinic
    or exists (select 1 from public.provider_clinic_assignments pca
               join public.providers pr on pr.id = pca.provider_id
               where pca.clinic_id = p_clinic_id and pr.user_id = auth.uid());
$$;

-- ── RLS: clinic_item_pricing ────────────────────────────────────────────────
alter table public.clinic_item_pricing enable row level security;
drop policy if exists "Staff read clinic pricing" on public.clinic_item_pricing;
create policy "Staff read clinic pricing" on public.clinic_item_pricing
  for select to authenticated using (public.is_staff(auth.uid()));
drop policy if exists "Managers write clinic pricing" on public.clinic_item_pricing;
create policy "Managers write clinic pricing" on public.clinic_item_pricing
  for all to authenticated
  using (public.user_can_manage_clinic(clinic_id))
  with check (public.user_can_manage_clinic(clinic_id));

-- ── RLS: clinic_item_price_history ──────────────────────────────────────────
alter table public.clinic_item_price_history enable row level security;
drop policy if exists "Staff read clinic price history" on public.clinic_item_price_history;
create policy "Staff read clinic price history" on public.clinic_item_price_history
  for select to authenticated using (public.is_staff(auth.uid()));
drop policy if exists "Managers insert clinic price history" on public.clinic_item_price_history;
create policy "Managers insert clinic price history" on public.clinic_item_price_history
  for insert to authenticated with check (public.user_can_manage_clinic(clinic_id));

-- ── price resolver — single source of truth for every caller (P0-2) ─────────
-- Returns the clinic's price for a treatment, the member price when enabled,
-- the effective deposit, and price_set=false when the clinic has enabled the
-- item but not priced it (so callers can block the sale instead of charging $0).
create or replace function public.resolve_treatment_price(
  p_clinic_id uuid,
  p_treatment_id uuid,
  p_is_member boolean default false
)
returns table (
  price numeric,
  effective_price numeric,
  pricing_basis public.pricing_basis,
  price_set boolean,
  deposit_amount numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cip public.clinic_item_pricing%rowtype;
  tx public.treatments%rowtype;
  cl public.clinics%rowtype;
  v_price numeric;
  v_effective numeric;
  v_basis public.pricing_basis := 'flat';
  v_price_set boolean := false;
  v_dep_type text;
  v_dep_value numeric;
  v_deposit numeric := 0;
begin
  select * into tx from public.treatments where id = p_treatment_id;
  select * into cl from public.clinics where id = p_clinic_id;

  if p_clinic_id is not null and p_treatment_id is not null then
    select * into cip from public.clinic_item_pricing
      where clinic_id = p_clinic_id and treatment_id = p_treatment_id
      limit 1;
  end if;

  if cip.id is not null then
    v_price := cip.price;
    v_basis := cip.pricing_basis;
    v_price_set := cip.price is not null;
    if p_is_member and cip.is_member_pricing_enabled and cip.member_price is not null then
      v_effective := cip.member_price;
    else
      v_effective := cip.price;
    end if;
    v_dep_type := cip.deposit_type;
    v_dep_value := cip.deposit_value;
  else
    -- No clinic price yet — fall back to the legacy global treatment price,
    -- but report price_set=false so the UI flags "price not set".
    v_price := tx.price;
    v_price_set := false;
    if p_is_member and coalesce(tx.is_member_pricing_enabled, false) and tx.member_price is not null then
      v_effective := tx.member_price;
    else
      v_effective := tx.price;
    end if;
  end if;

  -- Deposit: item override → clinic default → none.
  if cl.id is not null and coalesce(cl.deposit_enabled, false) then
    v_dep_type := coalesce(v_dep_type, cl.deposit_type);
    v_dep_value := coalesce(v_dep_value, cl.deposit_value);
    if v_dep_type = 'flat' then
      v_deposit := coalesce(v_dep_value, 0);
    else
      v_deposit := round(coalesce(v_effective, 0) * coalesce(v_dep_value, 0) / 100.0, 2);
    end if;
  end if;

  return query select
    v_price,
    v_effective,
    v_basis,
    v_price_set,
    greatest(v_deposit, 0);
end;
$$;

grant execute on function public.resolve_treatment_price(uuid, uuid, boolean) to authenticated, anon;
grant execute on function public.user_can_manage_clinic(uuid) to authenticated;
