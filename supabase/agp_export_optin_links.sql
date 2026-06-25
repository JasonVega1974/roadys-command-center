-- =====================================================================
-- export_optin_links() — admin CSV export of per-stop opt-in URLs.
-- =====================================================================
-- SECURITY DEFINER so it can read agp_locations.optin_token (which is
-- column-locked out of direct SELECT for anon/authenticated by Phase A2)
-- and assemble the full opt-in URL SERVER-SIDE. It returns only the stop
-- code, stop name, and the FINISHED URL string — the raw token is never a
-- returned column and the A2 column lock is NOT loosened.
--
-- EXECUTE is granted to `authenticated` ONLY (not anon) — same lockdown as
-- the planner. anon cannot call it.
--
-- Idempotent (create or replace). search_path pinned per CLAUDE.md.
--
-- NOTE: the URL origin (jasonvega1974.github.io/...) is hardcoded — update it HERE
-- if the opt-in page ever moves to a custom domain. Relies on Phase A1's NOT NULL on
-- optin_token: a NULL token would make `'...?t=' || NULL` => NULL url (empty CSV cell).
-- =====================================================================
begin;

create or replace function public.export_optin_links()
returns table(stop_code text, stop_name text, optin_url text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select l.code, l.name,
         'https://jasonvega1974.github.io/roadys-command-center/truck-stop-optin.html?t=' || l.optin_token
  from public.agp_locations l
  order by l.code
$$;
revoke all on function public.export_optin_links() from public;        -- removes anon's implicit EXECUTE
grant execute on function public.export_optin_links() to authenticated; -- admin/planner only

commit;

-- =====================================================================
-- VERIFICATION — confirm anon CANNOT execute, authenticated CAN
-- =====================================================================
-- expect anon_can = f, auth_can = t :
-- select has_function_privilege('anon','public.export_optin_links()','EXECUTE')          as anon_can,
--        has_function_privilege('authenticated','public.export_optin_links()','EXECUTE') as auth_can;
--
-- and export_optin_links must NOT appear in anon's executable function list
-- (anon still only the five form RPCs):
-- select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where has_function_privilege('anon', p.oid,'EXECUTE') and n.nspname='public' order by 1;
--
-- spot-check the output (as admin) — every row has a full URL, no bare tokens:
-- select * from public.export_optin_links() limit 5;
