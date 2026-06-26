# Better-Of Dual Discount — Design Spec

Date: 2026-06-26
Status: Approved (design)

## 1. Purpose

In the Aggregator Launch Planner, a "Better Of" (BO) aggregator currently stores a
single discount value treated as the same number in either unit. Some aggregators
(e.g., A to B) want **separate** Cost+ and Retail− values. This feature lets the
Aggregator Workspace capture two values for a BO aggregator and flows them all the
way to the truck-stop opt-in page, so a stop sees the correct recommended value for
whichever unit it selects.

## 2. Data model

Aggregator object (in `aggregator-planner.html`) gains two fields:
- `boCostPlus`  — the Cost+ (¢) value, used only when `discountType === 'BO'`.
- `boRetailMinus` — the Retail− (¢) value, used only when `discountType === 'BO'`.

The existing `discountValue` is **unchanged** — it remains the single value for
`C+` and `R−`. `none` uses no value. For `BO`, `discountValue` is not used; the two
new fields are.

New `agp_aggregators` columns (text, like `discount_value`):
- `bo_cost_plus`
- `bo_retail_minus`

`agp_aggregators` already has a full table-level grant to `authenticated` (post
Phase B) and to `anon`/`authenticated` pre-Phase-B, so the new columns ride along
with no grant change and no PostgREST-upsert `42501` issue (unlike the
column-restricted `agp_locations`).

**Backfill:** existing BO rows get `bo_cost_plus = bo_retail_minus = discount_value`,
so today's single BO value (e.g., A to B "10") becomes C+10 / R−10 — no regression.

## 3. Workspace UI (Program Details)

In `renderAggWorkspace`, the discount area currently renders: a "Default discount"
type `select` + a single "Discount value (¢)" input (`data-aggf="discountValue"`).

New behavior, driven by the current `discountType`:
- `C+` or `R−` → one "Discount value (¢)" input (as today, `data-aggf="discountValue"`).
- `BO` → **two** inputs replace the single one: "Cost + (¢)"
  (`data-aggf="boCostPlus"`) and "Retail − (¢)" (`data-aggf="boRetailMinus"`).
- `none` → no value input.

Changing the discount type re-renders the workspace (the workspace already calls
`renderWorkspaceKeepScroll()` when `discountType` changes in `onFieldChange`), so the
field area swaps between one and two boxes live. The two new inputs are plain text
fields handled by the existing `data-aggf` input handler (which sets
`a[dataset.aggf] = value` + `commit()`), so no new handler is required.

## 4. Sync

- `aggToRow` adds `bo_cost_plus: a.boCostPlus || ""`, `bo_retail_minus: a.boRetailMinus || ""`.
- `rowToAgg` adds `boCostPlus: r.bo_cost_plus || ""`, `boRetailMinus: r.bo_retail_minus || ""`.
- `seed()` `A()` defaults both to `""`. The one BO seed entry (A to B) sets
  `boCostPlus: "10"`, `boRetailMinus: "10"` explicitly (matching its current
  `discountValue: "10"`), so a fresh local seed shows the two boxes filled.

`buildEntities` uses `aggToRow`, so edits to the two fields diff and upsert normally.

## 5. Opt-in page (full flow)

`list_optin_aggregators` returns two more columns: `bo_cost_plus`, `bo_retail_minus`.
The function is re-created (idempotent) to add them to its RETURNS + select list;
it stays `SECURITY DEFINER`, anon-executable (unchanged grant).

On `truck-stop-optin.html`, the aggregator object gains `bo_cost_plus` /
`bo_retail_minus`. The BO recommendation becomes **per-unit** (replacing the current
"single value in both units" behavior from the earlier BO fix):
- The card's default value and the recommended line, when the stop is in **Cost+**
  mode, use `bo_cost_plus`; in **Retail−** mode, use `bo_retail_minus`.
- `buildChoices` for an untouched BO card emits `C+` with `bo_cost_plus`
  (still never a blank-value BO row; the form remains single-unit per card, so the
  stop picks one unit and gets that unit's value).
- A touched card uses the stop's own typed value, as today.

Concretely: a helper resolves an aggregator's recommended value for a given unit —
for non-BO it's `discount_value`; for BO it's `bo_cost_plus` (C+) or
`bo_retail_minus` (R−). `cardHTML`, `recalc`, and `buildChoices` use that helper
instead of `a.discount_value` directly for BO.

## 6. Migration + pipeline display

One SQL file `supabase/agp_bo_dual_discount.sql`:
- `alter table public.agp_aggregators add column if not exists bo_cost_plus text default '';`
- `... add column if not exists bo_retail_minus text default '';`
- Backfill BO rows: `update ... set bo_cost_plus = discount_value, bo_retail_minus = discount_value where discount_type = 'BO' and coalesce(bo_cost_plus,'') = '';`
- `create or replace function public.list_optin_aggregators()` returning the two new columns.
- No grant/RLS/anon changes; no `optin_token` involvement.

Pipeline display: the planner's `discLabel(type, value, ...)` for `BO` shows
`C+<bo_cost_plus> / R−<bo_retail_minus> (BO)` using the two values instead of the
single value.

## 7. Testing (headless, existing harness pattern)

Planner:
- `aggToRow`/`rowToAgg` round-trip `bo_cost_plus`/`bo_retail_minus`.
- `renderAggWorkspace` shows two inputs (`data-aggf="boCostPlus"`,
  `data-aggf="boRetailMinus"`) when `discountType==='BO'`, and one input otherwise.
- `discLabel` for BO shows both values.

Opt-in page:
- For a BO aggregator with `bo_cost_plus=10`, `bo_retail_minus=12`: the card defaults
  to C+ with 10; switching to R− shows 12 as recommended/default.
- `buildChoices` untouched BO → `{discount_type:'C+', cost_plus:'10', retail_minus:''}`.
- Non-BO aggregators unaffected (still use `discount_value`).

`node --check` on both pages.

## 8. Files touched

- `aggregator-planner.html` — `aggToRow`/`rowToAgg`, seed `A()`, `renderAggWorkspace`
  (two-box BO), `discLabel` (BO label).
- `truck-stop-optin.html` — recommended-value helper + `cardHTML`/`recalc`/`buildChoices`
  BO handling; aggregator object carries the two fields.
- `supabase/agp_bo_dual_discount.sql` — new migration (columns + backfill +
  `list_optin_aggregators`).
- `supabase/agp_schema.sql` / `agp_optin_portal.sql` — document the two new columns +
  the updated `list_optin_aggregators` signature.

## 9. Out of scope

- No change to `C+`/`R−`/`none` behavior or to `discountValue`.
- No anon/grant/RLS/token changes.
- No new aggregator types.
