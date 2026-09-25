-- Fix: recompute_selection's output columns (qualified, selected) clashed with leads.selected
-- inside PL/pgSQL ("column reference "selected" is ambiguous"). Rename the outputs.
-- The return type changes, so the function must be dropped first.

drop function if exists recompute_selection(uuid);

create function recompute_selection(p_run_id uuid) returns table (qualified_count int, selected_count int)
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select r.target_lead_count into n from runs r where r.id = p_run_id;
  update leads l set selected = false where l.run_id = p_run_id and l.selected;
  update leads l set selected = true where l.id in (
    select x.id from leads x
    where x.run_id = p_run_id and x.qualification_status = 'qualified'
    order by x.manual_decision desc, x.confidence desc nulls last, x.created_at
    limit n
  );
  return query select
    (select count(*)::int from leads x where x.run_id = p_run_id and x.qualification_status = 'qualified'),
    (select count(*)::int from leads x where x.run_id = p_run_id and x.selected);
end $$;
revoke execute on function recompute_selection(uuid) from public, anon, authenticated;
