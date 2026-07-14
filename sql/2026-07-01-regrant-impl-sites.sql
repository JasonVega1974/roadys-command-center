-- 2026-07-01 — Restore anon/authenticated privileges on impl_sites (+ re-grant
-- across all public tables).
--
-- SYMPTOM: index.html (Roady's Command Center) and implementation.html showed
-- no data; console logged:
--     impl_sites?select=*  -> 403 (Forbidden)
--     implLoadFromSupabase error: permission denied for table impl_sites
-- Users who still "have data" are reading their localStorage cache from before
-- the regression — every fresh/cleared browser 403s because the live REST read
-- fails.
--
-- ROOT CAUSE: impl_sites lost its table-level GRANTs. "permission denied for
-- table" is a privilege error (HTTP 403), NOT an RLS policy denial (which would
-- return an empty 200). The 2026-05-27 grant migration had granted it, so the
-- grant was dropped since — a DROP+RECREATE of the table (recreating silently
-- drops all grants) or an explicit REVOKE. RLS policies are the access boundary
-- in this codebase, but the GRANT must exist or every anon request 403s.
--
-- FIX: re-grant across all public tables (idempotent; also catches anything
-- else that lost grants), plus a static fallback + RLS re-assertion for the
-- implementation-portal tables. Safe to re-run.

BEGIN;

-- ─── 1. Dynamic re-grant over every base table in public ──────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.%I TO anon, authenticated', r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Sequences too (serial/bigserial PKs need USAGE for INSERT).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT sequence_schema, sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I.%I TO anon, authenticated', r.sequence_schema, r.sequence_name);
  END LOOP;
END $$;

-- ─── 2. Static fallback for the implementation-portal tables ──────────────
-- (Run just these three if your pooler rejects DO blocks.)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.impl_sites TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sd_tickets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_leads  TO anon, authenticated;

-- ─── 3. Re-assert RLS + permissive policies on impl_sites ─────────────────
-- In case the table was recreated (which also drops RLS + policies). Drop-then-
-- create keeps this idempotent and independent of any prior policy names.
ALTER TABLE public.impl_sites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS impl_sites_read       ON public.impl_sites;
DROP POLICY IF EXISTS impl_sites_insert     ON public.impl_sites;
DROP POLICY IF EXISTS impl_sites_update     ON public.impl_sites;
CREATE POLICY impl_sites_read   ON public.impl_sites FOR SELECT USING (true);
CREATE POLICY impl_sites_insert ON public.impl_sites FOR INSERT WITH CHECK (true);
CREATE POLICY impl_sites_update ON public.impl_sites FOR UPDATE USING (true) WITH CHECK (true);

COMMIT;

-- ─── Verification (run after COMMIT) ──────────────────────────────────────
-- impl_sites should list anon + authenticated, each with all four privileges:
--   SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privs
--     FROM information_schema.role_table_grants
--    WHERE table_schema = 'public' AND table_name = 'impl_sites'
--      AND grantee IN ('anon','authenticated')
--    GROUP BY grantee;
--   -- Expect two rows, privs = "DELETE, INSERT, SELECT, UPDATE".
--
-- Policies present:
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'impl_sites';
--
-- Smoke test as anon (should return rows, not 403):
--   -- from the app or curl with the anon key:
--   -- GET /rest/v1/impl_sites?select=*&limit=1
