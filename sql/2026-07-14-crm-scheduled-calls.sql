begin;

-- ── crm_scheduled_calls ──────────────────────────────────────────────
create table if not exists public.crm_scheduled_calls (
  id                text primary key,
  lead_id           text not null,
  company           text,
  owner             text,
  call_type         text not null,
  scheduled_at      timestamptz not null,
  status            text not null default 'scheduled',
  note              text,
  source            text not null default 'manual',
  reminder_1h_sent  boolean not null default false,
  reminder_dod_sent boolean not null default false,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table public.crm_scheduled_calls enable row level security;

create policy crm_sched_read   on public.crm_scheduled_calls for select using (true);
create policy crm_sched_insert on public.crm_scheduled_calls for insert with check (true);
create policy crm_sched_update on public.crm_scheduled_calls for update using (true) with check (true);
create policy crm_sched_delete on public.crm_scheduled_calls for delete using (true);

grant select, insert, update, delete on public.crm_scheduled_calls to anon, authenticated;

create index if not exists crm_sched_by_time  on public.crm_scheduled_calls (scheduled_at);
create index if not exists crm_sched_by_lead  on public.crm_scheduled_calls (lead_id);

-- reuse the existing search-path-pinned trigger fn touch_updated_at()
create trigger crm_sched_touch before update on public.crm_scheduled_calls
  for each row execute function public.touch_updated_at();

-- Realtime so the dashboard card updates live (optional but recommended):
-- alter publication supabase_realtime add table public.crm_scheduled_calls;

-- ── crm_owner_emails ─────────────────────────────────────────────────
create table if not exists public.crm_owner_emails (
  owner      text primary key,
  email      text not null,
  timezone   text not null default 'America/Chicago',
  updated_at timestamptz default now()
);

alter table public.crm_owner_emails enable row level security;

create policy crm_owner_read   on public.crm_owner_emails for select using (true);
create policy crm_owner_insert on public.crm_owner_emails for insert with check (true);
create policy crm_owner_update on public.crm_owner_emails for update using (true) with check (true);

grant select, insert, update, delete on public.crm_owner_emails to anon, authenticated;

create trigger crm_owner_touch before update on public.crm_owner_emails
  for each row execute function public.touch_updated_at();

-- Seed owners — REPLACE the placeholder emails before Phase B:
insert into public.crm_owner_emails (owner, email) values
  ('Robert Watson','robert@REPLACE.me'),
  ('Angel Long','angel@REPLACE.me'),
  ('Logan','logan@REPLACE.me')
on conflict (owner) do nothing;

commit;

-- Verify:
-- select * from public.crm_owner_emails;
-- select id,company,call_type,scheduled_at,status from public.crm_scheduled_calls order by scheduled_at desc limit 5;
