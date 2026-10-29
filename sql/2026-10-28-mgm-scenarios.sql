-- 2026-10-28 — Membership Growth Model: scenarios, P&L actuals, admin roster.
--
-- Three tables, one transaction:
--
--   mgm_admins       who may EDIT the model. Readable by any signed-in user,
--                    writable by NOBODY from a browser.
--   mgm_scenarios    a saved scenario. `state` is the tool's whole state
--                    object, so a scenario reopens exactly as saved.
--   mgm_pnl_actuals  P&L-derived figures that must never enter this PUBLIC
--                    repo: gross profit, net income, net margin, payroll,
--                    opex, settlement spread.
--
-- THIS FILE CONTAINS NO ACTUAL FIGURES. It creates the empty tables. The P&L
-- values are entered by the owner in the Supabase SQL editor, outside git.
--
-- WHY ANON HOLDS NOTHING HERE
--
-- This repo is public and the Supabase anon key is published in its committed
-- HTML. So `anon` is the public internet. Everything in this feature is
-- revoked from anon outright — a signed-in session is the only way in.
--
-- That revoke is necessary but NOT sufficient for mgm_pnl_actuals, because a
-- session is cheap to obtain while signups are open. Two further controls
-- stand behind it: the admin-only SELECT policy on that table, and the
-- dashboard signup restriction in verification item 10. Do not treat the anon
-- revoke alone as the boundary.
-- Same posture as sql/2026-10-05-bd-value-profiles.sql and
-- sql/2026-10-05-crm-leads-require-auth.sql.
--
-- READ vs WRITE
--
-- Writing is admin-only on all three tables, through public.mgm_is_admin().
-- That is a real server-side boundary, not a UI gate — a non-admin who flips
-- a flag in the browser console still cannot write a row.
--
-- Reading is NOT uniform, and the difference is deliberate:
--
--   mgm_admins       any signed-in user  (knowing who can edit buys nothing)
--   mgm_scenarios    any signed-in user  (view, print, export)
--   mgm_pnl_actuals  ADMINS ONLY         (it is the income statement)
--
-- The P&L is the exception because "signed in" is not a trusted set here: the
-- anon key is published in this repo's committed HTML and Supabase enables
-- email signups with no domain allowlist by default, so absent the dashboard
-- step in verification item 10(b), anyone who views the page source can
-- obtain a session. The policy does not rely on that step being done.
--
-- ORDER OF STATEMENTS
--
-- mgm_admins and mgm_is_admin() come FIRST because the write policies on the
-- other two tables call that function, and a policy cannot reference a
-- function that does not exist yet. Every policy below is therefore created
-- exactly once, in its final form. Do not reintroduce an earlier
-- "authenticated can write" version to be dropped later: this file is the
-- written record of the disclosure boundary, and it must state one answer to
-- "who may write?", not two.
--
-- Re-runnable: every CREATE POLICY is preceded by DROP POLICY IF EXISTS, every
-- CREATE TRIGGER by DROP TRIGGER IF EXISTS, tables and indexes use IF NOT
-- EXISTS, and each table's privileges are REVOKEd wholesale before being
-- GRANTed, so the grant statement is the complete and only statement of who
-- holds what.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- 1. mgm_admins — the write roster
--
-- The list of admin emails is deliberately readable by any signed-in user,
-- because it is not the security boundary. The boundary is the write policies
-- on the data tables below: a non-admin who bypasses the UI gate from the
-- browser console still cannot write a row. Knowing who CAN write buys
-- nothing, and a tool that cannot tell you why you are read-only is worse.
--
-- Nobody can write this table from a browser at all — no INSERT/UPDATE/DELETE
-- policy and no write grant. Membership is managed in the SQL editor. There is
-- deliberately no in-app roster screen; the missing write policy is the design,
-- not an oversight.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.mgm_admins (
  email      text        PRIMARY KEY,
  added_by   text        NOT NULL DEFAULT '',
  added_at   timestamptz NOT NULL DEFAULT now(),
  note       text        NOT NULL DEFAULT ''
);

ALTER TABLE public.mgm_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mgm_admins_read ON public.mgm_admins;
CREATE POLICY mgm_admins_read ON public.mgm_admins
  FOR SELECT USING (auth.uid() IS NOT NULL);
-- Deliberately NO insert/update/delete policy.

-- REVOKE FIRST, then GRANT. Supabase's project default privileges grant ALL on
-- newly created tables in `public` to anon and authenticated, so the verbs this
-- table must not expose have to be revoked explicitly rather than merely left
-- ungranted — the same reason sql/2026-09-09-gs-travel-vault.sql revokes
-- delete/truncate by name. TRUNCATE matters most: it is NOT subject to RLS, so
-- a leftover default TRUNCATE grant would let a signed-in non-admin empty the
-- admin roster even though no write policy exists.
REVOKE ALL ON public.mgm_admins FROM anon, authenticated;
GRANT SELECT ON public.mgm_admins TO authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 2. mgm_is_admin() — the write gate every policy below calls
--
-- Email comparison is case-insensitive and whitespace-trimmed: Supabase
-- preserves the case a user typed at signup, so a strict match would let an
-- admin silently lose access by capitalising their own address.
--
-- COALESCE(..., '') matters: a JWT with no email claim yields '', which matches
-- no row, so the function returns FALSE rather than NULL. A null predicate
-- denies too, but relying on that is worse than being explicit.
--
-- SECURITY DEFINER so the lookup is not itself subject to mgm_admins' RLS, and
-- search_path pinned per CLAUDE.md (function_search_path_mutable lint).
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.mgm_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mgm_admins a
    WHERE lower(btrim(a.email)) = lower(btrim(COALESCE(auth.jwt() ->> 'email', '')))
  );
$$;

-- Only `authenticated` ever evaluates a policy that calls this. anon holds no
-- grant on any table here, so it can never reach a policy — and with the
-- function revoked it cannot probe the roster for a known address either.
REVOKE ALL ON FUNCTION public.mgm_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mgm_is_admin() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 3. The data tables
--
-- mgm_scenarios: scope='company' rows are the shared set every signed-in
-- owner sees; scope='user' rows are personal drafts keyed by owner_email.
--
-- mgm_pnl_actuals: one row per period, id like '2026-09'. This is the table
-- the public-repo boundary exists for.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.mgm_scenarios (
  id          text        PRIMARY KEY,
  name        text        NOT NULL,
  scope       text        NOT NULL DEFAULT 'company'
                          CHECK (scope IN ('company','user')),
  owner_email text        NOT NULL DEFAULT '',
  state       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mgm_scenarios_scope ON public.mgm_scenarios (scope);

-- One company scenario per name, so a shared name never has two answers.
CREATE UNIQUE INDEX IF NOT EXISTS mgm_scenarios_one_company_per_name
  ON public.mgm_scenarios (name) WHERE scope = 'company';

CREATE TABLE IF NOT EXISTS public.mgm_pnl_actuals (
  id            text        PRIMARY KEY,          -- e.g. '2026-09'
  period_label  text        NOT NULL DEFAULT '',
  period_months integer     NOT NULL DEFAULT 12,
  member_basis  integer     NOT NULL DEFAULT 0,
  streams       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  totals        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  source        text        NOT NULL DEFAULT '',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── RLS: scenarios read by any signed-in user; P&L is admin-only ────────
-- Reading a shared scenario is useful to anyone signed in; changing one is
-- not.
--
-- The P&L does NOT get that split. Its read is admin-only, because the anon
-- key is published in this project's committed HTML and Supabase enables
-- email signups with no domain allowlist by default -- so "any signed-in
-- user" would have meant "anyone who read the page source and clicked sign
-- up", and the figures in this table are gross profit, net income, net
-- margin, payroll, opex and settlement spread. No verification query can
-- see the difference: every check in this file passes identically whether
-- signups are open or closed. So the restriction lives here, in the policy,
-- rather than depending on a dashboard toggle nothing audits.
--
-- Disabling public signups is ALSO required -- see the manual step in the
-- verification block. Both, deliberately: the policy holds if the dashboard
-- setting is ever changed or this file is applied to a fresh project, and
-- the dashboard setting limits the signed-in population that can read
-- scenarios. A saved scenario carries whatever an admin typed into the
-- ebitdaMargin assumption field, which is the one place a real net margin
-- could reach a scenario row.
ALTER TABLE public.mgm_scenarios   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mgm_pnl_actuals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mgm_scenarios_read   ON public.mgm_scenarios;
DROP POLICY IF EXISTS mgm_scenarios_insert ON public.mgm_scenarios;
DROP POLICY IF EXISTS mgm_scenarios_update ON public.mgm_scenarios;

CREATE POLICY mgm_scenarios_read   ON public.mgm_scenarios
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY mgm_scenarios_insert ON public.mgm_scenarios
  FOR INSERT WITH CHECK (public.mgm_is_admin());
CREATE POLICY mgm_scenarios_update ON public.mgm_scenarios
  FOR UPDATE USING (public.mgm_is_admin()) WITH CHECK (public.mgm_is_admin());

DROP POLICY IF EXISTS mgm_pnl_actuals_read   ON public.mgm_pnl_actuals;
DROP POLICY IF EXISTS mgm_pnl_actuals_insert ON public.mgm_pnl_actuals;
DROP POLICY IF EXISTS mgm_pnl_actuals_update ON public.mgm_pnl_actuals;

-- Admin-only, not auth.uid() IS NOT NULL. See the note above the RLS block:
-- a published anon key plus default-open signups makes "signed in" a public
-- set, and this table holds the income statement.
CREATE POLICY mgm_pnl_actuals_read   ON public.mgm_pnl_actuals
  FOR SELECT USING (public.mgm_is_admin());
CREATE POLICY mgm_pnl_actuals_insert ON public.mgm_pnl_actuals
  FOR INSERT WITH CHECK (public.mgm_is_admin());
CREATE POLICY mgm_pnl_actuals_update ON public.mgm_pnl_actuals
  FOR UPDATE USING (public.mgm_is_admin()) WITH CHECK (public.mgm_is_admin());

-- Deliberately NO delete policy on either table: removing a shared scenario or
-- a P&L period is an owner decision made in the SQL editor, not from a browser.

-- ── updated_at triggers ─────────────────────────────────────────────────
-- search_path pinned per CLAUDE.md on both.
CREATE OR REPLACE FUNCTION public.touch_mgm_scenarios_updated_at()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS mgm_scenarios_touch_updated_at ON public.mgm_scenarios;
CREATE TRIGGER mgm_scenarios_touch_updated_at
  BEFORE UPDATE ON public.mgm_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.touch_mgm_scenarios_updated_at();

CREATE OR REPLACE FUNCTION public.touch_mgm_pnl_actuals_updated_at()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS mgm_pnl_actuals_touch_updated_at ON public.mgm_pnl_actuals;
CREATE TRIGGER mgm_pnl_actuals_touch_updated_at
  BEFORE UPDATE ON public.mgm_pnl_actuals
  FOR EACH ROW EXECUTE FUNCTION public.touch_mgm_pnl_actuals_updated_at();

-- ── Grants ──────────────────────────────────────────────────────────────
-- Revoke-then-grant, for the default-privileges reason given on mgm_admins
-- above: after these four statements, anon holds nothing and authenticated
-- holds exactly SELECT, INSERT, UPDATE — no DELETE, no TRUNCATE.
-- Neither table has a serial/bigserial key, so no sequence grant is needed
-- (both primary keys are client-supplied text).
REVOKE ALL ON public.mgm_scenarios   FROM anon, authenticated;
REVOKE ALL ON public.mgm_pnl_actuals FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.mgm_scenarios   TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.mgm_pnl_actuals TO authenticated;

COMMIT;


-- ══════════════════════════════════════════════════════════════════════════
-- Verification (run manually in the SQL editor after applying)
--
-- Each block below says what a BROKEN migration returns, not only what a
-- correct one returns. A check that reads the same either way is not a check.
-- ══════════════════════════════════════════════════════════════════════════

-- 1. RLS IS ACTUALLY ENABLED.
--    Run this FIRST and do not skip it: pg_policies lists an unenforced policy
--    exactly the same way it lists an enforced one, so if ENABLE ROW LEVEL
--    SECURITY had been missed, every other query in this block would still
--    look perfect while all three tables sat wide open to authenticated.
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public'
--     and tablename in ('mgm_admins','mgm_pnl_actuals','mgm_scenarios')
--   order by tablename;
--   -- correct: 3 rows, rowsecurity = true on every one
--   -- broken : any row with rowsecurity = false, or fewer than 3 rows

-- 2. THE WRITE RULE IS mgm_is_admin(), NOT "any signed-in user".
-- select tablename, policyname, cmd, qual, with_check from pg_policies
--   where schemaname='public'
--     and tablename in ('mgm_scenarios','mgm_pnl_actuals')
--   order by tablename, cmd, policyname;
--   -- correct: 6 rows. The two SELECT rows read (auth.uid() IS NOT NULL);
--   --          all four INSERT/UPDATE rows read mgm_is_admin() in with_check
--   --          (and in qual for the UPDATEs).
--   -- broken : an INSERT or UPDATE row whose with_check says
--   --          (auth.uid() IS NOT NULL) — the admin gate did not land and
--   --          every signed-in user can rewrite the P&L.

-- 3. NOBODY CAN WRITE THE ADMIN ROSTER, AND NOTHING CAN BE DELETED.
--    `cmd <> 'SELECT'` also catches a FOR ALL policy, which reports as 'ALL'.
-- select tablename, policyname, cmd from pg_policies
--   where schemaname='public'
--     and ( (tablename = 'mgm_admins' and cmd <> 'SELECT')
--        or (tablename in ('mgm_scenarios','mgm_pnl_actuals') and cmd in ('DELETE','ALL')) );
--   -- correct: 0 rows
--   -- broken : any row at all

-- 4. ANON HOLDS NOTHING. This is the check that keeps the P&L off the public
--    web — the anon key is published in this repo's committed HTML, so a
--    single stray anon privilege publishes the table to the internet.
--
--    has_table_privilege() is used deliberately instead of
--    information_schema.role_table_grants. The information_schema privilege
--    views show only rows whose grantor or grantee is a currently ENABLED role
--    for the session running the query. In the Supabase SQL editor that is
--    normally fine (postgres is a member of anon, so anon rows are visible),
--    but that visibility is a property of the session, not of the grant: run
--    the same query from a role without that membership and a real grant to
--    anon vanishes from the view, returning zero rows — a false all-clear on
--    the one check that must never give one. has_table_privilege() reads
--    pg_catalog and is not filtered that way. It also accounts for privileges
--    reaching anon via PUBLIC or via role membership, which a
--    grantee = 'anon' filter would miss entirely.
-- select t.tbl, p.priv, has_table_privilege('anon', t.tbl, p.priv) as anon_has
--   from (values ('public.mgm_scenarios'),('public.mgm_pnl_actuals'),
--                ('public.mgm_admins')) as t(tbl),
--        (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
--                ('REFERENCES'),('TRIGGER')) as p(priv)
--   order by 1, 2;
--   -- correct: 21 rows, anon_has = false on every one
--   -- broken : any true. If one appears, this names the ACL entry behind it
--   --          (grantee 0 = PUBLIC):
-- select c.relname, a.privilege_type, a.grantee::regrole::text as granted_to
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   cross join lateral aclexplode(c.relacl) a
--   where n.nspname='public'
--     and c.relname in ('mgm_scenarios','mgm_pnl_actuals','mgm_admins')
--     and (a.grantee = 'anon'::regrole::oid or a.grantee = 0)
--   order by 1, 2;
--   -- correct: 0 rows

-- 5. AUTHENTICATED HOLDS EXACTLY WHAT IT SHOULD — and in particular no
--    TRUNCATE, which RLS does not restrain, and no DELETE.
-- select c.relname,
--        string_agg(a.privilege_type, ', ' order by a.privilege_type) as privs
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   cross join lateral aclexplode(c.relacl) a
--   where n.nspname='public'
--     and c.relname in ('mgm_scenarios','mgm_pnl_actuals','mgm_admins')
--     and a.grantee = 'authenticated'::regrole::oid
--   group by c.relname order by 1;
--   -- correct: mgm_admins = SELECT
--   --          mgm_pnl_actuals = INSERT, SELECT, UPDATE
--   --          mgm_scenarios   = INSERT, SELECT, UPDATE
--   -- broken : DELETE or TRUNCATE in any row — the REVOKE did not run, and
--   --          Supabase's default privileges granted ALL at CREATE time.

-- 6. ALL THREE FUNCTIONS ARE SECURITY DEFINER WITH search_path PINNED.
-- select p.proname, p.prosecdef, p.proconfig
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public'
--     and p.proname in ('mgm_is_admin','touch_mgm_scenarios_updated_at',
--                       'touch_mgm_pnl_actuals_updated_at')
--   order by 1;
--   -- correct: 3 rows, prosecdef = true, proconfig = {"search_path=public, pg_temp"}
--   -- broken : proconfig NULL on any row — unpinned, and Supabase's
--   --          function_search_path_mutable lint will flag it

-- 7. THE PARTIAL UNIQUE INDEX ACTUALLY LANDED. Run as the table owner, which
--    bypasses RLS — that is the point: this probes the index, not the policy.
-- begin;
--   insert into public.mgm_scenarios (id, name) values ('probe1','dupe-probe');
--   insert into public.mgm_scenarios (id, name) values ('probe2','dupe-probe');
--   -- correct: the SECOND insert ERRORs with
--   --          "duplicate key value violates unique constraint
--   --           mgm_scenarios_one_company_per_name"
--   -- broken : both succeed — the partial unique index did not land and two
--   --          company scenarios can share one name
-- rollback;

-- 8. THE ADMIN GATE ACTUALLY GATES — both directions.
--
--    NOTE: a bare `select public.mgm_is_admin();` in the SQL editor returns
--    FALSE even when everything is correct, because the editor session carries
--    no JWT: request.jwt.claims is unset, so auth.jwt() is NULL, the email
--    COALESCEs to '' and matches no row. That FALSE is not a failure. Set the
--    claim explicitly to test it, and test a non-admin address too — a gate
--    that only ever says yes has not been tested.
-- begin;
--   select set_config('request.jwt.claims',
--                     '{"email":"jasonvega1974@gmail.com"}', true);
--   select public.mgm_is_admin();   -- correct: TRUE  (after the seed below)
--   select set_config('request.jwt.claims',
--                     '{"email":"NOT-an-admin@example.com"}', true);
--   select public.mgm_is_admin();   -- correct: FALSE
--   select set_config('request.jwt.claims',
--                     '{"email":"  JasonVega1974@Gmail.com  "}', true);
--   select public.mgm_is_admin();   -- correct: TRUE (case/whitespace-insensitive)
--   -- broken : the second returns TRUE (the gate admits anyone), or the first
--   --          or third returns FALSE after seeding (the gate admits nobody)
-- rollback;

-- 9. SEED THE FIRST ADMIN. Replace the address only if the owner changes.
--    WITHOUT THIS NOBODY CAN EDIT and the tool is read-only for everyone — a
--    fresh migration leaves mgm_admins empty, and that is the expected state,
--    not a bug. Everyone else who signs in stays read-only by design: view,
--    print, export. There is no in-app roster management; this INSERT, run by
--    hand here, is the whole mechanism.
-- insert into public.mgm_admins (email, note)
--   values ('jasonvega1974@gmail.com', 'project owner')
--   on conflict (email) do nothing;
-- select email, added_at from public.mgm_admins order by email;
--   -- correct: exactly one row
--
--    Then confirm end-to-end from the app while signed in as that account:
--    saving a scenario must succeed as that user, and must fail with a 403 /
--    42501 for any other signed-in account. That round trip, not any query
--    above, is the proof the boundary works through PostgREST.

-- 10. THE P&L READ IS ADMIN-ONLY — confirm the policy, then close signups.
--     Both halves are required; neither substitutes for the other.
--
--     (a) The policy. mgm_pnl_actuals must be admin-gated on SELECT as well
--         as on write, unlike mgm_scenarios which is readable by any
--         signed-in user:
-- select tablename, policyname, cmd, qual
--   from pg_policies
--  where schemaname = 'public'
--    and tablename in ('mgm_scenarios', 'mgm_pnl_actuals')
--    and cmd = 'SELECT'
--  order by tablename;
--   -- correct: mgm_pnl_actuals_read qual contains mgm_is_admin()
--   --          mgm_scenarios_read   qual contains auth.uid() IS NOT NULL
--   -- broken : mgm_pnl_actuals_read reads auth.uid() IS NOT NULL — that is
--   --          the pre-hardening policy, and it exposes the income statement
--   --          to anyone who can obtain a session (see (b)).
--
--     (b) Public signups. NO QUERY IN THIS FILE CAN CHECK THIS — it is a
--         dashboard setting, and every verification above passes identically
--         whether it is on or off. Do it by hand, in the Supabase dashboard:
--
--           Authentication → Sign In / Providers → Email
--             • turn OFF "Enable email signups" (invite/admin-create only), or
--             • restrict signups to the company domain via an allowlist
--
--         Why it still matters once (a) is in place: the anon key is published
--         in this repo's committed HTML, so without this a stranger can create
--         a session at will. They could not read the P&L after (a), but they
--         could read every shared scenario — and a scenario carries whatever
--         an admin typed into the ebitdaMargin assumption field, which is the
--         one route by which a real net margin can reach a scenario row.
--
--         Re-check this setting after any Supabase project migration, restore,
--         or clone. It is the only control here that lives outside this file.
