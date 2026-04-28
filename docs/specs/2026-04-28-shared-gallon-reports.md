# Shared Gallon Reports — Design Spec

- **Date**: 2026-04-28
- **Status**: Approved (pre-implementation)
- **Scope (this PR)**: `value-props.html` legacy file only
- **Out of scope (this PR)**: React port mirror, true auth, time-series gallon history

## Problem

Today, fleet gallon reports imported through the "📥 Import Gallon Report"
panel in `value-props.html` are stored only in-memory (`FN[]` / `FR[]`) and
in `localStorage['vp_imported_fleets']`. There is no Supabase write. Each
user maintains a private dataset, and the `findFleets()` / `scanFleets()`
flow that powers the value-prop creation wizard reads from this private
in-memory copy. Two consequences:

1. Person A imports a fleet — Person B never sees it.
2. The 50-mile radius scan that drives every new VP is fed by a
   silently-divergent dataset across users.

We are adding a shared cloud source of truth for fleet gallon records,
without changing the import UX, without breaking the offline / blocked-network
fallback that the rest of the file already does.

## Pre-implementation verifications (done)

- **Re-Scan button exists** at `value-props.html:877` and `reScan(id)` is
  defined at `value-props.html:1187`. Existing VPs can pull cloud updates
  on demand without auto-recomputing frozen snapshots.
- **Master unlock is in-memory only** (`let masterUnlocked` at
  `index.html:13925`; no `localStorage` / `sessionStorage` writes that
  survive a page nav). There is no client-side signal a separate page
  could read to distinguish master from team. Decision: drop the
  `imported_by` field entirely from this schema. Adding real audit
  later requires real auth.

## Schema

New table on `https://yyhnnalsqzyghjqtfisy.supabase.co`. Sits beside the
existing `value_props`, `geo_cache`, `crm_leads`, `impl_sites`, `vp_enroll`,
`fleet_status`.

```sql
create table fleet_gallon_reports (
  id          uuid        primary key default gen_random_uuid(),
  fleet_name  text        not null,
  city        text        not null,
  state       char(2)     not null,
  gallons     numeric     not null default 0,
  period      text,                          -- nullable, unused for v1
  source      text        default 'manual',  -- 'paste' | 'csv' | 'xlsx'
  imported_at timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Dedupe key: plain (fleet_name, city, state). Period intentionally
-- excluded from the index for v1 — last-write-wins on (fleet, city, state).
-- Plain columns (no lower()) so PostgREST `?on_conflict=fleet_name,city,state`
-- matches this index. Client normalization (below) makes the comparison
-- effectively case-insensitive.
create unique index fleet_gallon_reports_dedupe
  on fleet_gallon_reports (fleet_name, city, state);

create index fleet_gallon_reports_state on fleet_gallon_reports (state);
create index fleet_gallon_reports_fleet on fleet_gallon_reports (fleet_name);

-- Realtime enabled in dashboard:
alter publication supabase_realtime add table fleet_gallon_reports;
```

`period` is kept nullable so a future "month picker" can land without a
schema migration. When that ships, the unique index gets rebuilt to include
`coalesce(period, '')`.

## RLS

Matches the trust model the rest of the codebase already uses (anon key,
no real auth, PIN gate is UI-only):

```sql
alter table fleet_gallon_reports enable row level security;

create policy fgr_read   on fleet_gallon_reports
  for select using (true);

create policy fgr_insert on fleet_gallon_reports
  for insert with check (true);

create policy fgr_update on fleet_gallon_reports
  for update using (true) with check (true);

-- No DELETE policy — anon cannot DELETE rows. Fleet-wide deletes happen
-- in the Supabase dashboard (master-only by virtue of who has the
-- dashboard login). This is a guardrail against accidental wipes from
-- the browser, not a security boundary.
```

The browser **never** issues `DELETE` to this table. Per-fleet "Remove fleet"
in the UI continues to mutate `FN`/`FR`/`localStorage` only — it does not
delete cloud rows. (If we later want shared deletes, that's a follow-up
spec; it requires the tombstone pattern from `value_props`.)

## Write path

Replacement for the tail of `confirmImport()` (`value-props.html:1413`):

1. **Normalize the fleet name** before any state mutation:
   `fleetName = fleetName.trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w+/g, c => c.toLowerCase())`.
   City already gets Title Case and state already gets uppercase via
   `parseGallonData()`. With all three normalized identically across users,
   the plain `(fleet_name, city, state)` unique index is effectively
   case-insensitive. Two users typing `ABC Trucking` and `abc trucking`
   produce the same row.
2. **Optimistic local push**: append to `FN`/`FR`, synthesize `GEO`, write
   `localStorage['vp_imported_fleets']`. UI updates immediately.
3. **Sum-on-import** (`dedupeAndSumRows`): real-world fleet exports
   list one row per transaction. A 1289-row import for a single fleet
   regularly contains 1000+ duplicates on `(city, state)`. PostgREST +
   `Prefer: resolution=merge-duplicates` against a unique index requires
   the conflict key to be unique within the batch — otherwise Postgres
   rejects the whole upsert with `21000: ON CONFLICT DO UPDATE command
   cannot affect row a second time`. Before POST we group by trimmed,
   case-insensitive `(city, state)` and sum `gallons`. `findFleets()`
   only ever totals these gallons downstream, so summing on import is
   semantics-preserving. The same dedupe-and-sum runs in
   `migrateSeedDataToCloud` for safety, even though today's `FD` blob
   has one row per city.
4. **Cloud upsert** via plain `fetch` (matches the rest of the file's
   pattern; no new SDK dep):

   ```
   POST /rest/v1/fleet_gallon_reports?on_conflict=fleet_name,city,state
   Headers:
     apikey, Authorization: Bearer <SB_KEY>
     Content-Type: application/json
     Prefer: resolution=merge-duplicates,return=minimal
   Body:
     [{fleet_name, city, state, gallons, source}, ...]   // already deduped
   AbortController timeout: 5000ms
   ```

   The `on_conflict` column list matches the plain unique index from
   the schema section. Confirmed behavior: existing row → `gallons`
   replaced, `updated_at` bumped; new row → inserted.
5. **Bounded retry**: 3 attempts with exponential backoff (250ms, 500ms,
   1s). 4xx is treated as permanent — request itself is malformed, retry
   is pointless — so we surface a banner and do not loop. 5xx and network
   errors are transient and get retried.
6. **On terminal failure** (4xx, or all 3 retries exhausted): enqueue the
   batch in `localStorage['vp_pending_imports']` once, surface
   `#gr-sync-banner` with the failure reason. **No silent re-queueing.**
7. **On success**: nothing else; the optimistic state already matches.

`saveImportedData()` keeps writing `vp_imported_fleets` exactly as it does
today, so an offline user has a complete local copy.

## Read path / hydration

In `syncLoad()` (`value-props.html:467`), after `loadImportedData()`:

1. Call new `loadGallonReportsFromSupabase()`:
   ```
   GET /rest/v1/fleet_gallon_reports?select=fleet_name,city,state,gallons
   Range: 0-9999     (PostgREST default cap is 1000; raise via Range)
   ```
   Page if more than the cap.
2. **Merge into `FN`/`FR`/`GEO`**, with cloud winning on per-fleet conflict.
   Algorithm, in order:
   1. Build `cloudFleetNames = new Set(cloudRows.map(r => r.fleet_name))`.
   2. Build `pendingFleetRows` from `localStorage['vp_pending_imports']` —
      rows that were imported locally but haven't been upserted yet.
   3. Drop every row from `FR` whose fleet name is in `cloudFleetNames`.
      This is the step that fixes the today-bug where `confirmImport()`
      appends duplicates on re-import.
   4. For every cloud row, ensure its fleet name is in `FN`, then append
      `[fleetIdx, city, state, gallons]` to `FR`. Synthesize `GEO` if
      the city/state pair is unknown.
   5. Re-append `pendingFleetRows` on top, so a queued local import isn't
      erased while it waits to upsert.
3. **Rebuild localStorage cache** from the merged in-memory state, so a
   browser whose cache was wiped repopulates from cloud on next load.

`findFleets()` itself (`value-props.html:717`) does **not** change. It
still walks `FR`. The only behavior change is what populates `FR`.

## Realtime

Subscribe via Supabase Realtime (PostgREST channel) on the
`fleet_gallon_reports` table for `INSERT` and `UPDATE` events. On
each event:

- INSERT: upsert into `FN`/`FR`/`GEO` if not present.
- UPDATE: replace the matching row's `gallons` in `FR`.

Realtime is set up **after** initial hydration so we don't race with the
`GET`. If realtime fails to connect (sandbox, CSP, blocked WS), the page
silently no-ops and falls back to load-on-page-open — same pattern as
the existing `syncLoad()` failure paths.

**Pending-queue retry triggers**: page load (existing pattern) **and**
realtime reconnect (`channel.on('system', { event: 'reconnect' }, ...)`),
because users leave tabs open for hours.

**Bounded queue retries**: each pending entry tracks an `attempts`
counter. `flushPendingImports` increments on every failed flush; after
`MAX_FLUSH_ATTEMPTS = 3` the entry is dropped from the queue and
`#gr-sync-banner` surfaces with the dropped fleet list. This prevents
the queue from growing unbounded across sessions when a request is
deterministically broken (e.g. a malformed row Postgres will always
reject).

## One-shot seed migration

The embedded `FD.r` blob in `value-props.html` is the seed dataset. After
the table goes live it must be migrated **once** so a fresh browser sees
the seed without re-importing. Implementation:

- Add `migrateSeedDataToCloud()` to the global scope, **not auto-fired**.
- Gating logic:
  1. `GET /rest/v1/fleet_gallon_reports?select=id&limit=1` — if it returns
     a row, abort ("seed already done").
  2. Otherwise, batch-upsert all `FD.r` rows (~500 at a time per POST to
     keep payloads manageable).
  3. On success, write `localStorage['vp_seed_migration_done']='1'` as a
     belt-and-suspenders flag.
- Invoked manually from the browser console after the table exists:
  `migrateSeedDataToCloud()`. Surfaces progress via `console.log` and
  ends with a count.
- **Not exposed in the UI** — one-time admin operation, not user-facing.

The `FD` literal stays in the HTML as the offline fallback. After
migration, hydration prefers cloud + adds anything cloud doesn't have
from FD (so a brand-new install with no network still scans).

## What explicitly does NOT change

- `vp.fleetMatches` JSONB on existing `value_props` rows is **not**
  retroactively rewritten when new gallon data arrives. A VP saved last
  month keeps last month's snapshot. To pick up cloud updates, the user
  opens the VP and clicks 🔄 Re-Scan (verified to exist at
  `value-props.html:877`).
- `findFleets()` signature and logic.
- The CSV/XLSX parser (`parseGallonData`, `readExcel`).
- The preview/confirm modal markup and IDs.
- Fleet rename / remove / active-inactive flows. None of those write to
  the cloud table in v1; they're local-only as today. **Caveat**: a
  rename in browser A leaves browser B's cloud-hydrated copy unchanged
  — browser B's hydration on next load still shows the old name. This
  is acceptable for v1 (renames are rare; flagged in follow-ups).

## Pre-delivery checks

1. **`node --check`** on every new function extracted to a temp `.js`:
   `dedupeAndSumRows`, `showGRSyncBanner`,
   `loadGallonReportsFromSupabase`, `upsertGallonReportsToCloud`,
   `flushPendingImports`, `subscribeGallonReportsRealtime`,
   `migrateSeedDataToCloud`, the modified `confirmImport` body, and the
   `syncLoad` patch.
2. **Duplicate function names**: `grep -nE "^\s*function [a-zA-Z_]+|^\s*async function [a-zA-Z_]+" value-props.html` before/after, diff. Zero new collisions.
3. **Duplicate element IDs**: one new DOM id this PR — `gr-sync-banner`
   (created on demand by `showGRSyncBanner`). Run
   `grep -oE 'id="[^"]+"' value-props.html | sort | uniq -d` and confirm
   the only output is empty.
4. **PostgREST upsert smoke test** on the live project before declaring
   done: import 3 rows, re-import same rows, confirm row count stays at
   3 and `gallons` reflects last write. Then import a 1000+-row fleet
   export with known duplicates on `(city, state)` and confirm the
   request returns 201 with the expected sum-per-city row count.
5. **Realtime smoke test**: two browsers open on the page, import in
   browser A, confirm browser B's `FR` length increases without refresh.

**Tail-check rule does not apply here.** The project has a separate
truncation tail-check rule for `index.html` (verify the closing
`</script>` is preceded by the `tick()` function, the `setInterval`
heartbeat, and the Google Translate widget block before `</body>`).
That rule is specific to `index.html` because of how its build pipeline
truncates inline scripts. `value-props.html` is a self-contained file
with no such pipeline; it does not require this check.

## Files touched

- `value-props.html` — only file in v1.
- `docs/specs/2026-04-28-shared-gallon-reports.md` — this doc.
- Supabase dashboard SQL (manual) — table + indexes + policies +
  realtime publication.

## Deployment

Per project convention: GitHub web UI upload only. No `git push`, no
force-push. The new spec doc and modified HTML get uploaded via the
GitHub web editor.

## Post-deployment runbook (sum-on-import fix)

After the sum-on-import / bounded-retry PR ships, the existing cloud
table needs to be reset and re-seeded so it's consistent with the new
import semantics. Existing pending-queue entries from the broken
debugging session also need to be cleared so they don't re-attempt
under the new code.

**Step 1 — Truncate the cloud table.** In the Supabase dashboard SQL
editor:

```sql
truncate table fleet_gallon_reports;
```

**Step 2 (optional, recommended) — Confirm the column type bound.**
The schema already declares `gallons numeric` (effectively unbounded
precision). Tighten it as a server-side safety net:

```sql
alter table fleet_gallon_reports
  alter column gallons type numeric(12,2);
```

That caps each row at 9,999,999,999.99 gallons, which is well beyond
any plausible monthly fleet potential.

**Step 3 — Clear the broken pending queue and seed flag in the
browser.** Open the deployed `value-props.html` in DevTools console:

```js
localStorage.removeItem('vp_pending_imports');
localStorage.removeItem('vp_seed_migration_done');
```

(Confirmed in `value-props.html`: `FGR_PENDING_KEY = 'vp_pending_imports'`,
`FGR_SEED_DONE_KEY = 'vp_seed_migration_done'`.)

**Step 4 — Re-seed.** Same console session:

```js
migrateSeedDataToCloud()
```

Watch for `Seed migration done: N uploaded, 0 failed.` Expected count
is the deduped row count printed in the first log line — for today's
`FD` blob, raw == deduped (one row per city), so the number matches
the previous 9422.

**Step 5 — Smoke test the real import.** Re-run the 1289-row import
that originally triggered the 21000 error. Expected outcome: ~50 rows
land in `fleet_gallon_reports` (one per unique city), each with the
summed gallons total, and the request returns 201.

## Follow-ups (separate PRs)

1. **React port mirror**. `react-app/src/hooks/useValuePropsState.ts`
   `importFleet` (`:392`) and `loadImportedData` (`:70`) need the same
   cloud round-trip. The React port already has a plain-fetch sync layer
   (`src/lib/valuePropsSync.ts`) — add `loadGallonReports` /
   `upsertGallonReports` there, mirror behavior, mirror realtime via
   the existing `@supabase/supabase-js` client used elsewhere in
   react-app (the SDK is fine in the React app — see CLAUDE.md note).
2. **Time-series support** if/when someone wants month-over-month: add
   `period` to the unique index, add a "Reporting month" picker to the
   import panel, default to current YYYY-MM.
3. **Shared deletes**. If "Remove fleet" should propagate to other
   users, add a `fleet_gallon_reports` DELETE policy + tombstone set
   (`vp_fgr_tombstones`) following the `vp_tombstones` pattern.
4. **Shared renames**. Today, `confirmRename()` only mutates `FN[]` and
   the localStorage cache — it does not rewrite cloud rows' `fleet_name`.
   A renamed fleet "comes back" under the old name on browser B. Fix by
   adding `UPDATE` against the cloud table when a rename happens.
5. **Real auth**, if/when the master/team distinction needs to be more
   than a UI gate.
