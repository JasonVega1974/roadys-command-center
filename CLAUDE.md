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
