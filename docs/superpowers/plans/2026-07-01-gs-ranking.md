# Growth Strategist Ranking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-contained "Growth Strategist Ranking" page to `index.html` that scores each GS on the share of measurable program cells (green ÷ measurable, %), ranks GSs, supports per-stop drill-down, monthly snapshots, and full master-mode cell editing.

**Architecture:** One new page in `index.html` styled like the GS Metrics page. Embedded JS seeds (`GS_TERRITORY`, `AGG_DISCOUNTS_BY_STOP`) plus the file's existing fuel/rewards seeds and live vendor enrollment feed a pure scoring engine `gsrCompute(gs, month)`. A thin storage layer holds per-cell overrides and monthly snapshots in localStorage (Supabase-shaped). Rendering: a GS view (scorecard + per-stop expand) and a Leadership view (ranking table). Master mode (`body.dash-edit-mode`) makes every cell editable.

**Tech Stack:** Vanilla ES2019 inline JS in `index.html`; localStorage; no build step, no test runner. Verification = `node vm.Script` syntax check + node functional harnesses that eval extracted functions. Line endings are CRLF — preserve them.

## Global Constraints

- All code lands in `C:\Users\JasonVega\Desktop\GitHub Clone\roadys-command-center\index.html`. Data-gen scripts live in scratchpad.
- Score = `Σ green ÷ Σ measurable cells` (mean of 1/0 cells), expressed %; rank descending. NOT programs-per-stop, NOT average-of-averages.
- Grey/no-data cells are excluded from every denominator (overall, section, per-metric). Same rule everywhere.
- Grey metric with ≥1 master-entered value for the month becomes measurable that month; its blank cells then count as red.
- Snapshots carry `metricSetVersion` = the sorted list of measurable metric keys used that month.
- Vendor Top-8 by ID: Cintas/Entegra V00134, Sysco V00010, Lynco V00022, DAS V00036, Truck Parking Club V00112, Farmer Brothers V00002, Coca-Cola V00033, Heartland V00232.
- Aggregator name map (data→canonical): `RTS Carrier Services`→RTS, QPN→QPN, TCS→TCS, `OOIDA`→OOIDA, `TSD Logistics`→TSD, `Prime Inc. Advantage +`→"Prime Inc. Advantage +", Motive→Motive, `Greenlane`→"Green Lane", `Load Connex`→"Load Connex", AtoB→AtoB.
- Everything gets an `gsr` prefix (functions, ids, storage keys) to avoid collisions with existing code.
- Only edit `index.html`; leave the unrelated uncommitted files alone. Commit after each task. Push to `main` via `git push origin sync-gs:main`.

---

## Metric definitions (shared reference for all tasks)

`GSR_METRICS` — ordered list of sections; each section has rows; each row: `{key, label, section, measurable, source}`.

```
Legacy Aggregators (section 'legacy'):
  agg:RTS   (measurable, source agg 'RTS')
  agg:QPN   (measurable, agg 'QPN')
  agg:TCS   (measurable, agg 'TCS')
  agg:Edge  (grey)
  agg:TATS  (grey)
  agg:OOIDA (measurable, agg 'OOIDA')
  agg:TSD   (measurable, agg 'TSD')
  agg:RXO   (grey)
  agg:OTP   (grey)  label "OTP Capital"
  agg:Prime (measurable, agg 'Prime Inc. Advantage +')  label "Prime Inc. Advantage +"
New Aggregators (section 'new'):
  agg:Motive (measurable, agg 'Motive')
  agg:HaulPay (grey)
  agg:GreenLane (measurable, agg 'Green Lane')
  agg:LoadConnex (measurable, agg 'Load Connex')
  agg:TOA (grey)
  agg:CloudTrucks (grey)
  agg:AtoB (measurable, agg 'AtoB')
  agg:Onramp (grey)
  agg:Octane (grey)
Fleets (section 'fleets'):  fleets (measurable, source fuel.fl>0)
Fuelman (section 'fuelman'): fuelman (grey)
R-Check (section 'rcheck'):  rcheck (grey)
Rewards (section 'rewards'): rewards (measurable, source rewards.g>0)
Rewards Multipliers (section 'rwdmult'): rwdmult (grey)
Merchant Console (section 'mconsole'): mconsole (grey)
Vendor Programs (section 'vendor'):
  vend:V00134 (measurable) "Cintas (via Entegra)"
  vend:V00010 (measurable) "Sysco"
  vend:V00022 (measurable) "Lynco"
  vend:V00036 (measurable) "DAS"
  vend:V00112 (measurable) "Truck Parking Club"
  vend:V00002 (measurable) "Farmer Brothers"
  vend:V00033 (measurable) "Coca-Cola"
  vend:V00232 (measurable) "Heartland"
Retention Rate (section 'retention'): retention (grey)
```

Auto-source lookups (per stop `sid`, month `m`):
- `agg`: `(AGG_DISCOUNTS_BY_STOP[sid]||[]).some(a => a[0] === canonicalName)` → 1/0.
- `fleets`: fuel seed for `m` (`gsrFuelSeed(m)[sid]?.fl > 0`).
- `rewards`: rewards seed for `m` (`gsrRewardsSeed(m)[sid]?.g > 0`).
- `vend:Vxxxx`: live vendor enrollment — `gsrVendorEnrolled(sid, 'Vxxxx')` reads the file's vendor-enrollment map; if unavailable returns null (→ treat as red, still measurable, since vendor enrollment is a real source).
- grey rows: auto value = null (no source) → grey unless a master override exists.

A cell's resolved value: `override ?? auto`. `state` = `'green'` (1), `'red'` (0), or `'grey'` (null and metric not active).

---

### Task 1: Generate and embed the data seeds (GS_TERRITORY + AGG_DISCOUNTS_BY_STOP)

**Files:**
- Create: `scratchpad/gen-gsr-seeds.js` (generator)
- Modify: `index.html` (insert two seed consts near the other seeds, after the `FUEL_OVERLAY` block)

**Interfaces:**
- Produces globals `GS_TERRITORY` (`{ [gsName]: { stops: [{id, name}] } }`) and `AGG_DISCOUNTS_BY_STOP` (`{ [sid]: [[aggName, type, rm, cp], …] }`, same shape as gs-command-center).

- [ ] **Step 1: Write the generator** `scratchpad/gen-gsr-seeds.js`

```js
const fs=require('fs');
const dl='C:\\Users\\JasonVega\\Downloads';
const out='<scratchpad>';
// GS_TERRITORY from the gallon report (June rows carry the current GS assignment)
const rows=fs.readFileSync(dl+'\\gallon-report-all-12mo-20260701.csv','utf8').split(/\r?\n/).slice(1).filter(Boolean).map(l=>l.split(','));
const terr={};
for(const r of rows){ if(r[3]!=='2026-06') continue; const gs=(r[2]||'').trim(); if(!gs||gs==='(none)') continue; const id=r[0].trim(); (terr[gs]=terr[gs]||{}) ; (terr[gs].stops=terr[gs].stops||[]).push({id, name:(r[1]||'').trim()}); }
for(const g in terr) terr[g].stops.sort((a,b)=>a.name.localeCompare(b.name));
const gsJs='const GS_TERRITORY = '+JSON.stringify(terr,null,0)+';';
fs.writeFileSync(out+'\\gsr-territory.js', gsJs.replace(/\},"/g,'},\n  "'), 'utf8');
// AGG_DISCOUNTS_BY_STOP: reuse the already-generated seed file from the earlier task
fs.copyFileSync(out+'\\agg-seed2.js', out+'\\gsr-agg.js');
console.log('GS count', Object.keys(terr).length, 'stops', Object.values(terr).reduce((s,g)=>s+g.stops.length,0));
```

- [ ] **Step 2: Run it**

Run: `node scratchpad/gen-gsr-seeds.js`
Expected: prints `GS count 6 stops 218` (±; ignore `(none)`/Nathan single-stop).

- [ ] **Step 3: Embed both seeds into index.html**

Insert after the `// ── FUEL_OVERLAY:BODY_END ──` line, wrapped in sentinels:
`// ── GSR_SEEDS:BODY_START ──` / `const GS_TERRITORY = {…};` / `const AGG_DISCOUNTS_BY_STOP = {…};` / `// ── GSR_SEEDS:BODY_END ──`.
Use a node injector with **function replacement** (`html.replace(anchor, () => block)`) or `split/join` — never a raw string replacement (the `$` in data breaks String.replace). Assert the anchor matched exactly once.

- [ ] **Step 4: Syntax check**

Run the standard node `vm.Script` inline-script check on `index.html`.
Expected: `blocks 1 errors 0`. Also assert `html.includes('const GS_TERRITORY')` and `const AGG_DISCOUNTS_BY_STOP`.

- [ ] **Step 5: Commit**

```bash
git add index.html && git commit -m "feat(gsr): embed GS_TERRITORY + AGG_DISCOUNTS_BY_STOP seeds"
```

---

### Task 2: Metric registry + scoring engine `gsrCompute`

**Files:**
- Modify: `index.html` (add a `<script>`-scoped block: `GSR_METRICS`, source helpers, `gsrCompute`)
- Test: `scratchpad/test-gsr-compute.js`

**Interfaces:**
- Consumes: `GS_TERRITORY`, `AGG_DISCOUNTS_BY_STOP`, `gsrFuelSeed(m)`, `gsrRewardsSeed(m)`, `gsrVendorEnrolled(sid,vid)`, `gsrGetOverride(gs,sid,key,m)`.
- Produces: `gsrCompute(gs, month)` →
  ```
  { gs, month,
    metrics: [ {key,label,section,measurable, active, cells:{sid:{state:'green'|'red'|'grey', v:0|1|null}}, greenStops, measStops, pct} ],
    sections: [ {section, label, green, meas, pct} ],
    stops: [{id,name}],
    perStop: {sid:{green, meas, pct}},
    overall: {green, meas, pct},
    metricSetVersion: 'gsr:key,key,…' }
  ```
  `measurable` = static flag; `active` = measurable OR (grey with ≥1 override this month). Denominators count only `active` rows. `pct` = green/meas (0 if meas==0).

- [ ] **Step 1: Write the failing functional test** `scratchpad/test-gsr-compute.js`

```js
// Harness: define stubs, eval the gsrCompute source pulled from index.html, assert math.
const assert=require('assert');
global.GS_TERRITORY={ TGS:{stops:[{id:'S1',name:'a'},{id:'S2',name:'b'}]} };
global.AGG_DISCOUNTS_BY_STOP={ S1:[['RTS','R-',-0.1,0]], S2:[] };
global.gsrFuelSeed=()=>({S1:{fl:5},S2:{fl:0}});
global.gsrRewardsSeed=()=>({S1:{g:100},S2:{g:0}});
global.gsrVendorEnrolled=(sid,vid)=> (sid==='S1'&&vid==='V00010');
let OV={}; global.gsrGetOverride=(gs,sid,key,m)=>OV[[gs,sid,key,m].join('|')];
// eval gsrCompute + GSR_METRICS source (paste from index.html between GSR_ENGINE sentinels)
require('fs'); // load + eval here in Step 3
```

- [ ] **Step 2: Implement `GSR_METRICS` + helpers + `gsrCompute` in index.html**

Wrap in `// ── GSR_ENGINE:BODY_START ──` / `… ── GSR_ENGINE:BODY_END ──`. Key logic:

```js
const GSR_AGG_NAME = {RTS:'RTS',QPN:'QPN',TCS:'TCS',OOIDA:'OOIDA',TSD:'TSD',Prime:'Prime Inc. Advantage +',Motive:'Motive',GreenLane:'Green Lane',LoadConnex:'Load Connex',AtoB:'AtoB'};
const GSR_METRICS = [ /* the registry from "Metric definitions" — one entry per row with key,label,section,sectionLabel,measurable,kind,arg */ ];
function gsrAuto(row, sid, m){
  if(row.kind==='agg'){ const nm=GSR_AGG_NAME[row.arg]; return (AGG_DISCOUNTS_BY_STOP[sid]||[]).some(a=>a[0]===nm)?1:0; }
  if(row.kind==='fleets'){ return (gsrFuelSeed(m)[sid]?.fl>0)?1:0; }
  if(row.kind==='rewards'){ return (gsrRewardsSeed(m)[sid]?.g>0)?1:0; }
  if(row.kind==='vend'){ const v=gsrVendorEnrolled(sid,row.arg); return v==null?0:(v?1:0); }
  return null; // grey rows have no auto source
}
function gsrCompute(gs, m){
  const stops=(GS_TERRITORY[gs]?.stops)||[];
  // first pass: does each grey row have any override this month? -> active
  const metrics=GSR_METRICS.map(row=>{
    const cells={}; let anyOverride=false;
    for(const st of stops){
      const ov=gsrGetOverride(gs, st.id, row.key, m);
      if(ov!=null) anyOverride=true;
      const auto=gsrAuto(row, st.id, m);
      const v = ov!=null ? ov : auto;
      cells[st.id]={ v };
    }
    const active = row.measurable || anyOverride;
    let green=0, meas=0, greenStops=0;
    for(const st of stops){
      const c=cells[st.id];
      if(!active){ c.state='grey'; continue; }
      const val = c.v==null ? 0 : c.v; // active grey blanks -> red
      c.v=val; c.state=val? 'green':'red'; meas++; if(val){green++; greenStops++;}
    }
    return {key:row.key,label:row.label,section:row.section,sectionLabel:row.sectionLabel,measurable:row.measurable,active,cells,greenStops,measStops:active?stops.length:0,green,meas,pct:meas?green/meas:0};
  });
  // sections + overall + perStop
  const secMap={};
  for(const mx of metrics){ if(!mx.active) continue; const s=secMap[mx.section]=secMap[mx.section]||{section:mx.section,label:mx.sectionLabel,green:0,meas:0}; s.green+=mx.green; s.meas+=mx.meas; }
  const sections=Object.values(secMap).map(s=>({...s,pct:s.meas?s.green/s.meas:0}));
  const perStop={};
  for(const st of stops){ let g=0,me=0; for(const mx of metrics){ if(!mx.active) continue; const val=mx.cells[st.id].v; me++; if(val)g++; } perStop[st.id]={green:g,meas:me,pct:me?g/me:0}; }
  const green=metrics.reduce((a,mx)=>a+mx.green,0), meas=metrics.reduce((a,mx)=>a+mx.meas,0);
  const version='gsr:'+metrics.filter(mx=>mx.active).map(mx=>mx.key).sort().join(',');
  return {gs,month:m,metrics,sections,stops,perStop,overall:{green,meas,pct:meas?green/meas:0},metricSetVersion:version};
}
```

Add temporary default stubs so it loads before Task 3/UI wire real sources:
`gsrFuelSeed`, `gsrRewardsSeed`, `gsrVendorEnrolled`, `gsrGetOverride` — see Step 3 wiring.

- [ ] **Step 3: Wire the real source helpers** (in the same block)

```js
function gsrFuelSeed(m){ return (m==='2026-06'&&typeof FUEL_JUN_2026_DATA==='object')?FUEL_JUN_2026_DATA : (m==='2026-05'&&typeof FUEL_MAY_2026_DATA==='object')?FUEL_MAY_2026_DATA : (m==='2026-04'&&typeof FUEL_APR_2026_DATA==='object')?FUEL_APR_2026_DATA : {}; }
function gsrRewardsSeed(m){ const k='REWARDS_'+m.replace('-','_')+'_SEED'; try{ return (typeof window[k]==='object'&&window[k])||({}); }catch(e){ return {}; } }
// vendor enrollment: reuse the file's vp_enroll map (loaded from Supabase). If the
// per-stop map is VPE = {sid:{vid:true}}, else return null (measurable, red).
function gsrVendorEnrolled(sid, vid){ try{ const e=(typeof VPE==='object'&&VPE)?VPE[sid]:null; return e? !!e[vid] : false; }catch(_){ return false; } }
```
(During implementation, confirm the actual global name for the vendor-enrollment map in index.html and the rewards seed access; adjust `gsrRewardsSeed`/`gsrVendorEnrolled` to the real names. `gsrGetOverride` is defined in Task 3.)

- [ ] **Step 4: Finish + run the functional test**

Complete `scratchpad/test-gsr-compute.js` to eval the `GSR_ENGINE` block from index.html and assert:
```js
const r=gsrCompute('TGS','2026-06');
// S1: RTS green, fleets green, rewards green, Sysco(V00010) green = 4 green of measurable
// measurable rows = 20 (6 legacy meas +4 new meas +fleets +rewards +8 vendor). meas cells = 20*2=40.
assert.strictEqual(r.overall.meas, 40);
assert.strictEqual(r.overall.green, 4);      // only S1 hits RTS,fleets,rewards,Sysco
assert.ok(Math.abs(r.overall.pct - 4/40) < 1e-9);
assert.strictEqual(r.metrics.find(x=>x.key==='fuelman').cells['S1'].state, 'grey');
console.log('OK', r.overall);
```
Run: `node scratchpad/test-gsr-compute.js` → Expected: `OK { green:4, meas:40, pct:0.1 }`.

- [ ] **Step 5: Syntax check + commit**

Node `vm.Script` check → `errors 0`.
```bash
git add index.html && git commit -m "feat(gsr): metric registry + scoring engine (green ÷ measurable)"
```

---

### Task 3: Overrides + monthly snapshots storage

**Files:**
- Modify: `index.html` (storage helpers in the GSR block)
- Test: `scratchpad/test-gsr-store.js`

**Interfaces:**
- Produces: `gsrGetOverride(gs,sid,key,m)`, `gsrSetOverride(gs,sid,key,m,val)` (val 0|1|null; null clears), `gsrSaveSnapshot(result)`, `gsrLoadSnapshots()`, `gsrSnapshot(gs,m)`, `gsrPrevMonth(m)`, `gsrYtdAvg(gs, m)`.

- [ ] **Step 1: Write the failing test** `scratchpad/test-gsr-store.js`

```js
const assert=require('assert');
const store={}; global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k]};
// eval the GSR storage fns from index.html here
gsrSetOverride('G','S1','fuelman','2026-06',1);
assert.strictEqual(gsrGetOverride('G','S1','fuelman','2026-06'),1);
gsrSetOverride('G','S1','fuelman','2026-06',null);
assert.strictEqual(gsrGetOverride('G','S1','fuelman','2026-06'),undefined);
gsrSaveSnapshot({gs:'G',month:'2026-06',overall:{pct:0.5},metricSetVersion:'gsr:a'});
assert.strictEqual(gsrSnapshot('G','2026-06').overall.pct,0.5);
assert.strictEqual(gsrPrevMonth('2026-06'),'2026-05');
console.log('OK');
```

- [ ] **Step 2: Implement**

```js
const GSR_OV_KEY='roadys_gsr_overrides', GSR_SNAP_KEY='roadys_gsr_snapshots';
function gsrLoadJSON(k){ try{ return JSON.parse(localStorage.getItem(k)||'{}'); }catch(e){ return {}; } }
function gsrSaveJSON(k,o){ try{ localStorage.setItem(k, JSON.stringify(o)); }catch(e){} }
function gsrOvId(gs,sid,key,m){ return [gs,sid,key,m].join('|'); }
function gsrGetOverride(gs,sid,key,m){ const v=gsrLoadJSON(GSR_OV_KEY)[gsrOvId(gs,sid,key,m)]; return v==null?undefined:v; }
function gsrSetOverride(gs,sid,key,m,val){ const o=gsrLoadJSON(GSR_OV_KEY); const id=gsrOvId(gs,sid,key,m); if(val==null) delete o[id]; else o[id]=val?1:0; gsrSaveJSON(GSR_OV_KEY,o); }
function gsrSaveSnapshot(r){ const o=gsrLoadJSON(GSR_SNAP_KEY); o[r.gs+'|'+r.month]={gs:r.gs,month:r.month,pct:r.overall.pct,green:r.overall.green,meas:r.overall.meas,metricSetVersion:r.metricSetVersion,ts:Date.now()}; if(r.overall){ o[r.gs+'|'+r.month].overall={pct:r.overall.pct}; } gsrSaveJSON(GSR_SNAP_KEY,o); }
function gsrLoadSnapshots(){ return gsrLoadJSON(GSR_SNAP_KEY); }
function gsrSnapshot(gs,m){ return gsrLoadSnapshots()[gs+'|'+m]||null; }
function gsrPrevMonth(m){ const [y,mo]=m.split('-').map(Number); const d=new Date(y,mo-2,1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function gsrYtdAvg(gs,m){ const y=m.split('-')[0]; const snaps=gsrLoadSnapshots(); const vals=Object.values(snaps).filter(s=>s.gs===gs&&s.month.startsWith(y)&&s.month<=m).map(s=>s.pct); return vals.length? vals.reduce((a,b)=>a+b,0)/vals.length : null; }
```
Note: `Date.now()` is fine in the browser (only workflow scripts forbid it).

- [ ] **Step 3: Run test** → `node scratchpad/test-gsr-store.js` → `OK`.
- [ ] **Step 4: Syntax check + commit**
```bash
git add index.html && git commit -m "feat(gsr): overrides + monthly snapshot storage"
```

---

### Task 4: Page scaffold + nav + dispatch

**Files:** Modify `index.html` (nav item, page container, PAGES entry, renderPage dispatch, `renderGSRanking` stub).

**Interfaces:** Produces the `pg-gs-ranking` page, nav entry, and `renderGSRanking()` entry point.

- [ ] **Step 1:** Add nav entry after the Growth Strategist Metrics nav block (around line 850):
```html
<div class="nav-parent" data-nav-grp-toggle="gsranking" onclick="navDirect('gs-ranking',this,'gsranking')"><span class="ni-icon">🏆</span>Growth Strategist Ranking<span class="expand-icon">▶</span></div>
<div class="nav-children" data-nav-grp-children="gsranking"></div>
```
- [ ] **Step 2:** Add the page container after the GS Metrics page (`</div>` closing `#pg-gs-metrics`, ~line 1011):
```html
<div class="page" id="pg-gs-ranking">
  <div class="sec-hdr"><div class="sec-title">GROWTH STRATEGIST RANKING</div><span class="badge ba" id="gsr-period">—</span></div>
  <div id="gsr-controls" style="margin-bottom:14px"></div>
  <div id="gsr-body"></div>
</div>
```
- [ ] **Step 3:** Add to PAGES list (~line 9785): `{id:'gs-ranking',icon:'🏆',name:'Growth Strategist Ranking'},`
- [ ] **Step 4:** Add dispatch in `renderPage` (~line 3177 area): `else if(id==='gs-ranking') renderGSRanking();`
- [ ] **Step 5:** Add stub `function renderGSRanking(){ const b=document.getElementById('gsr-body'); if(b) b.textContent='…'; }`
- [ ] **Step 6:** Syntax check (`errors 0`); commit `feat(gsr): page scaffold + nav + dispatch`.

---

### Task 5: GS scorecard view (renderGSRanking)

**Files:** Modify `index.html` (`renderGSRanking`, `gsrRenderScorecard`, helpers).

**Interfaces:** Consumes `gsrCompute`. Produces the GS view: a GS `<select>` (+ "All / Leadership" option), a month display (current = `getM()` from the page's `#ms`, or default June), and a scorecard table.

- [ ] **Step 1:** `renderGSRanking()`:
  - Build controls: GS dropdown from `Object.keys(GS_TERRITORY).sort()` plus `All (Leadership)`; persist selection in `localStorage['roadys_gsr_gs']`.
  - Month = `currentMonthKey`-equivalent; index uses the prior-calendar-month default (June). Reuse the page `#ms` value if present, else `'2026-06'`.
  - If GS selected → `gsrRenderScorecard(gs, m)`; if All → `gsrRenderLeaderboard(m)` (Task 6).
- [ ] **Step 2:** `gsrRenderScorecard(gs,m)` renders, from `gsrCompute(gs,m)`:
  - Header: GS name, overall `pct` as % + `green/meas`, rank vs other GSs (compute all GSs' pct, sort).
  - A table grouped by section: a section header row with the section `pct` (green/meas · %); then one row per metric showing label + "x of xx · %" (`greenStops/meas Stops`) for measurable, or a greyed "no data — editable" for grey/inactive rows. Color the % chip green scale.
  - An expandable **stops** panel: a row per stop with a ▶ arrow; expanding shows that stop's per-metric ✓ (green) / ✗ (red) list (skip grey). Use the existing collapse pattern (toggle a hidden div).
  - Reuse GS Metrics styling classes (`.dt`, chips, `var(--green)/var(--red)/var(--dim)`).
- [ ] **Step 3:** Syntax check; manual: open page, pick a GS, verify counts and a spot-check stop matches AGG_DISCOUNTS_BY_STOP.
- [ ] **Step 4:** Commit `feat(gsr): GS scorecard view with per-stop expand`.

---

### Task 6: Leadership ranking view

**Files:** Modify `index.html` (`gsrRenderLeaderboard`).

**Interfaces:** Consumes `gsrCompute`, `gsrPrevMonth`, `gsrSnapshot`, `gsrYtdAvg`.

- [ ] **Step 1:** `gsrRenderLeaderboard(m)`:
  - For each GS: `cur = gsrCompute(gs,m).overall.pct`; `prev = gsrSnapshot(gs, gsrPrevMonth(m))?.pct`; `ytd = gsrYtdAvg(gs,m)`.
  - Table sorted by `cur` desc: Rank | GS | This month % | Prev month % (or —) | YTD avg % (or —) | green/meas. Movement arrow vs prev.
  - Each row expandable → inline `gsrRenderScorecard(gs,m)` beneath it.
- [ ] **Step 2:** Syntax check; manual: All view shows 6 GSs ranked.
- [ ] **Step 3:** Commit `feat(gsr): leadership ranking view (month / prev / YTD)`.

---

### Task 7: Master-mode cell editing

**Files:** Modify `index.html` (`gsrToggleCell`, edit affordances in scorecard render, activation).

**Interfaces:** Consumes `gsrSetOverride`, `gsrCompute`. Produces click-to-edit cells gated on `document.body.classList.contains('dash-edit-mode')`.

- [ ] **Step 1:** In `gsrRenderScorecard`, when `body.dash-edit-mode`, render each stop×metric cell (in the per-stop expansion and/or an editable matrix) as a clickable control cycling **green → red → clear(auto/grey)** via `onclick="gsrToggleCell('${gs}','${sid}','${key}','${m}')"`.
- [ ] **Step 2:** `gsrToggleCell(gs,sid,key,m)`: read current resolved value; cycle override 1→0→null; call `gsrSetOverride`; re-render scorecard. A grey metric that receives any override becomes active on next compute (already handled by `gsrCompute`).
- [ ] **Step 3:** Show a small "editing" hint + the current metric-set version when in edit mode. Non-edit mode = read-only (no onclick).
- [ ] **Step 4:** Syntax check; manual: toggle a Fuelman cell in edit mode → metric activates, denominators/rank update, persists across reload.
- [ ] **Step 5:** Commit `feat(gsr): master-mode cell editing + grey-metric activation`.

---

### Task 8: Month control + snapshot save + polish

**Files:** Modify `index.html` (month picker in `#gsr-controls`, save-snapshot on compute).

- [ ] **Step 1:** Add a month `<select>` in `#gsr-controls` (reuse the MOS list; default to the prior-calendar-month = current data month). On change, re-render for that month.
- [ ] **Step 2:** On each `renderGSRanking` compute, `gsrSaveSnapshot(result)` for every GS for the shown month (so prev/YTD accumulate). Guard: only save completed months.
- [ ] **Step 3:** Set `#gsr-period` badge to the month label; ensure the page shows on nav.
- [ ] **Step 4:** Full node `vm.Script` syntax check; manual pass across GS view, leadership view, edit mode.
- [ ] **Step 5:** Commit `feat(gsr): month picker + snapshot persistence` and push `git push origin sync-gs:main`.

---

## Self-Review

- **Spec coverage:** placement/nav (T4) ✓; data layer (T1) ✓; metric set incl. grey/measurable + mapping (T2) ✓; scoring green÷measurable, grey excluded (T2) ✓; GS view + per-stop expand (T5) ✓; leadership month/prev/YTD (T6) ✓; snapshots + metricSetVersion (T2/T3/T8) ✓; master-mode editing + grey activation (T7) ✓; Top-8 vendors by ID (constraints/T2) ✓.
- **Placeholders:** source-helper globals (`VPE`, rewards seed access) are the only "confirm exact name at implementation" notes — resolved in T2 Step 3 by grepping index.html for the real vendor-enrollment/rewards globals before finalizing; not shipped as TODOs.
- **Type consistency:** `gsrCompute` return shape is consumed identically by T5/T6/T7; storage fn names match across T3/T6/T7/T8; `key`/`sid`/`m` argument order consistent in override fns.
