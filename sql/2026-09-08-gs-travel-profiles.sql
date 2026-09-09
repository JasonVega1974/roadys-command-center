-- gs_travel_profiles — per-person travel preferences for the GS Travel Planner.
-- Phase 1 of docs/superpowers/specs/2026-09-08-gs-travel-profile-design.md
-- `sec` is created here but stays NULL until Phase 2 (encrypted vault), so that
-- phase needs no migration against a populated table.
begin;

create table if not exists public.gs_travel_profiles (
  gs_name         text primary key,
  home_airport    text,
  hotel_brand     text,
  hotel_notes     text,
  airline         text,
  airline_tier    text,
  has_precheck    boolean default false,
  has_globalentry boolean default false,
  notes           text,
  sec             jsonb,
  updated_at      timestamptz default now()
);

alter table public.gs_travel_profiles enable row level security;

create policy gs_travel_profiles_read
  on public.gs_travel_profiles for select using (true);
create policy gs_travel_profiles_insert
  on public.gs_travel_profiles for insert with check (true);
create policy gs_travel_profiles_update
  on public.gs_travel_profiles for update using (true) with check (true);
-- DELETE is a real requirement: removing a departed person from the roster.
-- SUPERSEDED: this policy was dropped by
-- sql/2026-09-09-drop-gs-travel-profiles-delete-policy.sql -- removals are now
-- done in the SQL Editor, not from the browser's anon key.
create policy gs_travel_profiles_delete
  on public.gs_travel_profiles for delete using (true);

grant select, insert, update, delete on public.gs_travel_profiles to anon, authenticated;

create or replace function public.touch_gs_travel_profiles_updated_at() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists gs_travel_profiles_touch on public.gs_travel_profiles;
create trigger gs_travel_profiles_touch
  before update on public.gs_travel_profiles
  for each row execute function public.touch_gs_travel_profiles_updated_at();

commit;

-- ── Verification (run these after the migration) ──────────────────────
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='gs_travel_profiles';
--   -- expect rowsecurity = true
--
-- select policyname, cmd from pg_policies
--   where tablename='gs_travel_profiles' order by cmd;
--   -- expect 4 rows: DELETE, INSERT, SELECT, UPDATE
--
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name='gs_travel_profiles' and grantee in ('anon','authenticated')
--   order by grantee, privilege_type;
--   -- expect 8 rows: anon and authenticated each with DELETE/INSERT/SELECT/UPDATE
--
-- select p.proname, p.prosecdef, p.proconfig from pg_proc p
--   join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='touch_gs_travel_profiles_updated_at';
--   -- expect prosecdef = true and proconfig containing search_path=public,pg_temp
