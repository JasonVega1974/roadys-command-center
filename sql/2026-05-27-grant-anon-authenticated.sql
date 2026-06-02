-- 2026-05-27 — GRANT SELECT, INSERT, UPDATE, DELETE on every public.* table
-- to the anon and authenticated roles. This codebase uses the anon key for
-- all browser writes (RLS policies are the access boundary, not GRANTs), so
-- without this every new table silently 403s until grants are added.
--
-- Two blocks below: a dynamic loop that grants over EVERY current table in
-- public (preferred — picks up tables that might exist beyond what's in the
-- HTML), and a static fallback listing the 12 tables referenced by the
-- codebase as of 2026-05-27.
--
-- Run order: this file AFTER 2026-05-27-enable-rls-and-fix-search-path.sql.
-- Idempotent — re-running is a no-op.

BEGIN;

-- ─── 1. Dynamic grant: every base table in public ─────────────────────────
-- Uses pg_tables (excludes views and foreign tables — those need different
-- privileges anyway). Schema-qualifies every table name via format(%I) so
-- mixed-case or reserved-word names are still handled safely.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
      FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON %I.%I TO anon, authenticated',
      r.schemaname, r.tablename
    );
    RAISE NOTICE 'Granted on %.%', r.schemaname, r.tablename;
  END LOOP;
END $$;

-- ─── 2. Sequences (UUID PKs don't need this, but serial PKs do) ───────────
-- Anything `bigserial`/`serial` needs USAGE on its sequence for INSERT to
-- work. Granting USAGE+SELECT on every sequence keeps future migrations
-- self-contained.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT sequence_schema, sequence_name
      FROM information_schema.sequences
     WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format(
      'GRANT USAGE, SELECT ON SEQUENCE %I.%I TO anon, authenticated',
      r.sequence_schema, r.sequence_name
    );
  END LOOP;
END $$;

COMMIT;

-- ─── Static fallback (commented — keep as a paste-in for emergencies) ─────
-- These are the 12 tables this codebase actually talks to today, taken
-- from `sb.from('...')` and `fetch(... /rest/v1/...)` call sites:
--
--   crm_leads, deck_gallery, fleet_gallon_reports, fleet_status, fuel_data,
--   geo_cache, impl_sites, kpi_data, pnl_notes, sd_tickets, value_props,
--   vp_enroll
--
-- If the dynamic block ever needs to be replaced (eg. running through a
-- pooler that disallows DO blocks), uncomment the static GRANT below:
--
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_leads            TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.deck_gallery         TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_gallon_reports TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_status         TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_data            TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.geo_cache            TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.impl_sites           TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_data             TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnl_notes            TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.sd_tickets           TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.value_props          TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.vp_enroll            TO anon, authenticated;

-- ─── Verification ─────────────────────────────────────────────────────────
-- After running, confirm every table has all four privileges for both roles:
--
--   SELECT table_name, grantee,
--          string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privs
--     FROM information_schema.role_table_grants
--    WHERE table_schema = 'public'
--      AND grantee IN ('anon','authenticated')
--    GROUP BY table_name, grantee
--    ORDER BY table_name, grantee;
--   -- Expect: every table appears twice (once per role), privs =
--   --         "DELETE, INSERT, SELECT, UPDATE".
