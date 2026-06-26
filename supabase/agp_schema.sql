-- =====================================================================
-- Aggregator Launch Planner — Supabase schema (schema of record)
-- =====================================================================
-- These tables ALREADY EXIST in project yyhnnalsqzyghjqtfisy with RLS
-- enabled. This file documents the shape aggregator-planner.html reads/
-- writes (see the SUPABASE SYNC block in that file). Every JS state field
-- maps to a column below — no ALTER TABLE was required for the migration.
--
-- Cloud is the source of truth; localStorage[roadysAggregatorPlanner] is an
-- offline cache only. UI prefs (ui.tab, ui.currentAgg, ui.locSort,
-- ui.locFilter, ui.stepSort, collapsed stages) are NEVER synced.
--
-- Column <- JS state field mapping:
--   agp_aggregators: launch_target<-launchTarget, launch_actual<-launchActual,
--     contact_name<-contactName, contact_role<-contactRole,
--     discount_type<-discountType, discount_value<-discountValue,
--     discount_target<-discountTarget, sort_index<-(array order). date-ish
--     columns receive NULL when blank; markup is coerced to number-or-NULL.
--   agp_steps:    (aggregator_id, step_id) <- aggregator id + step key.
--   agp_optins:   discount_type/discount_value/retail_minus/cost_plus <-
--                 discountType/discountValue/retailMinus/costPlus.
--   agp_settings: key 'process_description' <- processDescription.
-- =====================================================================

begin;

create table if not exists public.agp_aggregators (
  id              text primary key,
  name            text default '',
  rail            text default '',
  status          text default 'not_started',
  launch_target   date,
  deadline        date,
  launch_actual   date,
  contact_name    text default '',
  contact_role    text default '',
  phone           text default '',
  email           text default '',
  location        text default '',
  carriers        text default '',
  markup          numeric,
  discount_type   text default '',
  discount_value  text default '',
  discount_target text default '',
  notes           text default '',
  sort_index      integer default 0,
  show_on_form    boolean default false,   -- opt-in portal: publish this aggregator to the truck-stop form
  bo_cost_plus    text default '',         -- Better-Of: per-unit Cost+ value (see agp_bo_dual_discount.sql)
  bo_retail_minus text default '',         -- Better-Of: per-unit Retail- value
  updated_at      timestamptz default now()
);

create table if not exists public.agp_steps (
  aggregator_id text not null,
  step_id       text not null,
  status        text default 'not_started',
  owner         text default '',
  target        date,
  done          date,
  notes         text default '',
  updated_at    timestamptz default now(),
  primary key (aggregator_id, step_id)
);

create table if not exists public.agp_locations (
  id         text primary key,
  name       text default '',
  city       text default '',
  state      text default '',
  code       text default '',
  gs         text default '',
  ach        text default '',   -- "Customer is setup for ACH"
  responded_at timestamptz,     -- opt-in portal: set when the stop submits the form (form-owned)
  optin_token  text,            -- opt-in portal: per-stop link token. agp_optin_portal.sql makes it
                                --   default gen_optin_token(), UNIQUE, NOT NULL, and column-locks it out
                                --   of anon/authenticated SELECT (Phase A2). Never read it from the client.
  updated_at timestamptz default now()
);

create table if not exists public.agp_optins (
  aggregator_id  text not null,
  location_id    text not null,
  status         text default 'Select',
  discount_type  text default '',
  discount_value text default '',
  retail_minus   text default '',
  cost_plus      text default '',
  notes          text default '',
  entered        boolean default false,   -- "Discount entered in Interstate"
  updated_at     timestamptz default now(),
  primary key (aggregator_id, location_id)
);

create table if not exists public.agp_descriptions (
  aggregator_id text primary key,
  body          text default '',
  updated_at    timestamptz default now()
);

create table if not exists public.agp_settings (
  key        text primary key,
  value      text default '',
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- TRUCK-STOP OPT-IN PORTAL — see supabase/agp_optin_portal.sql (AUTHORITATIVE)
-- ---------------------------------------------------------------------
-- On top of the columns above, the portal migration adds these functions:
--   * anon-EXECUTE (the five form RPCs): resolve_optin_token, resolve_optin_by_code,
--     list_optin_aggregators, submit_optin, submit_optin_by_code.
--   * get_optin_token: authenticated ONLY (planner copy-link).
--   * internal, NO anon/authenticated grant: _apply_optin (shared write helper both
--     submit_* entry points delegate to) and gen_optin_token (optin_token column default).
--   * Phase A2: agp_locations SELECT/INSERT/UPDATE re-granted PER COLUMN to EXCLUDE
--     optin_token, so anon/authenticated can neither read nor write the token.
--   * Phase B (after the planner adopts Supabase Auth): anon stripped of ALL agp_*
--     table grants and the permissive policies re-scoped to `authenticated`; only the
--     five form RPCs stay anon-executable.
--
-- WARNING: the grant do-block BELOW is the PRE-PORTAL baseline (full anon CRUD +
-- permissive `using(true)` policies). Re-running it AFTER the portal migration would
-- re-open optin_token to anon and undo Phase A2/B. Do NOT re-run it post-portal —
-- agp_optin_portal.sql is the source of truth for agp_* grants and policies.
-- ---------------------------------------------------------------------

-- RLS + grants (already applied in the project; shown for completeness).
-- The browser uses the anon key for every read/write.
do $$
declare t text;
begin
  foreach t in array array['agp_aggregators','agp_steps','agp_locations','agp_optins','agp_descriptions','agp_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete', t);
    execute format('create policy %I on public.%I for select using (true)', t||'_read', t);
    execute format('create policy %I on public.%I for insert with check (true)', t||'_insert', t);
    execute format('create policy %I on public.%I for update using (true) with check (true)', t||'_update', t);
    execute format('create policy %I on public.%I for delete using (true)', t||'_delete', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;

commit;

-- Verify:
-- select 'aggregators', count(*) from public.agp_aggregators
-- union all select 'steps', count(*) from public.agp_steps
-- union all select 'locations', count(*) from public.agp_locations
-- union all select 'optins', count(*) from public.agp_optins
-- union all select 'descriptions', count(*) from public.agp_descriptions
-- union all select 'settings', count(*) from public.agp_settings;
