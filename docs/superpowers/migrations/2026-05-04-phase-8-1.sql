-- ─────────────────────────────────────────────────────────────────────
-- Phase 8.1 — Supabase Auth + Users (Foundation)
-- Run once via Supabase Studio → SQL Editor → New query.
-- After running, follow the seed instructions at the bottom of this file.
-- ─────────────────────────────────────────────────────────────────────

-- 1. Application users table. Joins to auth.users by id.
create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text,
  role        text not null check (role in ('gs', 'manager')),
  gs_name     text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.users.gs_name is
  'For role=gs: must exactly match a REGIONS key in gs-command-center.html. For role=manager: leave NULL.';

-- 2. updated_at maintenance trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_touch_updated_at on public.users;
create trigger users_touch_updated_at
  before update on public.users
  for each row execute function public.touch_updated_at();

-- 3. Index for email lookup
create index if not exists users_email_idx on public.users (email);

-- 4. RLS: users see their own row; managers see all.
alter table public.users enable row level security;

drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users
  for select using (auth.uid() = id);

drop policy if exists users_manager_select_all on public.users;
create policy users_manager_select_all on public.users
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'manager'
    )
  );

-- No INSERT / UPDATE / DELETE policies — users are managed exclusively
-- via Supabase Studio (service role bypasses RLS) for v1.

-- ─────────────────────────────────────────────────────────────────────
-- Seed instructions (run AFTER the schema above):
--
-- A. In Supabase Studio → Authentication → Users → "Add user":
--    - Email: jasonvega1974@gmail.com
--    - Auto-confirm user: yes
--    Copy the resulting user's UUID — you'll need it below.
--
-- B. Run this in SQL Editor (replace the UUID):
--
--    insert into public.users (id, email, full_name, role, gs_name) values
--      ('<paste-uuid-here>',
--       'jasonvega1974@gmail.com',
--       'Jason Vega',
--       'manager',
--       null);
--
-- C. (Optional) Seed one test GS the same way. The full_name + email
--    can be anything; the gs_name MUST match a REGIONS key exactly
--    (e.g., 'Logan Resinkin', 'Burt Newman', 'Maria Coleman',
--    'Shannon Bumbalough', 'Stefanie Ritter', 'Steph Leslie').
--
--    insert into public.users (id, email, full_name, role, gs_name) values
--      ('<paste-uuid-here>',
--       'logan@example.com',
--       'Logan Resinkin',
--       'gs',
--       'Logan Resinkin');
-- ─────────────────────────────────────────────────────────────────────
