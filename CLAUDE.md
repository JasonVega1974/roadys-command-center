# Roady's Command Center — Claude operating notes

## Supabase: new-table checklist

**Any migration that introduces a new table in this project MUST include both
of the following in the same migration block:**

1. `ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY;`
   Plus the explicit `CREATE POLICY` rows. RLS without policies blocks everything;
   policies without RLS leave the table wide open.
2. `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<name> TO anon, authenticated;`
   The browser uses the anon key for every write. Without this GRANT, even a
   permissive RLS policy returns 403. If the table has a `serial`/`bigserial`
   primary key, also `GRANT USAGE, SELECT ON SEQUENCE public.<name>_<col>_seq TO anon, authenticated`.

Template to paste into any new-table migration:

```sql
create table public.example (
  id uuid primary key default gen_random_uuid(),
  -- columns...
  updated_at timestamptz default now()
);

alter table public.example enable row level security;

create policy example_read   on public.example for select using (true);
create policy example_insert on public.example for insert with check (true);
create policy example_update on public.example for update using (true) with check (true);
-- Add a DELETE policy only if browser-initiated deletes are a real requirement.

grant select, insert, update, delete on public.example to anon, authenticated;

-- Realtime, if needed:
-- alter publication supabase_realtime add table public.example;
```

**Trigger / SECURITY DEFINER functions must pin `search_path`** — Supabase's
`function_search_path_mutable` lint will flag any function that doesn't:

```sql
create or replace function public.touch_example_updated_at() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
```

The migration in `sql/2026-05-27-enable-rls-and-fix-search-path.sql` already
fixed the two functions that pre-existed without `search_path` pinned
(`touch_updated_at`, `deck_gallery_touch_updated_at`). New functions must
ship pinned from day one.

## Tables today (2026-06-08)

Core (from `index.html` / `value-props.html`):
`crm_leads`, `deck_gallery`, `fleet_gallon_reports`, `fleet_status`,
`fuel_data`, `geo_cache`, `impl_sites`, `kpi_data`, `pnl_notes`,
`sd_tickets`, `value_props`, `vp_enroll`. All grants and RLS confirmed
via the 2026-05-27 migration batch in `sql/`.

GS Command Center cloud sync (Phase 10, from `gs-command-center.html`):
`gs_activity_logs`, `gs_scheduled_calls`, `gs_critical_items`, `gs_tasks`,
`gs_stop_records`, `gs_scenarios`, `gs_managers`. RLS + grants added in
`sql/2026-06-08-gs-command-center-tables.sql`. All PKs are **text**
(client ids like `'log_'+Date.now()`); `gs_stop_records` keys on the
composite `(stop_id, gs_name)`, `gs_managers` on `name`, the rest on `id`.

`gs_stop_records` is the cloud mirror of the per-GS `stopdata` /`extras`
`localStorage` namespaces (membership + site-contact data). Those
namespaces remain the source of truth on each GS device, seeded inline
from `COMPANY_MEMBERSHIP_DATA` and `MANAGER_CONTACTS_SEED`; the Phase 10
sync upserts them to the cloud. (The earlier proposed `stop_records`
table in `sql/membership_supabase_notes.sql` was never built — superseded
by `gs_stop_records`.)

CRM Phase B (from `CRM.html` / `call-booking.html`): `crm_scheduled_calls`,
`crm_owner_emails` (`sql/2026-07-14-crm-scheduled-calls.sql`),
`crm_booking_offers` (`sql/2026-07-14-crm-booking.sql`, RPC-only — no
direct anon/authenticated grants, reached only via SECURITY DEFINER RPCs),
and `crm_email_templates` (`sql/2026-07-15-crm-email-templates.sql`) — the
Email Templates tab's canned-outreach library, synced so edits are shared
between owners instead of living per-browser in `localStorage`.

Travel Profiles Phase 1 (from `gs-travel-planner.html`):
`gs_travel_profiles` (`sql/2026-09-08-gs-travel-profiles.sql`), keyed on
`gs_name` (text PK). Per-person travel preferences — home airport, hotel
brand, airline/tier, PreCheck/Global Entry, notes. **No account, KTN, or
passport numbers**: the anon key is public, so every row is world-readable.
The anon DELETE policy was revoked by
`sql/2026-09-09-drop-gs-travel-profiles-delete-policy.sql`, so removing a
person is a SQL Editor job — the page can no longer delete cloud rows.

Travel Profiles Phase 2 (from `gs-travel-planner.html`): `gs_travel_vault`
(`sql/2026-09-09-gs-travel-vault.sql`), one row, `id='v1'`. Holds **wrapped
key material only** — each `wraps` entry is the shared data key encrypted
under one holder's passphrase (or the printed recovery code). No key and no
plaintext ever land in it. Like `gs_travel_profiles` it has no DELETE policy
and no DELETE grant; removing a holder is an UPDATE that rewrites `wraps`.
Every change to the row goes through `tpVaultMutateWraps()`, which reads the
row, computes the new wraps from that snapshot, and writes with
`.eq('updated_at', seen).select()` — `updated_at` is bumped by a trigger, so
it is the version token. An empty returned array means another holder
changed access first: abort, never retry. A lost write here silently deletes
someone's only way in, and there is no escrow.

## Project structure quick reference

- `index.html` — Roady's Network Command Center (admin/master dashboard).
  Owns Supabase sync: writes `fuel_data`, `kpi_data`, `pnl_notes`,
  `impl_sites`, `crm_leads`, `sd_tickets`, `vp_enroll`. Reads everything.
- `gs-command-center.html` — Growth Strategist workstation. Reads
  `roadys_fuel` / `roadys_kpi` / `roadys_vp_enroll` from `localStorage`
  (mirrors written by `index.html`). Owns its own `stopdata` per-GS
  namespace. **Writes the seven `gs_*` tables** via the Phase 10
  `syncToCloud()` (manual ☁️ Sync button) — upserts per-GS activity logs,
  scheduled calls, critical items, tasks, stop records, scenarios, and the
  manager/region config. Uses the Supabase SDK (`getRoadysSB()`).
- `value-props.html` — Value-prop wizard. Owns `value_props`, `geo_cache`,
  `fleet_status`, `fleet_gallon_reports`. Uses plain `fetch(... /rest/v1/...)`
  instead of the Supabase SDK.
- `implementation.html` — Onboarding tracker. Mirrors `impl_sites`,
  `sd_tickets`, `crm_leads` from `index.html`.
- `vendors.html` — Vendor master + program details.
- `gs-travel-planner.html` — Three tabs behind one header (`.viewTab`
  buttons toggle `#viewPlanner` / `#viewVisit` / `#viewProfiles`, and swap
  the header button group). Trips and visits stay in `localStorage`; only
  **Travel Profiles** touches the cloud — it reads and writes
  `gs_travel_profiles` and `gs_travel_vault` via the Supabase SDK, mirrored
  locally under `gsp2:profile:<tpKey>` so the page still works offline.
  Account numbers on a profile are **client-side encrypted** (AES-GCM under
  a data key wrapped in `gs_travel_vault`) and are readable only while the
  vault is unlocked for the tab; the passphrase, the recovery code and the
  key itself are never persisted anywhere and are gone on reload. **The
  passphrase and recovery code belong in the company password manager, with
  at least two people able to reach it** — that operational step is the only
  thing standing between the company and permanent data loss, since losing
  every wrap is unrecoverable by design. "Manage access" (unlocked vaults
  only) rotates the passphrase, adds a holder, or removes one; all three
  re-wrap the same key and re-encrypt nothing. `#gsName` decides
  trip ownership (`tripKey(curGS(),…)`), so nothing in the async roster
  render may change the selection — see the sentinel handling in
  `tpRenderGSDropdown()`. **Route Planner**: OSRM routing, trips under
  `gsp2:trip:<gs>:<name>`. Two independent airports — `state.origin` is the
  **Depart Airport** (flown into, start of the routing) and `state.dest` the
  **Return Airport** (flown out of, end of it). Neither is ever inferred from
  the other; the old `sameEnd` "Return to start point" checkbox is gone, and
  `migrateAirports()` materializes it into a real `dest` when an old trip is
  opened. "Same as depart" is a button that *writes* the value, not an
  assumption. Up to `MAX_STOPS` (25) stops per trip — the on-screen map has
  no cap at all (see "Route Planner: the map" below). **Site Visit**: the `site-visit.html` form
  ported to this app's theme, with photo/video attachments stored as
  base64 inside the record. Visits save one key per visit under
  `gsp2:visit:<gs>:<id>`; `svSave()` warns past `SV_WARN_CHARS` and, if
  the quota still bites, saves the notes and drops the media rather than
  failing quietly. Everything else derives from the DOM — `svYNIndex()`
  reads the Yes/No labels, `svReportBody()` builds the print packet and
  the Drive document — so adding a form row needs no matching JS.
  The form mirrors `Site Review Master Template` (Administrative,
  Fuel Gallon, Rewards, Vendor Program, ROI Summary). The **ROI Summary**
  card is the one section with live math: `svROIRecalc()` fills each
  revenue Amount from `base × margin`, sums the rows tagged
  `data-roi-group="rev|sav|exp"`, and derives Net Income; margins start
  from `SV_ROI_DEFAULTS`, re-applied by `svClear()` after the wipe.
  Rows that skip grid columns carry `data-col` so the printed report
  labels them correctly instead of falling back to the `.hdr` position.
  **`SV_SIGNAGE` / `SV_RESTROOM` / `SV_SHOWER` / `SV_AMENITIES` are
  index-keyed (`sv-sign-3`, `sv-amen-18`, …) — append only.** Inserting
  in the middle shifts every id after it and a saved visit restores its
  answers into the wrong rows. Aggregator rows are slug-keyed instead,
  so they can move between the Legacy and New groups freely, but
  renaming a label orphans its saved values.
  Two constants at the top of the `<script>` need real values before
  those buttons do anything: `SLACK_WEBHOOK_URL` (an Incoming Webhook
  for #site-visits; posted with `mode:'no-cors'` + a form-urlencoded
  content type, since Slack's endpoint sends no CORS headers, which
  means delivery can't be confirmed from the page) and
  `GDRIVE_CLIENT_ID` (a Web-application OAuth client with the Drive API
  enabled and this page's origin authorized; `drive.file` scope only).
  Both show a "not configured yet" dialog until then.

### Route Planner: the map (Leaflet + OSRM geometry, not Google Embed)

The on-screen map is Leaflet, tiled from Stadia Maps' dark basemap
(`TILE_URL`/`TILE_ATTR`), not Google's Maps Embed API. That switch happened
because the Embed API drew **its own** route choice between waypoints,
independent of whichever OSRM route the app actually calculated and
describes in the itinerary/print packet — the two could silently disagree —
and because its embed mode caps at a fixed waypoint count, which a 20-stop
trip would blow past. Leaflet draws straight from `state.route.legs[i].geom`,
the literal geometry OSRM returned for the chosen leg, so the map and the
printed directions are provably the same route, and there's no waypoint cap
to hit at any stop count up to `MAX_STOPS`.

Three marker kinds, visually distinct on purpose: numbered gold-ringed
circles for truck stops (`stopIcon()`), blue circles for the Depart/Return
airports (`airportIcon()`), and a blue **teardrop pin** — not another
circle — for each hotel night (`hotelIcon()`, `.rmHotelPin`), so lodging
reads at a glance against the round stop/airport markers. `hotelIcon()`'s
`iconAnchor` is hand-derived from the CSS rotation math (a 24×24 box,
`border-radius:50% 50% 50% 0`, `rotate(-45deg)`) so the pin's drawn tip —
not its bounding-box center — lands on the actual coordinate; if the pin
size or rotation ever changes, that anchor has to be re-derived, not
nudged by eye. `mapPointsFor()`'s full-trip branch (`dayIdx===null`)
walks every `state.schedule.days[*].items` once a build exists — it used
to stop at origin/stops/dest only, so no hotel marker ever appeared on
the default "Full trip" tab, only inside a specific Day tab. That walk
skips `'resume'` items (`skipResume:true`) because `'resume'` is always
the same coordinate as the previous day's `'hotel'` item — leaving it in
would draw two overlapping markers per night.

`ensureMap()`/`clearMap()` hold one persistent `L.map` + `L.layerGroup`,
rebuilt on every redraw rather than an iframe `src` being thrown away —
`drawMapFor(dayIdx, ordered, dest, useReal)` is the single entry point for
both the full-trip and per-day views. **`useReal` must never be inferred
from whether `state.route` exists** — it has to mean "the current stop set
still matches what `state.route` was built from." `refreshMapPreview()`
always passes `false`: it only ever runs when `tripGeometrySig()` has
already proven the stops diverged from the last build (that's the whole
reason it's redrawing), so `state.route.legs`, if present, describe a
*different* set or order of stops and would draw a route that no longer
matches the markers. `renderMap()` (called right after a successful Build,
and by `loadTrip()`/`setLegAlt()`/`repickAllLegs()`, all of which keep
`state.route` synchronized with the current stops first) always passes
`true`.

Even with `useReal:true`, `routeLinesFor()` falls back to a straight line
per missing leg — a **slim-reopened trip has no `leg.geom` at all**
(`slimForSave()` strips it to keep saved trips small), so every "solid"
segment silently degrades to the dashed straight-line style rather than
throwing or drawing nothing. The one thing OSRM never routes is the morning
hotel→site hop from the night-hotel rule (below): `routeLinesFor()` draws
that as its own dashed segment, matched up via a `pendingHop` flag set on a
`part:'morning'` drive item and consumed by the next visit/arrive item.

### Route Planner: the night hotel rule

**Every overnight is the hotel nearest the NEXT day's first scheduled site —
the Return Airport on the last night. Nothing overrides it:** not elapsed
drive time, not mileage, not the "Stop Driving By" time. The whole remaining
drive happens that evening, so the morning is a short hop from the hotel door
(`HOP_MPH`) instead of hours of highway. If you are tempted to add a
"but if it's after X o'clock…" branch to `buildSchedule()`, that is the exact
fallback this rule exists to forbid.

`state.driveTil` is advisory: when the evening drive runs past it the drive
and hotel items carry `late:true` and the itinerary card says so — the hotel
does not move. The one thing it still decides is *whether* a night before the
flight home is needed at all, which is a question about sleeping, not placing.

`buildSchedule()` is synchronous (several sync callers), so it reads
`nightHotelFor()` out of the `state.nightHotels` cache and falls back to the
site itself — right place, missing name. `resolveNightHotels()` fills that
cache from Overpass afterwards, retries three times because Overpass answers
429/504 under load, re-renders once, and on failure says so on the card rather
than leaving "Looking up…" forever. The lookup takes the **strictly nearest**
lodging; the GS's preferred brand is a display hint only and must never move
the pin.

### Route Planner: the map follows stop edits

The Google embed URL is built from coordinates alone — no routing call —
so `refreshMapPreview()` redraws it straight from `state.stops` whenever
`markDirty()` fires (200 ms debounce, and it no-ops unless
`tripGeometrySig()` changed, so typing in a notes field doesn't churn the
iframe). Only drive times, the day split and turn-by-turn need OSRM, so
while a preview is showing the day tabs hide and the hint under the map
says a build is needed. `renderMap()` re-settles `mapSig` after a real
build so the optimized order isn't immediately overdrawn.

**Manual test — the map must update on every one of these, with no
Build My Route in between:**

1. Pick a Depart Airport *and* a Return Airport (different ones — that is the
   point), add 2–3 Roady's stops, hit **Build My Route**.
   Map draws the route; day tabs appear.
2. **Add** a stop → its pin joins the map, day tabs hide, hint switches
   to "Drive times… still from the last build".
3. **Reorder** with ▲ / ▼ → the waypoint order on the map follows.
4. **Remove** with ✕ → that pin drops off.
5. **Build My Route** again → day tabs come back, hint returns to
   "Showing the full trip".
6. Type in Trip Name or a stop's notes → map must *not* redraw.
7. Delete every stop → falls back to the plain base map.

Regression guard: the pre-fix build showed a stale map through steps
2–4, so if any of those stop moving the preview hook has been broken.

## SQL conventions

- New files go under `sql/` named `YYYY-MM-DD-<slug>.sql`. Wrap every
  migration in `BEGIN; … COMMIT;` so a syntax error doesn't leave the
  schema half-applied.
- Inline a verification query block (commented) at the bottom so anyone
  running the file in the SQL Editor can check it landed correctly.
- Optional/dangerous migrations (eg. schema additions paired with seed
  data) live as `<...>_optional.sql` and document the dependency at the
  top of the file.

## Data seed pattern (gallon, membership, amenities, contacts)

Per-stop data is injected into the HTML as inline JS constants (eg.
`FUEL_APR_2026_DATA`, `COMPANY_MEMBERSHIP_DATA`, `AMENITIES_FUEL_CARDS_SEED`,
`MANAGER_CONTACTS_SEED`) plus a single hook inside `loadFuelGD()` /
`loadStopRecord()` that merges the seed with what's in `localStorage`.
User edits always win; the seed only fills empty fields. To regenerate a
seed, re-run the Python script under `C:\tmp\` — it replaces the block in
place via the `// ── SEED_NAME ──` / `// ── /SEED_NAME ──` sentinels.
