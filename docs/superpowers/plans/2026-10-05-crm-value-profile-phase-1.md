# CRM × Value Profile — Phase 1 (Supabase Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put Bus Dev value profiles in Supabase, linked to CRM leads, behind a real login, with draft autosave that survives a reload on any browser.

**Architecture:** One shared UMD module (`roadysBD.js`) owns the Supabase client, the auth session and all `bd_value_profiles` reads/writes, so the CRM, the calculator and the Implementation page never duplicate the mapping. The recommendation rule lives in `bdpgStats.js` beside the other tested rules. The calculator's existing localStorage draft layer is re-pointed at Supabase rather than rewritten, keeping its restore, hardening and quota behaviour.

**Tech Stack:** Vanilla ES5-style browser JS (no build step), `@supabase/supabase-js@2` from jsDelivr, UMD modules shared via `<script src>`, `node --test` for unit tests, Postgres/Supabase for storage.

**Spec:** `docs/superpowers/specs/2026-10-05-crm-value-profile-integration-design.md`

## Global Constraints

- **No formula change.** Every multiplier in `busDevGallonsCalculator.js` is untouched. `node --test *.test.js` must stay at **242 passing** plus whatever this plan adds.
- **Migration B is held.** `sql/2026-10-05-crm-leads-require-auth.sql` is written in Task 1 but **NOT applied** until the user confirms the login works on `CRM.html`, `implementation.html` and the calculator in a second browser. Task 9 is the gate.
- **New tables follow CLAUDE.md:** RLS enabled *with* explicit policies, grants stated, `search_path` pinned on every trigger function (`set search_path = public, pg_temp`).
- **Migrations live in `sql/YYYY-MM-DD-<slug>.sql`**, wrapped in `BEGIN; … COMMIT;`, with a commented verification block at the foot.
- **No existing CRM feature regresses:** Kanban drag-and-drop, calendar, auto-scheduler, email templates, notes, scheduled calls, CSV import/export, deleted-lead restore, analytics, the `?lead=&call=` deep link, the 90-second background refresh.
- **Supabase is the source of truth.** `localStorage` is an offline cache only, never rendered without a session.
- **Stage rule:** saving a profile never moves a lead silently. It prompts, and only for leads at Prospect or Qualified. See spec §0.1.
- **Author** on every profile row is the session email, falling back to `crmWhoAmI()` when no session field is available.
- Branch off `main` before the first commit. The user runs `git push`; this plan commits locally only.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `sql/2026-10-05-bd-value-profiles.sql` | New table, 5 indexes, 2 trigger fns, RLS, grants | Create |
| `sql/2026-10-05-crm-leads-require-auth.sql` | Swap `crm_leads` anon → authenticated | Create (apply later) |
| `roadysBD.js` | Supabase client + auth session + profile CRUD + row mapping | Create |
| `roadysBD.test.js` | Unit tests for the row mapping (pure, no network) | Create |
| `bdpgStats.js` | Add `recommendation(finalGallons)` to the existing rules module | Modify |
| `bdpgStats.test.js` | Tests for the band boundaries | Modify |
| `CRM.html` | Load shared modules, login gate, clear cache on sign-out | Modify |
| `bus-dev-potential-gallons/index.html` | Login gate, draft layer → Supabase, Save to Prospects → leads | Modify |
| `implementation.html` | Login gate, hard-delete → soft-delete fix | Modify |

---

## Task 1: Migrations

**Files:**
- Create: `sql/2026-10-05-bd-value-profiles.sql`
- Create: `sql/2026-10-05-crm-leads-require-auth.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.bd_value_profiles` with columns `id, lead_id, status, prospect_name, city, state_code, location_type, region, profile, roadway, inputs, results, official_subtotal, final_gallons, recommendation, region_pct_stamp, baseline_stamp, author, created_at, updated_at, deleted_at`. Every later task reads/writes these exact names.

- [ ] **Step 1: Create the branch**

```bash
git checkout main
git checkout -b feat/crm-value-profile-phase-1
```

- [ ] **Step 2: Write `sql/2026-10-05-bd-value-profiles.sql`**

```sql
BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- bd_value_profiles — a Bus Dev Potential Gallons value profile, optionally
-- linked to a CRM lead. Drafts and finals share the table; `status` tells
-- them apart. The full breakdown lives in inputs/results jsonb; the columns
-- beside them are the fields CRM.html renders and aggregates, promoted out
-- of jsonb so the Lead Table, CSV and leaderboard need no extraction and
-- SUM(final_gallons) works directly.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.bd_value_profiles (
  id                text        PRIMARY KEY,
  -- SET NULL, not CASCADE: a lead row vanishing must orphan the profile,
  -- never destroy it.
  lead_id           text        REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  status            text        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','final')),
  prospect_name     text        NOT NULL DEFAULT '',
  city              text        NOT NULL DEFAULT '',
  state_code        text        NOT NULL DEFAULT '',
  location_type     text        NOT NULL DEFAULT '',
  region            text        NOT NULL DEFAULT '',
  profile           text        NOT NULL DEFAULT '',
  roadway           text        NOT NULL DEFAULT '',
  inputs            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  results           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  official_subtotal integer,
  final_gallons     integer,
  recommendation    text        NOT NULL DEFAULT '',
  -- Provenance, mirroring the stamps the tool already keeps: the region % and
  -- baseline the stored gallons were computed on, so a figure can be told
  -- apart from one computed on today's scale.
  region_pct_stamp  text        NOT NULL DEFAULT '',
  baseline_stamp    text        NOT NULL DEFAULT '',
  author            text        NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX IF NOT EXISTS bd_value_profiles_lead_id
  ON public.bd_value_profiles (lead_id);
CREATE INDEX IF NOT EXISTS bd_value_profiles_status
  ON public.bd_value_profiles (status);
CREATE INDEX IF NOT EXISTS bd_value_profiles_deleted_at
  ON public.bd_value_profiles (deleted_at);

-- One FINAL profile per lead, so a lead card never has two numbers to choose
-- between.
CREATE UNIQUE INDEX IF NOT EXISTS bd_value_profiles_one_final_per_lead
  ON public.bd_value_profiles (lead_id)
  WHERE status = 'final' AND deleted_at IS NULL AND lead_id IS NOT NULL;

-- One DRAFT per lead, for the same reason: drafts are shared between owners,
-- so two drafts for one lead would be two answers to the same question.
CREATE UNIQUE INDEX IF NOT EXISTS bd_value_profiles_one_draft_per_lead
  ON public.bd_value_profiles (lead_id)
  WHERE status = 'draft' AND deleted_at IS NULL AND lead_id IS NOT NULL;

-- A draft not yet linked to a lead has lead_id IS NULL and cannot be
-- constrained that way, so those are keyed per author — Robert's unlinked
-- draft and Angel's must never collide.
CREATE UNIQUE INDEX IF NOT EXISTS bd_value_profiles_one_unlinked_draft_per_author
  ON public.bd_value_profiles (author)
  WHERE status = 'draft' AND deleted_at IS NULL AND lead_id IS NULL;

-- search_path pinned per CLAUDE.md (function_search_path_mutable lint).
CREATE OR REPLACE FUNCTION public.touch_bd_value_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS bd_value_profiles_touch_updated_at ON public.bd_value_profiles;
CREATE TRIGGER bd_value_profiles_touch_updated_at
  BEFORE UPDATE ON public.bd_value_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_bd_value_profiles_updated_at();

-- ── RLS: authenticated only ─────────────────────────────────────────────
-- The anon key is published in this repo's HTML on GitHub Pages, so anon is
-- granted nothing at all here. A signed-in session is the only way in.
ALTER TABLE public.bd_value_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bd_value_profiles_read   ON public.bd_value_profiles;
DROP POLICY IF EXISTS bd_value_profiles_insert ON public.bd_value_profiles;
DROP POLICY IF EXISTS bd_value_profiles_update ON public.bd_value_profiles;

CREATE POLICY bd_value_profiles_read   ON public.bd_value_profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY bd_value_profiles_insert ON public.bd_value_profiles
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY bd_value_profiles_update ON public.bd_value_profiles
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
-- No DELETE policy: removal is a soft delete (deleted_at), same as crm_leads.

GRANT SELECT, INSERT, UPDATE ON public.bd_value_profiles TO authenticated;
REVOKE ALL ON public.bd_value_profiles FROM anon;

-- ── crm_leads: index + a real updated_at trigger ────────────────────────
-- updated_at is currently set by CRM.html on every upsert, so a row written
-- by any other path keeps a stale value. The trigger makes it true regardless
-- of who writes.
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS crm_leads_stage ON public.crm_leads (stage);

CREATE OR REPLACE FUNCTION public.touch_crm_leads_updated_at()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_touch_updated_at ON public.crm_leads;
CREATE TRIGGER crm_leads_touch_updated_at
  BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_crm_leads_updated_at();

COMMIT;

-- ── Verification (run manually in the SQL editor after applying) ────────
-- select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='bd_value_profiles'
--   order by ordinal_position;
-- select policyname, cmd from pg_policies
--   where schemaname='public' and tablename='bd_value_profiles';
-- select indexname from pg_indexes
--   where schemaname='public' and tablename='bd_value_profiles';
-- -- must return 0 rows (anon holds no grant):
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name='bd_value_profiles' and grantee='anon';
```

- [ ] **Step 3: Write `sql/2026-10-05-crm-leads-require-auth.sql`**

```sql
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
```

- [ ] **Step 4: Verify both files parse as SQL text and are correctly placed**

Run: `ls -la sql/2026-10-05-*.sql && grep -c "BEGIN;" sql/2026-10-05-bd-value-profiles.sql sql/2026-10-05-crm-leads-require-auth.sql`
Expected: both files listed; each reports `1`.

- [ ] **Step 5: Hand the user Migration A to apply**

Print the full contents of `sql/2026-10-05-bd-value-profiles.sql` in chat and ask the user to run it in the Supabase SQL editor, plus the dashboard step: **Authentication → Providers → Email → turn OFF "Enable sign ups"**, then create the three accounts by hand. Wait for confirmation that the verification queries returned the expected rows before Task 2.

- [ ] **Step 6: Commit**

```bash
git add sql/2026-10-05-bd-value-profiles.sql sql/2026-10-05-crm-leads-require-auth.sql
git commit -m "feat(sql): bd_value_profiles table and the held crm_leads auth migration"
```

---

## Task 2: `roadysBD.js` — row mapping

Mapping first, in isolation, because it is the only part of the module that is pure and therefore the only part worth unit-testing. Auth and network come in Task 3.

**Files:**
- Create: `roadysBD.js`
- Test: `roadysBD.test.js`

**Interfaces:**
- Consumes: the column names from Task 1.
- Produces: `RoadysBD.map.toRow(profile)` → snake_case object; `RoadysBD.map.fromRow(row)` → camelCase object with keys `id, leadId, status, prospectName, city, stateCode, locationType, region, profile, roadway, inputs, results, officialSubtotal, finalGallons, recommendation, regionPctStamp, baselineStamp, author, createdAt, updatedAt`. Tasks 4–7 use these names.

- [ ] **Step 1: Write the failing test**

Create `roadysBD.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { RoadysBD } = require('./roadysBD.js');

test('toRow converts camelCase to the column names the table uses', () => {
  const row = RoadysBD.map.toRow({
    id: 'bdp_1', leadId: 'CRM-123456', status: 'final',
    prospectName: "Dysart's", city: 'Hermon', stateCode: 'ME',
    locationType: 'Truck Stop', region: 'Northeast',
    profile: 'Medium truck stop', roadway: 'Interstate',
    inputs: { pricingLevel: 0 }, results: { finalGallons: 11153 },
    officialSubtotal: 11153, finalGallons: 11153,
    recommendation: 'Good fit', regionPctStamp: '6.3',
    baselineStamp: '10492', author: 'robert@example.com'
  });
  assert.equal(row.lead_id, 'CRM-123456');
  assert.equal(row.prospect_name, "Dysart's");
  assert.equal(row.state_code, 'ME');
  assert.equal(row.location_type, 'Truck Stop');
  assert.equal(row.official_subtotal, 11153);
  assert.equal(row.final_gallons, 11153);
  assert.equal(row.region_pct_stamp, '6.3');
  assert.equal(row.baseline_stamp, '10492');
  // camelCase keys must not survive into the row
  assert.equal(row.leadId, undefined);
  assert.equal(row.finalGallons, undefined);
});

test('fromRow is the exact inverse of toRow', () => {
  const profile = {
    id: 'bdp_2', leadId: null, status: 'draft',
    prospectName: 'Vega Travel Plaza', city: 'Idaho Falls', stateCode: 'ID',
    locationType: 'Truck Stop', region: 'Northwest',
    profile: 'Large truck stop', roadway: 'Interstate',
    inputs: { amenityLevel: 'Average' }, results: {},
    officialSubtotal: null, finalGallons: null,
    recommendation: '', regionPctStamp: '', baselineStamp: '',
    author: 'angel@example.com'
  };
  const back = RoadysBD.map.fromRow(RoadysBD.map.toRow(profile));
  Object.keys(profile).forEach(k => assert.deepEqual(back[k], profile[k], k));
});

test('fromRow coerces a missing or wrong-typed column to a safe default', () => {
  // A hand-edited row must not reach the DOM as undefined or [object Object].
  const back = RoadysBD.map.fromRow({ id: 'bdp_3', prospect_name: { x: 1 } });
  assert.equal(back.prospectName, '');
  assert.equal(back.status, 'draft');
  assert.equal(back.leadId, null);
  assert.equal(back.finalGallons, null);
  assert.deepEqual(back.inputs, {});
});

test('toRow never emits a status the CHECK constraint would reject', () => {
  assert.equal(RoadysBD.map.toRow({ status: 'nonsense' }).status, 'draft');
  assert.equal(RoadysBD.map.toRow({ status: 'final' }).status, 'final');
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test roadysBD.test.js`
Expected: FAIL — `Cannot find module './roadysBD.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `roadysBD.js`:

```js
/* roadysBD.js — shared Supabase layer for the Business Development tools.
 *
 * Loaded by CRM.html, bus-dev-potential-gallons/index.html and
 * implementation.html. UMD with no DOM access, so the mapping below is
 * unit-testable under `node --test` exactly like busDevGallonsCalculator.js
 * and bdpgStats.js.
 *
 * Why the mapping lives in one place: CRM.html already writes the same
 * 20-field crm_leads mapping twice, in opposite directions, 80 lines apart
 * (crmLoadFromSupabase / crmSaveLeadToSupabase). One drifted field there is a
 * silent data loss. This module is the one definition for profiles.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoadysBD = factory().RoadysBD;
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var STATUSES = ['draft', 'final'];

  // The guard set, matching the discipline the BDPG tool already uses:
  // str() for text, num() for stored numbers, obj() for jsonb. A hand-edited
  // or half-written row must degrade to a safe default rather than reach the
  // DOM as "undefined" or "[object Object]".
  function str(v) { return typeof v === 'string' ? v : ''; }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function obj(v) {
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }
  function status(v) {
    return STATUSES.indexOf(v) !== -1 ? v : 'draft';
  }
  // lead_id is nullable by design (an unlinked draft), so '' must become null
  // rather than an empty string the FK would reject.
  function leadId(v) { return (typeof v === 'string' && v) ? v : null; }

  function toRow(p) {
    p = p || {};
    return {
      id:                str(p.id),
      lead_id:           leadId(p.leadId),
      status:            status(p.status),
      prospect_name:     str(p.prospectName),
      city:              str(p.city),
      state_code:        str(p.stateCode),
      location_type:     str(p.locationType),
      region:            str(p.region),
      profile:           str(p.profile),
      roadway:           str(p.roadway),
      inputs:            obj(p.inputs),
      results:           obj(p.results),
      official_subtotal: num(p.officialSubtotal),
      final_gallons:     num(p.finalGallons),
      recommendation:    str(p.recommendation),
      region_pct_stamp:  str(p.regionPctStamp),
      baseline_stamp:    str(p.baselineStamp),
      author:            str(p.author)
    };
  }

  function fromRow(r) {
    r = r || {};
    return {
      id:               str(r.id),
      leadId:           leadId(r.lead_id),
      status:           status(r.status),
      prospectName:     str(r.prospect_name),
      city:             str(r.city),
      stateCode:        str(r.state_code),
      locationType:     str(r.location_type),
      region:           str(r.region),
      profile:          str(r.profile),
      roadway:          str(r.roadway),
      inputs:           obj(r.inputs),
      results:          obj(r.results),
      officialSubtotal: num(r.official_subtotal),
      finalGallons:     num(r.final_gallons),
      recommendation:   str(r.recommendation),
      regionPctStamp:   str(r.region_pct_stamp),
      baselineStamp:    str(r.baseline_stamp),
      author:           str(r.author)
    };
  }

  var RoadysBD = { map: { toRow: toRow, fromRow: fromRow } };
  return { RoadysBD: RoadysBD };
}));
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node --test roadysBD.test.js`
Expected: PASS, 4 tests.

Note: the inverse test passes `createdAt`/`updatedAt` nowhere — they are server-assigned and deliberately absent from both maps. If a later task needs them for display, read them off the raw row.

- [ ] **Step 5: Confirm the existing suite is untouched**

Run: `node --test *.test.js 2>&1 | grep -E "^. (tests|pass|fail)"`
Expected: `tests 246`, `pass 246`, `fail 0` (242 existing + 4 new).

- [ ] **Step 6: Commit**

```bash
git add roadysBD.js roadysBD.test.js
git commit -m "feat(bd): shared profile row mapping with guarded coercion"
```

---

## Task 3: `roadysBD.js` — auth and profile CRUD

**Files:**
- Modify: `roadysBD.js`

**Interfaces:**
- Consumes: `RoadysBD.map` from Task 2.
- Produces:
  - `RoadysBD.auth.client()` → Supabase client or `null`
  - `RoadysBD.auth.session()` → session object or `null`
  - `RoadysBD.auth.email()` → string, `''` when signed out
  - `RoadysBD.auth.signIn(email, password)` → `Promise<{ok:boolean, error:string}>`
  - `RoadysBD.auth.signOut()` → `Promise<void>`
  - `RoadysBD.auth.init()` → `Promise<session|null>`, restores a stored session
  - `RoadysBD.profiles.forLead(leadId)` → `Promise<profile|null>` (final only)
  - `RoadysBD.profiles.forLeads(ids)` → `Promise<Object>` keyed by leadId (final only)
  - `RoadysBD.profiles.draftFor(leadId)` → `Promise<profile|null>`; `leadId` null means the caller's own unlinked draft
  - `RoadysBD.profiles.saveDraft(p)` / `.saveFinal(p)` → `Promise<{ok, error, profile}>`
  - `RoadysBD.profiles.softDelete(id)` → `Promise<{ok, error}>`

- [ ] **Step 1: Add the auth and CRUD block to `roadysBD.js`**

Insert immediately before `var RoadysBD = { map: ... };` and replace that line with the fuller object shown at the end of this step.

```js
  // ── Supabase client ──────────────────────────────────────────────────
  // Same project and anon key every other page in this repo uses. The key is
  // public (this repo is published to GitHub Pages) — it identifies the
  // project, it does not authorize anything. RLS on bd_value_profiles
  // requires a real session, so the key alone opens nothing.
  var SB_URL  = 'https://yyhnnalsqzyghjqtfisy.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5aG5uYWxzcXp5Z2hqcXRmaXN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDE4NzksImV4cCI6MjA4OTQxNzg3OX0.misOc3tEQD0GBOsjNkv6Im8wUmlfXhiX97DflpgaqAc';

  var _client = null;
  var _session = null;

  function client() {
    if (!_client && typeof window !== 'undefined' && window.supabase) {
      _client = window.supabase.createClient(SB_URL, SB_ANON);
    }
    return _client;
  }

  function errText(e) {
    if (!e) return '';
    return e.message || e.error_description || 'Unknown error';
  }

  function init() {
    var c = client();
    if (!c) return Promise.resolve(null);
    return c.auth.getSession().then(function (res) {
      _session = (res && res.data && res.data.session) || null;
      // Keep _session fresh across token refreshes and sign-out in another
      // tab, so email() and the RLS-bearing client never disagree.
      c.auth.onAuthStateChange(function (_evt, s) { _session = s || null; });
      return _session;
    }).catch(function () { return null; });
  }

  function session() { return _session; }
  function email() {
    return (_session && _session.user && _session.user.email) || '';
  }

  function signIn(e, pw) {
    var c = client();
    if (!c) return Promise.resolve({ ok: false, error: 'Supabase unavailable' });
    return c.auth.signInWithPassword({ email: e, password: pw })
      .then(function (res) {
        if (res.error) return { ok: false, error: errText(res.error) };
        _session = res.data.session;
        return { ok: true, error: '' };
      })
      .catch(function (err) { return { ok: false, error: errText(err) }; });
  }

  function signOut() {
    var c = client();
    _session = null;
    if (!c) return Promise.resolve();
    return c.auth.signOut().catch(function () {});
  }

  // ── Profiles ─────────────────────────────────────────────────────────
  var TABLE = 'bd_value_profiles';

  function q() {
    var c = client();
    return c ? c.from(TABLE) : null;
  }

  function forLead(id) {
    var t = q();
    if (!t || !id) return Promise.resolve(null);
    return t.select('*').eq('lead_id', id).eq('status', 'final')
      .is('deleted_at', null).limit(1)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) return null;
        return fromRow(res.data[0]);
      })
      .catch(function () { return null; });
  }

  // One round trip for a whole board rather than one per card — the Kanban
  // can hold hundreds of leads and a request each would be unusable.
  function forLeads(ids) {
    var t = q();
    var out = {};
    if (!t || !ids || !ids.length) return Promise.resolve(out);
    return t.select('*').in('lead_id', ids).eq('status', 'final')
      .is('deleted_at', null)
      .then(function (res) {
        if (res.error || !res.data) return out;
        res.data.forEach(function (r) { out[r.lead_id] = fromRow(r); });
        return out;
      })
      .catch(function () { return out; });
  }

  // leadId null means "my own unlinked draft", which is keyed by author —
  // see the partial unique index in sql/2026-10-05-bd-value-profiles.sql.
  function draftFor(id) {
    var t = q();
    if (!t) return Promise.resolve(null);
    var sel = t.select('*').eq('status', 'draft').is('deleted_at', null);
    sel = id ? sel.eq('lead_id', id) : sel.is('lead_id', null).eq('author', email());
    return sel.limit(1)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) return null;
        return fromRow(res.data[0]);
      })
      .catch(function () { return null; });
  }

  function save(p, st) {
    var t = q();
    if (!t) return Promise.resolve({ ok: false, error: 'Supabase unavailable', profile: null });
    var row = toRow(p);
    row.status = st;
    if (!row.author) row.author = email();
    if (!row.id) row.id = 'bdp_' + Date.now();
    return t.upsert(row, { onConflict: 'id' }).select()
      .then(function (res) {
        if (res.error) return { ok: false, error: errText(res.error), profile: null };
        var saved = (res.data && res.data.length) ? fromRow(res.data[0]) : fromRow(row);
        return { ok: true, error: '', profile: saved };
      })
      .catch(function (err) {
        return { ok: false, error: errText(err), profile: null };
      });
  }

  function saveDraft(p) { return save(p, 'draft'); }
  function saveFinal(p) { return save(p, 'final'); }

  function softDelete(id) {
    var t = q();
    if (!t || !id) return Promise.resolve({ ok: false, error: 'Supabase unavailable' });
    return t.update({ deleted_at: new Date().toISOString() }).eq('id', id)
      .then(function (res) {
        return res.error ? { ok: false, error: errText(res.error) } : { ok: true, error: '' };
      })
      .catch(function (err) { return { ok: false, error: errText(err) }; });
  }

  var RoadysBD = {
    map:  { toRow: toRow, fromRow: fromRow },
    auth: { client: client, init: init, session: session, email: email,
            signIn: signIn, signOut: signOut },
    profiles: { forLead: forLead, forLeads: forLeads, draftFor: draftFor,
                saveDraft: saveDraft, saveFinal: saveFinal,
                softDelete: softDelete }
  };
```

- [ ] **Step 2: Verify the module still loads under Node and the mapping tests pass**

The auth/CRUD half is network code and is not unit-tested here — it is exercised by the browser checklist in Task 9. What must hold is that requiring the module under Node (where `window` is undefined and `client()` returns null) does not throw.

Run: `node --test roadysBD.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 3: Add a guard test that the module is safe to require headless**

Append to `roadysBD.test.js`:

```js
test('the module loads headless and every network call degrades to a null result', async () => {
  // No window, so client() is null. Nothing may throw — CRM.html and the
  // calculator both call these before a session exists.
  assert.equal(RoadysBD.auth.client(), null);
  assert.equal(RoadysBD.auth.session(), null);
  assert.equal(RoadysBD.auth.email(), '');
  assert.equal(await RoadysBD.profiles.forLead('CRM-1'), null);
  assert.deepEqual(await RoadysBD.profiles.forLeads(['CRM-1']), {});
  assert.equal(await RoadysBD.profiles.draftFor(null), null);
  assert.equal((await RoadysBD.profiles.saveDraft({})).ok, false);
  assert.equal((await RoadysBD.auth.signIn('a@b.c', 'x')).ok, false);
});
```

- [ ] **Step 4: Run it**

Run: `node --test roadysBD.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Confirm the full suite**

Run: `node --test *.test.js 2>&1 | grep -E "^. (tests|pass|fail)"`
Expected: `tests 247`, `pass 247`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add roadysBD.js roadysBD.test.js
git commit -m "feat(bd): auth session and bd_value_profiles CRUD in the shared module"
```

---

## Task 4: Recommendation bands in `bdpgStats.js`

**Files:**
- Modify: `bdpgStats.js`
- Test: `bdpgStats.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `BDPG_STATS.recommendation(finalGallons)` → one of `'Strong fit' | 'Good fit' | 'Marginal' | 'Below threshold' | ''`. Tasks 6 and 7 store the result; Phase 2 renders it.

- [ ] **Step 1: Write the failing tests**

Append to `bdpgStats.test.js`:

```js
// ── membership recommendation ───────────────────────────────────────────
// Bands are the network's own quartiles over the 190 reporting locations in
// network-locations.json (avgGalMo): p25 1,480 · median 6,059 · p75 17,455.

test('recommendation bands sit on the documented boundaries', () => {
  assert.equal(BDPG_STATS.recommendation(17500), 'Strong fit');
  assert.equal(BDPG_STATS.recommendation(17499), 'Good fit');
  assert.equal(BDPG_STATS.recommendation(6000),  'Good fit');
  assert.equal(BDPG_STATS.recommendation(5999),  'Marginal');
  assert.equal(BDPG_STATS.recommendation(1500),  'Marginal');
  assert.equal(BDPG_STATS.recommendation(1499),  'Below threshold');
  assert.equal(BDPG_STATS.recommendation(0),     'Below threshold');
});

test('a profile with no generated gallons has no recommendation, not a bad one', () => {
  // null gallons is a profile saved before Generate ran. Calling that
  // "Below threshold" would assert a verdict the calculator never produced.
  assert.equal(BDPG_STATS.recommendation(null), '');
  assert.equal(BDPG_STATS.recommendation(undefined), '');
  assert.equal(BDPG_STATS.recommendation(''), '');
  assert.equal(BDPG_STATS.recommendation(NaN), '');
  assert.equal(BDPG_STATS.recommendation('nonsense'), '');
  assert.equal(BDPG_STATS.recommendation({}), '');
});

test('a numeric string is accepted, as a stored jsonb value can be', () => {
  assert.equal(BDPG_STATS.recommendation('11153'), 'Good fit');
});

test('negative gallons cannot occur but must not fall through to a good band', () => {
  assert.equal(BDPG_STATS.recommendation(-1), 'Below threshold');
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test bdpgStats.test.js 2>&1 | grep -E "^. (tests|pass|fail)"`
Expected: FAIL — `BDPG_STATS.recommendation is not a function`.

- [ ] **Step 3: Implement**

In `bdpgStats.js`, add before the export block:

```js
  // ── membership recommendation ─────────────────────────────────────────
  //
  // Derived from finalGallons, never entered. Every boundary is a quartile of
  // the network's own reported monthly gallons (network-locations.json,
  // avgGalMo over the 190 locations that report): p25 1,480, median 6,059,
  // p75 17,455. Rounded outward to readable figures so a rep can hold them in
  // their head; the rounding is the only judgement in the table.
  //
  // Ordered high-to-low and evaluated in order, so the bands cannot overlap
  // or leave a gap the way a set of independent range checks can.
  var RECOMMENDATION_BANDS = [
    { min: 17500, label: 'Strong fit' },
    { min: 6000,  label: 'Good fit' },
    { min: 1500,  label: 'Marginal' },
    { min: -Infinity, label: 'Below threshold' }
  ];

  function recommendation(finalGallons) {
    // '' means "no verdict", and it is NOT the same fact as the lowest band.
    // A profile saved before Generate ran has null gallons; calling that
    // "Below threshold" would assert a verdict the calculator never produced.
    if (finalGallons === null || finalGallons === undefined || finalGallons === '') return '';
    var n = Number(finalGallons);
    if (!isFinite(n)) return '';
    for (var i = 0; i < RECOMMENDATION_BANDS.length; i++) {
      if (n >= RECOMMENDATION_BANDS[i].min) return RECOMMENDATION_BANDS[i].label;
    }
    return '';
  }
```

And add to the export object, beside `prospectSignal`:

```js
    recommendation: recommendation,
    RECOMMENDATION_BANDS: RECOMMENDATION_BANDS,
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node --test bdpgStats.test.js 2>&1 | grep -E "^. (tests|pass|fail)"`
Expected: `pass 160`, `fail 0` (156 existing + 4 new).

- [ ] **Step 5: Confirm the full suite and that the formula is untouched**

Run: `node --test *.test.js 2>&1 | grep -E "^. (tests|pass|fail)"`
Expected: `tests 251`, `pass 251`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add bdpgStats.js bdpgStats.test.js
git commit -m "feat(bdpg): membership recommendation from network quartiles"
```

---

## Task 5: Login gate on all three pages

One task, not three: the gate is the same code in each, and a reviewer cannot sensibly approve it on one page while rejecting it on another — Migration B needs all three or none.

**Files:**
- Modify: `CRM.html` (script tags near `:11`; `crmInit()` at `:3596`; `DOMContentLoaded` at `:3660`)
- Modify: `bus-dev-potential-gallons/index.html` (script tags at `:7-17`; `DOMContentLoaded` at the file foot)
- Modify: `implementation.html` (script tags in `<head>`; its boot handler)

**Interfaces:**
- Consumes: `RoadysBD.auth.init/signIn/signOut/email` from Task 3.
- Produces: `bdShowLoginGate(onReady)` — identical in all three files — and a guarantee that no page renders Supabase-backed data before a session exists.

- [ ] **Step 1: Add the shared script tags**

`CRM.html` already loads `@supabase/supabase-js@2` at `:11`. Immediately after it add:

```html
<script src="bdpgStats.js"></script>
<script src="roadysBD.js"></script>
```

In `bus-dev-potential-gallons/index.html`, after the `bdpgStats.js` tag at `:17` add:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="../roadysBD.js"></script>
```

In `implementation.html`, after its existing `@supabase/supabase-js@2` tag add:

```html
<script src="roadysBD.js"></script>
```

- [ ] **Step 2: Add the gate function to each of the three files**

Paste this verbatim into each file's main `<script>`, near the existing boot code. It is duplicated rather than shared because these are three standalone HTML pages with no module loader, and the markup it injects differs from nothing — keeping it identical is the point.

```js
// ── Login gate ────────────────────────────────────────────────────────
// Supabase Auth, email + password. Sign-ups are disabled in the dashboard,
// so the account list IS the allowlist — there is no email list in this
// bundle, because any list shipped to the browser is advisory, not enforcing.
//
// This is NOT the old SETTINGS.pin soft-lock, which compares a localStorage
// string in client JS and stops nobody. That stays where it is, as the
// accident guard it already is, and runs after this.
function bdShowLoginGate(onReady){
  RoadysBD.auth.init().then(function(session){
    if(session){ onReady(); return; }
    var ov=document.createElement('div');
    ov.className='pin-overlay';
    ov.innerHTML=
      '<div class="pin-box">'+
      '<h3>🔒 Sign in</h3>'+
      '<p>Business Development — Roady\'s</p>'+
      '<input type="email" class="pin-input bd-email" placeholder="email" autocomplete="username" style="width:260px;text-align:left"/>'+
      '<input type="password" class="pin-input bd-pw" placeholder="password" autocomplete="current-password" style="width:260px;text-align:left"/>'+
      '<div class="pin-err"></div>'+
      '<div style="margin-top:16px;display:flex;gap:8px;justify-content:center">'+
      '<button class="btn btn-accent bd-go">Sign in</button></div>'+
      '</div>';
    document.body.appendChild(ov);
    var em=ov.querySelector('.bd-email'), pw=ov.querySelector('.bd-pw'),
        err=ov.querySelector('.pin-err'), go=ov.querySelector('.bd-go');
    var submit=function(){
      err.textContent='';
      go.disabled=true; go.textContent='Signing in…';
      RoadysBD.auth.signIn(em.value.trim(), pw.value).then(function(r){
        go.disabled=false; go.textContent='Sign in';
        if(!r.ok){ err.textContent=r.error||'Sign-in failed'; pw.value=''; pw.focus(); return; }
        ov.remove();
        onReady();
      });
    };
    go.onclick=submit;
    [em,pw].forEach(function(i){ i.addEventListener('keydown',function(e){ if(e.key==='Enter') submit(); }); });
    setTimeout(function(){ em.focus(); },50);
  });
}

// Sign-out must also drop the offline caches. Leaving them would keep the
// previous user's pipeline readable on disk after Migration B has moved the
// table itself behind auth — the cache would become the hole in the lock.
function bdSignOut(){
  ['roadys_crm_v2','roadysBDPGDraft'].forEach(function(k){
    try{ localStorage.removeItem(k); }catch(e){}
  });
  RoadysBD.auth.signOut().then(function(){ location.reload(); });
}
```

- [ ] **Step 3: Wrap each page's boot in the gate**

`CRM.html` — replace the handler at `:3660`:

```js
document.addEventListener('DOMContentLoaded',()=>{
  bdShowLoginGate(function(){
    if(SETTINGS.locked && SETTINGS.locked['crm'] && SETTINGS.pin){ crmShowPinGate(); }
    else { crmInit(); }
  });
});
```

`bus-dev-potential-gallons/index.html` — replace the handler at the file foot:

```js
document.addEventListener('DOMContentLoaded', function () {
  bdShowLoginGate(function () {
    // Before the first render, never after: restoreDraft() writes the ⓪ card's
    // fields and sets savedSig, and render() captures its unsaved-work baseline
    // on that first pass.
    BDPG.restoreDraft();
    BDPG.render();
  });
});
```

`implementation.html` — wrap its existing boot call the same way, leaving any PIN gate it has inside the callback.

- [ ] **Step 4: Add a Sign out control to each page**

In `CRM.html`, beside the existing `#crm-whoami` select in the topbar:

```html
<button class="btn" onclick="bdSignOut()" title="Sign out">Sign out</button>
```

Add the equivalent button to the calculator's header button group and to `implementation.html`'s topbar.

- [ ] **Step 5: Verify in the browser**

Serve the repo and open all three pages. Confirm:
- each shows the sign-in overlay and no page content behind it
- a wrong password shows an error and does not sign in
- a correct password reveals the page, and every existing feature still works (Kanban drag, calendar, templates, notes, CSV export)
- **Sign out** returns to the overlay, and `localStorage.roadys_crm_v2` is gone
- reloading after sign-in does **not** re-prompt (the session restores)

```bash
node -e "const h=require('http'),f=require('fs'),p=require('path'),u=require('url');const t={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'};h.createServer((q,s)=>{let x=decodeURIComponent(u.parse(q.url).pathname);if(x.endsWith('/'))x+='index.html';const g=p.join(process.cwd(),x);f.readFile(g,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'Content-Type':t[p.extname(g)]||'application/octet-stream'});s.end(d)})}).listen(8731,()=>console.log('http://127.0.0.1:8731'))"
```

- [ ] **Step 6: Commit**

```bash
git add CRM.html bus-dev-potential-gallons/index.html implementation.html
git commit -m "feat(auth): Supabase email/password gate on CRM, calculator and implementation"
```

---

## Task 6: Draft autosave → Supabase

Re-points the layer built in merge `3304ebf`. Everything in spec §0.5 is kept; only the storage target and the debounce change.

**Files:**
- Modify: `bus-dev-potential-gallons/index.html` — the draft block added before `BDPG.prospectHtml`

**Interfaces:**
- Consumes: `RoadysBD.profiles.draftFor/saveDraft`, `RoadysBD.auth.email()`.
- Produces: `BDPG.currentLeadId` (string or null) — Task 7 reads it to decide link vs create.

- [ ] **Step 1: Change the debounce and add the lead binding**

```js
  // 800ms, down from 2000: the draft now lands in Supabase where the other
  // owner can see it, so the window where their screen is stale matters more
  // than the write volume. Still debounced, because this fires per keystroke.
  BDPG.DRAFT_DEBOUNCE_MS = 800;

  // Set from ?lead=<id> at boot, or by Save to Prospects once a lead is
  // linked. null means an unlinked draft, which the table keys by author.
  BDPG.currentLeadId = null;
```

- [ ] **Step 2: Make `flushDraft` write through to Supabase**

Replace the body of `BDPG.flushDraft`:

```js
  BDPG.flushDraft = function () {
    if (BDPG._draftTimer) { clearTimeout(BDPG._draftTimer); BDPG._draftTimer = null; }
    var d = BDPG.draftSnapshot();
    if (!BDPG.draftHasContent(d)) {
      BDPG.clearDraftStorage();
      BDPG.setDraftMsg('');
      return;
    }
    // localStorage first and synchronously: it is the offline mirror, and it
    // is the only write that can still succeed inside a pagehide handler.
    var localOk = true;
    try { localStorage.setItem(BDPG.DRAFT_KEY, JSON.stringify(d)); } catch (e) { localOk = false; }

    RoadysBD.profiles.saveDraft(BDPG.draftProfile(d)).then(function (r) {
      if (r.ok) {
        if (r.profile && r.profile.id) BDPG.currentProfileId = r.profile.id;
        BDPG.setDraftMsg('Draft saved ' + BDPG.draftTimeLabel(d.savedAt));
      } else {
        // Never report a cloud save that did not happen. The local mirror may
        // still have landed, and saying so is the difference between "your
        // work is safe here but not shared yet" and a false all-clear.
        BDPG.setDraftMsg(localOk
          ? 'Saved on this device only — not synced'
          : 'Draft could not be saved');
      }
    });
  };
```

- [ ] **Step 3: Add the snapshot → profile adapter**

```js
  // The ⓪-card draft plus whatever the engine currently holds, in the shape
  // roadysBD.js stores. Results are included only when a result exists: a
  // draft with no Generate behind it must carry null gallons and no
  // recommendation, not zeros that read as a calculated answer.
  BDPG.draftProfile = function (d) {
    var s = BDPG.state, e = s.result ? s.result.estimate : null;
    return {
      id: BDPG.currentProfileId || '',
      leadId: BDPG.currentLeadId,
      status: 'draft',
      prospectName: d.name, city: d.city, stateCode: d.stateCode,
      locationType: d.locationType,
      region: s.state ? (BusDevGallonsCalc.resolveRegion(s.state) || '') : '',
      profile: s.profile || '', roadway: s.roadway || '',
      inputs: BDPG.profileInputs(),
      results: e ? JSON.parse(JSON.stringify(e)) : {},
      officialSubtotal: e ? e.officialSubtotal : null,
      finalGallons: e ? e.finalGallons : null,
      recommendation: e ? BDPG_STATS.recommendation(e.finalGallons) : '',
      regionPctStamp: e ? BDPG.regionPctStamp(e.regionPct) : '',
      baselineStamp: e ? BDPG.baselineStamp(e.baseline) : '',
      author: RoadysBD.auth.email() || ''
    };
  };

  // Every input the calculator needs to reopen this profile exactly as saved.
  // Deliberately NOT the whole of BDPG.state: result and resultStale are
  // derived, and the panel-open flags are not data (same rule as SIG_SKIP).
  BDPG.profileInputs = function () {
    var s = BDPG.state;
    return {
      profile: s.profile, roadway: s.roadway, state: s.state,
      amenityDetails: JSON.parse(JSON.stringify(s.amenityDetails || {})),
      amenityLevel: s.amenityLevel, restroomLevel: s.restroomLevel,
      truckerPathRating: s.truckerPathRating,
      pricingLevel: s.pricingLevel, rewardsLevel: s.rewardsLevel,
      supportingDetails: JSON.parse(JSON.stringify(s.supportingDetails || {})),
      prospect: JSON.parse(JSON.stringify(s.prospect || {}))
    };
  };
```

- [ ] **Step 4: Restore from Supabase first, localStorage second**

`restoreDraft()` is synchronous and runs before the first render, so the cloud read cannot block it. Keep it exactly as it is for the local mirror, and add an async pass after:

```js
  // The cloud draft wins when it exists: it is the shared one, and the local
  // mirror may be this browser's older copy. Runs after the first render, so
  // the page is never blank waiting on the network; re-renders only if the
  // cloud copy actually differs from what restoreDraft() already painted.
  BDPG.hydrateDraftFromCloud = function () {
    return RoadysBD.profiles.draftFor(BDPG.currentLeadId).then(function (p) {
      if (!p) return false;
      var local = BDPG.draftSnapshot();
      var same = p.prospectName === local.name && p.city === local.city &&
                 p.stateCode === local.stateCode &&
                 p.locationType === local.locationType;
      if (same) { BDPG.currentProfileId = p.id; return false; }
      BDPG.applyProfile(p);
      BDPG.currentProfileId = p.id;
      BDPG.savedSig = '';          // a restored draft is still unsaved work
      BDPG._draftMsg = 'Draft restored from the cloud' +
        (p.author ? ' — last edited by ' + p.author : '');
      BDPG.render();
      return true;
    });
  };

  // Writes a stored profile back onto BDPG.state. Mirrors onLoadProfile()'s
  // migration guards: each field is replaced only when it has the type it
  // must have, so a hand-edited row cannot reach the DOM as [object Object].
  BDPG.applyProfile = function (p) {
    var i = p.inputs || {};
    var s = BDPG.state;
    if (typeof i.profile === 'string') s.profile = i.profile;
    if (typeof i.roadway === 'string') s.roadway = i.roadway;
    if (typeof i.state === 'string') s.state = i.state;
    if (i.amenityDetails && typeof i.amenityDetails === 'object') s.amenityDetails = i.amenityDetails;
    if (typeof i.amenityLevel === 'string') s.amenityLevel = i.amenityLevel;
    if (typeof i.restroomLevel === 'string') s.restroomLevel = i.restroomLevel;
    if (i.truckerPathRating !== undefined) s.truckerPathRating = i.truckerPathRating;
    if (i.pricingLevel !== undefined) s.pricingLevel = i.pricingLevel;
    if (typeof i.rewardsLevel === 'string') s.rewardsLevel = i.rewardsLevel;
    if (i.supportingDetails && typeof i.supportingDetails === 'object') s.supportingDetails = i.supportingDetails;
    if (i.prospect && typeof i.prospect === 'object') s.prospect = i.prospect;
    // A reopened profile has inputs but no result until Generate runs again,
    // and that is not a stale result — it is simply not computed yet.
    s.result = null;
    s.resultStale = false;
    BDPG.normalizeLevels();
    BDPG.updatePreEvalSignal();
  };
```

- [ ] **Step 5: Read `?lead=` at boot and hydrate**

Replace the calculator's `DOMContentLoaded` body from Task 5:

```js
document.addEventListener('DOMContentLoaded', function () {
  bdShowLoginGate(function () {
    var p = new URLSearchParams(location.search);
    BDPG.currentLeadId = p.get('lead') || null;
    BDPG.restoreDraft();
    BDPG.render();
    BDPG.hydrateDraftFromCloud();
  });
});
```

- [ ] **Step 6: Verify in the browser**

With the server from Task 5 running, open `bus-dev-potential-gallons/`, sign in, and confirm:
- typing a name shows *Saving draft…* then *Draft saved* within ~1 s
- a row appears in `bd_value_profiles` with `status='draft'` (check in the Supabase table editor)
- reload restores the fields
- opening the same URL in a second browser signed in as the other user shows the same draft, with *last edited by* naming the first user
- going offline (devtools → Network → Offline) and typing shows *Saved on this device only — not synced* rather than a false success

- [ ] **Step 7: Confirm the suite still passes**

Run: `node --test *.test.js 2>&1 | grep -E "^. (tests|pass|fail)"`
Expected: `tests 251`, `pass 251`, `fail 0`.

- [ ] **Step 8: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): draft autosave writes to Supabase at 800ms with a local mirror"
```

---

## Task 7: Save to Prospects → link or create a CRM lead

**Files:**
- Modify: `bus-dev-potential-gallons/index.html` — `BDPG.onSaveProfile` and `BDPG.saveToProspectsHtml`

**Interfaces:**
- Consumes: `RoadysBD.profiles.saveFinal`, `BDPG.draftProfile`, `BDPG.currentLeadId`, `BDPG_STATS.recommendation`.
- Produces: nothing later in Phase 1 depends on. Phase 2 reads the rows this writes.

- [ ] **Step 1: Add the lead search and create helpers**

```js
  // Leads the rep can attach this profile to. Searched over company, city and
  // state — the three things they will actually have in front of them.
  BDPG.searchLeads = function (q) {
    var c = RoadysBD.auth.client();
    if (!c || !q) return Promise.resolve([]);
    var like = '%' + q.replace(/[%_]/g, '') + '%';
    return c.from('crm_leads').select('id,company,city,state,stage')
      .is('deleted_at', null)
      .or('company.ilike.' + like + ',city.ilike.' + like + ',state.ilike.' + like)
      .limit(10)
      .then(function (r) { return (r.error || !r.data) ? [] : r.data; })
      .catch(function () { return []; });
  };

  // Creates a lead at Prospect, seeded from the profile. Reuses the CRM's own
  // normalisation so the duplicate check below matches what CRM.html would
  // have matched — a company already in the pipeline must warn, not silently
  // become a second card.
  BDPG.normCompany = function (s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  };

  BDPG.createLeadFromProfile = function () {
    var c = RoadysBD.auth.client();
    if (!c) return Promise.resolve(null);
    var s = BDPG.state, p = s.prospect;
    var company = BDPG.displayName();
    return c.from('crm_leads').select('id,company,city,state,stage')
      .is('deleted_at', null).limit(500)
      .then(function (r) {
        var rows = (r.error || !r.data) ? [] : r.data;
        var dup = rows.filter(function (x) {
          return BDPG.normCompany(x.company) === BDPG.normCompany(company);
        })[0];
        if (dup) {
          var ok = confirm('A lead for "' + dup.company + '" already exists (' +
            (dup.state || 'no state listed') + ' · ' + dup.stage + ').\n\n' +
            'OK — attach this profile to that lead.\n' +
            'Cancel — create a second lead anyway.');
          if (ok) return dup.id;
        }
        var id = 'CRM-' + String(Date.now()).slice(-6);
        var row = {
          id: id, company: company,
          contact: '', phone: '', email: '',
          street: p.street || '', city: p.city || '', state: s.state || '',
          zip: '', exit: '', lanes: '',
          stage: 'Prospect', priority: 'Medium',
          owner: RoadysBD.auth.email() || '', source: 'Market Research',
          locations: 1, est_gallons: 0, deal_value: 0,
          follow_up: '', notes: p.notes || '',
          activity: [{ text: 'Lead created from a value profile',
                       date: new Date().toISOString().slice(0, 10),
                       by: RoadysBD.auth.email() || '', type: 'note' }],
          updated_at: new Date().toISOString()
        };
        return c.from('crm_leads').insert(row).then(function (ins) {
          return ins.error ? null : id;
        });
      })
      .catch(function () { return null; });
  };
```

- [ ] **Step 2: Add the stage prompt**

```js
  // Spec §0.1: "Contacted" means we reached out, and a value profile is often
  // pre-contact research — so this ASKS and never moves a lead silently. Only
  // Prospect and Qualified are offered; a lead already at Meeting Scheduled or
  // later is never prompted and never moved.
  BDPG.MOVEABLE_STAGES = ['Prospect', 'Qualified'];

  BDPG.maybePromptStage = function (leadId, company) {
    var c = RoadysBD.auth.client();
    if (!c || !leadId) return Promise.resolve();
    return c.from('crm_leads').select('stage').eq('id', leadId).limit(1)
      .then(function (r) {
        if (r.error || !r.data || !r.data.length) return;
        var stage = r.data[0].stage;
        if (BDPG.MOVEABLE_STAGES.indexOf(stage) === -1) return;
        if (!confirm('Saved value profile for ' + company + '.\n\n' +
                     'This lead is at ' + stage + '. Move it to Contacted?')) return;
        var act = { text: 'Moved from ' + stage + ' to Contacted',
                    date: new Date().toISOString().slice(0, 10),
                    by: RoadysBD.auth.email() || '', type: 'stage' };
        return c.from('crm_leads').select('activity').eq('id', leadId).limit(1)
          .then(function (a) {
            var log = (!a.error && a.data && a.data.length && Array.isArray(a.data[0].activity))
              ? a.data[0].activity : [];
            log.push(act);
            return c.from('crm_leads')
              .update({ stage: 'Contacted', activity: log }).eq('id', leadId);
          });
      })
      .catch(function () {});
  };
```

- [ ] **Step 3: Rewrite `onSaveProfile` to go through Supabase**

Keep the existing "no result — save blank?" confirm exactly as it is; only the storage and the linking are new.

```js
  BDPG.onSaveProfile = function () {
    var name = BDPG.resolveProspectName() || prompt('Name this profile:');
    if (!name) return;
    if (!BDPG.resolveProspectName()) BDPG.state.prospect.name = name;

    // Unchanged from the localStorage build: nothing may be stored that
    // describes a different input set than the result it carries, and which
    // way out of that is the rep's call, never a silent recompute.
    if (!BDPG.state.result && BDPG.state.resultStale) {
      if (!confirm('An input changed after the last Generate, so there are no current results to save.\n\n' +
                   'Saving now stores this prospect with BLANK gallon figures.\n\n' +
                   'OK — save it blank.\nCancel — go back and click Generate Value Profile first.')) return;
    }

    var finish = function (leadId) {
      BDPG.currentLeadId = leadId || null;
      var prof = BDPG.draftProfile(BDPG.draftSnapshot());
      prof.leadId = BDPG.currentLeadId;
      RoadysBD.profiles.saveFinal(prof).then(function (r) {
        if (!r.ok) { toast('Could not save to Prospects — ' + r.error, 'err'); return; }
        BDPG.currentProfileId = r.profile.id;
        if (BDPG._draftTimer) { clearTimeout(BDPG._draftTimer); BDPG._draftTimer = null; }
        BDPG.clearDraftStorage();
        BDPG._draftMsg = '';
        toast('Saved to Prospects — ' + BDPG.displayName());
        BDPG.render();
        BDPG.savedSig = BDPG.stateSig();
        if (BDPG.currentLeadId) BDPG.maybePromptStage(BDPG.currentLeadId, BDPG.displayName());
      });
    };

    if (BDPG.currentLeadId) { finish(BDPG.currentLeadId); return; }
    BDPG.createLeadFromProfile().then(finish);
  };
```

- [ ] **Step 4: Verify in the browser**

- Build a profile with no `?lead=`, hit **Save to Prospects** → a new lead appears in `crm_leads` at Prospect, the stage prompt fires, OK moves it to Contacted and appends a `type:'stage'` activity entry.
- Re-save the same profile → it updates the same `bd_value_profiles` row, not a second one (the partial unique index would reject a second final anyway).
- Build a profile for a company that already exists → the duplicate confirm offers to attach instead.
- Open `bus-dev-potential-gallons/?lead=CRM-123456` → saving attaches to that lead and prompts only if it is at Prospect or Qualified.
- Repeat against a lead at Negotiation → no prompt, no stage change.

- [ ] **Step 5: Confirm the suite**

Run: `node --test *.test.js 2>&1 | grep -E "^. (tests|pass|fail)"`
Expected: `tests 251`, `pass 251`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): Save to Prospects links or creates a CRM lead, prompts for Contacted"
```

---

## Task 8: Fix the `implementation.html` hard delete

**Files:**
- Modify: `implementation.html:7913-7920` (`crmDeleteLeadFromSupabase`)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Behaviour change only.

- [ ] **Step 1: Replace the hard DELETE with the soft delete**

At `implementation.html:7913`, replace:

```js
    const {error}=await sb.from('crm_leads').delete().eq('id',id);
```

with:

```js
    // Soft delete, matching CRM.html and sql/2026-07-15-crm-leads-soft-delete.sql.
    // This was a hard DELETE: a lead removed from this page was gone for good
    // and never appeared in CRM.html's Deleted Leads restore modal, which only
    // lists rows with deleted_at set. Value profiles now hang off these leads
    // (lead_id is ON DELETE SET NULL), so a hard delete also silently orphaned
    // the profile.
    const {error}=await sb.from('crm_leads').update({deleted_at:new Date().toISOString()}).eq('id',id);
```

- [ ] **Step 2: Filter soft-deleted leads out of this page's own list**

This is required, not conditional. `implementation.html:7849` reads `crm_leads`
with **no `deleted_at` filter**, which is a second pre-existing bug: a lead
soft-deleted in `CRM.html` today still appears on the Implementation page.
Without this line, Step 1 would make that worse — every lead deleted here
would also stay visible here.

At `implementation.html:7849`, replace:

```js
    const {data,error}=await sb.from('crm_leads').select('*').order('created_at',{ascending:false});
```

with:

```js
    // .is('deleted_at',null) matches CRM.html's own load. Without it this page
    // lists leads that were soft-deleted elsewhere — and, after the Step 1
    // fix, ones deleted from this page too.
    const {data,error}=await sb.from('crm_leads').select('*').is('deleted_at',null).order('created_at',{ascending:false});
```

- [ ] **Step 3: Verify in the browser**

- Delete a lead from `implementation.html` → it disappears from that page's list.
- Open `CRM.html` → **Deleted Leads** → the lead is listed and **Restore** brings it back on both pages.

- [ ] **Step 4: Commit**

```bash
git add implementation.html
git commit -m "fix(implementation): soft-delete leads so a deletion is recoverable"
```

---

## Task 9: Migration B gate

**Files:** none — this is the operational gate.

- [ ] **Step 1: Run the full Phase 1 checklist in two browsers**

Browser 2 signed in as a different user:

1. Sign in on `CRM.html`; sign out; confirm a signed-out tab shows the gate and not stale cached leads.
2. Open the calculator from a lead URL — fields pre-fill.
3. Type one field → *Saving draft…* → *Draft saved* within ~1 s. Reload: restored.
4. Browser 2: same draft visible, labelled, naming the last editor.
5. **Save to Prospects** against a new prospect → lead created at Prospect, stage prompt, profile linked.
6. Against an existing lead by search → attaches; Cancel on the prompt leaves the stage alone.
7. Browser 2: the lead shows in **Contacted**.
8. Delete a lead from `implementation.html` → restorable from CRM's Deleted Leads.
9. Every untouched CRM feature still works: Kanban drag, calendar, auto-scheduler, templates, notes, CSV import/export, analytics, `?lead=&call=` deep link.

- [ ] **Step 2: Report to the user and WAIT**

Print the checklist result. **Do not apply Migration B.** The user confirms the login works on all three pages in a second browser first — this is an explicit hold, not a formality: applying it early returns 403 on `implementation.html` and `CRM.html` for anyone not yet signed in.

- [ ] **Step 3: On the user's confirmation only, hand them Migration B**

Print `sql/2026-10-05-crm-leads-require-auth.sql` for the Supabase SQL editor, then re-run checklist items 1, 7 and 8 to confirm all three pages still work with `crm_leads` locked.

- [ ] **Step 4: Final suite run**

Run: `node --test *.test.js 2>&1 | grep -E "^. (tests|pass|fail)"`
Expected: `tests 251`, `pass 251`, `fail 0`.

---

## Self-Review

**Spec coverage.** §0.1 stage prompt → Task 7 Step 2. §0.2 amenities → Phase 3, not this plan. §0.3 recommendation → Task 4. §0.4 auth/RLS → Tasks 1, 5, 9. §0.5 draft layer preserved → Task 6. §1 shared module → Tasks 2–3. §2.1 table → Task 1. §2.2 `crm_leads` index + trigger → Task 1. §2.3 two migrations → Task 1 + Task 9 gate. §2.4 cache cleared on sign-out → Task 5 Step 2; three unique indexes → Task 1 Step 2; author/updated_at surfaced → Task 6 Step 4. §3 items 1–8 → Tasks 1–9 in order. Phase 2 (§4) and Phase 3 (§5) are deliberately out of scope and get their own plans.

**Placeholder scan.** No TBD/TODO, and no step left to the implementer's judgement — every code step carries the exact code and the exact line to replace. Task 8 Step 2 was originally written as "add the filter if it is absent"; verifying the reference showed `implementation.html:7849` has no `deleted_at` filter at all, so it is now an unconditional replacement with the finding stated.

**Line references verified** against the working tree at the time of writing: `CRM.html:11` (supabase tag), `:3596` (`crmInit`), `:3660` (`DOMContentLoaded`); `implementation.html:7849` (lead select), `:7913` (`crmDeleteLeadFromSupabase`); `bus-dev-potential-gallons/index.html:7-17` (script tags). An implementer picking this up later should re-confirm them — these three files are edited often.

**Type consistency.** `toRow`/`fromRow` field names match the Task 1 columns one-for-one. `BDPG.draftProfile` emits exactly the camelCase keys `fromRow` produces. `BDPG.currentLeadId` is set in Task 6 Step 1 and read in Tasks 6–7. `BDPG_STATS.recommendation` is defined in Task 4 and called in Task 6 Step 3 and Task 7. `RoadysBD.auth.email()` is defined in Task 3 and used in Tasks 5–7. Test counts run 242 → 246 → 247 → 251 and are stated at each step.
