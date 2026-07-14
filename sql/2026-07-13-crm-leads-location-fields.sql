BEGIN;

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS city  text,
  ADD COLUMN IF NOT EXISTS zip   text,
  ADD COLUMN IF NOT EXISTS exit  text,
  ADD COLUMN IF NOT EXISTS lanes text;

COMMIT;

-- Verification (run manually in the Supabase SQL editor after applying):
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'crm_leads'
-- order by ordinal_position;
