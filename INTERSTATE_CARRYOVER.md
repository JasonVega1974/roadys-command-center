# Interstate migration carryover — GS Performance Tracker UI

Handoff note for the follow-up PR in the Interstate V2 repo. This standalone redesign
was intentionally kept on seeds/localStorage; the items below are the surfaces that must
be re-fed from **live pre-release DB data** when the module lands under `/command-center`.

- **Three top cards** (Retention Rate · GS Network Average Score · Total Active Stops) —
  reproduce against `GET /api/gs/performance-tracker/summary`. Current + prev + YTD each.
- **Three category cards** (Fuel Average · Rewards · Vendor Programs) — the `green/meas · %`
  rollup (`gsrCatTotals`) maps to the summary endpoint's `categories` block. Category →
  section membership lives in `GSR_CATS` and must match the server's rollup exactly.
- **12-month standings grid** (GS · Jan–Dec · YTD · Retention) — maps to
  `GET /api/gs/performance-tracker/standings`. Jul–Dec `%` placeholders correspond to
  `null` months (no closed snapshot); keep the muted-`%` treatment, not `—`.
- **Retention seed replacement** — `RETENTION_BY_STOP` / `RETENTION_BY_STOP_PREV` are
  placeholder deterministic values. Replace with the live V2 retention KPI, feeding both
  the network Retention card and the per-GS Retention column. Both are tagged with a
  `// TODO: replace with Interstate live data` comment in `rankings.html`.
- **Extended snapshot shape** — `gsrSaveSnapshot` now stores per-section `{green,meas}`.
  This is the shape the nightly `gs_monthly_snapshots` job should write (overall + sections),
  so category history survives a metric-set change without recompute from raw data.
- **Master-mode overrides** — still `localStorage` (`GSR_OV_KEY`) here. In V2 these become
  RBAC-gated writes to `gs_metric_overrides` via the `SECURITY DEFINER` RPC pattern.
- **Grey metrics** — Fuelman, R-Check, Rewards Multipliers, Merchant Console remain
  `measurable:false`. Agent A must confirm each is queryable before flipping to measurable.
- **Vendor scoring** depends on `VP_ENROLL` (`roadys_vp_enroll`); in V2 this is the
  canonical Top 8 against `vendor_locations`. Do not re-enumerate the 8 vendor IDs.
- **Metric-set version** — `gsrCompute` already emits `metricSetVersion`; wire it to the
  `X-Metric-Set-Version` response header so the client can invalidate cached history.
- **Row ordering** — grid sorts by YTD desc, tiebreak current-month pct desc, then GS name.
  Mirror this server-side in the standings endpoint's `rows` ordering.
- **Category drill-down modals** (Fuel · Rewards · Vendor Programs) — 12-month per-GS grid opened by clicking a category card. In Interstate this becomes `GET /api/gs/performance-tracker/category-trend?cat=<fuel|rewards|vendor>&year=YYYY`, returning per-GS × per-month pct + per-GS YTD.
