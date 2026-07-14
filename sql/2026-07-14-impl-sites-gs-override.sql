-- Add a per-site Growth Strategist override to impl_sites.
-- When gs_override is non-empty, it wins over the automatic state/stop-ID/name
-- derivation used by implGetSiteGS() in index.html / implementation.html.
-- impl_sites already has RLS enabled + grants to anon/authenticated
-- (see sql/2026-05-27 batch), so this is a plain column add.

BEGIN;

ALTER TABLE public.impl_sites
  ADD COLUMN IF NOT EXISTS gs_override text;

COMMIT;

-- Verification (run manually in the Supabase SQL editor after applying):
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'impl_sites'
-- order by ordinal_position;
