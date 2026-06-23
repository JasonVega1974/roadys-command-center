# Truck Stop Opt-In Portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A personalized, token-gated truck-stop opt-in page that models per-gallon profit and writes opt-in choices straight into the planner's Supabase data via a single validated RPC, plus the planner changes that surface responses.

**Architecture:** New static page `truck-stop-optin.html` is **RPC-only** — it calls four `SECURITY DEFINER` functions (`resolve_optin_token`, `resolve_optin_by_code`, `list_optin_aggregators`, `submit_optin`) and holds **zero** direct table grants. The planner gains a `show_on_form` toggle, a Responded column, a copy-link action, and (critically) explicit-column reads of `agp_locations` because the token column becomes non-selectable. Migration is two-phase; a planner email+password auth task gates the lockdown and link distribution.

**Tech Stack:** Static HTML + vanilla JS (no build step), Supabase JS v2 (anon key for the form / authenticated for the planner post-auth), GitHub Pages. Tests are headless Node scripts that extract the page `<script>`, mock the DOM + a mock Supabase client, and assert on pure functions + rendered HTML (same pattern as the planner's `C:/tmp/agp_*.js` tests).

## Global Constraints

- **GATE SEQUENCE (hard, numbered dependencies — nothing skips ahead):**
  0. **Phase A1** (additive: columns + token gen/backfill + the 5 functions; no grant change) applied → **verify `submit_optin` boundaries (Task 0)** before any page code is built on the RPC.
  1. Opt-in page + **Phase A2** (token-column lock) + **planner explicit-column refactor** → ship together (same deploy).
  2. **Planner email+password Supabase Auth** → BLOCKS everything below it.
  3. **Phase B** (anon strip + PUBLIC→authenticated policy re-scope) → only after (2) is live.
  4. **Email opt-in links to stops** → only after (3) is applied.
  No links go out before Phase B; Phase B does not land before planner auth. A finished page does not justify skipping ahead.
- **SAME-DEPLOY CONSTRAINT (hard):** **Phase A2's** column-level grant excludes `optin_token`, which breaks any `select('*')` on `agp_locations`. The planner's refactor to **explicit-column reads (Task 5) must ship in the SAME deployment as applying Phase A2** — it cannot lag by even one push. (Task 5 + the Phase A2 apply are a single atomic ship; see DEPLOY STEP A.) Phase A1 is additive and may be applied earlier without touching the planner.
- **Form is RPC-only:** `truck-stop-optin.html` must never call `sb.from('agp_*')…` — only `sb.rpc(...)` on the four functions. No table grants for the form.
- **Token never reaches the client:** the page only ever sends/receives a token via `?t=` and `resolve_optin_token`; it never reads `agp_locations.optin_token` directly. `get_optin_token` is `authenticated`-only (planner copy-link), never anon.
- **Supabase setup copied verbatim** from `gs-command-center.html` (`ROADYS_SB_URL`, `ROADYS_SB_ANON`, `ensureSupabaseLib`, `getRoadysSB`) — do not hardcode new credentials.
- **No git push without explicit approval.** The user controls every deploy. Commit locally; never `git push` unless told.
- `node --check` must pass on both pages after every task.

---

## File Structure

- **Create `truck-stop-optin.html`** — the public form. One file: styles, markup shell, and a script exposing `window.OPTIN` with a `__test` hook (mirrors the planner's `window.AGP.__test`). Pure logic (`profitPerGal`, `reanchor`, `buildChoices`) is separated into named functions so it is unit-testable.
- **Modify `aggregator-planner.html`** — explicit-column `agp_locations` reads; `responded_at` + `show_on_form` in the sync mappings; `show_on_form` toggle in the Aggregator Workspace; Responded column + copy-link in the Location Opt-In tab; optional email+password auth gate.
- **`supabase/agp_optin_portal.sql`** — already written. Phase A1 (additive), Phase A2 (token lock), Phase B (commented). Applied: A1 early (gate 0), A2 at DEPLOY STEP A, B at DEPLOY STEP B. Not edited by code tasks.
- **Create `supabase/agp_optin_portal_test.sql`** (Task 0) — transactional boundary tests for `submit_optin`, run against the DB after Phase A1.
- **Modify `supabase/agp_schema.sql`** — document the three new columns + four functions (schema of record).
- **Test scratch files** under `C:/tmp/optin_*.js` (not committed), per the existing convention.

---

## Task 0: `submit_optin` security-boundary tests (SQL) — BEFORE any page code

`submit_optin` is the entire write boundary and is `SECURITY DEFINER` (bypasses RLS), so its
internal validation is the only guard. It is SQL, not JS — the headless mock client cannot
exercise it. This task verifies the boundary directly against the function. **Run after
Phase A1 is applied** (functions exist; no grant/token-lock needed yet).

**Files:**
- Create: `supabase/agp_optin_portal_test.sql`

**Interfaces:**
- Consumes: the functions from Phase A1 (`submit_optin`, `resolve_optin_token`).
- Produces: a transactional test (`begin … rollback`) that creates two disposable stops + a
  published and an unpublished aggregator, runs the four boundary cases with `assert`-style
  `raise exception` on failure, and **rolls back** so nothing persists.

- [ ] **Step 1: Write the test script** — `supabase/agp_optin_portal_test.sql`

```sql
-- Run in the Supabase SQL editor AFTER Phase A1. Rolls back: no data persists.
begin;

-- fixtures: two stops (known tokens) + one published, one unpublished aggregator
insert into public.agp_aggregators(id,name,show_on_form,discount_type,discount_value)
  values ('t_pub','TestPub',true,'R-','12'), ('t_unpub','TestUnpub',false,'C+','10');
insert into public.agp_locations(id,name,code,optin_token)
  values ('t_locA','Stop A','TA','tok_AAA_'||gen_optin_token()),
         ('t_locB','Stop B','TB','tok_BBB_'||gen_optin_token());

do $$
declare
  tokA text; tokB text; n_before int; n_after int; v_status text; v_type text; v_val text;
begin
  select optin_token into tokA from public.agp_locations where id='t_locA';
  select optin_token into tokB from public.agp_locations where id='t_locB';

  -- CASE 1: invalid/unresolvable token -> rejected, ZERO writes
  select count(*) into n_before from public.agp_optins;
  begin
    perform public.submit_optin('definitely-not-a-real-token',
      '[{"aggregator_id":"t_pub","status":"Yes","discount_type":"R-","retail_minus":"12"}]'::jsonb);
    raise exception 'CASE1 FAIL: invalid token did not raise';
  exception when others then null;  -- expected: raised
  end;
  select count(*) into n_after from public.agp_optins;
  if n_after <> n_before then raise exception 'CASE1 FAIL: invalid token wrote % rows', n_after-n_before; end if;

  -- CASE 2: choice naming a NON-show_on_form aggregator -> that entry skipped (no row)
  perform public.submit_optin(tokA,
    '[{"aggregator_id":"t_unpub","status":"Yes","discount_type":"C+","cost_plus":"10"}]'::jsonb);
  if exists (select 1 from public.agp_optins where aggregator_id='t_unpub' and location_id='t_locA')
    then raise exception 'CASE2 FAIL: wrote a row for an unpublished aggregator'; end if;

  -- CASE 3: re-submit writes ONLY the token's own stop, never another stop's rows
  perform public.submit_optin(tokA,
    '[{"aggregator_id":"t_pub","status":"No","discount_type":"R-","retail_minus":"8"}]'::jsonb);
  perform public.submit_optin(tokA,  -- re-submit (latest wins) for stop A
    '[{"aggregator_id":"t_pub","status":"Yes","discount_type":"R-","retail_minus":"12"}]'::jsonb);
  if exists (select 1 from public.agp_optins where location_id='t_locB')
    then raise exception 'CASE3 FAIL: stop A submit wrote stop B rows'; end if;
  select status into v_status from public.agp_optins where aggregator_id='t_pub' and location_id='t_locA';
  if v_status <> 'Yes' then raise exception 'CASE3 FAIL: re-submit did not update own row (got %)', v_status; end if;

  -- CASE 4: out-of-range status + discount values -> clamped
  perform public.submit_optin(tokA,
    '[{"aggregator_id":"t_pub","status":"MAYBE","discount_type":"WAT","retail_minus":"999","cost_plus":"abc"}]'::jsonb);
  select status,discount_type,retail_minus into v_status,v_type,v_val
    from public.agp_optins where aggregator_id='t_pub' and location_id='t_locA';
  if v_status <> 'No Response' then raise exception 'CASE4 FAIL: status not clamped (got %)', v_status; end if;
  if v_type   <> ''           then raise exception 'CASE4 FAIL: type not clamped (got %)', v_type; end if;
  if v_val    <> ''           then raise exception 'CASE4 FAIL: value not clamped (got %)', v_val; end if;

  raise notice 'ALL submit_optin boundary cases PASSED';
end $$;

rollback;
```

- [ ] **Step 2: Run it** in the Supabase SQL editor (after Phase A1). Expected: `NOTICE: ALL submit_optin boundary cases PASSED`, transaction rolled back (no rows persist). If any `CASE… FAIL` raises, fix the `submit_optin` function in `agp_optin_portal.sql`, re-apply Phase A1's function, re-run — do not proceed to T1 until green.

- [ ] **Step 3: Commit**

```bash
git add supabase/agp_optin_portal_test.sql
git commit -m "test(optin): submit_optin security-boundary SQL tests (token, show_on_form, own-stop-only, clamping)"
```

---

## Task 1: Opt-in page scaffold + calculator pure functions

**Files:**
- Create: `truck-stop-optin.html`
- Test: `C:/tmp/optin_calc.js`

**Interfaces:**
- Produces (on `window.OPTIN.__test`):
  - `profitPerGal(type, value, cost, retail)` → number|null. `type` ∈ `'C+'|'R-'`. `cost`/`retail` are dollars/gal (e.g. 3.00). Returns ¢/gal, or `null` when a Retail− needs cost/retail that are missing/non-numeric.
  - `reanchor(recType, recValue, targetType, cost, retail)` → `{type, value}` — the recommended discount expressed in `targetType`'s unit; `null` value if conversion needs cost/retail and they're missing.

- [ ] **Step 1: Write the failing test** — `C:/tmp/optin_calc.js`

```javascript
const fs=require('fs');
function load(){ // minimal DOM stub + extract <script>, eval, return window.OPTIN
  const reg={}; const make=()=>new Proxy({},{get:(t,p)=>p==='style'?{}:p==='classList'?{add(){},remove(){},toggle(){}}:(t[p]??(()=>{})),set:(t,p,v)=>(t[p]=v,true)});
  global.document={readyState:'complete',addEventListener(){},getElementById:()=>make(),querySelector:()=>make(),querySelectorAll:()=>[],createElement:()=>make()};
  global.window={}; global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
  const html=fs.readFileSync('truck-stop-optin.html','utf8');
  eval(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  return global.window.OPTIN.__test;
}
const X=load(); let ok=true; const t=(n,c)=>{console.log((c?'PASS':'FAIL')+' '+n);if(!c)ok=false;};
// Cost+12 -> 12 regardless of cost/retail
t('Cost+12 = 12c', X.profitPerGal('C+','12',3.00,3.40)===12);
t('Cost+ with no cost/retail still = value', X.profitPerGal('C+','10',null,null)===10);
// Retail-12 at 40c spread -> 28
t('Retail-12 @ .40 spread = 28c', X.profitPerGal('R-','12',3.00,3.40)===28);
t('Retail- with missing inputs -> null', X.profitPerGal('R-','12',null,null)===null);
// re-anchor: Retail-12 expressed as Cost+ at .40 spread = Cost+28 (equal profit)
const r=X.reanchor('R-','12','C+',3.00,3.40); t('reanchor R-12 -> C+28', r.type==='C+'&&r.value===28);
t('reanchor profit equals original', X.profitPerGal(r.type,String(r.value),3.00,3.40)===X.profitPerGal('R-','12',3.00,3.40));
process.exit(ok?0:1);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node C:/tmp/optin_calc.js`
Expected: FAIL (file/functions not defined).

- [ ] **Step 3: Create `truck-stop-optin.html`** with the shell + the pure functions.

The page is one file. Add a `<style>` block (reuse the planner's `--agp-*` dark palette for consistency), a `<body><div class="opt">…</div>`, and a `<script>` containing an IIFE that ends with:

```javascript
function profitPerGal(type, value, cost, retail){
  const v = parseFloat(value); if(isNaN(v)) return null;
  if(type==='C+') return v;                       // stop nets the +X cents
  if(type==='R-'){                                 // (retail - cost) - Y, needs both
    const c=parseFloat(cost), r=parseFloat(retail);
    if(isNaN(c)||isNaN(r)) return null;
    return Math.round((r-c)*100) - v;             // spread in cents minus Y
  }
  return null;
}
function reanchor(recType, recValue, targetType, cost, retail){
  if(recType===targetType) return {type:recType, value:parseInt(recValue,10)||0};
  const c=parseFloat(cost), r=parseFloat(retail);
  if(isNaN(c)||isNaN(r)) return {type:targetType, value:null};   // need spread to convert
  const spread=Math.round((r-c)*100); const v=parseInt(recValue,10)||0;
  // R-Y and C+X are equal when X = spread - Y  (and Y = spread - X)
  const conv = targetType==='C+' ? (spread - v) : (spread - v);
  return {type:targetType, value:conv};
}
window.OPTIN = { __test:{ profitPerGal, reanchor } };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node C:/tmp/optin_calc.js` → Expected: all PASS. Then `node --check` on the extracted script.

- [ ] **Step 5: Commit**

```bash
git add truck-stop-optin.html
git commit -m "feat(optin): scaffold page + profit/re-anchor calculator functions"
```

---

## Task 2: Supabase client + stop resolution (token + fallback)

**Files:**
- Modify: `truck-stop-optin.html` (script)
- Test: `C:/tmp/optin_resolve.js`

**Interfaces:**
- Consumes: `profitPerGal`, `reanchor` (Task 1).
- Produces: `OPTIN.__test.setClient(mock)`, `OPTIN.__test.resolveStop()` → `Promise<{stop, aggregators}|{needFallback:true}>`. `resolveStop()` reads `?t=` (via a settable `OPTIN.__test.setQuery({t})`), calls `sb.rpc('resolve_optin_token',{p_token})`; on empty → `{needFallback:true}`; on hit → loads `list_optin_aggregators`. `OPTIN.__test.resolveByCode(code,name)` → calls `resolve_optin_by_code`.

- [ ] **Step 1: Write the failing test** — mock client returns table-RPC shapes.

```javascript
// mock: sb.rpc(name,args) -> {data,error}; resolve_optin_token returns [] or [row]
function mockSB(rows, aggs){ return { rpc:(n,a)=>{
  if(n==='resolve_optin_token') return Promise.resolve({data: rows.filter(r=>r.optin_token===a.p_token).map(({optin_token,...s})=>s), error:null});
  if(n==='resolve_optin_by_code') return Promise.resolve({data: rows.filter(r=>r.code.toLowerCase()===a.p_code.toLowerCase()&&r.name.toLowerCase()===a.p_name.toLowerCase()).map(({optin_token,...s})=>s), error:null});
  if(n==='list_optin_aggregators') return Promise.resolve({data:aggs, error:null});
  return Promise.resolve({data:null,error:{message:'unknown rpc '+n}});
};}
```
Assert: valid token → `{stop:{id,name,...}, aggregators:[…]}` and the stop object has **no** `optin_token`; unknown token → `{needFallback:true}`; `resolveByCode` matches by code+name.

- [ ] **Step 2: Run → FAIL** (`resolveStop` undefined).

- [ ] **Step 3: Implement** — copy the Supabase setup verbatim from `gs-command-center.html` (lines 2623–2645: `ROADYS_SB_URL`, `ROADYS_SB_ANON`, `ensureSupabaseLib`, `getRoadysSB`). Add `resolveStop`/`resolveByCode` using `sb.rpc(...)`. Expose `setClient`, `setQuery`, `resolveStop`, `resolveByCode` on `__test`.

- [ ] **Step 4: Run → PASS.** `node --check`.

- [ ] **Step 5: Commit**

```bash
git add truck-stop-optin.html
git commit -m "feat(optin): Supabase client + token/code stop resolution (RPC-only)"
```

---

## Task 3: Render cards — hero profit, re-anchoring, firm statement

**Files:**
- Modify: `truck-stop-optin.html`
- Test: `C:/tmp/optin_render.js`

**Interfaces:**
- Consumes: Task 1–2.
- Produces: `OPTIN.__test.render(stop, aggregators, choices)` → sets `#optBody` innerHTML; `OPTIN.__test.lastHTML()` returns it. `choices` is the in-memory map `{aggId:{status,type,value}}`.

**Spec for the rendered card (per aggregator):**
- Container `.opt-card[data-agg="<id>"]`.
- **Hero profit** `.opt-profit` — the visually dominant element (largest type, bold): text `<n>¢ / gal` from `profitPerGal(choice.type, choice.value, cost, retail)`, or `— enter cost & retail` when null.
- Name `.opt-name`, description `.opt-desc` (≤2 lines), fleets `.opt-fleets` (`carriers` field).
- Recommended line `.opt-rec` — uses `reanchor(recType, recValue, choice.type, cost, retail)`; renders `Recommended: <Cost +|Retail −> <value>` in the **same unit** the stop has selected (or native unit + "(enter cost & retail to compare)" when value is null).
- Discount controls `.opt-disc` (smaller than the hero): a type toggle (`C+`/`R-`) `data-opt-type`, a value input `data-opt-value`, both `data-agg`.
- Agree/Decline `data-opt-status` (`Yes`/`No`).
- The firm statement renders once at top `.opt-firm`: "If you do not respond, you will be automatically enrolled at the recommended discount for each aggregator below."

- [ ] **Step 1: Write failing test** — render a 2-aggregator fixture with cost 3.00, retail 3.40, choices defaulting to recommended. Assert:
  - one `.opt-card` per aggregator; `.opt-firm` present once.
  - hero `.opt-profit` contains `28¢` for a Retail−12 default.
  - switching a choice to `{type:'C+',value:'28'}` re-renders hero `28¢` and `.opt-rec` shows `Cost +` (same unit), not `Retail −`.
  - profit-dominant: assert `.opt-profit` font-size rule is larger than `.opt-disc` input (string check the CSS).

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `render()` + the CSS (`.opt-profit{font-size:30px;font-weight:800}` clearly larger than controls). Recompute hero + rec from current `cost/retail` inputs and `choices`.

- [ ] **Step 4: Run → PASS.** `node --check`.

- [ ] **Step 5: Commit** `feat(optin): aggregator cards with hero profit + unit re-anchoring`.

---

## Task 4: Wire inputs + submit (build payload, call submit_optin, confirm)

**Files:**
- Modify: `truck-stop-optin.html`
- Test: `C:/tmp/optin_submit.js`

**Interfaces:**
- Produces: `OPTIN.__test.buildChoices(stop, aggregators, choices)` → array of `{aggregator_id,status,discount_type,retail_minus,cost_plus}`. Rules: a card the stop **touched** → its status/type/value; an **untouched** card → `status:'No Response'` + the aggregator's recommended `discount_type` and value mapped into `retail_minus`/`cost_plus` (firm-statement default). `BO` not produced by the form (form is single-type per card). `OPTIN.__test.submit()` → captures `sb.rpc('submit_optin',{p_token, p_choices})`.

- [ ] **Step 1: Write failing test:**
  - `buildChoices` for a touched Cost+ card → `{discount_type:'C+', cost_plus:'<v>', retail_minus:''}`; touched Retail− → `{discount_type:'R-', retail_minus:'<v>', cost_plus:''}`.
  - untouched card → `{status:'No Response', discount_type:<rec>, …rec value…}`.
  - `submit()` calls `sb.rpc('submit_optin',{p_token:<token>, p_choices:<array>})` exactly once and shows the confirmation node (`#optDone` non-empty).

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** the delegated input handlers (type toggle, value, agree/decline, cost/retail → live re-render), `buildChoices`, and `submit()` → `sb.rpc('submit_optin', …)` → on `{error:null}` render a thank-you summary; on error show a retry message. Bind `init()` to read `?t`, `resolveStop`, render, or show the fallback "Store # + name" form.

- [ ] **Step 4: Run → PASS.** `node --check`.

- [ ] **Step 5: Commit** `feat(optin): submit via submit_optin RPC + confirmation + fallback identify`.

---

## DEPLOY STEP A (operational gate — NOT a code commit)

> **Prerequisite:** **Phase A1** is already applied and **Task 0 is green** (functions exist and
> validated). The opt-in page (Tasks 1–4) may deploy any time in this window — it's RPC-only
> and unaffected by grant changes.
>
> **HARD CONSTRAINT:** Apply **Phase A2** (the token-column lock) and deploy **Task 5** (planner
> explicit-column reads) **in the SAME deployment**. Phase A2 removes `select('*')` access to
> `agp_locations`; if the planner refactor isn't live simultaneously, the planner breaks. Order:
> finish + verify Task 5, then apply Phase A2 and push the planner **together** — Task 5 must not
> lag Phase A2 by even one push.

---

## Task 5: Planner — explicit-column `agp_locations` reads + `responded_at` mapping

**Files:**
- Modify: `aggregator-planner.html` (`sbSelectAll`/`fetchAllRemote`, `rowToLoc`, `locToRow`)
- Test: `C:/tmp/optin_planner_read.js`

**Interfaces:**
- Consumes: existing planner sync layer.
- Produces: `agp_locations` is read with an **explicit column list** `id,name,city,state,code,gs,ach,responded_at,updated_at` (NOT `*`, NOT `optin_token`). `rowToLoc` adds `responded_at`; `locToRow` does **not** write `responded_at` (form-owned) and never sends `optin_token`.

- [ ] **Step 1: Failing test** — extend the planner harness: a mock whose `agp_locations` select records the requested column string; assert it equals `id,name,city,state,code,gs,ach,responded_at,updated_at` and never `*`; assert `rowToLoc({...,responded_at:'2026-06-23T00:00:00Z'})` carries `responded_at`; assert `locToRow(loc)` has no `optin_token` key and no `responded_at` key.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — in `sbSelectAll`, special-case `agp_locations` to `.select('id,name,city,state,code,gs,ach,responded_at,updated_at')`; other tables keep `*`. Add `responded_at:r.responded_at||null` to `rowToLoc`; leave it out of `locToRow`.

- [ ] **Step 4: Run → PASS.** `node --check`.

- [ ] **Step 5: Commit** `refactor(planner): explicit-column agp_locations reads (token excluded) + responded_at` — **ship with DEPLOY STEP A.**

---

## Task 6: Planner — `show_on_form` toggle (Aggregator Workspace)

**Files:**
- Modify: `aggregator-planner.html` (`aggToRow`/`rowToAgg`, seed `A()`, workspace render)
- Test: `C:/tmp/optin_showform.js`

**Interfaces:**
- Produces: aggregator object gains `showOnForm:boolean` (default false; default **true** for the launch aggregators in seed if desired, else all false). `aggToRow` adds `show_on_form:!!a.showOnForm`; `rowToAgg` adds `showOnForm:r.show_on_form===true`. A checkbox in the Aggregator Workspace header bound to it, committing on change.

- [ ] **Step 1: Failing test** — `aggToRow` includes `show_on_form`; `rowToAgg({show_on_form:true})` → `showOnForm:true`; rendered workspace contains a `data-aggf-bool="showOnForm"` (or equivalent) checkbox reflecting state.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** the mapping + a checkbox in `renderAggWorkspace` head; handle its change in `onFieldChange` (set `a.showOnForm`, `commit()`, `renderPipeline()`), default `showOnForm:false` in seed `A()` and migrate backfill.

- [ ] **Step 4: Run → PASS.** `node --check`.

- [ ] **Step 5: Commit** `feat(planner): show_on_form toggle per aggregator (drives opt-in form)`.

---

## Task 7: Planner — Responded column + Copy opt-in link

**Files:**
- Modify: `aggregator-planner.html` (`renderLocations` COLS + rows, bind handler)
- Test: `C:/tmp/optin_planner_ui.js`

**Interfaces:**
- Produces: a **Responded** column in the Location Opt-In table — ✓ + `fmtDate(responded_at)` when set, else "No response" (sortable via `valFor` key `responded`). A per-row **"link"** action `data-optin-link="<locId>"` that calls `sb.rpc('get_optin_token',{p_loc_id})` and copies `<origin>/truck-stop-optin.html?t=<token>`. Because `get_optin_token` is `authenticated`-only, under the (pre-auth) anon planner it returns a permission error → show toast "Sign in to copy opt-in links" (functional after Task 9).

- [ ] **Step 1: Failing test** — render Motive with one loc having `responded_at` set and one not; assert the table shows `✓` for the first and `No response` for the second; assert a `data-optin-link` control exists per row; with a mock `get_optin_token` returning `'abc'`, the copy handler builds a URL ending `truck-stop-optin.html?t=abc`.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** the COLS entry + cell, the `valFor` `responded` case, and a delegated click handler for `data-optin-link` that `await sb.rpc('get_optin_token',…)`, builds the URL, `navigator.clipboard.writeText`, toasts success or the sign-in hint on error.

- [ ] **Step 4: Run → PASS.** `node --check`.

- [ ] **Step 5: Commit** `feat(planner): responded indicator + copy opt-in link`.

---

## Task 8: Document schema of record

**Files:**
- Modify: `supabase/agp_schema.sql`

- [ ] **Step 1:** Add the three columns (`agp_aggregators.show_on_form`, `agp_locations.responded_at`, `agp_locations.optin_token`) and a comment block listing the four functions + the column-grant/token rule, pointing to `agp_optin_portal.sql` as the authoritative migration.
- [ ] **Step 2: Commit** `docs(supabase): document opt-in portal columns + functions in schema of record`.

---

## Task 9: Planner email+password Supabase Auth  ⟵ GATE (blocks Phase B + links)

**Files:**
- Modify: `aggregator-planner.html` (auth gate around `getRoadysSB`/`syncInit`)
- Test: manual + `C:/tmp/optin_auth.js` (client-session shape only)

> **GATE:** This task BLOCKS DEPLOY STEP B and all link distribution. Do not apply Phase B or email any link until this is live and the admin team can sign in.

**Interfaces:**
- Produces: a sign-in screen (email + password) shown before the planner loads; on success the planner uses the **authenticated** session for all Supabase calls (`supabase.auth.signInWithPassword`). Use email+password — **not magic links** (per the gs-command-center magic-link revert). Sign-out control.

- [ ] **Step 1:** Write a test asserting that, when no session exists, `syncInit` does not call table reads and the auth screen renders; when a (mock) session exists, sync proceeds. (Auth UI is verified manually in-browser.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the auth gate: on load, `supabase.auth.getSession()`; if none, render the email+password form and `signInWithPassword` on submit; gate `syncInit()` behind a session; add sign-out. Confirm the copy-link (Task 7) now works under the authenticated role.
- [ ] **Step 4: Run → PASS** + manual sign-in check.
- [ ] **Step 5: Commit** `feat(planner): email+password auth gate (authenticated role)`.

---

## DEPLOY STEP B (operational gate — after Task 9 is LIVE)

> Apply **Phase B** of `supabase/agp_optin_portal.sql` (anon strip + PUBLIC→authenticated policy re-scope + function revokes). Verify with the four verification queries: anon holds **no** `agp_*` table privilege, policies are `{authenticated}`, anon executes **only** the four form RPCs. Smoke-test: planner (signed in) reads/writes fine; opt-in page resolves + submits fine; an unauthenticated `agp_locations` REST call is denied. **Only after this passes:** email opt-in links to stops.

---

## Self-Review

**Spec coverage:** `submit_optin` server-side boundary (T0) · token access (T2) · fallback (T2/T4) · firm statement (T3) · calculator + profit math (T1) · hero profit (T3) · re-anchoring (T1/T3) · descriptions + fleets (T3 via `list_optin_aggregators`) · change type+value (T3) · submit→cloud (T4) · `show_on_form` toggle (T6) · responded indicator (T7) · copy-link (T7) · explicit-column read (T5) · migration Phase A1/A2/B (gate 0 / DEPLOY A / DEPLOY B) · planner auth (T9) · schema doc (T8). No gaps.

**Placeholder scan:** none — every code step shows code; tests show assertions.

**Type consistency:** `profitPerGal`/`reanchor` signatures used identically in T1/T3; `buildChoices` shape matches `submit_optin`'s expected `p_choices` keys (`aggregator_id,status,discount_type,retail_minus,cost_plus`); planner mappings (`rowToLoc`/`locToRow`/`aggToRow`/`rowToAgg`) named consistently with the existing file.

**Gate visibility:** the GATE SEQUENCE + SAME-DEPLOY constraint are in Global Constraints and repeated at DEPLOY STEP A, Task 9, and DEPLOY STEP B so they can't be missed mid-execution.
