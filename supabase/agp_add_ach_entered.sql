-- =====================================================================
-- Aggregator Launch Planner — add ACH + "entered in Interstate" columns
-- =====================================================================
-- RUN THIS in the Supabase SQL editor BEFORE/right after deploying the
-- planner build that adds the "ACH" and "Entered in Interstate" columns.
-- Until these columns exist, the planner will show "Cloud sync failed"
-- (the upsert sends fields the table doesn't have). Idempotent + safe.
--
--   agp_locations.ach  <- "Customer is setup for ACH" (YES/NO/N/A/
--                          FUEL ACH ONLY), per location (shared).
--   agp_optins.entered <- "Discount entered in Interstate" (True/False),
--                          per aggregator per location.
-- =====================================================================
begin;

alter table public.agp_locations add column if not exists ach text default '';
alter table public.agp_optins    add column if not exists entered boolean default false;

commit;

-- After running this, reload the planner (sync resumes). To pull the ACH
-- + entered values from the spreadsheet, use "↻ Reload from sheet" on the
-- Location Opt-In tab.
--
-- Verify:
-- select column_name, data_type from information_schema.columns
--   where table_name='agp_locations' and column_name='ach';
-- select column_name, data_type from information_schema.columns
--   where table_name='agp_optins' and column_name='entered';
