-- 2026-05-27 — Rewards KPIs for May 2026
--
-- Source: rewards-by-truckstop-2026-05*.csv merged across 6 pagination
-- pages. Coverage: 143 of 368 MEMBERS. 8 CSV rows had no MEMBERS match
-- (mostly offboarding sites — listed in the runner output, not included below).
-- Re-import if you receive new pages; this upsert will overwrite.

-- Schema reminder: kpi_data(metric_key text, month text, value numeric,
--                            PRIMARY KEY (metric_key, month))

BEGIN;

INSERT INTO public.kpi_data (metric_key, month, value) VALUES
  ('Rewards Add Transactions',    '2026-05', 45038),
  ('Rewards Redeem Transactions', '2026-05', 4607),
  ('Rewards Gallons Captured',    '2026-05', 4227593.9),
  ('Issued Points (Add Dollars)', '2026-05', 46922.03),
  ('Redeemed Points',             '2026-05', 32049.73),
  ('Redemption Rate',             '2026-05', 0.6830)
ON CONFLICT (metric_key, month) DO UPDATE SET
  value = EXCLUDED.value;

COMMIT;

-- Verify:
--   SELECT metric_key, value
--     FROM public.kpi_data
--    WHERE month = '2026-05'
--      AND metric_key LIKE '%Reward%' OR metric_key IN
--          ('Issued Points (Add Dollars)','Redeemed Points','Redemption Rate')
--    ORDER BY metric_key;
