-- 2026-05-27 — Rewards KPIs for May 2026 (PARTIAL DATA)
--
-- Source: rewards-by-truckstop-2026-05.csv covered only 50 of ~368 stops
-- (alphabet range A–E, ending at 'Eco Travel Plaza'). Network aggregates
-- below are sums across only those 50 stops. Re-import with a complete
-- export when available; this upsert will overwrite the partial figures.

-- Schema reminder: kpi_data(metric_key text, month text, value numeric,
--                            PRIMARY KEY (metric_key, month))

BEGIN;

INSERT INTO public.kpi_data (metric_key, month, value) VALUES
  ('Rewards Add Transactions',    '2026-05', 11127),
  ('Rewards Redeem Transactions', '2026-05', 1208),
  ('Rewards Gallons Captured',    '2026-05', 1019000.5),
  ('Issued Points (Add Dollars)', '2026-05', 11265.84),
  ('Redeemed Points',             '2026-05', 8256.99),
  ('Redemption Rate',             '2026-05', 0.7330)
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
