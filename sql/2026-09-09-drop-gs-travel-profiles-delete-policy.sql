-- Remove browser-initiated deletion from gs_travel_profiles.
--
-- The table shipped (sql/2026-09-08-gs-travel-profiles.sql) with a
-- `for delete using (true)` policy plus a DELETE grant to anon, on the reasoning
-- that removing a departed person is a real requirement. In practice that
-- requirement is rare, and this project's anon key is embedded in HTML served
-- publicly from GitHub Pages -- so the policy let anyone on the internet delete
-- every travel profile with a single PostgREST call. Removals now happen here,
-- in the SQL Editor, by a human.
--
-- TRUNCATE is revoked in the same breath. RLS does not gate TRUNCATE, so leaving
-- it granted would keep a deletion primitive open even with the policy gone. It
-- has no PostgREST HTTP mapping and so was never reachable with the anon key,
-- but revoking it costs nothing and closes the theoretical hole rather than
-- relying on PostgREST's surface staying as it is today. Both DELETE and
-- TRUNCATE arrived via Supabase's project-level default privileges
-- (alter default privileges ... grant all on tables to anon, authenticated),
-- which is why the original migration did not need to request them.
--
-- SELECT / INSERT / UPDATE are deliberately untouched: the app still needs to
-- read profiles and let the master user create and edit them.

begin;

drop policy if exists gs_travel_profiles_delete on public.gs_travel_profiles;

revoke delete, truncate on public.gs_travel_profiles from anon, authenticated;

commit;

-- ── Verification (run these after the migration) ──────────────────────
-- select policyname, cmd from pg_policies
--   where tablename='gs_travel_profiles' order by cmd;
--   -- expect 3 rows: INSERT, SELECT, UPDATE  (no DELETE)
--
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name='gs_travel_profiles' and grantee in ('anon','authenticated')
--   order by grantee, privilege_type;
--   -- expect DELETE and TRUNCATE both absent for both roles.
--   -- INSERT, REFERENCES, SELECT, TRIGGER and UPDATE remain (REFERENCES and
--   -- TRIGGER are Supabase defaults with no PostgREST mapping; harmless).
--
-- To remove a departed person's profile from now on:
--   delete from public.gs_travel_profiles where gs_name = 'Their Name';
