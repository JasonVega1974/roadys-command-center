-- 2026-06-04 — Diagnostic: what's actually in kpi_data for rewards metrics
--
-- Run this in the Supabase SQL Editor to see exactly what the cloud has.
-- Compare against the expected values in the comment block at the bottom.
-- If a cell is wrong or missing, re-run 2026-06-04-kpi-rewards-authoritative.sql.

SELECT
  metric_key,
  month,
  value
FROM public.kpi_data
WHERE month BETWEEN '2025-01' AND '2026-06'
  AND metric_key IN (
    'Rewards Add Transactions',
    'Rewards Redeem Transactions',
    'Rewards Gallons Captured',
    'Issued Points (Add Dollars)',
    'Rewards Multiplier Diff',
    'Redeemed Points',
    'Redemption Rate',
    'Delta'
  )
ORDER BY metric_key, month;

-- Expected values (from Rewards (1).csv + Rewards.csv) — should match every row:
--
--                                            2025-01     2025-12     2026-04     2026-05     2026-06
-- Rewards Add Transactions                     56057       42847       50168       45427        6694
-- Rewards Redeem Transactions                   6859        5103        4949        4628         663
-- Rewards Gallons Captured                  5,655,460   4,158,955   4,728,023   4,263,187     627,784
-- Issued Points (Add Dollars)              $64,828.87  $47,575.57  $52,452.58  $47,276.68   $7,203.64
-- Rewards Multiplier Diff                   $8,274.27   $5,986.02   $5,172.35   $4,644.81     $925.80
-- Redeemed Points                          $50,880.14  $38,713.89  $34,519.32  $32,178.50   $4,555.41
-- Redemption Rate (decimal)                    0.7848      0.8137      0.6581      0.6806      0.6324
-- Delta                                    $13,948.73   $8,861.68  $17,933.26  $15,098.18   $2,648.23
--
-- Full grid is 18 months × 8 metrics = 144 rows expected.

-- ─── If counts are off, audit by metric ──────────────────────────────────
-- SELECT metric_key, COUNT(*) AS months
--   FROM public.kpi_data
--  WHERE month BETWEEN '2025-01' AND '2026-06'
--    AND metric_key IN (
--      'Rewards Add Transactions','Rewards Redeem Transactions',
--      'Rewards Gallons Captured','Issued Points (Add Dollars)',
--      'Rewards Multiplier Diff','Redeemed Points',
--      'Redemption Rate','Delta'
--    )
--  GROUP BY metric_key ORDER BY metric_key;
-- Expect each metric to have COUNT = 18 (Jan 2025 through Jun 2026).
