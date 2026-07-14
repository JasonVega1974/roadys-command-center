-- 2026-06-24  Rewards network totals — June 2026 update
-- Source: rewards-annual-all-2026-20260624.csv (TOTAL / Network Total row).
-- 2026-01..2026-05 were unchanged vs the prior authoritative load; only June
-- moved from a partial month to a near-full month. Delta = Add USD - Redeem USD.
-- Schema: kpi_data(metric_key text, month text, value numeric, PK(metric_key,month)).

BEGIN;

INSERT INTO public.kpi_data (metric_key, month, value) VALUES
  ('Rewards Add Transactions', '2026-06', 35226),
  ('Rewards Redeem Transactions', '2026-06', 3787),
  ('Rewards Gallons Captured', '2026-06', 3362098),
  ('Issued Points (Add Dollars)', '2026-06', 38199.37),
  ('Rewards Multiplier Diff', '2026-06', 4578.39),
  ('Redeemed Points', '2026-06', 27023.68),
  ('Redemption Rate', '2026-06', 0.7074),
  ('Delta', '2026-06', 11175.69)
ON CONFLICT (metric_key, month) DO UPDATE SET value = EXCLUDED.value;

COMMIT;