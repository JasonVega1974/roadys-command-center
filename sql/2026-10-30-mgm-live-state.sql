-- 2026-10-30 — Membership Growth Model: one shared "live state" row.
--
-- ONE TABLE, ONE ROW, same shape as mgm_ui_prefs (sql/2026-10-29-mgm-ui-
-- prefs.sql):
--
--   read   any signed-in user   — the whole point is that non-admins (and
--                                  an admin on a second device) see what
--                                  was last published
--   write  ADMINS ONLY          — through public.mgm_is_admin()
--
-- WHAT THIS REPLACES
--
-- Scenario-based sharing (mgm_scenarios) is being retired in favour of this:
-- one admin edits locally, as always, and an explicit Publish pushes the
-- current state here. Every other signed-in viewer sees that published
-- state on their next page load. No real-time push, no autosave on every
-- keystroke -- Publish is a deliberate action, same as Save-scenario was.
-- The scenario UI is hidden (not deleted) by a page-side flag; this table
-- does not depend on that flag and would work identically if scenarios were
-- ever brought back alongside it.
--
-- WHY THIS IS NOT NEW EXPOSURE
--
-- mgm_scenarios already stores full-state snapshots and is already readable
-- by any signed-in user -- a saved scenario IS the whole model state. This
-- table does not widen what is exposed, only how it is delivered: one
-- current row instead of a growing list of named snapshots. The same
-- containment that protects every other outbound path in this tool
-- (MM.stripResidue + MM.residueVerdict, verified on the OUTBOUND PAYLOAD
-- ITSELF, not on the assumption that a strip ran upstream) runs on Publish
-- too -- see MGM.publishState in membership-growth-model/index.html.
--
-- CONCURRENCY: CONFLICT DETECTION, NOT MERGE
--
-- mgm_ui_prefs' hiddenSections uses optimistic concurrency with a retry:
-- on a lost race it re-reads and reapplies the SAME DELTA, which is safe
-- because a delta there is "toggle one key" -- trivially re-appliable
-- against any snapshot. A full model state has no equivalent trivial delta:
-- it is hundreds of fields, several of them admin-mutable ARRAYS (groups,
-- sources, history, staffing.reps) where a real delta would need a 3-way
-- merge (base/local/remote) including reconciling reorders. That is a much
-- harder problem than this feature needs for a two-admin team.
--
-- So Publish uses optimistic concurrency with DETECTION ONLY: it compares
-- against the updated_at the publishing admin last saw (at page load, or
-- their last Pull, or their last successful Publish), and if the row has
-- changed since, the publish is REFUSED outright -- never silently merged,
-- never silently overwritten. The admin is told plainly that someone else
-- published since they last loaded, and must reload or Pull the latest
-- state and reapply their change on top of it. This is a deliberate,
-- named simplification; fails loud rather than risking silent corruption.
--
-- Re-runnable: IF NOT EXISTS on the table, DROP POLICY IF EXISTS before each
-- CREATE POLICY, DROP TRIGGER IF EXISTS before the CREATE TRIGGER, and
-- privileges REVOKEd wholesale before being GRANTed so the grant statement
-- is the complete and only statement of who holds what.
--
-- DEPENDS ON sql/2026-10-28-mgm-scenarios.sql, which creates
-- public.mgm_admins and public.mgm_is_admin(). Apply that first: the write
-- policies below reference that function and a policy cannot reference one
-- that does not exist yet.

BEGIN;

CREATE TABLE IF NOT EXISTS public.mgm_live_state (
  id           text        PRIMARY KEY DEFAULT 'v1',
  state        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  published_by text        NOT NULL DEFAULT '',
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- SINGLE ROW BY CONSTRUCTION. Without this, a second row is not an error
  -- and the page would silently read whichever one came back first -- two
  -- answers to "what is published", resolved by row order.
  CONSTRAINT mgm_live_state_single_row CHECK (id = 'v1'),

  -- A JSON OBJECT, not an array, string, number or null. The client's own
  -- containment (stripResidue + residueVerdict) is the real protection for
  -- WHAT the object may contain; this is only the backstop for anything
  -- that reaches the table without going through the client at all (the
  -- SQL editor, a future script).
  CONSTRAINT mgm_live_state_is_object CHECK (jsonb_typeof(state) = 'object')
);

ALTER TABLE public.mgm_live_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mgm_live_state_read   ON public.mgm_live_state;
DROP POLICY IF EXISTS mgm_live_state_insert ON public.mgm_live_state;
DROP POLICY IF EXISTS mgm_live_state_update ON public.mgm_live_state;

-- Any signed-in user READS. This is the entire point of the feature: a
-- non-admin (or an admin who has not published from this device) sees the
-- latest published state.
CREATE POLICY mgm_live_state_read ON public.mgm_live_state
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only admins WRITE. Real server-side boundary, not a UI gate: a non-admin
-- who sets MGM.isAdmin = true in the console still cannot write.
CREATE POLICY mgm_live_state_insert ON public.mgm_live_state
  FOR INSERT WITH CHECK (public.mgm_is_admin());
CREATE POLICY mgm_live_state_update ON public.mgm_live_state
  FOR UPDATE USING (public.mgm_is_admin()) WITH CHECK (public.mgm_is_admin());

-- Deliberately NO delete policy. There is nothing to delete: the row is
-- permanent and "un-publishing" is not a concept here -- publishing the
-- shipped defaults back would be the equivalent, as an ordinary UPDATE. A
-- DELETE policy would also break the optimistic-concurrency token by
-- letting the row vanish between a read and a later write.

-- ── updated_at trigger ──────────────────────────────────────────────────
-- This column is the CONCURRENCY TOKEN, not decoration -- Publish writes
-- with .eq('updated_at', seen), so the value MUST change on every update or
-- two admins' publishes could both appear to succeed while one silently
-- overwrote the other. Hence a trigger rather than trusting the client to
-- send a new timestamp.
--
-- search_path pinned per CLAUDE.md (function_search_path_mutable lint).
CREATE OR REPLACE FUNCTION public.touch_mgm_live_state_updated_at()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS mgm_live_state_touch_updated_at ON public.mgm_live_state;
CREATE TRIGGER mgm_live_state_touch_updated_at
  BEFORE UPDATE ON public.mgm_live_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_mgm_live_state_updated_at();

-- ── Grants ──────────────────────────────────────────────────────────────
-- REVOKE FIRST, then GRANT. Supabase's project default privileges grant ALL
-- on newly created tables in `public` to anon and authenticated, so verbs
-- this table must not expose have to be revoked explicitly rather than
-- merely left ungranted. TRUNCATE matters most: it is NOT subject to RLS,
-- so a leftover default grant would let a signed-in non-admin empty this
-- table despite the admin-only write policies.
--
-- anon holds NOTHING: the anon key is published in this repo's committed
-- HTML, so anon is the public internet. A signed-in session is the only
-- way in.
REVOKE ALL ON public.mgm_live_state FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.mgm_live_state TO authenticated;

-- Seed the single row so the first Publish is an UPDATE with a real
-- concurrency token rather than an INSERT race between two admins, and so a
-- non-admin's very first load has something to read (the shipped defaults,
-- via an empty state object -- see MM.mergeState's defaults-win-for-absent-
-- keys behaviour).
INSERT INTO public.mgm_live_state (id, state, published_by)
  VALUES ('v1', '{}'::jsonb, 'migration')
  ON CONFLICT (id) DO NOTHING;

COMMIT;


-- ══════════════════════════════════════════════════════════════════════════
-- Verification (run manually in the SQL editor after applying)
--
-- Each block says what a BROKEN migration returns, not only what a correct
-- one returns. A check that reads the same either way is not a check.
-- ══════════════════════════════════════════════════════════════════════════

-- 1. RLS IS ACTUALLY ENABLED. Run this FIRST.
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='mgm_live_state';
--   -- correct: 1 row, rowsecurity = true
--   -- broken : rowsecurity = false, or no row

-- 2. THE WRITE RULE IS mgm_is_admin(), THE READ RULE IS NOT. Both halves
--    matter: an admin-only read would hide publishes from non-admins and
--    defeat the feature; an auth-only write would let any signed-in user
--    publish state for everyone.
-- select policyname, cmd, qual, with_check from pg_policies
--   where schemaname='public' and tablename='mgm_live_state' order by cmd, policyname;
--   -- correct: 3 rows.
--   --   SELECT  qual       = (auth.uid() IS NOT NULL)
--   --   INSERT  with_check = mgm_is_admin()
--   --   UPDATE  qual and with_check both = mgm_is_admin()
--   -- broken : the SELECT row reads mgm_is_admin() -> non-admins never see
--   --          a publish; an INSERT/UPDATE row reads auth.uid() IS NOT NULL
--   --          -> any signed-in user can publish for everyone; a DELETE or
--   --          ALL row exists at all

-- 3. ANON HOLDS NOTHING.
-- select p.priv, has_table_privilege('anon','public.mgm_live_state',p.priv) as anon_has
--   from (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
--                ('REFERENCES'),('TRIGGER')) as p(priv) order by 1;
--   -- correct: 7 rows, anon_has = false on every one
--   -- broken : any true

-- 4. AUTHENTICATED HOLDS EXACTLY SELECT, INSERT, UPDATE.
-- select string_agg(a.privilege_type, ', ' order by a.privilege_type) as privs
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   cross join lateral aclexplode(c.relacl) a
--   where n.nspname='public' and c.relname='mgm_live_state'
--     and a.grantee = 'authenticated'::regrole::oid;
--   -- correct: INSERT, SELECT, UPDATE
--   -- broken : DELETE or TRUNCATE present

-- 5. THE TRIGGER FIRES.
-- begin;
--   select updated_at as before from public.mgm_live_state where id='v1';
--   update public.mgm_live_state set published_by='trigger-probe' where id='v1';
--   select updated_at as after from public.mgm_live_state where id='v1';
--   -- correct: after > before
--   -- broken : after = before -- two admins' concurrent publishes would
--   --          both report success while one silently overwrote the other
-- rollback;

-- 6. THE SINGLE-ROW AND OBJECT CONSTRAINTS ACTUALLY LANDED.
-- begin;
--   insert into public.mgm_live_state (id) values ('v2');
--   -- correct: ERROR, violates check constraint mgm_live_state_single_row
-- rollback;
-- begin;
--   update public.mgm_live_state set state='["a"]'::jsonb where id='v1';
--   -- correct: ERROR, violates check constraint mgm_live_state_is_object
-- rollback;

-- 7. THE FUNCTION IS SECURITY DEFINER WITH search_path PINNED.
-- select p.prosecdef, p.proconfig from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public' and p.proname='touch_mgm_live_state_updated_at';
--   -- correct: prosecdef = true, proconfig = {"search_path=public, pg_temp"}

-- 8. THE SEED ROW EXISTS.
-- select id, state, published_by from public.mgm_live_state;
--   -- correct: exactly one row, id='v1', state={}

-- 9. END TO END, FROM THE APP. No query above proves the boundary works
--    through PostgREST. Signed in as an admin, publish and confirm the row
--    changes; signed in as a non-admin, confirm the published state loads
--    AND that attempting a write fails with 403 / 42501.
