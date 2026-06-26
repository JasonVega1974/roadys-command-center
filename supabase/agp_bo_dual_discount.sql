-- =====================================================================
-- Better-Of dual discount — add per-unit BO values to agp_aggregators
-- and surface them on the opt-in form. No grant/RLS/anon/token changes.
-- Idempotent. agp_aggregators already has a full authenticated grant, so
-- the new columns ride along with no privilege work.
-- =====================================================================
begin;

alter table public.agp_aggregators add column if not exists bo_cost_plus    text default '';
alter table public.agp_aggregators add column if not exists bo_retail_minus text default '';

-- Backfill existing BO rows so the two values match the old single value.
update public.agp_aggregators
   set bo_cost_plus    = discount_value,
       bo_retail_minus = discount_value
 where discount_type = 'BO'
   and coalesce(bo_cost_plus,'') = '' and coalesce(bo_retail_minus,'') = '';

-- list_optin_aggregators: the RETURNS table gains two columns. Postgres can't change an
-- existing function's return type via CREATE OR REPLACE (ERROR 42P13), so DROP first, then
-- recreate AND re-grant — DROP also drops the EXECUTE grants.
drop function if exists public.list_optin_aggregators();
create or replace function public.list_optin_aggregators()
returns table(id text, name text, rail text, carriers text,
              discount_type text, discount_value text, discount_target text,
              bo_cost_plus text, bo_retail_minus text, description text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select a.id, a.name, a.rail, a.carriers,
         a.discount_type, a.discount_value, a.discount_target,
         coalesce(a.bo_cost_plus,''), coalesce(a.bo_retail_minus,''), coalesce(d.body,'')
  from public.agp_aggregators a
  left join public.agp_descriptions d on d.aggregator_id = a.id
  where a.show_on_form is true
  order by a.sort_index
$$;
revoke all on function public.list_optin_aggregators() from public;        -- re-apply the form-RPC grant
grant execute on function public.list_optin_aggregators() to anon, authenticated;

commit;

-- Verify (run after commit):
-- select id, discount_type, discount_value, bo_cost_plus, bo_retail_minus
--   from public.agp_aggregators where discount_type='BO';
-- select * from public.list_optin_aggregators();   -- as admin; columns include bo_cost_plus/bo_retail_minus
