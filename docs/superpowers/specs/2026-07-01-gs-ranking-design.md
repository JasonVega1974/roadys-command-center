# Growth Strategist Ranking — Design Spec

**Date:** 2026-07-01
**Target file:** `index.html` (Roady's Command Center) — new page, self-contained.
**Reference:** the existing Growth Strategist Metrics page (`pg-gs-metrics` / `renderGSMetrics`).

## 1. Purpose

A per-Growth-Strategist scorecard + cross-GS ranking. Each GS is scored on how many
of their truck stops are signed up to each program/metric. The headline number is a
**true average (proportion) of measurable yes/no cells**, and GSs are ranked by it,
highest first. Sourced from the same data gs-command-center uses (embedded into
index.html), structured so the future "interstate database" can repoint it.

## 2. Placement & navigation

- New page container `<div class="page" id="pg-gs-ranking">`.
- Nav entry **🏆 Growth Strategist Ranking**, a sibling of Growth Strategist Metrics,
  wired via `navDirect('gs-ranking', this, 'gsranking')`.
- New render fn `renderGSRanking()` dispatched from `renderPage()` (`else if(id==='gs-ranking') renderGSRanking();`)
  and added to the PAGES list (`{id:'gs-ranking', icon:'🏆', name:'Growth Strategist Ranking'}`).
- Visual style matches GS Metrics: `sec-hdr`, uppercase accent section labels, `.dt`
  tables, cards. Green = yes, red = no, grey = no-data.

## 3. Data layer (embedded seeds, mirrors gs-command-center)

All embedded as inline JS constants with regeneration sentinels (project convention),
generated from the same sources as gs-command-center so numbers reconcile.

- **`GS_TERRITORY`** — `{ gsName: { stops: [{id, name}] } }`, from the gallon report's
  Growth Strategist column. v1 GSs: Steph Leslie (55), Maria Coleman (41),
  Shannon Bumbalough (34), Logan Resinkin (33), Burt Newman (31), Stefanie Ritter (24).
- **`AGG_DISCOUNTS_BY_STOP`** — reuse the same per-stop aggregator seed as gs-command-center
  (aggregator name → stop signed up). Drives Legacy + New Aggregator metrics.
- **Fuel seed** (`FUEL_JUN_2026_DATA` etc.) — `fl` (fleet gallons) drives the Fleets metric.
- **Rewards seed** (`REWARDS_2026_06_SEED` etc.) — a stop with rewards `g>0` that month = Rewards yes.
- **Vendor enrollment** — vp_enroll / roster status drives Vendor Programs (top-8).
- **Per-stop accepts** — Fuelman / R-Check flags (embedded from gs-command-center's
  per-stop accepts data). A stop with no flag = red (not accepting), a real measurable "no".

## 4. Metric set (v1) — measurable vs no-data

A metric is **measurable** when we have a source that authoritatively says in/out for
every stop (absence in the source = red). A metric is **no-data (grey)** when we have no
source at all; grey cells are excluded from every denominator.

### Sections & rows

| Section | Rows (canonical) | Measurable | No-data (grey) |
|---|---|---|---|
| Legacy Aggregators | RTS, QPN, TCS, Edge, TATS, OOIDA, TSD, RXO, OTP Capital, Prime Inc. Advantage + | RTS, QPN, TCS, OOIDA, TSD, Prime Inc. Advantage + | Edge, TATS, RXO, OTP Capital |
| New Aggregators | Motive, Haul Pay, Green Lane, Load Connex, TOA, Cloud Trucks, AtoB, Onramp, Octane | Motive, Green Lane, Load Connex, AtoB | Haul Pay, TOA, Cloud Trucks, Onramp, Octane |
| Fleets | Fleets | Fleets | — |
| Fuelman | Fuelman | Fuelman | — |
| R-Check | R-Check | R-Check | — |
| Rewards | Rewards | Rewards | — |
| Rewards Multipliers | Rewards Multipliers | — | Rewards Multipliers |
| Merchant Console | Merchant Console (users registered) | — | Merchant Console |
| Vendor Programs | Sysco, Truck Parking Club, Coke, Cintas, Farmer Bros Coffee, Heartland, DAS, Lynco, Entegra | all 9 (from vendor enrollment) | — |
| Retention Rate | Retention Rate | — | Retention Rate |

**Aggregator name mapping** (data → canonical): `RTS Carrier Services`→RTS,
`OOIDA`→OOIDA (Excel "OIDA"), `TSD Logistics`→TSD, `Prime Inc. Advantage +`→"Prime Inc. Advantage +"
(Excel "Prime Advantage"), `Greenlane`→Green Lane, `Load Connex`→Load Connex, plus QPN, TCS, Motive, AtoB direct.

## 5. Scoring engine — `computeGSScorecard(gsName, month)`

For the GS's stops × the **measurable** metric rows, each cell is `1` (green) if that stop
has the metric that month, else `0` (red). No-data rows are omitted from all math.

- **Cell** — green(1) / red(0), measurable only.
- **Sub-row "x of xx · %"** — for a measurable metric row: `x` = green stops, `xx` = GS stop
  count, `%` = x/xx.
- **Section score** — green cells in the section ÷ measurable cells in the section, as %.
- **Overall GS score (the ranking number)** — `Σ green cells ÷ Σ measurable cells`, as %.
  This is the mean of all 1/0 measurable cells. Denominator = (# measurable rows) × (# stops).
  Example: 12 stops × (measurable rows), 41 green of 72 measurable = 57%.
- **Rank** — GSs sorted by overall score, descending.
- **NOT** programs-per-stop, **NOT** average-of-section-averages. A plain mean of the cells.

Grey/no-data cells (Edge, TATS, RXO, OTP Capital, Haul Pay, TOA, Cloud Trucks, Onramp,
Octane, Rewards Multipliers, Merchant Console, Retention Rate) are **never** in any
denominator. Because the grey set is identical for every GS, scores stay comparable.

## 6. Views (visibility — no auth yet)

- **GS view** — a GS-selector dropdown. Shows that GS's scorecard: each section with its
  rows (count · % · section average), green/red, and section subtotal. An **expand arrow
  per truck stop** reveals that stop's per-metric green/red checklist (scales past 55
  stops without a giant matrix). The Excel's metrics×stops grid is preserved conceptually
  and reachable via the per-stop expansion.
- **Leadership "All" view** — a ranking table of every GS by overall score: **this month,
  previous month, YTD average**, each row expandable into that GS's scorecard.
- No real access control in v1 (there is no login). The selector is the boundary; true
  per-GS gating arrives with future auth.

## 7. Monthly snapshots

- A month picker selects the scored month (reuse the page's month control).
- On compute, persist a snapshot to `localStorage` (shape ready for Supabase later):
  `{ month, gs, overallScore, sectionScores, greenCount, measurableCount, retention, metricSetVersion }`.
- Prev-month score = the prior month's snapshot; YTD average = mean of this year's monthly
  snapshots. These accumulate going forward; the first run shows the current month only.
- **`metricSetVersion`** tags each snapshot with the measurable-metric set used (e.g.
  `gsr-v1`). When the interstate DB backfills currently-grey metrics, the set becomes `gsr-v2`;
  cross-version comparisons are flagged so prev-month/YTD stay valid (don't compare a v1
  average against a v2 average silently).

## 8. Out of scope (v1)

- Real authentication / per-GS access control (selector stands in).
- Live interstate-DB wiring (embedded seeds stand in; structure supports repointing).
- Backfilling the grey metrics (Rewards Multipliers, Merchant Console, Retention Rate,
  and the unmatched aggregators) — they render grey until a source exists.

## 9. Success criteria

- New 🏆 page renders, styled like GS Metrics, with a working GS selector + leadership view.
- Each GS's overall score = green ÷ measurable cells (%), grey excluded; ranking sorts descending.
- Section and per-metric "x of xx · %" use the same grey-excluded denominators.
- Per-stop expansion shows correct green/red per metric.
- A monthly snapshot is saved and drives prev-month + YTD once ≥2 months exist.
- Numbers reconcile with gs-command-center for the same stops/metrics.
