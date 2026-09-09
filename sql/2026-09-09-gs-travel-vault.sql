-- gs_travel_vault — envelope-encryption key material for GS travel profiles.
-- Phase 2 of docs/superpowers/specs/2026-09-08-gs-travel-profile-design.md
--
-- Holds ONLY wrapped key material, never a key and never plaintext. Each entry
-- in `wraps` is {label, salt, iter, wrapped}: an AES-KW wrapping of the shared
-- data key (DEK) under a PBKDF2 key derived from one holder's passphrase, or
-- from the printed recovery code. Losing one passphrase therefore does not lose
-- the data, and rotating one re-wraps a single row instead of re-encrypting
-- every profile.
--
-- `kdf` is VESTIGIAL: nothing reads it. The per-wrap `iter` is the only
-- authoritative iteration count, so that raising the constant for new wraps
-- cannot break the ones already written. Do not treat this column as the
-- source of truth for KDF parameters.
--
-- No DELETE policy and no DELETE/TRUNCATE grant, matching the posture set by
-- sql/2026-09-09-drop-gs-travel-profiles-delete-policy.sql: this project's anon
-- key is public, so browser-initiated destruction stays impossible. Removing a
-- holder is an UPDATE that rewrites `wraps`.

begin;

create table if not exists public.gs_travel_vault (
  -- Exactly one row, ever. The client only ever reads/writes id='v1', so a
  -- second row would be key material nothing can reach: invisible in the UI,
  -- yet holding wraps that look like valid access. The CHECK makes that
  -- unrepresentable rather than merely unused.
  id         text primary key default 'v1' check (id = 'v1'),
  wraps      jsonb not null default '[]'::jsonb,
  kdf        jsonb not null default '{"name":"PBKDF2","hash":"SHA-256","iterations":600000}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.gs_travel_vault enable row level security;

create policy gs_travel_vault_read
  on public.gs_travel_vault for select using (true);
create policy gs_travel_vault_insert
  on public.gs_travel_vault for insert with check (true);
create policy gs_travel_vault_update
  on public.gs_travel_vault for update using (true) with check (true);
-- Deliberately NO delete policy.

grant select, insert, update on public.gs_travel_vault to anon, authenticated;
-- Supabase's project default privileges grant ALL on new tables in public, so
-- the destructive verbs must be revoked explicitly rather than merely not granted.
revoke delete, truncate on public.gs_travel_vault from anon, authenticated;

create or replace function public.touch_gs_travel_vault_updated_at() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists gs_travel_vault_touch on public.gs_travel_vault;
create trigger gs_travel_vault_touch
  before update on public.gs_travel_vault
  for each row execute function public.touch_gs_travel_vault_updated_at();

commit;

-- ── Verification (run these after the migration) ──────────────────────
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='gs_travel_vault';
--   -- expect rowsecurity = true
--
-- select policyname, cmd from pg_policies
--   where tablename='gs_travel_vault' order by cmd;
--   -- expect exactly 3 rows: INSERT, SELECT, UPDATE  (no DELETE)
--
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name='gs_travel_vault' and grantee in ('anon','authenticated')
--   order by grantee, privilege_type;
--   -- expect INSERT/SELECT/UPDATE for both roles, and NEITHER delete NOR truncate
--
-- select p.proname, p.prosecdef, p.proconfig from pg_proc p
--   join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='touch_gs_travel_vault_updated_at';
--   -- expect prosecdef = true and proconfig containing search_path=public, pg_temp
--
-- select con.conname, pg_get_constraintdef(con.oid) from pg_constraint con
--   join pg_class c on c.oid=con.conrelid
--   where c.relname='gs_travel_vault' and con.contype='c';
--   -- expect one CHECK constraint reading (id = 'v1'::text)
--
-- insert into public.gs_travel_vault (id) values ('v2');
--   -- expect ERROR: new row ... violates check constraint. If this SUCCEEDS,
--   -- the constraint did not land: delete the row and re-run the migration.
