-- Job B · P0-3 — Placeholder network catalog seed + clinic onboarding helper.
--
-- This is PLACEHOLDER data standing in for the real 40-item Portland price
-- list. Replace the rows below with the real seed when available. Items are
-- network-owned (owner_clinic_id = NULL) and carry a suggested_price,
-- pricing_basis, and GFE/MD-review flags.

insert into public.master_catalog_items (name, item_type, category, status, owner_clinic_id, suggested_price, pricing_basis, requires_gfe, requires_md_review)
values
  ('Botox (per unit)',            'procedure', 'Neuromodulators', 'active', null,  12.00, 'per_unit', true,  true),
  ('Dysport (per unit)',          'procedure', 'Neuromodulators', 'active', null,  4.00,  'per_unit', true,  true),
  ('Juvederm Filler (syringe)',   'procedure', 'Dermal Fillers',  'active', null,  650.00,'syringe',  true,  true),
  ('Sculptra (vial)',             'procedure', 'Dermal Fillers',  'active', null,  900.00,'vial',     true,  true),
  ('PDO Thread Lift (thread)',    'procedure', 'Threads',         'active', null,  300.00,'thread',   true,  true),
  ('Semaglutide Program (cycle)', 'procedure', 'Weight Mgmt',     'active', null,  399.00,'cycle',    true,  true),
  ('Laser Hair Removal (session)','procedure', 'Laser',           'active', null,  150.00,'session',  false, false),
  ('HydraFacial (flat)',          'procedure', 'Facials',         'active', null,  199.00,'flat',     false, false)
on conflict do nothing;

-- On clinic onboarding: copy suggested starting prices into the clinic's
-- editable price list. We seed from the operational `treatments` table (which
-- is what booking/checkout resolve against), using treatments.price as the
-- starting value so a new clinic has a complete, editable, priced menu.
create or replace function public.seed_clinic_pricing_from_treatments(p_clinic_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if not public.user_can_manage_clinic(p_clinic_id) then
    raise exception 'Not authorized to seed pricing for this clinic';
  end if;

  insert into public.clinic_item_pricing (clinic_id, treatment_id, price, member_price, is_member_pricing_enabled, pricing_basis, created_by)
  select p_clinic_id, t.id, coalesce(t.price, 0), t.member_price,
         coalesce(t.is_member_pricing_enabled, false), 'flat', auth.uid()
  from public.treatments t
  where t.is_active = true
    and not exists (
      select 1 from public.clinic_item_pricing cip
      where cip.clinic_id = p_clinic_id and cip.treatment_id = t.id
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.seed_clinic_pricing_from_treatments(uuid) to authenticated;
