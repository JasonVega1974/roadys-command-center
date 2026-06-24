-- =====================================================================
-- PHASE B (RUNNABLE) — role split. Paste into the Supabase SQL editor.
-- Run ONLY after the planner authenticates (gate 2 done). Idempotent — safe
-- to re-run. Identical logic to the PHASE B block in agp_optin_portal.sql,
-- just uncommented. After it runs, execute the four VERIFICATION QUERIES below.
-- =====================================================================
begin;

-- (1) GRANTS: strip anon from every agp_* table. Live anon holds GRANT ALL
--     (incl TRUNCATE/REFERENCES/TRIGGER), so revoke-all-privileges is required
--     (an enumerated CRUD revoke would leave those behind).
revoke all privileges on
  public.agp_aggregators, public.agp_steps, public.agp_locations,
  public.agp_optins, public.agp_descriptions, public.agp_settings
  from anon;

-- (2) FUNCTIONS: the four anon-executable funcs found live (none are form RPCs):
--     deck_gallery_touch_updated_at, pnl_notes_touch_updated_at, touch_updated_at
--     (trigger funcs — fire regardless of EXECUTE), and rls_auto_enable (unused
--     Security Advisor helper; no page calls any RPC at runtime). Pull all four
--     off public/anon. regprocedure lookup handles any signature.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
             ('deck_gallery_touch_updated_at','pnl_notes_touch_updated_at',
              'touch_updated_at','rls_auto_enable')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end $$;

-- (2b) gen_optin_token: pull it off anon so the verification shows ONLY the five
--      form RPCs as anon-executable — but authenticated MUST keep EXECUTE. The
--      optin_token column DEFAULT calls gen_optin_token(), and a column default runs
--      as the INSERTING role (not the table owner), so without this grant the
--      planner's authenticated new-location inserts would fail with permission denied.
revoke all on function public.gen_optin_token() from public;
grant execute on function public.gen_optin_token() to authenticated;

-- (3) RLS: live policies are bound to the PUBLIC role (with duplicate _read
--     policies on agp_locations/agp_optins). Revoking anon grants does NOT
--     touch PUBLIC-role policies, so drop EVERY existing policy per table
--     (handles PUBLIC-bound + duplicates + any unknown names) and recreate one
--     clean set scoped to `authenticated`. Apply to all six tables. DEFINER
--     RPCs bypass RLS, so the form is unaffected.
do $$
declare t text; pol record;
begin
  foreach t in array array['agp_aggregators','agp_steps','agp_locations',
                           'agp_optins','agp_descriptions','agp_settings']
  loop
    for pol in select policyname from pg_policies where schemaname='public' and tablename = t
    loop execute format('drop policy if exists %I on public.%I', pol.policyname, t); end loop;
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (true)', t||'_delete', t);
  end loop;
end $$;

-- (4) re-affirm authenticated keeps full access (token still column-excluded)
grant select, insert, update, delete on
  public.agp_aggregators, public.agp_steps, public.agp_optins,
  public.agp_descriptions, public.agp_settings to authenticated;
grant select (id,name,city,state,code,gs,ach,responded_at,updated_at) on public.agp_locations to authenticated;
grant insert (id,name,city,state,code,gs,ach,responded_at,updated_at) on public.agp_locations to authenticated;
grant update (id,name,city,state,code,gs,ach,responded_at,updated_at) on public.agp_locations to authenticated;  -- id: PostgREST upsert SETs the conflict key (else 42501)
grant delete on public.agp_locations to authenticated;

commit;

-- =====================================================================
-- VERIFICATION QUERIES (run after the transaction above commits)
-- =====================================================================
-- (a) Table-level privileges anon holds -> expect ZERO rows for agp_*
select table_name, privilege_type from information_schema.role_table_grants
  where grantee='anon' and table_name like 'agp_%' order by 1,2;

-- (b) Policies on agp_* -> roles column should be {authenticated} (no {public}/{anon})
select tablename, policyname, cmd, roles
  from pg_policies where tablename like 'agp_%' order by tablename, cmd;

-- (c) Functions anon may EXECUTE -> expect ONLY the five form RPCs:
--     resolve_optin_token, resolve_optin_by_code, list_optin_aggregators,
--     submit_optin, submit_optin_by_code (NOT gen_optin_token/_apply_optin/get_optin_token)
select n.nspname, p.proname, p.prosecdef as sec_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where has_function_privilege('anon', p.oid,'EXECUTE') and n.nspname='public' order by 2;
