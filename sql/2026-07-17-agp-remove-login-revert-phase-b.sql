-- =====================================================================
-- Aggregator Planner — revert Phase B role split (login screen removed)
-- =====================================================================
-- aggregator-planner.html no longer gates access behind Supabase Auth
-- email+password sign-in, so the browser is back to running as `anon`
-- for every read/write. This restores the Phase A2 grant/policy shape
-- that Phase B (supabase/agp_phase_b_run.sql) revoked from anon.
--
-- optin_token stays column-locked (Phase A2) — it's the secret per-stop
-- opt-in link and must never be anon/authenticated SELECTable. As a
-- result get_optin_token() and export_optin_links() are intentionally
-- LEFT authenticated-only below: with no login screen nobody can ever
-- hold that role, so the planner's "copy real opt-in link" and CSV
-- export features are now permanently disabled. Everything else
-- (aggregators, steps, optins, descriptions, settings, locations minus
-- the token) is fully open to anon.
--
-- Idempotent and safe to re-run.
-- =====================================================================
begin;

revoke all privileges on
  public.agp_aggregators, public.agp_steps, public.agp_optins,
  public.agp_descriptions, public.agp_settings, public.agp_locations
  from anon, authenticated;

grant select, insert, update, delete on
  public.agp_aggregators, public.agp_steps, public.agp_optins,
  public.agp_descriptions, public.agp_settings
  to anon, authenticated;

-- agp_locations: column-restricted, excludes optin_token (Phase A2 lock).
-- `id` is included in insert/update on purpose — PostgREST upserts as
-- INSERT ... ON CONFLICT (id) DO UPDATE and puts every payload column,
-- including the conflict key, in the UPDATE's SET list.
grant select (id, name, city, state, code, gs, ach, responded_at, updated_at)
  on public.agp_locations to anon, authenticated;
grant insert (id, name, city, state, code, gs, ach, responded_at, updated_at)
  on public.agp_locations to anon, authenticated;
grant update (id, name, city, state, code, gs, ach, responded_at, updated_at)
  on public.agp_locations to anon, authenticated;
grant delete on public.agp_locations to anon, authenticated;

-- gen_optin_token() backs the optin_token column DEFAULT. A column default
-- runs as the INSERTING role, so anon needs EXECUTE or new-location
-- inserts fail with permission denied.
grant execute on function public.gen_optin_token() to anon, authenticated;

-- RLS: drop Phase B's authenticated-only policies and recreate them
-- permissive (no role restriction), matching the pre-Phase-B shape.
do $$
declare t text; pol record;
begin
  foreach t in array array['agp_aggregators','agp_steps','agp_locations',
                           'agp_optins','agp_descriptions','agp_settings']
  loop
    for pol in select policyname from pg_policies where schemaname='public' and tablename = t
    loop execute format('drop policy if exists %I on public.%I', pol.policyname, t); end loop;
    execute format('create policy %I on public.%I for select using (true)', t||'_read', t);
    execute format('create policy %I on public.%I for insert with check (true)', t||'_insert', t);
    execute format('create policy %I on public.%I for update using (true) with check (true)', t||'_update', t);
    execute format('create policy %I on public.%I for delete using (true)', t||'_delete', t);
  end loop;
end $$;

commit;

-- =====================================================================
-- VERIFICATION QUERIES
-- =====================================================================
-- (a) anon table privileges -> expect rows for all six agp_* tables
--     (agp_locations limited to the non-token columns)
-- select table_name, privilege_type from information_schema.role_table_grants
--   where grantee='anon' and table_name like 'agp_%' order by 1,2;

-- (b) policies -> roles column should be {public} (empty/ANY), not {authenticated}
-- select tablename, policyname, cmd, roles from pg_policies
--   where tablename like 'agp_%' order by tablename, cmd;

-- (c) function EXECUTE -> gen_optin_token TRUE for anon; get_optin_token and
--     export_optin_links FALSE for anon (left authenticated-only, on purpose)
-- select has_function_privilege('anon','public.gen_optin_token()','EXECUTE')      as anon_can_gen,
--        has_function_privilege('anon','public.get_optin_token(text)','EXECUTE') as anon_can_get,
--        has_function_privilege('anon','public.export_optin_links()','EXECUTE')  as anon_can_export;
