-- ════════════════════════════════════════════════════════════════════
-- 2026-06-08  GS Command Center cloud-sync tables (Phase 10)
-- ════════════════════════════════════════════════════════════════════
-- Fixes:  POST .../gs_stop_records -> 401 "permission denied for table
--         gs_stop_records"  (and the same latent failure for the other
--         six gs_* tables the moment they have rows to upsert).
--
-- Root cause: gs-command-center.html syncToCloud() (Phase 10) upserts to
-- seven gs_* tables that were never given a migration -- no GRANT to the
-- anon key, no RLS, and (for gs_stop_records) no unique constraint for
-- the ON CONFLICT (stop_id, gs_name) target. Per CLAUDE.md every table
-- needs ENABLE RLS + explicit GRANT to anon/authenticated in the same block.
--
-- All PKs are TEXT: ids are generated client-side as 'log_'+Date.now(),
-- 'cr_...', 'sc_...', 'note_...', 'visit_...' -- never uuid/serial.
--
-- Idempotent: create-if-not-exists, guarded constraint adds, and
-- drop-policy-if-exists make this safe to run repeatedly and safe over
-- the already-existing gs_stop_records table.
--
-- NOTE on gs_managers: rows are derived in syncToCloud() from the live
-- REGIONS config (keyed by GS/manager name) plus GS_PINS; the natural key
-- is `name`, and the client upserts with onConflict: 'name'. (Earlier the
-- sync read localStorage 'gs_cmd_managers' as an array, but that key holds
-- an object, so it never ran -- fixed 2026-06-08.)
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── 1. gs_activity_logs ────────────────────────────────────────────
create table if not exists public.gs_activity_logs (
  id        text primary key,
  gs_name   text,
  stop_id   text,
  log_date  text,
  log_type  text,
  subject   text,
  notes     text
);

-- ── 2. gs_scheduled_calls ──────────────────────────────────────────
create table if not exists public.gs_scheduled_calls (
  id         text primary key,
  gs_name    text,
  stop_id    text,
  call_date  text,
  call_time  text,
  contact    text,
  purpose    text
);

-- ── 3. gs_critical_items ───────────────────────────────────────────
create table if not exists public.gs_critical_items (
  id          text primary key,
  gs_name     text,
  stop_id     text,
  reason      text,
  created_at  timestamptz default now()
);

-- ── 4. gs_tasks ────────────────────────────────────────────────────
create table if not exists public.gs_tasks (
  id           text primary key,
  gs_name      text,
  stop_id      text,
  title        text,
  priority     text,
  status       text,
  due_date     text,
  category     text,
  assigned_to  text,
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ── 5. gs_stop_records ─────────────────────────────────────────────
-- Composite natural key (stop_id, gs_name) -- matches the client's
-- onConflict: 'stop_id,gs_name'. Created without an inline constraint
-- so the guarded add below works for BOTH a fresh table and the
-- already-existing one that triggered the 401.
create table if not exists public.gs_stop_records (
  stop_id          text,
  gs_name          text,
  membership_cost  text,
  site_mgr_name    text,
  site_mgr_email   text,
  site_mgr_phone   text,
  notes            jsonb default '[]'::jsonb,
  visits           jsonb default '[]'::jsonb,
  extras           jsonb default '{}'::jsonb,
  updated_at       timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gs_stop_records'::regclass
      and contype in ('p', 'u')
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.gs_stop_records'::regclass and attname = 'stop_id'),
        (select attnum from pg_attribute where attrelid = 'public.gs_stop_records'::regclass and attname = 'gs_name')
      ]
  ) then
    alter table public.gs_stop_records
      add constraint gs_stop_records_stop_gs_key unique (stop_id, gs_name);
  end if;
end $$;

-- ── 6. gs_scenarios ────────────────────────────────────────────────
create table if not exists public.gs_scenarios (
  id          text primary key,
  gs_name     text,
  stop_id     text,
  name        text,
  fleet       text,
  notes       text,
  retail      jsonb default '{}'::jsonb,
  cost_plus   jsonb default '{}'::jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── 7. gs_managers (sync path currently inactive -- see header note) ─
create table if not exists public.gs_managers (
  name        text primary key,
  pin         text,
  role        text,
  regions     jsonb default '[]'::jsonb,
  color       text,
  updated_at  timestamptz default now()
);

-- ── RLS + policies + grants for all seven ──────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'gs_activity_logs','gs_scheduled_calls','gs_critical_items',
    'gs_tasks','gs_stop_records','gs_scenarios','gs_managers'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists %I on public.%I;', t||'_read',   t);
    execute format('drop policy if exists %I on public.%I;', t||'_insert', t);
    execute format('drop policy if exists %I on public.%I;', t||'_update', t);

    execute format('create policy %I on public.%I for select using (true);', t||'_read', t);
    execute format('create policy %I on public.%I for insert with check (true);', t||'_insert', t);
    execute format('create policy %I on public.%I for update using (true) with check (true);', t||'_update', t);

    execute format('grant select, insert, update, delete on public.%I to anon, authenticated;', t);
  end loop;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════
-- Verification (run after COMMIT; all seven rows should appear)
-- ════════════════════════════════════════════════════════════════════
-- select c.relname                                   as table,
--        c.relrowsecurity                            as rls_on,
--        has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
--        (select count(*) from pg_policies p
--           where p.schemaname='public' and p.tablename=c.relname) as policies
-- from pg_class c
-- where c.relnamespace = 'public'::regnamespace
--   and c.relname like 'gs\_%'
-- order by c.relname;
--
-- Confirm the upsert conflict target exists:
-- select conname, contype from pg_constraint
-- where conrelid = 'public.gs_stop_records'::regclass and contype in ('p','u');
