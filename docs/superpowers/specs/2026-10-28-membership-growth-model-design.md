# Membership Growth Model — design

**Date:** 2026-10-28
**Status:** approved, pending implementation plan
**Branch:** `feat/membership-growth-model` (off `main`)

Integrate the Membership Growth Model as a first-class Command Center tool at
`membership-growth-model/`, added to the index nav the way Bus Dev Potential
Gallons is. The starting point is a complete working v1
(`membership-growth-model.html`, from Claude chat). It is refactored and
extended here, not redesigned.

All five increments from `CC_PROMPT_MEMBERSHIP_GROWTH_MODEL.md` land in one pass.

---

## 1. Source data and what the investigation established

Five inputs were read and cross-checked. Everything below is verified, not assumed.

### 1.1 Verified correct in the v1

- **The history array is exactly right.** Extracted from
  `Historical member signups.xlsx` and checked row by row: 2019 19/4,
  2020 24/17, 2021 22/13/313, 2022 13/10/322, 2023 38/13/300,
  2024 52/41/311, 2025 25/35/296, 2026 32. PTP conversions (PTPC) and
  Change of Ownership (COO) are correctly excluded in every year.
  2025's 25 is 20 Roady's + 5 Roady's Lite; 2026's 32 is 30 + 2.
- **The billing aggregates tie out exactly**: 181 companies, 391 locations,
  $143,426.01/mo, $366.82/location — matching
  `company_membership_report_2026-10-28.csv` to the cent.
- **Derived attrition reproduces 9.7%**: lost / prior-year count for
  2023 (4.0%), 2024 (13.7%), 2025 (11.3%), averaged.

### 1.2 Base count is overstated by 5 → use 375

`location-list-2026-10-28.csv` has 380 rows with `status=active`, but five are
not member locations:

| Rows | Why excluded |
| --- | --- |
| 2 | Company `Roady's Corporate Office` — `Fuelman Payments`, `RCheck Payments`. Payment records, not locations. |
| 3 | Company `Demo Truck Stops` — `1234 Truck Stop Demo`, `3456 Truck Stop Demo`, `W.D. Truck Stop`. |

Real active = **375**. Independently, the billing CSV shows exactly **375
paying locations** (5 companies / 16 locations bill $0.00) — a corroborating
tie-out worth confirming with Interstate but not relied upon.

The v1 folded the 2 corporate rows into Truck Stop. Corrected group counts:

| Group | v1 | Corrected |
| --- | --- | --- |
| Truck Stop | 159 | **154** |
| Truck Stop-Service Center | 6 | 6 |
| C-Stores | 22 | 22 |
| PPO | 88 | 88 |
| Roady's Lite | 7 | 7 |
| Fuel Stops | 9 | 9 |
| PTP | 89 | 89 |
| **Total** | 380 | **375** |

Group taxonomy note: these are a hybrid of the CSV's `Group` and `Type`
columns. `PTP` (89) is the whole `Group=PTP` set regardless of type — 35 truck
stops, 24 service centers, 30 PPOs — so the `Truck Stop` row deliberately
excludes PTP truck stops. The refresh script encodes this mapping so it cannot
drift.

### 1.3 The v1's gallon baselines contradict the live BD engine

**Scope note.** The v1's BD tab was a per-prospect value-prop calculator. That
job belongs to the Bus Dev Potential Gallons tool and is **removed** from this
one (see §9). What survives is the need for *network-level* gallon production,
and for that this tool reads the live engine's baselines rather than keeping
its own copy — because the v1's copy is wrong.

The v1's `BD_BASE` is eight round placeholder values. The live
`busDevGallonsConfig.js` has empirically-derived ones, and they diverge hard:

| Profile / roadway | v1 `BD_BASE` | live `BDPG_CONFIG` |
| --- | --- | --- |
| Fuel stop / Any | 2,500 | **5,630** |
| Small / Backroad | 3,000 | **6,174** |
| Small / Highway | 5,000 | **2,338** |
| Small / Interstate | 7,500 | **8,400** |
| Medium / Highway | 7,500 | **5,250** |
| Medium / Interstate | 12,500 | **10,492** |
| Large / Highway | 10,000 | **15,307** |
| Large / Interstate | 15,000 | **23,565** |

Lane bands differ too (`1-2/3-5/6+` vs `any/1-4/1-3/4-6/7+`), and the v1 has
5 regions against the live engine's 8 — missing Northwest, Texas and Upper
Midwest entirely (`region_variance.json`). Reading the live engine is a
correctness fix, not a convenience.

### 1.4 The P&L overturns the v1's revenue model

The operating entity's `Income Statement, Sep 30 2026` covers Jan–Sep 2026 with
full line detail. Every income and COGS line was assigned to exactly one of the
model's four streams, and the four net figures reconcile **to the dollar**
against the statement's `Gross Profit` line — that figure is auth-gated, so it
lives in `mgm_pnl_actuals` and not here. The categorization is therefore
complete and non-overlapping.

Annualized (x12/9), per 375 members. The right-hand column is the **calibrated
driver** that ships in `membershipModelConfig.js`: a forward-looking planning
input, which is why it is committable. The statement's own realized per-stream
and total figures are auth-gated and are deliberately not reproduced here:

| Stream | v1 driver | v1 $/mem/yr | Calibrated driver |
| --- | --- | --- | --- |
| Dues — core | $367/mo | $4,404 | `duesPerLoc: 362`/mo (realized core dues, rounded to the dollar) |
| Dues — ancillary | — | — | `duesAncillaryPerMember: 119`/yr |
| Fuel | 55% x 8,000 gal x $0.03 | $1,584 | `settlementNetPerMember: -148`/yr + `fuelProgramMargin: 0`/gal |
| Vendor / program | 70% x $150/mo | $1,260 | `vendorPM: 110`/mo x 70% |
| Rewards | 50% x $45/mo | $270 | `rewardsPM: 29`/mo x 50% + `rewardsBreakagePerMember: 528`/yr |
| **Total** | | **$7,518** | **materially below the v1** — the realized total is auth-gated |

Four findings drive the redesign of this layer:

**(a) `Total Income` is not revenue.** It is ~95% gross pass-through:
`Settlement Income Fuelman`, `Settlement Income R-Check` and `Aggregator Income`
each have a near-identical COGS line. **The statement's `Gross Profit` line is
the revenue basis** (auth-gated; see `mgm_pnl_actuals`). Applying a multiple to
Total Income instead overstates the basis badly, which is why the tool shows
that line separately and labels it pass-through. The ratio between the two is
deliberately not stated anywhere in this repo: quoted beside the model's own
committed revenue total it would back-solve a gated figure.

**(b) Fuel settlement is a net loss.** The retained spread is marginally
positive on one card program and negative on the other two once write-offs are
counted, and nets **negative** across the nine months. (The per-program spreads
and the net dollars are P&L actuals — auth-gated; see `mgm_pnl_actuals`.) The
`$0.03/gal` assumption is unsupportable.

Critically, settlement dollars imply a per-member volume far below
the BD engine's 2,338–23,565 baselines, because settlement captures only
card-network transactions, not total site volume. **BD gallons and
settlement margin measure different quantities and must never be multiplied
together.** The fuel driver is therefore split:

- `settlementNetPerMember: -148` — the realized settlement economics, P&L-derived.
- `fuelProgramMargin: 0.00` — prospective per-gallon economics that the BD tool
  exists to sell, defaulting to **zero**. Any positive value is a forward
  assumption the user explicitly owns, labelled as such on screen, never a
  number the model asserts on the P&L's behalf.

**(c) Rewards is mostly breakage.** `Rewards Program Fee` is the smaller part
of rewards income and `Rewards-Expired Points` is about three-quarters of the
total. The committed drivers carry the two separately — `rewardsPM: 29`/mo at
50% participation, and `rewardsBreakagePerMember: 528`/yr — while the
statement's own line dollars stay auth-gated. Modelled as separate lines,
because breakage is a quality-of-earnings item a buyer discounts, not a growth
driver, and it must not ride inside a per-member fee that scales with member
count.

**(d) The valuation inputs are the biggest error.** The v1's `ebitdaMargin: 25%`
is far above the statement's reported net margin, which is a P&L actual and
stays auth-gated (see `mgm_pnl_actuals`). Opex consumes essentially all of gross
profit; payroll, consulting and the seasonal annual meeting are its largest
components. The model gets:

- revenue multiple applied to **gross profit**, with Total Income shown
  separately and explicitly labelled pass-through so nobody multiplies it;
- `ebitdaMargin` shipping **unset (0)** in the committed config, with the real
  margin loaded at runtime from `mgm_pnl_actuals` for a signed-in reader;
- an editable `ebitdaNormalization` add-back input defaulting to **0**, so any
  normalization argument is visible and attributable rather than baked in.

**That margin is a fully-loaded entity margin, and the tool must say so.** The
Income Statement is a single statement for the operating entity — nine
*monthly* columns (Sep→Jan) and one `Net Income` line, with **no segment
columns and no departmental breakout**. It therefore charges the membership line
with:

- **payroll, unallocated — the largest opex category, with no departmental split**
- corporate overhead that exists regardless of member count: the office lease,
  D&O/EPLI/Fiduciary insurance, bank charges, state taxes, subscriptions,
  consulting, the annual meeting
- costs serving *other* lines entirely: the aggregator/settlement business,
  which is near-zero-margin by design (§1.4(b)), and PTP truck stop marketing

So the reported margin is **the operating entity's whole-entity margin after all
corporate overhead, not the membership program's contribution margin**, which
would be materially higher. And a clean program figure is **not derivable from
this file** — payroll alone is the largest opex category and cannot be
allocated without headcount data the P&L does not contain. The tool must not
invent an allocation.

`valuation.marginBasis` and `valuation.marginBasisNote` carry this caveat in
config, and it renders in three places: beside the margin input on Profit &
Cash Flow, in the report's printed assumptions block, and in the PR body. A
reader who pulls the valuation out of this tool gets the caveat with it.

**Dues realization.** Recognized core dues run at **93.8%** of the $143,426/mo
billable aggregate. The model projects *realized* dues (`duesPerLoc: 362`), with
the billable rate and the realization ratio shown as cross-checks.

### 1.5 The $20,000/lost-member benchmark reconciles to nothing

Sheet 2 of the signups workbook values each lost member at $20,000/yr
(133 lost 2019–25 x $20,000 = $2.66M). Measured against the P&L it
**reconciles to no measure on the statement**: it sits well above realized gross
profit per member and well below gross Total Income per member, matching
neither, so it is most plausibly a planning or multi-year-value figure.

**Neither ratio is quoted here, and neither may be quoted anywhere in this
repo.** Both of those per-member figures are auth-gated, and the $20,000 is
committed — so a ratio stated beside it back-solves the gated figure by
division. (That is not hypothetical: it is how the one surviving disclosure in
this project was found, and `membershipModel.test.js` now carries a structural
test banning the shape.) The benchmark is kept as a **labelled cross-check** on
the reconciliation tile, sourced to the workbook, with the variance against
realized gross profit rendered on the Revenue per Member tab for a signed-in
reader and a standing note that its definition needs confirming. It never
overrides a driver.

---

### 1.6 The sales pipeline is live data this model was not using

`crm_leads` (auth-gated by `sql/2026-10-05-crm-leads-require-auth.sql`) already
holds the real pipeline, and its shape maps directly onto this model:

| Column | Feeds |
| --- | --- |
| `stage` | funnel counts across the nine `CRM_STAGES` (`CRM.html:1155`) |
| `locations` | **New Additions** — the model's unit is locations, not leads, and one lead can carry many (a single 2026 lead brought 18) |
| `est_gallons` | Fuel Gallon Production, inbound |
| `deal_value` | pipeline dues value |
| `owner` | Staffing & Capacity — actual load per rep (`CRM_OWNERS` = Robert Watson, Angel Long) |
| `source` | reconciles against the model's own source mix |
| `activity[]`, `follow_up` | cycle time, feeding Cost to Acquire |

`bd_value_profiles.final_gallons` joins per lead via `lead_id`, with one final
profile per lead enforced by a unique index — so modeled gallons are
unambiguous.

Win rate follows the convention `CRM.html` already sets: **Won / (Won + Lost)**,
with `Not Qualified` excluded because it never became a real opportunity.
`CRM_CLOSED_STAGES` are `Closed Won`, `Closed Lost`, `Not Qualified`.

Stage-to-close conversion rates are **not** in any source file. They ship as a
clearly-labelled unsourced default ladder, and whenever a session is available
the tab shows the **actual** historical win rate computed from `crm_leads`
beside the assumption, so the assumption can be corrected against reality
rather than trusted.

## 2. Public-repo disclosure boundary

`gh repo view` reports this repo **PUBLIC**, and `sql/2026-10-05-bd-value-profiles.sql`
states the reason plainly: *"The anon key is published in this repo's HTML on
GitHub Pages, so anon is granted nothing at all here."*

The §1.4 figures are the operating entity's income-statement summary.
Committing them to `membershipModelConfig.js` would publish them to an indexed
Pages site, permanently in git history. The boundary:

| Committed to the public repo | Supabase only, auth-gated |
| --- | --- |
| `duesPerLoc: 362`, `vendorPM: 110`, `rewardsPM: 29` | gross profit, net income, the net margin |
| participation rates, ramp, lag, attrition rates | payroll, consulting, annual-meeting opex |
| group counts (375), billing aggregates | per-stream settlement spreads |
| signup history (counts only, no member names) | the reconciliation tile's detail rows |

Forward-looking assumptions are ordinary planning inputs and ship in the
config. P&L actuals live in `mgm_pnl_actuals`, readable only with a session.
`membershipPnlActuals.local.js` is the dev fallback and is **gitignored**.

On the public deploy, unsigned, the reconciliation tile renders
"P&L actuals not loaded — sign in to reconcile" and the rest of the tool works
normally. Nothing in the committed config reveals a financial statement line.

---

## 3. File structure

```
membership-growth-model/index.html     the tool (ported from v1, not redesigned)
membershipModelConfig.js               root, UMD -> MGM_CONFIG   (data + defaults)
membershipModel.js                     root, UMD -> MembershipModel (pure engine)
membershipModel.test.js                node:test, matching busDevGallonsCalculator.test.js
tools/refresh-membership-config.py     CSVs -> regenerates config between sentinels
sql/2026-10-28-mgm-scenarios.sql       mgm_scenarios + mgm_pnl_actuals
membershipPnlActuals.local.js          gitignored dev fallback for P&L actuals
```

The engine leaves the HTML because the repo already does exactly this
(`busDevGallonsCalculator.js` + `.test.js`), and because the v1's engine needs
real changes it cannot be tested through otherwise:

- `const start = roadys + (y===CURRENT_YEAR?0:0)` — dead expression, removed.
- `const mo = (r.year===CURRENT_YEAR?2:12)` in `revenueModel` — computed, never
  read; `months` is unconditionally 12. Removed.
- `activationLag: 2` — a field that nothing reads. **Wired for real.**

No new runtime dependencies. Chart.js and the Supabase SDK stay on the same
CDNs the BDPG page uses.

---

## 4. The engine (`membershipModel.js`)

One **monthly** roll-forward, Nov 2026 → Dec 2029, with annual rows derived by
summing months — so the collapsible monthly table and the annual table cannot
disagree. Exported API:

```js
MembershipModel.runModel(state)        -> {months, years, startTotal, ptp}
MembershipModel.revenueModel(state, M) -> per-year stream breakdown
MembershipModel.valuation(state, lastYearRevenue)
MembershipModel.derivedAttrition(history) -> {rows, avg, steady, structural}
MembershipModel.revPerMember(state, M)  -> reconciliation vs P&L + $20k benchmark
```

Per month: `adds` (annual growth applied at year boundaries),
`steadyLoss = roadys * steadyRate/12`, `structuralLoss` from a per-year override
spread evenly across that year's months. Adds enter a lag queue and only count
toward revenue-producing members after `activationLag` months.

PTP is held flat (`ptpNet: 0`) — see §9.

### 4.1 Attrition: steady + structural

`attritionSteady` defaults to **9.7%** with `structural = 0`, so nothing on
screen moves on day one. The Historical tab shows the decomposition against a
3.6% steady baseline (the 2022–23 pre-spike average) and a **Use split basis**
button that switches to it and opens the per-year structural inputs:

| Year | Total | Steady @3.6% | Structural residual |
| --- | --- | --- | --- |
| 2024 | 13.7% (41) | 3.6% (~11) | 10.1% (~30) |
| 2025 | 11.3% (35) | 3.6% (~11) | 7.7% (~24) |

The justification is in the workbook itself, col O, dated 9/15/25: *"per Angel
several of the current off boarding are due to ownership changes and being sold
to T/A, Pilot, etc."* — structural consolidation, not recurring churn.

Scenario presets: **Conservative** 9.7% blended · **Base** 4.0% · **Aggressive**
3.6%. Structural override stays independently editable in all three; it **adds
to** steady loss and never replaces it.

### 4.2 Revenue streams

Seven lines, each independently editable, each sourced on screen:

| Line | Default | Source |
| --- | --- | --- |
| `duesPerLoc` | 362 /mo | P&L realized core dues |
| `duesAncillaryPerMember` | 119 /yr | renewal + set-up + NTTS ad |
| `settlementNetPerMember` | -148 /yr | P&L settlement net |
| `fuelProgramMargin` | 0.00 /gal | forward assumption, user-owned |
| `vendorPM` x `vendorPart` | 110 /mo x 70% | P&L program income net |
| `rewardsPM` x `rewardsPart` | 29 /mo x 50% | P&L rewards program fee |
| `rewardsBreakagePerMember` | 528 /yr | P&L expired points, flagged non-durable |

`avgGallons` keeps feeding `fuelProgramMargin` only, and the BD tab's
"Use in model" push still targets it.

### 4.3 Reconciliation tile (Revenue tab)

Three columns side by side: **derived from drivers**, **P&L actual**
(auth-gated), **$20,000 benchmark** — with variance against each and the
per-stream breakdown beneath. Shows the 93.8% dues realization ratio and
labels Total Income as pass-through. Unsigned, the P&L column reads
"sign in to reconcile" and the benchmark column still renders.

---

## 5. Universal editability

**Requirement: every data point, label and text block in this tool is editable
by the user, with no exceptions that require a code change.** Nothing is a
hardcoded literal in the HTML.

### 5.1 What becomes editable that was not

The v1 already binds numeric assumptions via `data-k` and the group/history
tables. Everything below is newly editable:

| Area | Editable as |
| --- | --- |
| `DATA_ASOF`, current year, projection horizon | date + number inputs |
| Group rows | add / rename / reorder / remove, not just edit counts |
| Billing aggregates (companies, locations, dues total) | number inputs |
| Onboarding / offboarding counts | number inputs |
| History years | add / remove rows, every cell editable |
| Monthly signup history 2010–2026 | editable grid, per cell |
| Stream labels ("Vendor / program", …) | text inputs |
| Source-mix rows (GS, referral, partner, inside) | add / rename / remove |
| Scenario names | text inputs |
| Valuation multiples, margin, normalization add-backs | number inputs |
| $20,000 benchmark and its label | number + text |
| P&L actuals (all stream + total figures) | number inputs, persisted to Supabase |
| Report letterhead: company, title, subtitle, footer, generated-by | text inputs |
| Report narrative / commentary per section | multi-line rich text boxes |
| Per-tab assumption notes | multi-line text boxes, printed with the report |
| Chart titles and axis labels | text inputs |
| Stage conversion ladder (9 stages) | number inputs, badged "assumption" |
| Pipeline basis toggle (flat rate vs pipeline) | select |
| Per-program participation % and ramp | number inputs |
| Group → engine profile mapping | selects, badged when edited |
| Per-group gallon baseline overrides | number inputs, badged |
| Acquisition cost, cost to serve, sales spend | number inputs |
| Reps, capacity per rep, cost per rep | add / rename / remove rows |
| Working capital days, capex | number inputs |

### 5.2 Mechanism

One binding convention extends the v1's `bindInputs()`:

- `data-k="path.to.field"` — scalar bind (number, text, date, select), already
  present, generalized to resolve dotted paths so nested state works.
- `data-k-list="history"` with `data-row-tpl` — repeating rows that support
  add / remove / reorder, used for groups, history, monthly cells, source mix
  and scenarios.
- `data-k-text="report.intro"` — multi-line prose, stored as plain text and
  rendered through a `textContent` sink, never `innerHTML`. Prose is
  user-authored and goes into the printed report, so it is escaped on render;
  that keeps a pasted `<script>` or a stray `<` from breaking the letterhead.

All of it writes to the same single `S` state object the v1 already persists, so
editability, localStorage, scenario save/load, Supabase sync, JSON export and
JSON import all come free — one state tree, one serialization path.

**Labels live in state, not markup.** Every default label moves into
`MGM_CONFIG.labels`, so renaming a stream or a group is a state edit.

### 5.3 Edit mode, so the page is not a sea of inputs

A header **Edit** toggle flips the page between read and edit presentation.
Read mode renders values as text; edit mode swaps in the bound controls and
reveals the add/remove/reorder affordances. The toggle is view-only state — it
is not persisted into a scenario and never affects the model. Print always
renders read mode regardless of the toggle.

### 5.4 Reset and provenance

Every section gets a **Reset to default** action restoring that section from
`MGM_CONFIG`, plus a global reset. Any field whose value differs from its
config default shows an "edited" marker, so a reader can tell a hand-typed
number from a sourced one — the same instinct behind the BDPG tool's
`region_pct_stamp` / `baseline_stamp`.

### 5.5 The one real tension: editable engine-sourced figures

Universal editability collides with §6's single-source-of-truth rule. The
gallon baselines, the group → profile mapping and the region percentages all
derive from the live BD engine; making them freely editable would let this page
quietly disagree with the customer-facing BD tool again — the exact bug §1.3
fixes. The same applies to any figure loaded from `crm_leads` or
`mgm_pnl_actuals`: an edited copy of live data must never look like the live
data.

Resolution: they are editable **as explicit, session-scoped overrides**. An
override is clearly badged "overridden — differs from BD engine", shows the
engine's value beside the typed one, is included in exports and the printed
report so a reader always sees that a figure was overridden, and is cleared by
a one-click revert. Overrides are **never written back** to
`busDevGallonsConfig.js` or `region_variance.json`, and a scenario carrying
overrides says so on load. The user can override anything; the tool can never
hide that they did.

---

## 6. Fuel Gallon Production (replaces the v1's BD tab)

**The per-prospect value-prop calculator is deleted.** `BD_BASE`, `BD_REGIONS`,
`bdRow()`, `tpPct()`, the pricing-posture control, the inside-sales and DEF
opportunity layers, and the "Business Development use only" panel all go. That
work belongs to `bus-dev-potential-gallons/` and stays there; duplicating it
here is what let the two tools disagree in the first place.

What replaces it is a **network-level** gallon production tab with three
components:

1. **Existing network.** Each group's location count × a per-group gallon
   baseline derived from the live engine's `BASELINE_TABLE`, so the figure
   moves when the engine's empirical baselines are re-derived.
2. **Pipeline inbound.** `SUM(crm_leads.est_gallons)` over open stages, plus
   `SUM(bd_value_profiles.final_gallons)` where a modeled profile exists —
   the modeled figure takes precedence over the hand-entered estimate for any
   lead that has one.
3. **Per-member average**, which is what feeds `revenue.avgGallons`.

The page loads the engine the same way the BDPG page does, one directory deep:

```html
<script src="../busDevGallonsConfig.js"></script>
<script src="../busDevGallonsCalculator.js"></script>
```

and fetches `../region_variance.json` through a cache-busting helper keyed to
`BDPG_CONFIG.DATA_ASOF`, mirroring `BDPG.dataUrl()`. Region variance is applied
as an optional network-weighted adjustment, using all **8** regions via
`resolveRegion()`; it is never applied per prospect.

Mapping group → engine profile is a judgement this tool must make explicit,
because the group taxonomy (§1.2) and the engine's profile taxonomy are
different vocabularies. The default mapping is editable and shown on screen:

| Group | Engine profile / roadway | Baseline |
| --- | --- | --- |
| Truck Stop | Medium truck stop / Interstate | 10,492 |
| Truck Stop-Service Center | Medium truck stop / Highway | 5,250 |
| C-Stores | Small truck stop / Highway | 2,338 |
| PPO | Fuel stop / Any | 5,630 |
| Roady's Lite | Small truck stop / Backroad | 6,174 |
| Fuel Stops | Fuel stop / Any | 5,630 |
| PTP | Small truck stop / Highway | 2,338 |

These assignments are **assumptions, not measurements** — the engine assigns a
profile from `dieselLanes` + `roadway` per location, which this tool does not
have per group. The tab says so inline, every row is editable, and any edited
row is badged per §5.5. A future refinement is to read `network-locations.json`
for real per-location profiles; out of scope here and noted as such.

The §1.4(b) caveat is restated on this tab, because it is the one place
somebody would be tempted to multiply the wrong two numbers:

> These are total site gallons. The P&L's fuel settlement covers card-network
> transactions only, a small fraction of site volume. Do not multiply these gallons by a
> settlement-derived margin.

Dynamic baseline from `bdpgStats.js` remains out of scope.

---

## 7. Supabase

Two tables, both mirroring `bd_value_profiles` exactly: RLS on,
`auth.uid() IS NOT NULL` policies, `GRANT ... TO authenticated`,
`REVOKE ALL ... FROM anon`, and a `search_path`-pinned touch trigger per
CLAUDE.md.

```sql
create table public.mgm_scenarios (
  id text primary key, name text not null,
  scope text not null default 'company' check (scope in ('company','user')),
  owner_email text, state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mgm_pnl_actuals (
  id text primary key,            -- e.g. '2026-09'
  period_label text not null, period_months integer not null,
  member_basis integer not null,
  streams jsonb not null default '{}'::jsonb,   -- per-stream net + per-member
  totals  jsonb not null default '{}'::jsonb,   -- gross profit, net income, opex
  source  text not null default '',
  updated_at timestamptz not null default now()
);
```

**The page is not hard-gated.** BDPG gates its whole boot behind login, but this
tool must stay printable and openable from the index tab, so it runs
anonymously on `localStorage` and sign-in is a **Sync scenarios** action
reusing `bdShowLoginGate`. Unauthenticated, cloud reads fail closed and the
local model keeps working.

Shared company scenarios are multi-writer, so saves use the optimistic
concurrency idiom CLAUDE.md documents for the travel vault: read the row,
compute the new state from that snapshot, write with
`.eq('updated_at', seen).select()`. `updated_at` is trigger-maintained, so it
is the version token. **An empty returned array means someone else saved
first — surface the conflict, never retry over them.**

No DELETE policy on either table; removal is an owner decision made in the SQL
editor.

---

## 8. Config, refresh script, nav

`MGM_CONFIG` carries group counts (375 basis), billing aggregates, the verified
annual history, the calibrated drivers from §1.4, all default **labels**
(§5.2), and the **full monthly signup history 2010–2026** extracted from the
workbook — Roady's + Roady's Lite only, PTPC and COO excluded.

Monthly adds are **lumpy from batch deals**, not seasonal: 2013-06 = 61,
2026-06 = 19 (one 18-location deal alone). The monthly chart carries that
caveat inline so the shape is never read as a seasonal curve.

`tools/refresh-membership-config.py` regenerates the data block between
`// ── MGM_DATA ──` / `// ── /MGM_DATA ──` sentinels, the pattern CLAUDE.md
documents for the other seeds. Filters: `status=active`, minus company
`Roady's Corporate Office`, company `Demo Truck Stops`, and `Test Company #*`.
**Aggregates only** — no member names, no per-location billing. It refuses to
write if the resulting total moves by more than a configurable threshold
without `--force`, so a malformed export cannot silently reset the model's base.
It rewrites only the data block, never the `labels` block, so a refresh cannot
clobber hand-edited wording.

Nav, in `index.html` under the existing **Membership** group beside PTP
Conversions, matching the BDPG entry's `↗` marker exactly (same inline
`style` on the marker span as `index.html:866`):

```html
<div class="ni" data-nav-id="membership-growth-model"
     onclick="window.open('membership-growth-model/','_blank')">
  <span class="ni-icon">📊</span>Membership Growth Model<span class="expand-icon"
    style="font-size:.7em;margin-left:auto;color:var(--accent)">↗</span>
</div>
```

The embedded 134KB base64 logo is replaced with `../assets/roadys-logo-cover.png`,
carrying the `onerror` fallback idiom from `gs-command-center.html:12923`.
That alone takes the page from 190KB to ~56KB.

---

## 9. Tab architecture — the ten "What to Include" items

The ten methodology items each get their own tab. The v1's six tabs are
absorbed rather than duplicated, so no content appears twice:

| # | Tab | Origin |
| --- | --- | --- |
| 1 | Starting Membership | was Foundation |
| 2 | New Additions | was Growth Model (part) |
| 3 | Member Losses | was Growth Model (part) |
| 4 | Sales Pipeline | **new** — `crm_leads` |
| 5 | Program Participation | **new** |
| 6 | Fuel Gallon Production | replaces the BD tab (§6) |
| 7 | Revenue per Member | was Revenue & Valuation (part) |
| 8 | Cost to Acquire & Serve | **new** |
| 9 | Staffing & Capacity | **new** |
| 10 | Profit & Cash Flow | was Revenue & Valuation (part) |
| 11 | Historical Data | kept — the source data feeding 2, 3 and 7 |
| 12 | Report | kept |

Twelve tabs exceed what fits on one row, but the v1's tab rail is already
`overflow-x:auto`, so this needs no new layout mechanism.

### 9.1 The five new model layers

Each is editable end to end like everything else (§5), and each states its
sourcing on screen. Where a figure is an unsourced assumption it says so
rather than borrowing authority from the verified numbers around it.

**Sales Pipeline** — funnel counts by stage, weighted expected locations
(`SUM(locations × stageWeight)`), pipeline dues value, and cycle time. Signed
in, it also shows the **actual** win rate from `crm_leads` as Won/(Won+Lost)
beside the assumed ladder. Its output — expected new locations per month —
feeds **New Additions**, replacing the flat `addsPerMonth` when the user opts
in; `addsPerMonth` stays as the fallback and the default, because the pipeline
is only visible to signed-in users and the model must still run without it.

**Program Participation** — per-program participation percentage and ramp for
fuel, vendor and rewards, with participating-member counts per year. This is
where `fuelPart`, `vendorPart` and `rewardsPart` move to; Revenue per Member
consumes them rather than owning them.

**Cost to Acquire & Serve** — acquisition cost per member (sales spend ÷ new
members) and cost to serve per member (opex ÷ members). Both default to **0**
with the P&L-derived figures loaded from `mgm_pnl_actuals` when signed in, per
§2. Payback period and LTV/CAC are derived, with LTV using the model's own
steady attrition rather than a separate assumption.

**Staffing & Capacity** — reps, leads per rep, and cost per rep against the
pipeline's actual per-owner load from `crm_leads.owner`. The headline output is
whether the modeled adds are achievable at the modeled headcount: the capacity
gap. Defaults to the two `CRM_OWNERS` with capacity left at 0 — an explicit
"unset", not a guess at how many leads a rep can carry.

**Profit & Cash Flow** — revenue (§4.2) less cost to serve and acquisition
cost, to EBITDA, with the §1.4(d) normalization add-backs, then a simple cash
bridge. The valuation panel (§5 of this spec's engine notes) lives here, since
valuation is the terminal output of the cash line.

### 9.2 What the new layers must not do

- **Never present an assumed conversion rate as sourced.** The stage ladder is
  invented; it carries an "assumption — confirm" marker and sits beside the
  derived actual whenever one is available.
- **Never let the pipeline silently change the projection.** Driving New
  Additions from the pipeline is opt-in, and the Growth tabs state which basis
  is live.
- **Never require a session to run.** Every pipeline-, P&L- and
  capacity-derived figure degrades to its editable default when unsigned, and
  says which it is using.

---

## 10. Flagged, not resolved

**PTP: 190 vs 89.** The workbook states PTP was 190 locations as of Jan 1 2024
(27 shops + 163 truck stops); the location list shows 89 active today. Either
~100 PTP locations left, or the list only covers those Roady's still services.
This is an Interstate question. The model holds PTP flat at `ptpNet: 0`, so it
does not propagate into any projection — but the Foundation tab shows the
discrepancy with a note rather than hiding it.

Also open, carried from the prompt file: per-group signup mix (needs Interstate),
confirmation of the $20,000 definition, and whether the email action should move
from `mailto:` to the Command Center's notification pathway.

---

## 11. Testing

`node --test membershipModel.test.js`, no new dependencies, matching the
existing `node:test` + UMD-require style.

- **Golden regression**: under legacy settings (steady 9.7%, structural 0, lag 0,
  v1 drivers) the refactored engine reproduces the v1's current output exactly.
  This is the guard that the extraction changed no numbers.
- `derivedAttrition()` reproduces 9.7% from the real history array.
- Monthly rows sum to the annual rows for every year.
- `activationLag` defers revenue-producing members by exactly N months.
- Structural override **adds to** steady loss, never replaces it.
- Scenario presets produce the three distinct documented rates.
- Revenue streams sum to the reported total; `revPerMember` reconciles to the
  P&L figure when actuals are supplied.
- `fuelProgramMargin: 0` default yields zero prospective fuel revenue.
- Config invariants: group counts sum to 375; source mix sums to 100.
- Editability: a dotted `data-k` path round-trips through state; adding and
  removing a group row keeps the total consistent; a reset restores the config
  default; prose with `<` and `&` survives a JSON export/import and renders
  escaped in the report.
- Refresh script: fixture CSVs with injected corporate/demo/test rows produce
  375 and the §1.2 group split; the threshold guard blocks a wild swing; the
  `labels` block is untouched.
- Pipeline: weighted expected locations sum `locations × stageWeight` over open
  stages only; closed stages contribute nothing; win rate is Won/(Won+Lost)
  with `Not Qualified` excluded; an empty lead set yields zeros, not NaN.
- Pipeline basis is opt-in: with it off, `runModel` output is byte-identical to
  the flat-`addsPerMonth` result.
- Gallon production: group counts × mapped baselines reproduce a hand-computed
  total; a per-group override changes only that group; `bd_value_profiles`
  modeled gallons take precedence over `crm_leads.est_gallons` for the same lead.
- Participation: moving `fuelPart` on the Participation tab changes Revenue per
  Member identically to editing it in place (one source, two views).
- Cost to Acquire: payback and LTV/CAC derive from the model's own steady
  attrition, and are null — not Infinity — when CAC is zero.
- Capacity: the gap is `modeled adds − (reps × capacity)`, and reports
  "capacity unset" rather than a false surplus when capacity is 0.
- Profit & Cash Flow: EBITDA equals revenue − cost to serve − acquisition cost
  + normalization, and the valuation panel consumes that same figure.

Manual browser checklist: six tabs, light/dark, edit-mode toggle, print
letterhead, CSV/JSON round-trip, email popup, scenario save/load/compare,
BD "Use in model" push, a badged BD override surviving export and print, and
the unsigned reconciliation tile degrading correctly.
