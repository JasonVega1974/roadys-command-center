-- 2026-10-06 — let the `authenticated` role reach the tables the newly-gated
-- pages read.
--
-- WHY THIS EXISTS
--
-- Signing in changes your Postgres role from `anon` to `authenticated`. Every
-- RLS policy on these tables was created scoped to `anon` alone, and the
-- grants matched. So a login did not ADD access — it took it away: the moment
-- a rep signed in, the policies stopped matching their role and PostgREST
-- answered 403 / 42501.
--
-- That stayed invisible while nothing could sign in. Phase 1 put a Supabase
-- login gate on CRM.html, implementation.html and the Potential Gallons
-- calculator, so from the first sign-in it broke every table in this list.
-- `crm_leads` hit it first and is already repaired by
-- sql/2026-10-05-crm-leads-require-auth.sql; these six are the rest.
--
-- ANON IS DELIBERATELY NOT REVOKED
--
-- This migration ADDS `authenticated`. It does not touch `anon`, because two
-- of these tables are still read anonymously by a page that has no gate:
--
--     table                 gated reader              un-gated reader
--     crm_scheduled_calls   CRM.html                  —
--     crm_lead_notes        CRM.html                  —
--     crm_email_templates   CRM.html                  —
--     impl_sites            implementation.html       index.html (8 queries)
--     sd_tickets            implementation.html       —
--     promotions            implementation.html       index.html (1 query)
--
-- Revoking anon here would break the dashboard. (index.html also mentions
-- sd_tickets and crm_leads 24 and 15 times respectively, but those are display
-- text in its schema-blueprint panel — it has zero live `.from()` calls on
-- either. Verified before writing this file.)
--
-- `crm_leads` is excluded on purpose: it IS meant to be authenticated-only and
-- the 2026-10-05 migration already revoked anon there.
--
-- Idempotent: the policy loop skips anything already covering authenticated,
-- and GRANT is a no-op when the privilege is already held.

BEGIN;

-- ─── 1. Widen the existing policies to cover authenticated ────────────────
-- ALTER POLICY ... TO rewrites only the role list; the USING/WITH CHECK
-- expressions are left exactly as they are, so this changes who a policy
-- applies to and never what it permits.

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('crm_scheduled_calls','crm_lead_notes',
                         'crm_email_templates','impl_sites',
                         'sd_tickets','promotions')
       AND 'authenticated' <> ALL(roles)
     ORDER BY tablename, policyname
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO anon, authenticated',
                   p.policyname, p.tablename);
    RAISE NOTICE 'policy %.% now covers authenticated', p.tablename, p.policyname;
  END LOOP;
END $$;

-- ─── 2. Grants ────────────────────────────────────────────────────────────
-- RLS is the access boundary in this codebase; grants are the gate in front of
-- it. Both are needed — a policy that matches is still refused without the
-- privilege, which is exactly the half-configured state crm_leads was in
-- (authenticated held DELETE and nothing else).

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_scheduled_calls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_lead_notes      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_email_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.impl_sites          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sd_tickets          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotions          TO authenticated;

-- Sequences, for any of these tables using a serial/bigserial primary key —
-- without USAGE the INSERT above still fails. Scoped to the six tables'
-- owned sequences rather than every sequence in public.
DO $$
DECLARE s record;
BEGIN
  FOR s IN
    SELECT DISTINCT seq.relname AS seqname
      FROM pg_class seq
      JOIN pg_depend d  ON d.objid = seq.oid AND d.classid = 'pg_class'::regclass
      JOIN pg_class tab ON tab.oid = d.refobjid
      JOIN pg_namespace n ON n.oid = tab.relnamespace
     WHERE seq.relkind = 'S'
       AND n.nspname = 'public'
       AND tab.relname IN ('crm_scheduled_calls','crm_lead_notes',
                           'crm_email_templates','impl_sites',
                           'sd_tickets','promotions')
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', s.seqname);
    RAISE NOTICE 'sequence % granted to authenticated', s.seqname;
  END LOOP;
END $$;

COMMIT;

-- ── Verification (run manually in the SQL editor after applying) ──────────
--
-- 1. Every policy on the six tables must now list authenticated.
--    Expect zero rows:
-- select tablename, policyname, roles
--   from pg_policies
--  where schemaname='public'
--    and tablename in ('crm_scheduled_calls','crm_lead_notes',
--                      'crm_email_templates','impl_sites','sd_tickets','promotions')
--    and 'authenticated' <> all(roles);
--
-- 2. Both roles hold the four privileges on all six tables.
--    Expect 12 rows, each listing DELETE, INSERT, SELECT, UPDATE:
-- select table_name, grantee,
--        string_agg(privilege_type, ', ' order by privilege_type) as privs
--   from information_schema.role_table_grants
--  where table_schema='public'
--    and table_name in ('crm_scheduled_calls','crm_lead_notes',
--                       'crm_email_templates','impl_sites','sd_tickets','promotions')
--    and grantee in ('anon','authenticated')
--  group by table_name, grantee
--  order by table_name, grantee;
--
-- 3. anon must STILL work on impl_sites and promotions — index.html has no
--    login gate and reads both. Expect rows, not a permission error:
-- select count(*) from public.impl_sites;
-- select count(*) from public.promotions;
