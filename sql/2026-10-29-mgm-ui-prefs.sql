-- 2026-10-29 — Membership Growth Model: shared card visibility.
--
-- ONE TABLE, ONE ROW. mgm_ui_prefs holds which cards are hidden from the
-- Membership Growth Model, shared by every viewer.
--
--   read   any signed-in user   — "hidden" must mean hidden for everyone
--   write  ADMINS ONLY          — through public.mgm_is_admin()
--
-- WHY THE READ IS NOT ADMIN-ONLY, unlike mgm_pnl_actuals
--
-- The brief called for "the same RLS shape as mgm_pnl_actuals" AND "readable
-- by any signed-in user". Those conflict: mgm_pnl_actuals_read is
-- mgm_is_admin() precisely because that table is the income statement. This
-- table is a layout preference. It takes the STRUCTURE of that file (single
-- row, revoke-then-grant, no DELETE policy, trigger with search_path pinned)
-- and the READ POLICY of mgm_admins / mgm_scenarios, auth.uid() IS NOT NULL.
--
-- If the read were admin-only, a non-admin's page could not learn which cards
-- are hidden and would render the un-tidied view — which is the entire thing
-- the feature exists to prevent. This is a tidying feature, not a permissions
-- feature: hiding a card is never a security control, and nothing may ever be
-- hidden here in order to keep a figure from a reader. The access boundary for
-- figures is mgm_pnl_actuals' own admin-only SELECT policy, and it is
-- unaffected by anything in this file.
--
-- WHAT THIS TABLE MAY CONTAIN
--
-- hidden_sections is {"<card-id>": true} and nothing else. The client coerces
-- keys against a frozen allowlist of data-card ids and coerces values with
-- !!v, dropping unknown keys rather than retaining them. The value space is
-- therefore `true` under a known id — no free text is representable, which is
-- the structural difference from the reverted `copy` field whose value space
-- was "any string". A jsonb column cannot enforce that by itself, hence the
-- CHECK below as a second line, and the client sanitiser as the first.
--
-- This table is deliberately NOT part of the tool's scenario `state`. Nothing
-- here is ever written into mgm_scenarios or into an exported JSON file, so
-- this feature adds no bytes to the publish boundary.
--
-- Re-runnable: IF NOT EXISTS on the table, DROP POLICY IF EXISTS before each
-- CREATE POLICY, DROP TRIGGER IF EXISTS before the CREATE TRIGGER, and
-- privileges REVOKEd wholesale before being GRANTed so the grant statement is
-- the complete and only statement of who holds what.
--
-- DEPENDS ON sql/2026-10-28-mgm-scenarios.sql, which creates public.mgm_admins
-- and public.mgm_is_admin(). Apply that first: the write policies below
-- reference that function and a policy cannot reference one that does not
-- exist yet.

BEGIN;

CREATE TABLE IF NOT EXISTS public.mgm_ui_prefs (
  id              text        PRIMARY KEY DEFAULT 'v1',
  hidden_sections jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_by      text        NOT NULL DEFAULT '',
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- SINGLE ROW BY CONSTRUCTION. Without this, a second row is not an error and
  -- the page would silently read whichever one came back first — two answers to
  -- "which cards are hidden", resolved by row order.
  CONSTRAINT mgm_ui_prefs_single_row CHECK (id = 'v1'),

  -- A JSON OBJECT, not an array, string, number or null. The client sanitiser
  -- is the real containment; this is the backstop for anything that reaches
  -- the table without going through it (the SQL editor, a future script).
  -- jsonb_typeof is used rather than a cast test because it reports 'object'
  -- for {} too, which is the common case.
  CONSTRAINT mgm_ui_prefs_sections_is_object
    CHECK (jsonb_typeof(hidden_sections) = 'object')
);

ALTER TABLE public.mgm_ui_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mgm_ui_prefs_read   ON public.mgm_ui_prefs;
DROP POLICY IF EXISTS mgm_ui_prefs_insert ON public.mgm_ui_prefs;
DROP POLICY IF EXISTS mgm_ui_prefs_update ON public.mgm_ui_prefs;

-- Any signed-in user READS. See the header: a non-admin who cannot read this
-- row sees the un-tidied page, which defeats the feature.
CREATE POLICY mgm_ui_prefs_read ON public.mgm_ui_prefs
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only admins WRITE. This is a real server-side boundary, not a UI gate: a
-- non-admin who sets MGM.isAdmin = true in the console still cannot write.
CREATE POLICY mgm_ui_prefs_insert ON public.mgm_ui_prefs
  FOR INSERT WITH CHECK (public.mgm_is_admin());
CREATE POLICY mgm_ui_prefs_update ON public.mgm_ui_prefs
  FOR UPDATE USING (public.mgm_is_admin()) WITH CHECK (public.mgm_is_admin());

-- Deliberately NO delete policy. There is nothing to delete: the row is
-- permanent and unhiding everything is an UPDATE to '{}'. A DELETE policy
-- would also break the optimistic-concurrency token by letting the row vanish
-- between a read and its write.

-- ── updated_at trigger ──────────────────────────────────────────────────
-- This column is the CONCURRENCY TOKEN, not decoration. The client writes with
-- .eq('updated_at', seen), so the value MUST change on every update or two
-- admins' writes would both appear to succeed while one was silently lost.
-- Hence a trigger rather than trusting the client to send a new timestamp.
--
-- search_path pinned per CLAUDE.md (function_search_path_mutable lint).
CREATE OR REPLACE FUNCTION public.touch_mgm_ui_prefs_updated_at()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS mgm_ui_prefs_touch_updated_at ON public.mgm_ui_prefs;
CREATE TRIGGER mgm_ui_prefs_touch_updated_at
  BEFORE UPDATE ON public.mgm_ui_prefs
  FOR EACH ROW EXECUTE FUNCTION public.touch_mgm_ui_prefs_updated_at();

-- ── Grants ──────────────────────────────────────────────────────────────
-- REVOKE FIRST, then GRANT. Supabase's project default privileges grant ALL on
-- newly created tables in `public` to anon and authenticated, so verbs this
-- table must not expose have to be revoked explicitly rather than merely left
-- ungranted. TRUNCATE matters most: it is NOT subject to RLS, so a leftover
-- default grant would let a signed-in non-admin empty this table despite the
-- admin-only write policies.
--
-- anon holds NOTHING: the anon key is published in this repo's committed HTML,
-- so anon is the public internet. A signed-in session is the only way in.
REVOKE ALL ON public.mgm_ui_prefs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.mgm_ui_prefs TO authenticated;

-- Seed the single row so the first write is an UPDATE with a real token rather
-- than an INSERT race between two admins. Empty: nothing hidden by default.
INSERT INTO public.mgm_ui_prefs (id, hidden_sections, updated_by)
  VALUES ('v1', '{}'::jsonb, 'migration')
  ON CONFLICT (id) DO NOTHING;

COMMIT;


-- ══════════════════════════════════════════════════════════════════════════
-- Verification (run manually in the SQL editor after applying)
--
-- Each block says what a BROKEN migration returns, not only what a correct one
-- returns. A check that reads the same either way is not a check.
-- ══════════════════════════════════════════════════════════════════════════

-- 1. RLS IS ACTUALLY ENABLED. Run this FIRST: pg_policies lists an unenforced
--    policy exactly as it lists an enforced one, so had ENABLE ROW LEVEL
--    SECURITY been missed, every check below would still look perfect while the
--    table sat open to authenticated.
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='mgm_ui_prefs';
--   -- correct: 1 row, rowsecurity = true
--   -- broken : rowsecurity = false, or no row

-- 2. THE WRITE RULE IS mgm_is_admin(), THE READ RULE IS NOT.
--    Both halves matter: an admin-only read would hide the layout from
--    non-admins and defeat the feature, and an auth-only write would let any
--    signed-in user rearrange the tool for everyone.
-- select policyname, cmd, qual, with_check from pg_policies
--   where schemaname='public' and tablename='mgm_ui_prefs' order by cmd, policyname;
--   -- correct: 3 rows.
--   --   SELECT  qual       = (auth.uid() IS NOT NULL)
--   --   INSERT  with_check = mgm_is_admin()
--   --   UPDATE  qual and with_check both = mgm_is_admin()
--   -- broken : the SELECT row reads mgm_is_admin()  -> non-admins see the
--   --          un-tidied page
--   --          an INSERT/UPDATE row reads auth.uid() IS NOT NULL -> any
--   --          signed-in user can hide cards for everyone
--   --          a DELETE or ALL row exists at all

-- 3. ANON HOLDS NOTHING. has_table_privilege() rather than
--    information_schema.role_table_grants: the information_schema views show
--    only rows whose grantor or grantee is an ENABLED role for the querying
--    session, so a real grant to anon can vanish from them depending on who
--    runs the query — a false all-clear on the one check that must never give
--    one. has_table_privilege reads pg_catalog and also accounts for
--    privileges reaching anon via PUBLIC or role membership.
-- select p.priv, has_table_privilege('anon','public.mgm_ui_prefs',p.priv) as anon_has
--   from (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
--                ('REFERENCES'),('TRIGGER')) as p(priv) order by 1;
--   -- correct: 7 rows, anon_has = false on every one
--   -- broken : any true

-- 4. AUTHENTICATED HOLDS EXACTLY SELECT, INSERT, UPDATE — no DELETE, and in
--    particular no TRUNCATE, which RLS does not restrain.
-- select string_agg(a.privilege_type, ', ' order by a.privilege_type) as privs
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   cross join lateral aclexplode(c.relacl) a
--   where n.nspname='public' and c.relname='mgm_ui_prefs'
--     and a.grantee = 'authenticated'::regrole::oid;
--   -- correct: INSERT, SELECT, UPDATE
--   -- broken : DELETE or TRUNCATE present — the REVOKE did not run and
--   --          Supabase's default privileges granted ALL at CREATE time

-- 5. THE TRIGGER FIRES, which is what makes updated_at a usable concurrency
--    token. Run as the table owner; this probes the trigger, not the policy.
-- begin;
--   select updated_at as before from public.mgm_ui_prefs where id='v1';
--   update public.mgm_ui_prefs set updated_by='trigger-probe' where id='v1';
--   select updated_at as after from public.mgm_ui_prefs where id='v1';
--   -- correct: after > before
--   -- broken : after = before — the trigger did not land, and two admins'
--   --          concurrent writes would both report success while one is lost
-- rollback;

-- 6. THE SINGLE-ROW AND OBJECT CONSTRAINTS ACTUALLY LANDED.
-- begin;
--   insert into public.mgm_ui_prefs (id) values ('v2');
--   -- correct: ERROR, violates check constraint mgm_ui_prefs_single_row
--   -- broken : succeeds — two rows can exist and the page reads whichever
--   --          comes back first
-- rollback;
-- begin;
--   update public.mgm_ui_prefs set hidden_sections='["a"]'::jsonb where id='v1';
--   -- correct: ERROR, violates check constraint mgm_ui_prefs_sections_is_object
--   -- broken : succeeds — a non-object reaches the client's sanitiser, which
--   --          must still fail closed to {}
-- rollback;

-- 7. THE FUNCTION IS SECURITY DEFINER WITH search_path PINNED.
-- select p.proname, p.prosecdef, p.proconfig
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public' and p.proname='touch_mgm_ui_prefs_updated_at';
--   -- correct: prosecdef = true, proconfig = {"search_path=public, pg_temp"}
--   -- broken : proconfig NULL — unpinned, and Supabase's
--   --          function_search_path_mutable lint will flag it

-- 8. THE SEED ROW EXISTS, so the first client write is an UPDATE with a real
--    token rather than two admins racing to INSERT.
-- select id, hidden_sections, updated_by from public.mgm_ui_prefs;
--   -- correct: exactly one row, id='v1', hidden_sections={}
--   -- broken : no rows

-- 9. END TO END, FROM THE APP. No query above proves the boundary works
--    through PostgREST. Signed in as an admin, hide a card and confirm the row
--    changes; signed in as a non-admin, confirm the card reads as hidden AND
--    that attempting a write fails with 403 / 42501.
