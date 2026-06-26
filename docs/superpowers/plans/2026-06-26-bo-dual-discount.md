# Better-Of Dual Discount — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a "Better Of" (BO) aggregator hold separate Cost+ and Retail− values in the planner, and flow those two values through to the truck-stop opt-in page so a stop sees the correct recommended value for the unit it selects.

**Architecture:** Add two aggregator fields (`boCostPlus`/`boRetailMinus`) backed by two new `agp_aggregators` columns; the workspace swaps its single value field for two when the type is BO; `list_optin_aggregators` returns the two columns; the opt-in page resolves an aggregator's per-unit value through one helper. `discountValue` and all non-BO behavior are unchanged.

**Tech Stack:** Static HTML + vanilla JS (no build), Supabase (Postgres + PostgREST), headless Node tests (extract `<script>`, mock DOM + mock Supabase), GitHub Pages.

## Global Constraints

- **`discountValue` and C+/R−/none behavior are unchanged.** The two new fields are used **only** when `discountType === 'BO'`.
- **No anon/grant/RLS/`optin_token` changes.** `agp_aggregators` already has a full table-level grant to `authenticated`, so the new columns need no grant work and have no `42501` upsert issue.
- **Column names:** `agp_aggregators.bo_cost_plus`, `agp_aggregators.bo_retail_minus` (text, default `''`). JS field names (planner): `boCostPlus`, `boRetailMinus`. On the opt-in page the aggregator object carries the snake_case names returned by the RPC: `bo_cost_plus`, `bo_retail_minus`.
- **Backfill:** existing BO rows get `bo_cost_plus = bo_retail_minus = discount_value` (no regression).
- **Deploy order:** apply the migration BEFORE pushing the page changes (the new planner's `aggToRow` upserts `bo_cost_plus`/`bo_retail_minus`; those columns must exist first). See DEPLOY STEP.
- `node --check` must pass on both pages after every task. No `git push` without explicit user approval.
- Tests use the existing headless harness pattern (extract the page `<script>`, eval with a mock DOM + mock Supabase client; planner exposes `window.AGP.__test`, opt-in exposes `window.OPTIN.__test`).

---

## File Structure

- **`supabase/agp_bo_dual_discount.sql`** (new) — adds the two columns, backfills BO rows, re-creates `list_optin_aggregators` to return them. Applied by the user.
- **`aggregator-planner.html`** (modify) — `aggToRow`/`rowToAgg`, seed `A()` + the A-to-B entry, `renderAggWorkspace` (two-box BO), `discLabel` (BO label).
- **`truck-stop-optin.html`** (modify) — a `unitValue`/`recommendedFor` helper + `cardHTML`/`recalc`/`buildChoices` BO handling; aggregator object carries `bo_cost_plus`/`bo_retail_minus`.
- **`supabase/agp_schema.sql`, `supabase/agp_optin_portal.sql`** (modify) — document the two columns + the updated `list_optin_aggregators` signature.

---

## Task 1: Migration — columns, backfill, `list_optin_aggregators`

**Files:**
- Create: `supabase/agp_bo_dual_discount.sql`

**Interfaces:**
- Produces: `agp_aggregators.bo_cost_plus`, `agp_aggregators.bo_retail_minus` (text default `''`); `list_optin_aggregators()` now also returns `bo_cost_plus`, `bo_retail_minus`.

- [ ] **Step 1: Write the migration file** `supabase/agp_bo_dual_discount.sql`

```sql
-- =====================================================================
-- Better-Of dual discount — add per-unit BO values to agp_aggregators
-- and surface them on the opt-in form. No grant/RLS/anon/token changes.
-- Idempotent. agp_aggregators already has a full authenticated grant, so
-- the new columns ride along with no privilege work.
-- =====================================================================
begin;

alter table public.agp_aggregators add column if not exists bo_cost_plus    text default '';
alter table public.agp_aggregators add column if not exists bo_retail_minus text default '';

-- Backfill existing BO rows so the two values match the old single value.
update public.agp_aggregators
   set bo_cost_plus    = discount_value,
       bo_retail_minus = discount_value
 where discount_type = 'BO'
   and coalesce(bo_cost_plus,'') = '' and coalesce(bo_retail_minus,'') = '';

-- list_optin_aggregators: add the two BO columns to the result.
create or replace function public.list_optin_aggregators()
returns table(id text, name text, rail text, carriers text,
              discount_type text, discount_value text, discount_target text,
              bo_cost_plus text, bo_retail_minus text, description text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select a.id, a.name, a.rail, a.carriers,
         a.discount_type, a.discount_value, a.discount_target,
         coalesce(a.bo_cost_plus,''), coalesce(a.bo_retail_minus,''), coalesce(d.body,'')
  from public.agp_aggregators a
  left join public.agp_descriptions d on d.aggregator_id = a.id
  where a.show_on_form is true
  order by a.sort_index
$$;

commit;

-- Verify (run after commit):
-- select id, discount_type, discount_value, bo_cost_plus, bo_retail_minus
--   from public.agp_aggregators where discount_type='BO';
-- select * from public.list_optin_aggregators();   -- as admin; columns include bo_cost_plus/bo_retail_minus
```

- [ ] **Step 2: Commit**

```bash
git add supabase/agp_bo_dual_discount.sql
git commit -m "feat(sql): BO dual-discount columns + backfill + list_optin_aggregators"
```

---

## Task 2: Planner sync mapping + seed

**Files:**
- Modify: `aggregator-planner.html` (`aggToRow`, `rowToAgg`, seed `A()` + A-to-B entry)
- Test: `C:/tmp/agp_bo_map.js`

**Interfaces:**
- Consumes: existing sync layer.
- Produces: aggregator object has `boCostPlus`/`boRetailMinus` (default `""`); `aggToRow` emits `bo_cost_plus`/`bo_retail_minus`; `rowToAgg` reads them.

- [ ] **Step 1: Write the failing test** `C:/tmp/agp_bo_map.js` (reuse the `agp_task6.js` harness; assertions:)

```javascript
// after loading the planner via the standard stub:
const X=AGP.__test;
const row=X.aggToRow({id:'atob',name:'A to B',discountType:'BO',boCostPlus:'10',boRetailMinus:'12'},0);
t('aggToRow emits bo_cost_plus/bo_retail_minus', row.bo_cost_plus==='10' && row.bo_retail_minus==='12');
const a=X.rowToAgg({id:'atob',discount_type:'BO',bo_cost_plus:'10',bo_retail_minus:'12'});
t('rowToAgg reads boCostPlus/boRetailMinus', a.boCostPlus==='10' && a.boRetailMinus==='12');
t('rowToAgg defaults empty when absent', X.rowToAgg({id:'x'}).boCostPlus==='' && X.rowToAgg({id:'x'}).boRetailMinus==='');
t('seed A to B has BO values 10/10', X.seed().aggregators.find(x=>x.id==='atob').boCostPlus==='10');
t('seed non-BO aggregators default empty BO values', X.seed().aggregators.find(x=>x.id==='motive').boCostPlus==='');
```

- [ ] **Step 2: Run → FAIL** (`aggToRow` has no `bo_cost_plus`).

- [ ] **Step 3: Implement.** In `aggToRow` (line 591–596), add to the returned object before `sort_index`:

```javascript
  bo_cost_plus:a.boCostPlus||"",bo_retail_minus:a.boRetailMinus||"",
```

In `rowToAgg` (line 597–602), add before `steps:{}`:

```javascript
  boCostPlus:r.bo_cost_plus||"",boRetailMinus:r.bo_retail_minus||"",
```

In `seed()` `A()` default object (line 817–818), add `boCostPlus:"",boRetailMinus:"",` next to `discountValue:""`. In the A-to-B seed entry (the `A({id:"atob",…})` call), add `boCostPlus:"10",boRetailMinus:"10",` (alongside its existing `discountType:"BO",discountValue:"10"`).

Expose `aggToRow`/`rowToAgg` are already on `__test` (from a prior task); `seed` too.

- [ ] **Step 4: Run → PASS.** `node --check`.

- [ ] **Step 5: Commit** `feat(planner): BO dual-discount sync mapping + seed`.

---

## Task 3: Planner workspace — two boxes for BO

**Files:**
- Modify: `aggregator-planner.html` (`renderAggWorkspace`, discount grid line 1174–1179)
- Test: `C:/tmp/agp_bo_workspace.js`

**Interfaces:**
- Consumes: Task 2's fields.
- Produces: workspace shows `data-aggf="boCostPlus"` + `data-aggf="boRetailMinus"` inputs when `discountType==='BO'`, a single `data-aggf="discountValue"` for `C+`/`R−`, and no value input for `none`.

- [ ] **Step 1: Write the failing test** (reuse the `agp_task6.js` workspace-render harness; `setState(seed())`, set `currentAgg`, call `renderAggWorkspace()`, read `reg['#agpAggWorkspace']._html`):

```javascript
const S=X.getState();
const atob=S.aggregators.find(x=>x.id==='atob'); S.ui.currentAgg='atob';
atob.discountType='BO'; atob.boCostPlus='10'; atob.boRetailMinus='12';
X.renderAggWorkspace(); let h=reg['#agpAggWorkspace']._html;
t('BO shows two value inputs', /data-aggf="boCostPlus"/.test(h) && /data-aggf="boRetailMinus"/.test(h));
t('BO hides the single discountValue input', !/data-aggf="discountValue"/.test(h));
const m=S.aggregators.find(x=>x.id==='motive'); S.ui.currentAgg='motive'; m.discountType='C+';
X.renderAggWorkspace(); h=reg['#agpAggWorkspace']._html;
t('C+ shows the single discountValue input', /data-aggf="discountValue"/.test(h) && !/data-aggf="boCostPlus"/.test(h));
m.discountType='none'; X.renderAggWorkspace(); h=reg['#agpAggWorkspace']._html;
t('none shows no value input', !/data-aggf="discountValue"/.test(h) && !/data-aggf="boCostPlus"/.test(h));
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.** Replace the single Discount-value field (line 1176) so the value field area is computed from the type. Change the grid block to:

```javascript
      <div class="agp-field"><label>Default discount</label>${selectHtml("aggf","discountType",DISCOUNT_TYPES,a.discountType)}</div>
      ${a.discountType==='BO'
        ? `<div class="agp-field"><label>Cost + (¢)</label><input class="agp-input" data-aggf="boCostPlus" value="${esc(a.boCostPlus)}" placeholder="e.g. 10"></div>
           <div class="agp-field"><label>Retail − (¢)</label><input class="agp-input" data-aggf="boRetailMinus" value="${esc(a.boRetailMinus)}" placeholder="e.g. 12"></div>`
        : a.discountType==='none'
          ? ``
          : `<div class="agp-field"><label>Discount value (¢)</label><input class="agp-input" data-aggf="discountValue" value="${esc(a.discountValue)}" placeholder="e.g. 8"></div>`}
      <div class="agp-field"><label>Roady's markup (¢)</label><input class="agp-input" data-aggf="markup" value="${esc(a.markup)}"></div>
      <div class="agp-field"><label>Discount target (text)</label><input class="agp-input" data-aggf="discountTarget" value="${esc(a.discountTarget)}"></div>
```

(The grid is `agp-grid-4`; for BO it holds 5 fields and wraps to a second row — acceptable. The existing `data-aggf` input handler and the `discountType`-change re-render via `renderWorkspaceKeepScroll()` already handle the new inputs and the live one↔two swap; no handler change.) `renderAggWorkspace` is already on `__test`.

- [ ] **Step 4: Run → PASS.** `node --check`.

- [ ] **Step 5: Commit** `feat(planner): two-box BO discount in Aggregator Workspace`.

---

## Task 4: Planner — BO label uses both values

**Files:**
- Modify: `aggregator-planner.html` (`discLabel` line 1051–1055 + its two callers at 1131 and 1375)
- Test: `C:/tmp/agp_bo_label.js`

**Interfaces:**
- Produces: `discLabel(a)` (now takes the aggregator object). BO → `C + <boCostPlus>, R - <boRetailMinus> / BO`.

- [ ] **Step 1: Write the failing test:**

```javascript
t('discLabel BO uses both values', X.discLabel({discountType:'BO',boCostPlus:'10',boRetailMinus:'12'})==='C + 10, R - 12 / BO');
t('discLabel C+ unchanged', X.discLabel({discountType:'C+',discountValue:'8'})==='C + 8');
t('discLabel none', X.discLabel({discountType:'none'})==='—');
```

- [ ] **Step 2: Run → FAIL** (`discLabel` not on `__test`, and signature differs).

- [ ] **Step 3: Implement.** Replace `discLabel` (1051–1055) with:

```javascript
function discLabel(a){
  const type=a&&a.discountType;
  if(type==="none"||!type)return"—";
  if(type==="BO")return (a.boCostPlus||a.boRetailMinus)?("C + "+(a.boCostPlus||"?")+", R - "+(a.boRetailMinus||"?")+" / BO"):"Better Of";
  return (type==="R-"?"R - ":"C + ")+(a.discountValue||"?");
}
```

Update both callers from `discLabel(a.discountType,a.discountValue)` to `discLabel(a)` (lines 1131 and 1375). Add `discLabel` to the `__test` export object.

- [ ] **Step 4: Run → PASS.** `node --check`.

- [ ] **Step 5: Commit** `feat(planner): BO pipeline label shows both C+/R- values`.

---

## Task 5: Opt-in page — per-unit BO recommended/default/submit

**Files:**
- Modify: `truck-stop-optin.html` (`cardHTML`, `recalc`, `buildChoices`; add `unitValue`/`recommendedFor`)
- Test: `C:/tmp/optin_bo.js`

**Interfaces:**
- Consumes: aggregator objects from `list_optin_aggregators` now carrying `bo_cost_plus`/`bo_retail_minus`.
- Produces: a BO aggregator's card default value, recommended line, and submit payload use the value for the selected unit; non-BO unchanged.

- [ ] **Step 1: Write the failing test** (reuse `optin_render.js`/`optin_submit.js` harnesses):

```javascript
// render: BO aggregator with bo_cost_plus=10, bo_retail_minus=12
const aggs=[{id:'atob',name:'A to B',carriers:'30K',discount_type:'BO',discount_value:'10',bo_cost_plus:'10',bo_retail_minus:'12',description:'x'}];
doc.getElementById('optCost').value='3.00'; doc.getElementById('optRetail').value='3.40';
let h=X.render(stop, aggs, {});                 // untouched -> default C+
t('BO card defaults to Cost + 10 (bo_cost_plus)', /Recommended: <b>Cost \+ 10<\/b>/.test(h) || /value="10"/.test(h));
h=X.render(stop, aggs, {atob:{type:'R-'}});      // stop switches to Retail-
t('BO in R- mode recommends Retail − 12 (bo_retail_minus)', /Recommended: <b>Retail − 12<\/b>/.test(h));
// buildChoices: untouched BO -> C+ with bo_cost_plus
const bc=X.buildChoices(stop, aggs, {});
const at=bc.find(x=>x.aggregator_id==='atob');
t('buildChoices untouched BO -> C+ with bo_cost_plus 10', at.discount_type==='C+' && at.cost_plus==='10' && at.retail_minus==='');
// non-BO unaffected
const mv=[{id:'motive',name:'Motive',discount_type:'R-',discount_value:'12'}];
t('non-BO buildChoices still uses discount_value', X.buildChoices(stop,mv,{}).find(x=>x.aggregator_id==='motive').retail_minus==='12');
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.** Add two helpers (near `reanchor`):

```javascript
// the ¢ value an aggregator recommends in a given unit: BO has a value per unit; others use discount_value
function unitValue(a, unit){
  if(a.discount_type==='BO') return (unit==='R-' ? a.bo_retail_minus : a.bo_cost_plus) || '';
  return a.discount_value || '';
}
// recommended {type,value} for the selected unit: BO is already per-unit (no spread conversion); others re-anchor
function recommendedFor(a, unit, cost, retail){
  if(a.discount_type==='BO'){ const v=parseInt(unitValue(a,unit),10); return {type:unit, value:isNaN(v)?null:v}; }
  return reanchor(a.discount_type, a.discount_value, unit, cost, retail);
}
```

In `cardHTML`, change the default value + recommended lines to:

```javascript
  const cVal=(ch.value!=null&&ch.value!=='')?ch.value:unitValue(a,cType);
  const rec=recommendedFor(a, cType, cost, retail);
```

In `recalc`, change its `cVal` default to `unitValue(a,cType)` and its `rec` to `recommendedFor(a, cType, cost, retail)` (same substitution).

In `buildChoices`, change the `valStr` default to use `unitValue`:

```javascript
    const valStr = (touched && ch.value!=null && ch.value!=='') ? String(ch.value) : String(unitValue(a, type)||'');
```

(The BO→C+ default `type` line in `buildChoices` and the BO→C+ `cType` default in `cardHTML` are unchanged. `reanchor`'s existing BO branch becomes unused but is left in place — non-BO paths still use it.)

- [ ] **Step 4: Run → PASS** + run `optin_render.js`/`optin_submit.js`/`optin_calc.js` regressions. `node --check`.

- [ ] **Step 5: Commit** `feat(optin): per-unit BO recommended/default/submit from bo_cost_plus/bo_retail_minus`.

---

## Task 6: Document the columns + RPC signature

**Files:**
- Modify: `supabase/agp_schema.sql`, `supabase/agp_optin_portal.sql`

- [ ] **Step 1:** In `agp_schema.sql` `agp_aggregators` CREATE TABLE, add `bo_cost_plus text default ''` and `bo_retail_minus text default ''` with a `-- BO per-unit values` comment. In `agp_optin_portal.sql`, update the `list_optin_aggregators` definition's RETURNS + select to include the two columns (so the file of record matches `agp_bo_dual_discount.sql`), with a comment pointing to that migration as the latest.
- [ ] **Step 2: Commit** `docs(supabase): document BO dual-discount columns + list_optin_aggregators`.

---

## DEPLOY STEP (operational — user-driven)

> **Apply the migration FIRST, then push the pages.** Order matters: the new planner's `aggToRow` upserts `bo_cost_plus`/`bo_retail_minus`, so those columns must exist or the location/aggregator sync 400s.
> 1. Run `supabase/agp_bo_dual_discount.sql`; run its verification (BO rows have both values; `list_optin_aggregators` returns the two columns).
> 2. Push `main` (planner + opt-in page). Hard-refresh, sign in.
> 3. Verify: a BO aggregator's workspace shows two boxes; editing them persists across reload; the pipeline label reads `C + x, R - y / BO`; the opt-in form for that aggregator (with `show_on_form` on) recommends the C+ value in Cost+ mode and the R− value in Retail− mode.

---

## Self-Review

**Spec coverage:** data model (T1 columns + T2 fields) · backfill (T1) · workspace two-box (T3) · sync (T2) · opt-in per-unit (T5 via `list_optin_aggregators` T1) · pipeline label (T4) · migration (T1) · docs (T6) · deploy order (DEPLOY STEP). No gaps.

**Placeholder scan:** none — every step has the code or the SQL.

**Type consistency:** planner JS uses `boCostPlus`/`boRetailMinus`; DB + RPC + opt-in page use `bo_cost_plus`/`bo_retail_minus`; `aggToRow`/`rowToAgg` bridge them. `discLabel(a)` signature changed in T4 and both callers updated. `unitValue`/`recommendedFor` names used consistently in T5. `list_optin_aggregators` RETURNS column order (T1) matches what the opt-in page reads by name (not position).
