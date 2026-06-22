-- =====================================================================
-- Aggregator Launch Planner — fix table permissions (RLS policies + grants)
-- =====================================================================
-- Run this in the Supabase SQL editor if planner edits aren't persisting
-- to the cloud (the app shows "Offline — not syncing" / "Cloud sync
-- failed — ..."). Symptom: changes save in your browser but a different
-- browser / incognito shows the original data, because the browser uses
-- the ANON key and the agp_* tables are missing INSERT/UPDATE/DELETE
-- policies and/or grants (reads can work while writes return 403 / RLS
-- violation). Idempotent and safe to re-run.
-- =====================================================================
begin;

do $$
declare t text;
begin
  foreach t in array array['agp_aggregators','agp_steps','agp_locations',
                           'agp_optins','agp_descriptions','agp_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete', t);
    execute format('create policy %I on public.%I for select using (true)', t||'_read', t);
    execute format('create policy %I on public.%I for insert with check (true)', t||'_insert', t);
    execute format('create policy %I on public.%I for update using (true) with check (true)', t||'_update', t);
    execute format('create policy %I on public.%I for delete using (true)', t||'_delete', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;

commit;

-- After running this, reload the planner once (it will seed the cloud if
-- the tables are empty), then confirm the indicator reads "Synced".
--
-- Verify policies/grants landed:
-- select tablename, policyname, cmd from pg_policies
--   where tablename like 'agp_%' order by tablename, cmd;
-- select table_name, privilege_type, grantee from information_schema.role_table_grants
--   where table_name like 'agp_%' and grantee='anon' order by table_name;
