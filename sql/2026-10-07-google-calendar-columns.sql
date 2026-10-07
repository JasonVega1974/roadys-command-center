-- Google Calendar sync: per-record event ids, each stored with the account
-- that owns it.
--
-- The owner column is not redundant. A Google event id is only meaningful
-- inside the calendar holding it, so without knowing whose calendar that is,
-- a second user opening the same lead would issue a DELETE against an id in
-- somebody else's account.
--
-- No RLS or grant changes. Both tables already grant at the table level, and
-- a table-level grant covers columns added later. Note the two are NOT
-- granted alike: crm_scheduled_calls allows all four verbs to anon and
-- authenticated, while crm_leads allows only select/insert/update to
-- authenticated with anon revoked and no DELETE grant at all.
BEGIN;

ALTER TABLE public.crm_scheduled_calls
  ADD COLUMN IF NOT EXISTS google_event_id       text,
  ADD COLUMN IF NOT EXISTS google_calendar_email text,
  ADD COLUMN IF NOT EXISTS google_synced_at      timestamptz;

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS google_followup_event_id text,
  ADD COLUMN IF NOT EXISTS google_followup_email    text;

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema='public'
--    and ((table_name='crm_scheduled_calls' and column_name like 'google%')
--      or (table_name='crm_leads' and column_name like 'google%'))
--  order by table_name, column_name;
-- -- expect 5 rows, every one is_nullable = YES
