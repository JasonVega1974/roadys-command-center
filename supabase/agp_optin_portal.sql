-- =====================================================================
-- Truck Stop Opt-In Portal — schema + RPC + grant model
-- =====================================================================
-- Two phases, applied separately:
--   PHASE A — additive + token lock. Safe to apply once the planner's
--             explicit-column read change is deployed (the token column
--             lock below breaks select('*')). Form is RPC-only from here.
--   PHASE B — role split. Apply ONLY AFTER planner auth (email+password)
--             lands. Strips anon to the 4 RPCs and re-scopes RLS policies
--             to `authenticated`, so BOTH layers (grants AND policies)
--             deny anon's direct table path.
--
-- RECONCILE FIRST: the live DB may diverge from repo migrations (manual
-- Security Advisor fixes). Run the verification queries at the bottom and
-- build the final Phase B revoke list from the ACTUAL output — esp. any
-- anon table privileges or anon-executable functions not represented here.
-- Phase B uses `revoke all privileges ... from anon`, which is exhaustive
-- for the six tables regardless of divergence; the open item is unexpected
-- anon-executable functions/views, which the queries will surface.
--
-- search_path pinned on every SECURITY DEFINER function. Idempotent.
-- =====================================================================


-- #####################################################################
-- ## PHASE A1 — additive: columns, token gen/backfill, RPCs.
-- ##            Does NOT change agp_locations grants, so the planner's
-- ##            select('*') keeps working. Safe to apply early so
-- ##            submit_optin can be verified (see agp_optin_portal_test.sql)
-- ##            BEFORE any page code is built on it.
-- #####################################################################
begin;

-- ---- 1. New columns -------------------------------------------------
alter table public.agp_aggregators add column if not exists show_on_form boolean default false;
alter table public.agp_locations  add column if not exists responded_at timestamptz;
alter table public.agp_locations  add column if not exists optin_token  text;

-- ---- 2. Token (256-bit, url-safe hex; no extension dep) --------------
create or replace function public.gen_optin_token() returns text
language sql volatile
set search_path = public, pg_temp
as $$
  select replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')
$$;

alter table public.agp_locations alter column optin_token set default public.gen_optin_token();
update public.agp_locations set optin_token = public.gen_optin_token() where optin_token is null;
create unique index if not exists agp_locations_optin_token_key on public.agp_locations(optin_token);
alter table public.agp_locations alter column optin_token set not null;

-- ---- 3. Public-form RPCs (SECURITY DEFINER, never touch the token) ---

-- (a) token -> safe stop fields
create or replace function public.resolve_optin_token(p_token text)
returns table(id text, name text, city text, state text, code text, gs text, responded_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select l.id, l.name, l.city, l.state, l.code, l.gs, l.responded_at
  from public.agp_locations l
  where l.optin_token = p_token
$$;
revoke all on function public.resolve_optin_token(text) from public;
grant execute on function public.resolve_optin_token(text) to anon, authenticated;

-- (b) lost-link fallback: store # + name -> safe stop fields
create or replace function public.resolve_optin_by_code(p_code text, p_name text)
returns table(id text, name text, city text, state text, code text, gs text, responded_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select l.id, l.name, l.city, l.state, l.code, l.gs, l.responded_at
  from public.agp_locations l
  where lower(btrim(l.code)) = lower(btrim(p_code))
    and lower(btrim(l.name)) = lower(btrim(p_name))
  limit 1
$$;
revoke all on function public.resolve_optin_by_code(text, text) from public;
grant execute on function public.resolve_optin_by_code(text, text) to anon, authenticated;

-- (c) safe aggregator display data for the form (no agp_aggregators SELECT)
create or replace function public.list_optin_aggregators()
returns table(id text, name text, rail text, carriers text,
              discount_type text, discount_value text, discount_target text, description text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select a.id, a.name, a.rail, a.carriers,
         a.discount_type, a.discount_value, a.discount_target, coalesce(d.body,'')
  from public.agp_aggregators a
  left join public.agp_descriptions d on d.aggregator_id = a.id
  where a.show_on_form is true
  order by a.sort_index
$$;
revoke all on function public.list_optin_aggregators() from public;
grant execute on function public.list_optin_aggregators() to anon, authenticated;

-- (d) THE ENTIRE WRITE BOUNDARY for the public form.
--     Two public entry points — submit_optin (token) and submit_optin_by_code
--     (lost-link fallback) — both resolve a stop THEN delegate every write to
--     ONE private helper, _apply_optin, so the boundary guarantees live in a
--     single place and cannot drift between the two entry points:
--       * the stop is resolved by the entry point (token, or unique code+name),
--         else the entry point rejects with NO write
--       * location_id passed to the helper is ALWAYS the resolved stop —
--         never caller-supplied — so a caller can never write another stop's rows
--       * only show_on_form aggregators are written (others skipped)
--       * status / discount_type clamped to allowed sets
--       * retail_minus / cost_plus clamped to 0-2 digit cents, else blank
--       * re-submit upserts THIS stop's own rows (latest wins)

-- (d.0) PRIVATE helper — not granted to anon/authenticated. Only the two
--       SECURITY DEFINER entry points (running as owner) can reach it.
create or replace function public._apply_optin(p_loc_id text, p_choices jsonb)
returns text
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  c        jsonb;
  v_agg    text;
  v_status text;
  v_type   text;
  v_rmin   text;
  v_cplus  text;
begin
  if p_loc_id is null then
    raise exception 'no stop resolved' using errcode = '28000';
  end if;
  if p_choices is null or jsonb_typeof(p_choices) <> 'array' then
    raise exception 'choices must be a JSON array' using errcode = '22023';
  end if;

  for c in select value from jsonb_array_elements(p_choices)
  loop
    v_agg := nullif(btrim(c->>'aggregator_id'), '');
    if v_agg is null then continue; end if;

    -- aggregator must exist AND be published on the form
    if not exists (select 1 from public.agp_aggregators a
                   where a.id = v_agg and a.show_on_form is true) then
      continue;
    end if;

    -- clamp status
    v_status := coalesce(c->>'status', 'No Response');
    if v_status not in ('Yes', 'No', 'No Response') then v_status := 'No Response'; end if;

    -- clamp discount type
    v_type := coalesce(c->>'discount_type', '');
    if v_type not in ('R-', 'C+', 'BO', 'none', '') then v_type := ''; end if;

    -- clamp values to 0-2 digit cents
    v_rmin  := coalesce(c->>'retail_minus', '');
    v_cplus := coalesce(c->>'cost_plus', '');
    if v_rmin  !~ '^[0-9]{0,2}$' then v_rmin  := ''; end if;
    if v_cplus !~ '^[0-9]{0,2}$' then v_cplus := ''; end if;

    -- write ONLY this resolved stop's row
    insert into public.agp_optins
      (aggregator_id, location_id, status, discount_type, retail_minus, cost_plus, updated_at)
    values (v_agg, p_loc_id, v_status, v_type, v_rmin, v_cplus, now())
    on conflict (aggregator_id, location_id) do update
      set status        = excluded.status,
          discount_type = excluded.discount_type,
          retail_minus  = excluded.retail_minus,
          cost_plus     = excluded.cost_plus,
          updated_at    = now();
  end loop;

  -- stamp completion on this stop only
  update public.agp_locations set responded_at = now() where id = p_loc_id;
  return p_loc_id;
end
$$;
revoke all on function public._apply_optin(text, jsonb) from public;   -- internal: no anon/authenticated grant

-- (d.1) TOKEN entry point — the emailed-link path.
create or replace function public.submit_optin(p_token text, p_choices jsonb)
returns text
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare v_loc text;
begin
  -- token must resolve to exactly one real stop, else reject (no write)
  select id into v_loc from public.agp_locations where optin_token = p_token;
  if v_loc is null then
    raise exception 'invalid or unknown opt-in token' using errcode = '28000';
  end if;
  return public._apply_optin(v_loc, p_choices);
end
$$;
revoke all on function public.submit_optin(text, jsonb) from public;
grant execute on function public.submit_optin(text, jsonb) to anon, authenticated;

-- (d.2) CODE+NAME entry point — the lost-link fallback. code+name is a weaker
--       identifier than an opaque token, so matching is STRICT: exact
--       (case-insensitive, trimmed) on BOTH columns and must resolve to
--       EXACTLY ONE stop. 0 or >1 matches → reject (no write). No partials.
create or replace function public.submit_optin_by_code(p_code text, p_name text, p_choices jsonb)
returns text
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare v_loc text; v_n int;
begin
  select count(*) into v_n
  from public.agp_locations
  where lower(btrim(code)) = lower(btrim(p_code))
    and lower(btrim(name)) = lower(btrim(p_name));
  if v_n <> 1 then
    raise exception 'stop not uniquely identified by store # + name' using errcode = '28000';
  end if;
  select id into v_loc
  from public.agp_locations
  where lower(btrim(code)) = lower(btrim(p_code))
    and lower(btrim(name)) = lower(btrim(p_name));
  return public._apply_optin(v_loc, p_choices);
end
$$;
revoke all on function public.submit_optin_by_code(text, text, jsonb) from public;
grant execute on function public.submit_optin_by_code(text, text, jsonb) to anon, authenticated;

-- (e) planner copy-link: one id -> its token. authenticated ONLY (NOT anon).
create or replace function public.get_optin_token(p_loc_id text)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select l.optin_token from public.agp_locations l where l.id = p_loc_id
$$;
revoke all on function public.get_optin_token(text) from public;
grant execute on function public.get_optin_token(text) to authenticated;   -- NOT anon

commit;
-- ## END PHASE A1 ####################################################


-- #####################################################################
-- ## PHASE A2 — token-column lock.
-- ##   COUPLED (hard): apply this in the SAME deployment as the planner's
-- ##   explicit-column read refactor (no select('*') on agp_locations).
-- ##   It removes anon/authenticated SELECT on optin_token; any select('*')
-- ##   on agp_locations breaks the instant this lands.
-- #####################################################################
begin;
revoke select, insert, update on public.agp_locations from anon, authenticated;
grant select (id, name, city, state, code, gs, ach, responded_at, updated_at)
  on public.agp_locations to anon, authenticated;
grant insert (id, name, city, state, code, gs, ach, responded_at, updated_at)
  on public.agp_locations to anon, authenticated;
grant update (name, city, state, code, gs, ach, responded_at, updated_at)
  on public.agp_locations to anon, authenticated;
grant delete on public.agp_locations to anon, authenticated;
commit;
-- ## END PHASE A2 ####################################################


-- #####################################################################
-- ## PHASE B  — role split.  DO NOT RUN until the planner authenticates
-- ##            (email+password Supabase Auth). This is a separate,
-- ##            blocking task; links must not be emailed before it lands.
-- ##            Reconcile the revoke list with the live verification output.
-- #####################################################################
-- begin;
--
-- -- (1) GRANTS: strip anon from every agp_* table. Live anon holds GRANT ALL
-- --     (incl TRUNCATE/REFERENCES/TRIGGER), so revoke-all-privileges is required
-- --     (an enumerated CRUD revoke would leave those behind).
-- revoke all privileges on
--   public.agp_aggregators, public.agp_steps, public.agp_locations,
--   public.agp_optins, public.agp_descriptions, public.agp_settings
--   from anon;
--
-- -- (2) FUNCTIONS: the four anon-executable funcs found live (none are form RPCs):
-- --     deck_gallery_touch_updated_at, pnl_notes_touch_updated_at, touch_updated_at
-- --     (trigger funcs — fire regardless of EXECUTE), and rls_auto_enable (unused
-- --     Security Advisor helper; no page calls any RPC at runtime). Pull all four
-- --     off public/anon. regprocedure lookup handles any signature.
-- do $$
-- declare r record;
-- begin
--   for r in select p.oid::regprocedure as sig
--            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--            where n.nspname = 'public' and p.proname in
--              ('deck_gallery_touch_updated_at','pnl_notes_touch_updated_at',
--               'touch_updated_at','rls_auto_enable')
--   loop
--     execute format('revoke execute on function %s from public, anon', r.sig);
--   end loop;
-- end $$;
--
-- -- (3) RLS: live policies are bound to the PUBLIC role (with duplicate _read
-- --     policies on agp_locations/agp_optins). Revoking anon grants does NOT
-- --     touch PUBLIC-role policies, so drop EVERY existing policy per table
-- --     (handles PUBLIC-bound + duplicates + any unknown names) and recreate one
-- --     clean set scoped to `authenticated`. Apply to all six tables. DEFINER
-- --     RPCs bypass RLS, so the form is unaffected.
-- do $$
-- declare t text; pol record;
-- begin
--   foreach t in array array['agp_aggregators','agp_steps','agp_locations',
--                            'agp_optins','agp_descriptions','agp_settings']
--   loop
--     for pol in select policyname from pg_policies where schemaname='public' and tablename = t
--     loop execute format('drop policy if exists %I on public.%I', pol.policyname, t); end loop;
--     execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_read', t);
--     execute format('create policy %I on public.%I for insert to authenticated with check (true)', t||'_insert', t);
--     execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t||'_update', t);
--     execute format('create policy %I on public.%I for delete to authenticated using (true)', t||'_delete', t);
--   end loop;
-- end $$;
--
-- -- (4) re-affirm authenticated keeps full access (token still column-excluded)
-- grant select, insert, update, delete on
--   public.agp_aggregators, public.agp_steps, public.agp_optins,
--   public.agp_descriptions, public.agp_settings to authenticated;
-- grant select (id,name,city,state,code,gs,ach,responded_at,updated_at) on public.agp_locations to authenticated;
-- grant insert (id,name,city,state,code,gs,ach,responded_at,updated_at) on public.agp_locations to authenticated;
-- grant update (name,city,state,code,gs,ach,responded_at,updated_at)    on public.agp_locations to authenticated;
-- grant delete on public.agp_locations to authenticated;
--
-- commit;
-- ## END PHASE B #####################################################


-- =====================================================================
-- VERIFICATION QUERIES (run to capture live state for reconciliation)
-- =====================================================================
-- -- RLS policies on the agp_* tables (roles column shows who they apply to)
-- select tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies where tablename like 'agp_%' order by tablename, cmd;
-- -- Table-level privileges anon holds
-- select table_name, privilege_type from information_schema.role_table_grants
--   where grantee='anon' and table_name like 'agp_%' order by 1,2;
-- -- Column-level privileges anon holds (token should NOT appear after Phase A)
-- select table_name, column_name, privilege_type from information_schema.column_privileges
--   where grantee='anon' and table_name like 'agp_%' order by 1,3,2;
-- -- Every function anon may EXECUTE (after Phase B: ONLY the 5 form RPCs —
-- --   resolve_optin_token, resolve_optin_by_code, list_optin_aggregators,
-- --   submit_optin, submit_optin_by_code. NOT _apply_optin (internal, never
-- --   granted to anon) and NOT get_optin_token (authenticated only).)
-- select n.nspname, p.proname, p.prosecdef as sec_definer
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where has_function_privilege('anon', p.oid,'EXECUTE') and n.nspname='public' order by 2;
