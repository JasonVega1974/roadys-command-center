-- 2026-06-04 — Rewards KPIs for April 2026
--
-- Source: rewards-by-truckstop-2026-04*.csv merged across 4 pagination
-- pages. Coverage: 141 of 368 MEMBERS. 6 CSV rows had no MEMBERS match
-- (mostly offboarding sites — listed in the runner output, not included below).
-- Re-import if you receive new pages; this upsert will overwrite.

-- Schema reminder: kpi_data(metric_key text, month text, value numeric,
--                            PRIMARY KEY (metric_key, month))

BEGIN;

INSERT INTO public.kpi_data (metric_key, month, value) VALUES
  ('Rewards Add Transactions',    '2026-04', 49851),
  ('Rewards Redeem Transactions', '2026-04', 4930),
  ('Rewards Gallons Captured',    '2026-04', 4692549.2),
  ('Issued Points (Add Dollars)', '2026-04', 52098.93),
  ('Redeemed Points',             '2026-04', 34374.65),
  ('Redemption Rate',             '2026-04', 0.6600)
ON CONFLICT (metric_key, month) DO UPDATE SET
  value = EXCLUDED.value;

COMMIT;

-- Verify:
--   SELECT metric_key, value
--     FROM public.kpi_data
--    WHERE month = '2026-04'
--      AND (metric_key LIKE '%Reward%' OR metric_key IN
--           ('Issued Points (Add Dollars)','Redeemed Points','Redemption Rate'))
--    ORDER BY metric_key;
