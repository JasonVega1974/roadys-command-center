# Bus Dev Potential Gallons (Design Spec)

**Date:** 2026-09-22 (revised twice same day — first review, then rename +
host-file correction + pricing-strategy adjustment)
**File(s):** `index.html` (new nav item + page), `busDevGallonsConfig.js`,
`busDevGallonsCalculator.js`, `busDevGallonsCalculator.test.js`,
`region_variance.json`, `network-context.json`
**Author:** Jason Vega + Claude
**Status:** Approved design — pending spec self-review (below), then
implementation plan (`writing-plans`).

---

## 1. Goal

A tool the Development team runs live with a prospective truck stop to
produce: the official Estimated Monthly Network Gallons (per Roady's
calculator PDF, implemented exactly), a pricing-strategy-adjusted final
potential-gallons figure, where the location fits in the network, a
recommended membership with breakeven math, and a written analysis
exportable as a leave-behind.

**Tool name:** "Bus Dev Potential Gallons". **Slug:** `bus-dev-potential-gallons`.

**Scope: standalone only** means no Interstate code, API, or database
dependency — **not** an unlinked page. **Delivery surface (corrected in this
revision):** a new section under the existing **Business Dev** nav group in
`index.html`'s sidebar (the file titled "Roady's Network Command Center" —
verified this is what "Command Center" refers to in the live site's
breadcrumb, `Command Center ▸ Tools ▸ Business Dev`, **not**
`gs-command-center.html`, a different file with no Business Dev tab of its
own). Concretely: a new `.ni` nav item nested under the `Business Dev`
`nav-children` group (alongside the existing "📞 Business Development CRM"
item, which opens `CRM.html`), rendering **inline** into a new
`<div class="page" id="pg-bus-dev-potential-gallons">` via `index.html`'s
existing `nav(id, el)` / `renderPage(id)` mechanism — never `window.open()`,
which is how sibling Tools items like "GS Command Center" and "Value Props"
open separate files instead.

The calculator engine (`busDevGallonsConfig.js` / `busDevGallonsCalculator.js`
/ tests) stays in separate files so it's real Node-testable pure functions —
the one deliberate deviation from "everything inline," confined to the
engine, not the page UI.

**Source of truth:** `Roadys_Prospective_Member_Gallons_Calculator.pdf` (2
pages, read in full — matches the user-supplied baseline table, region list,
adjustment tables and formula exactly, verbatim). The PDF and
`location-list-2026-09-21.csv` live at the repo root **gitignored** — internal
data, never committed, this is a public GitHub Pages repo.

---

## 2. Current state (verified)

- **`index.html`'s "Tools ▸ Business Dev" nav group** (line ~854-858): a
  `nav-lbl` labeled "Tools", under which `<div class="nav-parent"
  data-nav-grp-toggle="bizdev">Business Dev</div>` toggles a
  `<div class="nav-children" data-nav-grp-children="bizdev">` currently
  holding exactly one `.ni` item: `Business Development CRM` →
  `location.href='CRM.html'`. The new tool's nav item is added as a second
  child of this same `nav-children` block.
- **Page/nav mechanism, verified exactly:** `nav(id, el)` (line ~2862)
  removes `.active` from all `.ni`/`.nav-parent`/`.page`, adds `.active` to
  `#pg-<id>` and the clicked `.ni`, auto-expands the parent `nav-children`
  group, sets `#ptitle` from the `TITLES` object (line ~2861, a flat
  `{id: 'Display Title', ...}` map), then calls `renderPage(id)`.
  `renderPage(id)` (line ~3064) is an `if/else if` dispatch — the new page
  adds one more branch calling a new render function. **Not** every page
  needs a render call (some are static markup), but this one does since its
  content is fully JS-templated.
- Existing "Business Dev"-adjacent page: `kpi-bizdev` → `pgBizDev()` is a
  **different, unrelated** existing KPI page (New Members / Additional
  Revenue metrics). Not touched, no id collision (`bus-dev-potential-gallons`
  vs `kpi-bizdev`).
- `index.html` already defines a `REGIONS` constant (line ~2697) — same
  GS-territory concept as `gs-command-center.html`'s, **not** the
  calculator's geographic-variance region map, and partitions the US
  differently (e.g. its "Northeast" includes IL/VA/WV). The new region map is
  named `BDPG_REGION_MAP`, never `REGIONS`, to avoid any confusion.
- **CSS conventions in `index.html`, verified (different from
  `gs-command-center.html`'s):** `.page` (top-level container), `.sec-hdr` /
  `.sec-title` (section header, optionally with a `.badge`), `.fg` (label +
  input form group), `.eg` (dynamic form-field grid), `.btn` / `.btn-accent`
  (buttons), `.tw` / `.dt` (table wrapper / data table). There is **no
  `.card` class** in this file (unlike `gs-command-center.html`) — grouping
  within a page is done with `.sec-hdr` headers and plain styled `<div>`s.
  New feature-specific classes are prefixed `.bdpg-`. Palette:
  `--accent:#00C8FF`, `--green`, `--red`, `--yellow`, `--orange` (already
  defined, reused directly).
- **Repo convention:** no page in this repo currently loads a local `.js`
  file — everything lives inline in one `<script>` block per page, to keep
  the single-file-deploy model. **This spec deviates from that for the
  engine only** (`busDevGallonsConfig.js` / `busDevGallonsCalculator.js`),
  per the user's explicit ask for real `node --test`-able pure functions.
  Loaded via plain classic `<script src>` tags (no ES modules) added to
  `index.html`'s `<head>`, right after its existing CDN `<script src>` tags
  (Chart.js, xlsx, d3-array, d3-geo, topojson-client, Supabase — verified,
  line ~10-15) — the first local-file `<script src>` tags in the repo.
- CSV verified: 421 rows, 403 `Status=active`. Real `Type` values are `Truck
  Stop`, `PPO`, `Fuel Stop`, `Service Center`, `C-Store`, `Truck Stop /
  Service Center` — **no size (Small/Medium/Large) or lane-count field
  exists in this export**, so "network context by type" uses the CSV's own
  type categories, not the calculator's Location Profile categories. There
  is also no Highway/Interstate/Backroad field — `Exit / Highway` is free
  text and is not parsed.
- 4 rows have `Company`/`Name` containing "demo" (2 with `State=-1`, obvious
  placeholder data) — excluded from aggregation by a case-insensitive
  substring filter. After that exclusion + `Status=active`, all 400
  remaining rows resolve cleanly to one of the 5 regions (verified — zero
  unmapped states): Midwest 131, Southeast 123, West 78, Southwest 49,
  Northeast 19.

---

## 3. Decisions made during design

| Decision | Choice | Why |
|---|---|---|
| Tool name / slug | "Bus Dev Potential Gallons" / `bus-dev-potential-gallons` | User-specified rename |
| File names | `busDevGallonsConfig.js`, `busDevGallonsCalculator.js`, `busDevGallonsCalculator.test.js` | User-specified rename |
| Namespace | `window.BDPG`, region map `BDPG_REGION_MAP` | User-specified rename; avoids collision with `REGIONS` in both `index.html` and `gs-command-center.html` |
| Delivery surface | New `.ni` item under `index.html`'s existing Business Dev `nav-children`, rendering inline via `nav()`/`renderPage()` into `#pg-bus-dev-potential-gallons` | User corrected the host file after the first two rounds of design targeted the wrong file (`gs-command-center.html`, which has no Business Dev tab) — confirmed against the live site's breadcrumb |
| Engine as separate `.js` files | Yes, deviating from single-file convention for the engine only | User explicitly asked for real `node --test`-able pure functions; the page UI itself stays inline like every other `index.html` page |
| Styling | Reuses `index.html`'s existing `.page`/`.sec-hdr`/`.btn`/palette classes directly (verified defined, different set than `gs-command-center.html`'s) | It's now literally in the same stylesheet — no parallel palette to maintain |
| Border states (MD, DE → Northeast; WV → Southeast; OK → Southwest; CO → West) | User's original mapping, confirmed | PDF map art has no state gridlines to pixel-verify against; user confirmed explicitly |
| Region % storage | Committed `region_variance.json` is the default; admin panel writes a `localStorage` override on top, with a "differs from committed file" notice | User confirmed |
| `network-context.json` regeneration | In-page client-side generator (drop CSV in, parsed in-browser, resulting JSON shown to copy) | User confirmed |
| Region-variance CSV helper column mapping | Self-mapping UI: reads the uploaded file's header row, shows "Which column is State? / Which column is Gallons?" dropdowns, pre-selected by best-guess, user confirms | Never having seen a real Interstate export, guessing exact header names would be fragile |
| Demo rows | Excluded via `Company`/`Name` containing "demo" (case-insensitive) | 4 rows are clearly placeholder/test data |
| Lane-count mismatch (calculator open item 1) | Optional "Actual diesel lanes observed" field under Supporting Details; non-blocking inline note if it falls outside the selected row's range | Informational sanity check without ever touching the official number |
| Medium/Large + Backroad (calculator open item 2) | Confirmed unselectable | PDF defines exactly 8 rows; no such row exists |
| Membership costs / value-per-gallon | Placeholder constants (zeroed, clearly marked); a distinct "not configured" state everywhere they're unset (§9) | User will fill in real numbers; until then the UI must never show broken math |
| Network Fit Grade range-position | Scored within the prospect's own Location Profile baseline range (widened by fixed Amenities+Review bounds), not the full 2,500–15,000 network range | User corrected — the network-wide range capped every Fuel stop/Small truck stop near D/E |
| **4th adjustment: Pricing Strategy** | New config-driven dropdown, additive with the other three, feeds a **second, final** number distinct from the PDF's official subtotal | User added this in the 3rd round — see §5A |
| **Two distinct numbers** | Engine returns `officialSubtotal` (PDF formula, 3 factors) and `finalGallons` (4 factors, includes Pricing) as separate, never-conflated fields | User explicit: "Never conflate them" |
| Network Fit Grade basis | `officialSubtotal` (the network-calibrated, PDF-exact number) | Pricing posture is a sales lever chosen for this specific negotiation, not an inherent characteristic of the location — grading against a number that moves with negotiating posture would make the Grade mean something different for the same physical location depending on how aggressively a rep chooses to discount |
| Membership Fit basis | `finalGallons` (post-pricing) | Breakeven math should reflect the volume actually expected to flow under the pricing posture being proposed to this prospect, not a hypothetical at 0% pricing |
| Condition-adjusted view basis | `finalGallons` (post-pricing) | It's explicitly the last, most "real-world" non-official adjustment layered on top of everything else, including pricing |

---

## 4. File structure

```
index.html                    MODIFIED. New .ni nav item nested under the
                               Business Dev nav-children group (next to
                               "Business Development CRM"). New
                               <div class="page" id="pg-bus-dev-potential-gallons">
                               shell. New TITLES['bus-dev-potential-gallons']
                               entry. New renderPage() branch calling
                               renderBusDevGallons(). Two new <script src>
                               tags in <head> (after the existing CDN tags)
                               loading the two files below. All page
                               UI/state/logic added as one new inline
                               <script> block, under window.BDPG.

busDevGallonsConfig.js        Pure data, no logic:
                                 BASELINE_TABLE        (8 rows, Step 1)
                                 BDPG_REGION_MAP        (5 regions -> states)
                                 AMENITY_ADJUST         (-5% / 0% / +2%)
                                 REVIEW_BANDS           (rating bands -> %)
                                 PRICING_ADJUST         (NEW, 5 bands -> %)
                                 AMENITY_DETAIL_OPTIONS (suggestion thresholds)
                                 NETWORK_FIT_SIGNAL_*   (grade rubric)
                                 CONDITION_ADJUST       (+10% / 0% / -10%, non-official)
                                 MEMBERSHIP_CONFIG      (costs + value-per-gallon,
                                                          placeholders, all 0 = "not
                                                          configured", clearly marked)

busDevGallonsCalculator.js    Pure functions over that config. UMD-style export.
                               calculateEstimate() now returns BOTH
                               officialSubtotal and finalGallons (§5A) — never
                               conflated, per two separate named fields.

busDevGallonsCalculator.test.js  node:test + assert (Node 26 — zero deps).
                               Run via: node --test busDevGallonsCalculator.test.js

region_variance.json          Committed. Unchanged from prior revision:
                               {west, southwest, midwest, northeast, southeast, asOf}.

network-context.json          Committed. Unchanged from prior revision — real
                               aggregated data from location-list-2026-09-21.csv.
```

---

## 5. The official calculator (unchanged from prior revisions)

Implemented exactly as the PDF states, no deviations:

- **Step 1 — baseline.** Cascading selects: Location Profile -> only its
  valid Roadway options -> Fuel Lanes auto-filled and locked. Invalid
  combinations (e.g. Medium/Large + Backroad) are structurally impossible to
  select.
- **Step 2 — adjustments**, additive not compounded:
  `Official Subtotal = Baseline × (1 + Region% + Amenities% + Review%)`,
  rounded to the nearest whole gallon.
  - Region%: from the effective `region_variance.json` value for the
    state's `BDPG_REGION_MAP` region.
  - Amenities%: from the rep's **confirmed** amenity level.
  - Review%: Trucker Path rating, 1.0–5.0 one-decimal. Below 3.0 → −5%;
    3.0–3.5 → 0%; 3.6+ → +2%. Empty/no rating → 0% + a narrative flag.

This subtotal is labeled **"Official calculator"** everywhere it's shown —
it is the number that traces exactly to the printed PDF, unaffected by the
new Pricing Strategy adjustment (§5A).

---

## 5A. Fourth adjustment — Pricing Strategy (new in this revision)

A dropdown, **"Discount / pricing posture"**, config-driven in
`PRICING_ADJUST`:

| Posture | Adjustment |
|---|---|
| Most aggressive (deepest discounts) | +5.0% |
| Aggressive | +2.5% |
| Standard / moderate (**default**) | 0.0% |
| Light discounting | −2.5% |
| No discounts | −5.0% |

Additive, same mechanism as the other three factors:

```
Final Potential Gallons = Baseline × (1 + Region% + Amenities% + Review% + Pricing%)
```

**Both numbers are always computed and never conflated:**

- `officialSubtotal` = `Baseline × (1 + Region% + Amenities% + Review%)` —
  exactly what §5 computes, exactly what the PDF computes, unaffected by
  Pricing Strategy. Labeled "Official calculator" everywhere.
- `finalGallons` = `Baseline × (1 + Region% + Amenities% + Review% + Pricing%)`
  — the headline number, labeled "Final Potential Gallons".

`calculateEstimate()`'s return shape gains `pricingPct`, `pricingLabel`, and
`finalGallons` alongside the existing `baseline`, `regionPct`, `amenityPct`,
`reviewPct`, `reviewFlagged`, and (renamed) `officialSubtotal` fields
(previously just `gallons` — renaming it makes "which number is this"
impossible to get wrong by field name alone; see Task-level interface
changes in the implementation plan).

**Test requirement (exact):** at Standard/0% pricing, `officialSubtotal` and
`finalGallons` are equal and match cases A–D exactly (13,750 / 2,250 / 14,550
/ 3,240). Additional required cases:

| Case | Inputs | officialSubtotal | Pricing | finalGallons |
|---|---|---|---|---|
| A @ Most aggressive | Medium TS/Interstate/6+, West +6%, Good +2%, TP 3.8, **Most aggressive +5.0%** | 13,750 | +5.0% | 12,500 × 1.15 = **14,375** |
| A @ No discounts | same profile/region/amenity/review, **No discounts −5.0%** | 13,750 | −5.0% | 12,500 × 1.05 = **13,125** |
| C @ Aggressive | Large TS/Interstate/6+, Region −3%, Average, TP 3.5, **Aggressive +2.5%** | 14,550 | +2.5% | 15,000 × 0.995 = **14,925** |

Plus: every pricing band tested at least once, and an explicit invariant test
— `officialSubtotal` is identical across all 5 pricing bands for the same
non-pricing inputs (proving pricing selection never leaks into the official
number).

---

## 6. Region % — admin-managed (unchanged from prior revision)

- Effective Region% = `localStorage['roadysBDPGRegionOverride']` if present,
  else `region_variance.json`, else `0.0` for every region. (Key renamed
  from `roadysGVPRegionOverride` to match the `BDPG` namespace.)
- If neither committed file nor override has been set, a visible banner
  reads: *"Region variance not set — estimates use 0% region adjustment."*
- If an override exists **and differs** from the committed file, a small
  notice offers **[Clear override]**.
- Admin panel (collapsible): five one-decimal % inputs + an "as of" month,
  writes the override to `localStorage`, renders the resulting JSON for
  Jason to paste into `region_variance.json` to make it the new team-wide
  default.
- Optional CSV helper: self-mapping column UI (state/gallons), computes
  `Region % = (region avg gallons per location ÷ network avg per location) − 1`,
  discards the uploaded file/rows immediately after computing.
- The effective "as of" date is shown on results and on the export.

---

## 7. Network context (unchanged from prior revision)

Generated by an in-page admin control: drop `location-list-*.csv` in, parsed
client-side, filtered to `Status=active` and `Company`/`Name` not containing
"demo", grouped by `BDPG_REGION_MAP` region × CSV `Type` × CSV `Group`. The
resulting JSON is displayed for Jason to copy into the committed file. The
raw CSV is never sent anywhere or persisted.

---

## 8. Supporting analysis (never changes `officialSubtotal`; the Pricing
adjustment is the only new lever that changes `finalGallons`)

- **Amenity detail dropdowns** produce a **suggested** amenity level with a
  reason; the confirm/override `<select>` defaults to the suggestion and
  only clears its override flag when the rep picks a new value explicitly
  (not on every detail change). Only the confirmed level feeds §5.
- **Supporting Details** (collapsible): condition, hours, distance to
  interstate, corridor, competition, prospect name/city/state, plus the
  optional "Actual diesel lanes observed" sanity-check field.
- **Condition-adjusted view**: +10% / 0% / −10% applied to `finalGallons`
  (corrected in this revision — see §3), always labeled "non-official."
- **Network Fit Grade A–E**: 50% from where `officialSubtotal` (corrected in
  this revision — see §3) lands within the prospect's own Location Profile
  range (widened by the calculator's fixed Amenities/Review bounds, computed
  live from config); 50% from the average of 5 equally-weighted Supporting
  Details signals (condition/hours/distance/corridor/competition, each
  scored low(0)/mid(50)/high(100) per the mapping table already locked in).
  Bands: A ≥85 Flagship, B 70–84 Strong, C 55–69 Solid, D 40–54 Developing,
  E <40 Niche. Informational only, never affects §5/§5A.
- **Analysis narrative**: how the number was built; which of the
  calculator's *own* levers would move it and by how much — **now including
  Pricing Strategy** (e.g. "Moving from Standard to Aggressive pricing adds
  +2.5% ≈ 310 gal/mo to the final potential number"), alongside
  Region/Amenities/Review, so reps can show a prospect exactly what deeper
  discounting is worth in volume, never promising a gain the calculator
  doesn't recognize; strengths; gaps; 3–5 talk-track bullets.

---

## 9. Membership fit

Using `finalGallons` (corrected in this revision — see §3), never
`officialSubtotal`:

- Monthly value = `finalGallons` × value-per-gallon (placeholder constant)
- Breakeven gallons = monthly membership cost ÷ value-per-gallon (placeholder
  constants per plan: Roady's / PTP / Roady's Lite)
- Side-by-side comparison of the three plans; recommendation weighs
  breakeven headroom plus the region/type plan-group mix from §7.
- Output line: *"Membership pays for itself at X gal/mo — final potential
  estimate is Y (Z× coverage)."* (Wording updated from "official estimate"
  to "final potential estimate" since the number driving this line is now
  `finalGallons`, not `officialSubtotal`.)

**"Not configured" contract (unchanged):** `calculateMembershipFit()` never
divides by zero and never returns `NaN`/`Infinity`. `valuePerGallon <= 0` →
whole panel unconfigured, `{valuePerGallonConfigured: false, plans: []}`. A
plan with `cost <= 0` is individually unconfigured, no breakeven keys at all
on its entry. Export/Copy Summary omit the Membership Fit section entirely
unless at least one plan is fully configured.

---

## 10. Layout

Rendered into `#pg-bus-dev-potential-gallons` via `renderBusDevGallons()`,
following `index.html`'s own page conventions (`.sec-hdr`/`.sec-title` for
the page header, matching how `pg-kpi-entry` and other Tools pages are
built):

Section header ("BUS DEV POTENTIAL GALLONS") with region-variance date +
not-set banner
→ Step 1 (cascading selects, baseline result, 8-row reference table,
selected row highlighted)
→ Step 2 (state → region chip, inline-SVG 5-region map, amenity details →
suggested → confirm/override, Trucker Path input → band chip, **Pricing
Strategy dropdown — new**)
→ Supporting Details (collapsible)
→ [Generate Value Profile]
→ Results, in this exact order (revised in this round — "present both
numbers"):
   1. **Baseline**
   2. **Region-adjusted** (baseline × (1 + Region%) alone — an intermediate
      waterfall step, shown so the four-step build-up is traceable one
      factor at a time)
   3. **Official calculator subtotal** = `officialSubtotal` (Baseline ×
      (1 + Region% + Amenities% + Review%)), explicitly labeled "Official
      calculator" — this is the number that matches the printed PDF exactly
   4. **Pricing adjustment** (the Pricing% applied, shown as its own
      waterfall step)
   5. **Final Potential Gallons** = `finalGallons` — the headline number
   6. Position in the 2,500–15,000 network range bar + Network Fit Grade
      (based on `officialSubtotal`)
   7. Network context
   8. Condition-adjusted view (based on `finalGallons`)
   9. Membership fit (based on `finalGallons`)
   10. Analysis narrative (levers now include Pricing Strategy)
→ Actions: Export PDF (browser `@media print`, one-page, shows **both**
`officialSubtotal` and `finalGallons` with the full waterfall so anything can
be traced back to the printed calculator) · Copy Summary (plain text,
same dual-number requirement) · Save Profile (`localStorage`, "My Profiles"
load/delete list)

---

## 11. Increments

1. New nav item + page shell wired into `index.html`'s Business Dev group
   (§2) + `busDevGallonsConfig.js` + Step 1 cascading inputs
2. `busDevGallonsCalculator.js` + `busDevGallonsCalculator.test.js` — full
   engine including the Pricing Strategy adjustment and the dual
   `officialSubtotal`/`finalGallons` output, all required cases (A–D at
   Standard, the 3 new pricing-band cases, the full-band sweep, and the
   officialSubtotal invariant test)
3. Admin Region % panel + self-mapping CSV helper
4. Supporting analysis + results rendering (both-numbers waterfall,
   Network Fit Grade, network context, condition-adjusted view, membership
   fit, analysis narrative with the Pricing lever) + network-context
   generator
5. Export PDF (both numbers) / Copy Summary (both numbers) / Save Profile

Each increment reviewed before moving to the next.
