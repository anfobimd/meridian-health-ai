-- 3.1 — MD procedure-volume analytics
--
-- Server-side aggregate of procedures performed (completed appointments that
-- carry a treatment), grouped by clinic, treatment type, and month. The client
-- calls this RPC instead of pulling raw appointment rows.
--
-- Access scoping: the function is SECURITY INVOKER and additionally restricts
-- results to clinics the calling MD is actively assigned to in
-- md_coverage_assignments (resolved via providers.user_id = auth.uid()). An MD
-- therefore cannot read volume for clinics they are not assigned to, even by
-- passing an arbitrary p_clinic_id — the assignment filter is enforced in the
-- query body, not just the UI.

create or replace function public.md_procedure_volume(
  p_start timestamptz,
  p_end timestamptz,
  p_clinic_id uuid default null
)
returns table (
  clinic_id uuid,
  clinic_name text,
  treatment_id uuid,
  treatment_name text,
  category text,
  bucket date,
  procedure_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.clinic_id,
    c.name as clinic_name,
    a.treatment_id,
    t.name as treatment_name,
    t.category,
    date_trunc('month', a.scheduled_at)::date as bucket,
    count(*)::bigint as procedure_count
  from public.appointments a
  join public.treatments t on t.id = a.treatment_id
  left join public.clinics c on c.id = a.clinic_id
  where a.status = 'completed'
    and a.scheduled_at >= p_start
    and a.scheduled_at <  p_end
    and (p_clinic_id is null or a.clinic_id = p_clinic_id)
    and a.clinic_id in (
      select mca.clinic_id
      from public.md_coverage_assignments mca
      join public.providers p on p.id = mca.md_provider_id
      where p.user_id = auth.uid()
        and (mca.effective_until is null or mca.effective_until >= now())
    )
  group by a.clinic_id, c.name, a.treatment_id, t.name, t.category, date_trunc('month', a.scheduled_at)
  order by bucket desc, procedure_count desc;
$$;

grant execute on function public.md_procedure_volume(timestamptz, timestamptz, uuid) to authenticated;
