BEGIN;

-- Soft delete for crm_leads: CRM.html's Delete button previously ran a hard
-- DELETE with no recovery path. This adds a deleted_at marker instead —
-- existing RLS policies and anon/authenticated grants on crm_leads already
-- cover UPDATE, so no policy/grant changes are needed here.
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS crm_leads_deleted_at ON public.crm_leads (deleted_at);

COMMIT;

-- Verification (run manually in the Supabase SQL editor after applying):
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'crm_leads' and column_name = 'deleted_at';
--
-- To restore a lead deleted through the app before you notice:
-- update public.crm_leads set deleted_at = null where id = '<lead id>';
