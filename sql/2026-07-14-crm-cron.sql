-- Enable once (dashboard toggle or here):
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace <PROJECT_REF> and <CRON_SECRET> before running.
-- 1-hour reminders: every 15 minutes
select cron.schedule('crm-reminder-1h', '*/15 * * * *', $$
  select net.http_post(
    url    := 'https://<PROJECT_REF>.functions.supabase.co/crm-emails',
    headers:= jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body   := jsonb_build_object('action','reminder_1h')
  );
$$);

-- Start-of-day digest: 13:00 UTC (= 07:00 MDT / 06:00 MST — both owners are Mountain time)
select cron.schedule('crm-reminder-dod', '0 13 * * *', $$
  select net.http_post(
    url    := 'https://<PROJECT_REF>.functions.supabase.co/crm-emails',
    headers:= jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body   := jsonb_build_object('action','reminder_dod')
  );
$$);

-- Manage:
-- select * from cron.job;
-- select cron.unschedule('crm-reminder-1h');
