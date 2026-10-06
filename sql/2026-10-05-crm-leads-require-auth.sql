-- ⚠ DO NOT RUN until the login is confirmed working on CRM.html,
-- implementation.html AND bus-dev-potential-gallons/index.html in a second
-- browser. Both CRM.html (5 live queries) and implementation.html (3) hit
-- crm_leads with the anon key today; this migration makes that return 403.
--
-- index.html is unaffected: its 15 crm_leads references are display text in
-- the schema-blueprint panel, not live queries (verified: 0 occurrences of
-- `.from('crm_leads')`). truck-stop-optin.html and call-booking.html are
-- prospect-facing, never touch crm_leads, and stay anonymous.
BEGIN;

-- Existing policy names were never recorded in sql/, so drop whatever is
-- actually deployed rather than guessing at names.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='crm_leads'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.crm_leads', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_leads_read   ON public.crm_leads
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY crm_leads_insert ON public.crm_leads
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY crm_leads_update ON public.crm_leads
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
-- DELETE stays unpolicied: both pages soft-delete via deleted_at after the
-- Task 8 fix, so no code path needs a hard DELETE.

GRANT SELECT, INSERT, UPDATE ON public.crm_leads TO authenticated;
REVOKE ALL ON public.crm_leads FROM anon;

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────
-- select policyname, cmd, qual from pg_policies
--   where schemaname='public' and tablename='crm_leads';
-- -- must return 0 rows:
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name='crm_leads' and grantee='anon';
