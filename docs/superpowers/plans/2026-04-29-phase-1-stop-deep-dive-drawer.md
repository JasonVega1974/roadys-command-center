# GS Command Center Phase 1 — Stop Deep-Dive Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `#site-drawer` in `gs-command-center.html` with three new sections (Membership & Site Contact, Fuel Business — current month, Vendor Programs stub) and add two new entry points (My Stops table on Per-GS Dashboard, header global stop search) so a GS can drill into any stop in their territory and edit per-stop site-manager / membership data.

**Architecture:** Single-file edits to `gs-command-center.html`. The drawer DOM, CSS, and `openSiteDrawer(siteId)` already exist (line 1617) — Phase 1 inserts new `drawer-section` blocks into that function and adds new helpers above it. Per-stop GS-editable data persists to a new `gs_cmd_<gsName>_stopdata` localStorage key, hooked into the existing `loadData()` / `saveData()` cycle. Fuel breakdown reads `roadys_fuel.GD[stopId][YYYY-MM]` arrays already in source data.

**Tech Stack:** Pure HTML/JS/CSS, no build, no test framework. Verification = (1) `node -e "new Function(<extracted-script>)"` syntax check, (2) manual browser smoke test against `gs-command-center.html` opened directly from disk.

**Spec:** [docs/superpowers/specs/2026-04-29-gs-command-center-management-deepdive.md](../specs/2026-04-29-gs-command-center-management-deepdive.md), Phase 1 section.

**Phase boundary:** Phases 2–5 are out of scope for this plan and will get their own plans. The Vendor Programs section stub built here is intentionally minimal — it lights up in Phase 2.

---

## File Structure

**Modify only:** `gs-command-center.html`

Six insertion points in this single file. Locate each by grepping for the function/marker name; line numbers will drift as edits accumulate so don't rely on them.

| Insertion point | What we add there | Locator |
|---|---|---|
| `<style>` block (top of file) | One CSS class for fuel-tile grid; ~10 lines | `grep -n "#site-drawer{" gs-command-center.html` → CSS block runs around there |
| Topbar HTML | Global stop search input | `grep -n "topbar-user" gs-command-center.html` → insert before that block |
| Data-layer globals (around line 720) | `let stopdata = {};` declaration | `grep -n "let activityLogs" gs-command-center.html` |
| `loadData()` function | Read `_stopdata` key into `stopdata` | `grep -n "function loadData" gs-command-center.html` |
| `saveData()` function | Write `_stopdata` key from `stopdata` | `grep -n "function saveData" gs-command-center.html` |
| Above `openSiteDrawer` | New helpers: `stopFleetGallons`, `stopAggregatorGallons`, `fmtTrendPill`, `loadStopRecord`, `saveStopRecord`, `drawerMembershipHTML`, `drawerFuelHTML`, `drawerVendorStubHTML`, `searchStopsForDrawer`, `attachStopSearchHandlers` | `grep -n "function openSiteDrawer" gs-command-center.html` |
| Inside `openSiteDrawer` | Three new `drawer-section` blocks inserted between Site Details and Calculations | Same locator |
| `renderPerGSDashboard` function | "My Stops" sortable table card appended to the template literal | `grep -n "function renderPerGSDashboard" gs-command-center.html` |
| `renderTaskCard` function | Stop-name span gets its own click handler (stops propagation, opens drawer) | `grep -n "function renderTaskCard" gs-command-center.html` |
| Init flow | Wire search input event listener | `grep -n "function loadData" gs-command-center.html` → look for the IIFE / DOMContentLoaded block that runs `loadData()` on startup |

---

## Task 1: Add drawer card-style CSS

**Files:**
- Modify: `gs-command-center.html` (CSS block, near `#site-drawer{...}` rule around line 117)

- [ ] **Step 1: Locate the CSS insertion point**

```bash
grep -n "#site-drawer.open" gs-command-center.html
```

Expected: a single match around line 118.

- [ ] **Step 2: Insert new CSS rules immediately after the `.drawer-section h4` rule**

Find the block:
```css
.drawer-section h4{font-size:.78em;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin-bottom:8px}
```

Append directly after it:
```css
.drawer-card{margin-top:14px;padding:12px;background:var(--bg3);border-radius:6px;border-left:3px solid var(--accent)}
.drawer-card.purple{border-left-color:var(--purple)}
.drawer-card.cyan{border-left-color:var(--cyan)}
.drawer-card.green{border-left-color:var(--green)}
.drawer-card-hd{font-size:.62em;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:10px}
.drawer-card.purple .drawer-card-hd{color:var(--purple)}
.drawer-card.cyan .drawer-card-hd{color:var(--cyan)}
.drawer-card.green .drawer-card-hd{color:var(--green)}
.fuel-tile-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.fuel-tile{background:var(--bg);padding:10px;border-radius:5px}
.fuel-tile-lbl{font-size:.58em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.fuel-tile-val{font-size:1.05em;font-weight:800;color:var(--text);margin-top:3px}
.fuel-tile-trend{font-size:.68em;margin-top:4px}
.fuel-tile-ytd{font-size:.6em;color:var(--muted);margin-top:2px}
.trend-up{color:var(--green)}
.trend-down{color:var(--red)}
.stop-search-wrap{position:relative;flex:0 0 240px}
.stop-search-input{width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:6px 10px;font-size:.82em}
.stop-search-input:focus{outline:none;border-color:var(--cyan)}
.stop-search-results{position:absolute;top:100%;left:0;right:0;margin-top:4px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;max-height:300px;overflow-y:auto;z-index:300;display:none;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.stop-search-results.show{display:block}
.stop-search-row{padding:8px 10px;cursor:pointer;font-size:.82em;border-bottom:1px solid var(--border)}
.stop-search-row:last-child{border-bottom:0}
.stop-search-row:hover,.stop-search-row.active{background:var(--bg3)}
.stop-search-row .ssn{font-weight:700}
.stop-search-row .sss{font-size:.72em;color:var(--muted);margin-left:6px}
.mystops-table{width:100%;border-collapse:collapse;font-size:.82em}
.mystops-table th{text-align:left;padding:6px 8px;font-size:.7em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border);background:var(--bg3);cursor:pointer;user-select:none}
.mystops-table td{padding:6px 8px;border-bottom:1px solid var(--border)}
.mystops-table tr:hover td{background:var(--bg3)}
.mystops-table tr.clickable{cursor:pointer}
```

- [ ] **Step 3: Reload the page in the browser, open the existing drawer (e.g. click any task) — verify the existing layout still renders correctly. No new sections yet, just a no-op CSS addition.**

Pass criteria: the existing drawer (Location, Site Details, Calculations, Activity Log) looks identical to before this commit.

---

## Task 2: Add `stopdata` global and hook into `loadData`/`saveData`

**Files:**
- Modify: `gs-command-center.html` (lines around 719-822)

- [ ] **Step 1: Add `stopdata` declaration alongside the other per-GS state globals**

Find:
```js
let activityLogs = {};  // {siteId: [{date,type,subject,notes}]}
let scheduledCalls = []; // [{siteId,date,time,contact,purpose}]
let siteExtras = {};     // {siteId: {hasRewards,vendorPrograms,contacts,notes}}
let criticalItems = [];  // [{siteId,reason,created}]
```

Add this line directly below those four:
```js
let stopdata = {};       // {siteId: {membershipCost,siteMgrName,siteMgrEmail,siteMgrPhone,notes:[],visits:[]}}
```

- [ ] **Step 2: Read `_stopdata` in `loadData`**

Find this block in `loadData()`:
```js
  try{tasks=JSON.parse(localStorage.getItem(k+'_tasks')||'[]');}catch(e){tasks=[];}
}
```

Add one line above the `}` so the block becomes:
```js
  try{tasks=JSON.parse(localStorage.getItem(k+'_tasks')||'[]');}catch(e){tasks=[];}
  try{stopdata=JSON.parse(localStorage.getItem(k+'_stopdata')||'{}');}catch(e){stopdata={};}
}
```

Also reset `stopdata={};` in the All-GS-mode early-exit. Find:
```js
  if(!active){
    activityLogs={}; scheduledCalls=[]; siteExtras={}; criticalItems=[]; tasks=[];
    return;
  }
```

Replace with:
```js
  if(!active){
    activityLogs={}; scheduledCalls=[]; siteExtras={}; criticalItems=[]; tasks=[]; stopdata={};
    return;
  }
```

- [ ] **Step 3: Write `_stopdata` in `saveData`**

Find this block in `saveData()`:
```js
  localStorage.setItem(k+'_tasks',JSON.stringify(tasks));
}
```

Add one line above the `}`:
```js
  localStorage.setItem(k+'_tasks',JSON.stringify(tasks));
  localStorage.setItem(k+'_stopdata',JSON.stringify(stopdata));
}
```

- [ ] **Step 4: Run syntax check**

Extract the inline script and parse with Node:

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('gs-command-center.html','utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/g);
if(!m) throw new Error('no script blocks');
m.forEach((blk,i) => {
  const js = blk.replace(/^<script>|<\/script>$/g,'');
  try { new Function(js); }
  catch(e){ throw new Error('block '+i+': '+e.message); }
});
console.log('syntax ok, '+m.length+' script blocks');
"
```

Expected output: `syntax ok, N script blocks` — no thrown error.

- [ ] **Step 5: Browser smoke test**

Open `gs-command-center.html`, log in as a GS (PIN 1001-1006), open browser devtools console, run:
```js
console.log('stopdata:', stopdata);
saveData();
console.log('localStorage key:', localStorage.getItem('gs_cmd_'+getActiveGS()+'_stopdata'));
```

Expected: `stopdata: {}` and a localStorage value of `'{}'`. Confirms the round-trip works.

---

## Task 3: Add fuel decomposition + trend helpers

**Files:**
- Modify: `gs-command-center.html` (insert above `function openSiteDrawer` around line 1617)

- [ ] **Step 1: Locate the insertion point**

```bash
grep -n "^function openSiteDrawer" gs-command-center.html
```

- [ ] **Step 2: Insert helpers above `openSiteDrawer`**

⚠️ Important: `currentMonthKey()` already exists at line 642 — do NOT re-declare it. Reuse the existing one. The other helpers below are net-new.

Add the following function block immediately above the `function openSiteDrawer(siteId){` line:

```js
// ─── Stop Deep-Dive helpers (Phase 1) ────────────────────────────────
function stopFleetGallons(stopId, m){
  try {
    const GD = loadFuelGD();
    const fl = GD[stopId]?.[m]?.fleets;
    if(!Array.isArray(fl)) return 0;
    return fl.reduce((s,f)=>s+(+f.gallons||0),0);
  } catch(e){ return 0; }
}
function stopAggregatorGallons(stopId, m){
  try {
    const GD = loadFuelGD();
    const ag = GD[stopId]?.[m]?.aggregators;
    if(!Array.isArray(ag)) return 0;
    return ag.reduce((s,a)=>s+(+a.gallons||0),0);
  } catch(e){ return 0; }
}
function stopTotalGallons(stopId, m){
  try {
    const GD = loadFuelGD();
    return +(GD[stopId]?.[m]?.gallons||0);
  } catch(e){ return 0; }
}
function fmtTrendPill(curr, prior, label){
  if(!prior || prior <= 0) return '<span style="color:var(--muted)">— '+label+'</span>';
  const delta = ((curr - prior) / prior) * 100;
  const sign = delta >= 0 ? '▲' : '▼';
  const cls = delta >= 0 ? 'trend-up' : 'trend-down';
  return '<span class="'+cls+'">'+sign+' '+Math.abs(delta).toFixed(1)+'% '+label+'</span>';
}
function priorMonthKey(m){
  const [y,mo] = m.split('-').map(Number);
  const d = new Date(y, mo-2, 1);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}
function priorYearMonthKey(m){
  const [y,mo] = m.split('-').map(Number);
  return (y-1) + '-' + String(mo).padStart(2,'0');
}
function ytdGallonsForStop(stopId, m, kind /* 'total'|'fleet'|'agg' */){
  const [y, mo] = m.split('-').map(Number);
  let sum = 0;
  for(let i = 1; i <= mo; i++){
    const k = y + '-' + String(i).padStart(2,'0');
    if(kind === 'fleet') sum += stopFleetGallons(stopId, k);
    else if(kind === 'agg') sum += stopAggregatorGallons(stopId, k);
    else sum += stopTotalGallons(stopId, k);
  }
  return sum;
}
function loadStopRecord(stopId){
  if(!stopdata[stopId]) stopdata[stopId] = {membershipCost:'', siteMgrName:'', siteMgrEmail:'', siteMgrPhone:'', notes:[], visits:[]};
  return stopdata[stopId];
}
function saveStopRecord(stopId, partial){
  const rec = loadStopRecord(stopId);
  Object.assign(rec, partial);
  saveData();
}
```

- [ ] **Step 3: Run syntax check** (same command as Task 2 Step 4). Expected: `syntax ok`.

- [ ] **Step 4: Browser smoke test**

Reload, open devtools, run:
```js
const m = currentMonthKey();
console.log('total apr:', stopTotalGallons('R03650', m));
console.log('fleet apr:', stopFleetGallons('R03650', m));
console.log('agg apr:', stopAggregatorGallons('R03650', m));
console.log('ytd total:', ytdGallonsForStop('R03650', m, 'total'));
console.log('trend pill:', fmtTrendPill(120, 100, 'MoM'));
```

Expected: numbers (zero is fine if no `roadys_fuel` data is present in this browser), trend pill HTML string with `▲ 20.0% MoM`.

---

## Task 4: Insert Membership card into `openSiteDrawer`

**Files:**
- Modify: `gs-command-center.html` (`openSiteDrawer` function, after the existing Site Details section)

- [ ] **Step 1: Add `drawerMembershipHTML` helper above `openSiteDrawer`** (right below the helpers added in Task 3)

```js
function drawerMembershipHTML(stopId){
  const rec = loadStopRecord(stopId);
  const inS = 'background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px 7px;color:var(--text);font-size:.82em;width:100%';
  return `
    <div class="drawer-card purple">
      <div class="drawer-card-hd">💳 Membership &amp; Site Contact</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label style="display:block">
          <span style="font-size:.6em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Membership Cost / mo</span>
          <input id="sd-mem-${stopId}" style="${inS};margin-top:3px" value="${esc(rec.membershipCost||'')}" placeholder="$0.00" onblur="onMembershipChange('${stopId}', 'membershipCost', this.value)"/>
        </label>
        <label style="display:block">
          <span style="font-size:.6em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Site Manager</span>
          <input id="sd-mgrname-${stopId}" style="${inS};margin-top:3px" value="${esc(rec.siteMgrName||'')}" placeholder="Name" onblur="onMembershipChange('${stopId}', 'siteMgrName', this.value)"/>
        </label>
        <label style="display:block">
          <span style="font-size:.6em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Email</span>
          <input id="sd-mgremail-${stopId}" type="email" style="${inS};margin-top:3px" value="${esc(rec.siteMgrEmail||'')}" placeholder="email@stop.com" onblur="onMembershipChange('${stopId}', 'siteMgrEmail', this.value)"/>
        </label>
        <label style="display:block">
          <span style="font-size:.6em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Phone</span>
          <input id="sd-mgrphone-${stopId}" style="${inS};margin-top:3px" value="${esc(rec.siteMgrPhone||'')}" placeholder="(555) 555-5555" onblur="onMembershipChange('${stopId}', 'siteMgrPhone', this.value)"/>
        </label>
      </div>
    </div>
  `;
}
function onMembershipChange(stopId, field, val){
  saveStopRecord(stopId, {[field]: val});
  toast('Saved');
}
```

- [ ] **Step 2: Insert the card into `openSiteDrawer`**

Find this exact block inside `openSiteDrawer`:
```js
    <div class="drawer-section"><h4>⚙️ Site Details</h4>
```
…ending with the closing `</div>` for that section (it's 14 lines from the opener: the structure is `<div class="drawer-section"><h4>⚙️ Site Details</h4> ... </div>`).

Immediately after that closing `</div>` (and before the `<div class="drawer-section"><h4>🧮 Calculations` line), inject:
```html
    ${drawerMembershipHTML(siteId)}
```

- [ ] **Step 3: Syntax check** (same command). Expected: `syntax ok`.

- [ ] **Step 4: Browser smoke test**

Reload, log in as a GS, open the drawer for any stop (e.g., click a stop in the territory page or open a CRM activity). Verify:
1. New purple-bordered "Membership & Site Contact" card appears between Site Details and Calculations.
2. Type a membership cost like `$2,450.00`, tab out → toast says "Saved".
3. Reload the page, re-open the same stop drawer → the value persists.
4. Open devtools, run `console.log(JSON.parse(localStorage.getItem('gs_cmd_'+getActiveGS()+'_stopdata')))` → see the saved record.

---

## Task 5: Insert Fuel Business card into `openSiteDrawer`

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Add `drawerFuelHTML` helper above `openSiteDrawer`** (alongside the helpers from Tasks 3-4)

```js
function drawerFuelHTML(stopId){
  const m = currentMonthKey();
  const pm = priorMonthKey(m);
  const py = priorYearMonthKey(m);
  const monthLbl = (() => {
    const [y, mo] = m.split('-').map(Number);
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mo-1] + ' ' + y;
  })();
  const total = stopTotalGallons(stopId, m);
  const totalP = stopTotalGallons(stopId, pm);
  const totalY = stopTotalGallons(stopId, py);
  const totalYTD = ytdGallonsForStop(stopId, m, 'total');
  const fleet = stopFleetGallons(stopId, m);
  const fleetP = stopFleetGallons(stopId, pm);
  const fleetY = stopFleetGallons(stopId, py);
  const fleetYTD = ytdGallonsForStop(stopId, m, 'fleet');
  const agg = stopAggregatorGallons(stopId, m);
  const aggP = stopAggregatorGallons(stopId, pm);
  const aggY = stopAggregatorGallons(stopId, py);
  const aggYTD = ytdGallonsForStop(stopId, m, 'agg');
  const fmtN = n => Math.round(n).toLocaleString();
  return `
    <div class="drawer-card cyan">
      <div class="drawer-card-hd">⛽ Fuel Business — ${monthLbl}</div>
      <div class="fuel-tile-grid">
        <div class="fuel-tile">
          <div class="fuel-tile-lbl">Total Gallons</div>
          <div class="fuel-tile-val">${fmtN(total)}</div>
          <div class="fuel-tile-trend">${fmtTrendPill(total,totalP,'MoM')} · ${fmtTrendPill(total,totalY,'YoY')}</div>
          <div class="fuel-tile-ytd">YTD: ${fmtN(totalYTD)} gal</div>
        </div>
        <div class="fuel-tile">
          <div class="fuel-tile-lbl">Fleet Gallons</div>
          <div class="fuel-tile-val">${fmtN(fleet)}</div>
          <div class="fuel-tile-trend">${fmtTrendPill(fleet,fleetP,'MoM')} · ${fmtTrendPill(fleet,fleetY,'YoY')}</div>
          <div class="fuel-tile-ytd">YTD: ${fmtN(fleetYTD)} gal</div>
        </div>
        <div class="fuel-tile">
          <div class="fuel-tile-lbl">Aggregator Gallons</div>
          <div class="fuel-tile-val">${fmtN(agg)}</div>
          <div class="fuel-tile-trend">${fmtTrendPill(agg,aggP,'MoM')} · ${fmtTrendPill(agg,aggY,'YoY')}</div>
          <div class="fuel-tile-ytd">YTD: ${fmtN(aggYTD)} gal</div>
        </div>
      </div>
      ${(!total && !fleet && !agg) ? '<div style="font-size:.7em;color:var(--muted);margin-top:8px">No fuel data in <code>roadys_fuel</code> for this stop. Open <code>index.html</code> in another tab to populate.</div>' : ''}
    </div>
  `;
}
```

- [ ] **Step 2: Insert into `openSiteDrawer`** — right below the line `${drawerMembershipHTML(siteId)}` added in Task 4:

```html
    ${drawerFuelHTML(siteId)}
```

- [ ] **Step 3: Syntax check.** Expected: `syntax ok`.

- [ ] **Step 4: Browser smoke test**

Open the drawer. Verify:
1. Cyan-bordered Fuel Business card with month label (e.g., "Apr 2026").
2. Three tiles: Total / Fleet / Aggregator. With data: numbers + green/red trend pills + YTD subline. Without `roadys_fuel` populated: zeros + muted hint banner at the bottom.
3. Numbers are formatted with thousands separators.

If you have a separate tab where `index.html` has been opened to populate `roadys_fuel`, return to `gs-command-center.html`, reload, and re-open the drawer — numbers should now appear.

---

## Task 6: Insert Vendor Programs stub card into `openSiteDrawer`

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Add `drawerVendorStubHTML` helper above `openSiteDrawer`**

```js
function drawerVendorStubHTML(stopId){
  let enrolledIds = [];
  try {
    const VPE = loadVendorEnrolls();  // existing helper, returns {stopId:{vendorId:bool}}
    const stopVP = VPE[stopId];
    if(stopVP && typeof stopVP === 'object'){
      enrolledIds = Object.keys(stopVP).filter(vid => stopVP[vid] === true);
    }
  } catch(e){}
  const rows = enrolledIds.length
    ? enrolledIds.map(vid => `<div style="padding:6px 8px;background:var(--bg);border-radius:4px;font-size:.78em;font-family:monospace">${esc(vid)}</div>`).join('')
    : '<div style="font-size:.78em;color:var(--muted)">No enrolled vendor programs in <code>roadys_vp_enroll</code>.</div>';
  return `
    <div class="drawer-card green">
      <div class="drawer-card-hd">🏢 Vendor Programs (${enrolledIds.length} enrolled)</div>
      <div style="display:flex;flex-direction:column;gap:4px">${rows}</div>
      <div style="font-size:.66em;color:var(--muted);margin-top:8px">Vendor names &amp; contact details sync from <code>vendors.html</code> in Phase 2.</div>
    </div>
  `;
}
```

- [ ] **Step 2: Insert into `openSiteDrawer`** — right below `${drawerFuelHTML(siteId)}`:

```html
    ${drawerVendorStubHTML(siteId)}
```

- [ ] **Step 3: Syntax check.** Expected: `syntax ok`.

- [ ] **Step 4: Browser smoke test**

Open the drawer. Verify:
1. Green-bordered Vendor Programs card appears below Fuel Business and above Calculations.
2. With `roadys_vp_enroll` populated: list of vendor IDs (raw — Phase 2 fills in names).
3. Without data: muted "No enrolled vendor programs" message.
4. Always shows the "syncs from vendors.html in Phase 2" footer caption.

---

## Task 7: Add "My Stops" sortable table to Per-GS Dashboard

**Files:**
- Modify: `gs-command-center.html` (`renderPerGSDashboard` function around line 1194)

- [ ] **Step 1: Add `renderMyStopsCard` helper above `renderPerGSDashboard`**

```js
function renderMyStopsCard(stops){
  const m = currentMonthKey();
  const pm = priorMonthKey(m);
  const rows = stops.map(s => {
    const mtd = stopTotalGallons(s.id, m);
    const prior = stopTotalGallons(s.id, pm);
    const ytd = ytdGallonsForStop(s.id, m, 'total');
    const delta = (prior > 0) ? ((mtd-prior)/prior)*100 : null;
    const trendCell = (delta === null)
      ? '<span style="color:var(--muted)">—</span>'
      : (delta >= 0
          ? '<span class="trend-up">▲ '+delta.toFixed(1)+'%</span>'
          : '<span class="trend-down">▼ '+Math.abs(delta).toFixed(1)+'%</span>');
    return `<tr class="clickable" data-sid="${s.id}" data-mtd="${mtd}" data-ytd="${ytd}" data-mom="${delta===null?-9999:delta}" onclick="openSiteDrawer(this.dataset.sid)">
      <td><b>${esc(s.name)}</b></td>
      <td>${esc(s.city||'—')}</td>
      <td>${esc(s.state||'—')}</td>
      <td style="text-align:right">${Math.round(mtd).toLocaleString()}</td>
      <td style="text-align:right">${Math.round(ytd).toLocaleString()}</td>
      <td style="text-align:right">${trendCell}</td>
    </tr>`;
  }).join('');
  return `<div class="card" style="margin-top:14px">
    <div class="card-hd">📍 My Stops (${stops.length})</div>
    <div style="overflow-x:auto"><table class="mystops-table" id="mystops-tbl">
      <thead><tr>
        <th data-sort="name">Name</th>
        <th data-sort="city">City</th>
        <th data-sort="state">State</th>
        <th data-sort="mtd" style="text-align:right">MTD Gallons</th>
        <th data-sort="ytd" style="text-align:right">YTD Gallons</th>
        <th data-sort="mom" style="text-align:right">▲▼ MoM</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:18px">No stops in your territory.</td></tr>'}</tbody>
    </table></div>
  </div>`;
}
```

- [ ] **Step 2: Append the card to the end of `renderPerGSDashboard`'s template literal**

Locate the end of the template literal in `renderPerGSDashboard`. The structure is:
```js
  document.getElementById('dash-content').innerHTML=`
    <div class="card">...</div>
    <div ...>...</div>
    ${anySharedData ? `...` : `...`}
  `;
}
```

Replace the closing `` `; `` at the end of the template literal with `` ${renderMyStopsCard(stops)}\n  `; ``. Concretely: find the line that has just `` `; `` (closing the template + assignment) and change it to:

```js
    ${renderMyStopsCard(stops)}
  `;
```

- [ ] **Step 3: Wire sortability**

Below `renderMyStopsCard`, add a click-to-sort handler that delegates from the table thead. Append to `renderPerGSDashboard` AFTER the `innerHTML = ` assignment, before the closing `}`:

```js
  // Wire My Stops sort
  (function(){
    const tbl = document.getElementById('mystops-tbl');
    if(!tbl) return;
    let curSort = null, curDir = 1;
    tbl.querySelectorAll('thead th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if(curSort === key) curDir = -curDir;
        else { curSort = key; curDir = 1; }
        const tbody = tbl.tBodies[0];
        const rows = Array.from(tbody.rows).filter(r => r.cells.length === 6);
        const cellIdx = {name:0, city:1, state:2, mtd:3, ytd:4, mom:5}[key];
        rows.sort((a,b) => {
          let va, vb;
          if(key === 'mtd' || key === 'ytd' || key === 'mom'){
            va = +a.dataset[key]; vb = +b.dataset[key];
          } else {
            va = a.cells[cellIdx].textContent.trim().toLowerCase();
            vb = b.cells[cellIdx].textContent.trim().toLowerCase();
          }
          if(va < vb) return -1*curDir;
          if(va > vb) return  1*curDir;
          return 0;
        });
        rows.forEach(r => tbody.appendChild(r));
      });
    });
  })();
```

- [ ] **Step 4: Syntax check.** Expected: `syntax ok`.

- [ ] **Step 5: Browser smoke test**

Log in as a GS (PIN 1001-1006). On the Dashboard tab, scroll to the bottom of the dashboard. Verify:
1. New "My Stops" card with a table listing every stop in that GS's territory.
2. Columns: Name · City · State · MTD Gallons · YTD Gallons · ▲▼ MoM.
3. Click a row → drawer opens for that stop.
4. Click a column header (e.g., "MTD Gallons") → rows reorder ascending. Click again → descending.
5. Switch GS via the GS selector → table re-renders with that GS's stops.

---

## Task 8: Add header global stop search

**Files:**
- Modify: `gs-command-center.html` (topbar HTML around line 300-311, and add helper above `openSiteDrawer`)

- [ ] **Step 1: Insert the search input into the topbar**

Find:
```html
    <div class="topbar-user">
```

Add directly above it:
```html
    <div class="stop-search-wrap" id="stop-search-wrap">
      <input type="text" id="stop-search-input" class="stop-search-input" placeholder="🔍 Find stop..." autocomplete="off" oninput="onStopSearchInput()" onfocus="onStopSearchInput()" onblur="setTimeout(closeStopSearch, 150)" onkeydown="onStopSearchKey(event)">
      <div class="stop-search-results" id="stop-search-results"></div>
    </div>
```

- [ ] **Step 2: Add the search-handler helpers above `openSiteDrawer`**

```js
function searchableStopsForUser(){
  if(typeof networkStops === 'function' && currentUser && currentUser.isManager){
    return networkStops();
  }
  return Array.isArray(myStops) ? myStops : [];
}
function onStopSearchInput(){
  const q = (document.getElementById('stop-search-input').value || '').trim().toLowerCase();
  const box = document.getElementById('stop-search-results');
  if(!q){ box.classList.remove('show'); box.innerHTML = ''; return; }
  const stops = searchableStopsForUser();
  const matches = stops.filter(s => {
    const name = (s.name||'').toLowerCase();
    const id   = (s.id||'').toLowerCase();
    const city = (s.city||'').toLowerCase();
    return name.includes(q) || id.includes(q) || city.includes(q);
  }).slice(0, 8);
  if(!matches.length){
    box.innerHTML = '<div class="stop-search-row" style="color:var(--muted)">No matches</div>';
  } else {
    box.innerHTML = matches.map((s,i) => `<div class="stop-search-row${i===0?' active':''}" data-sid="${s.id}" onmousedown="onStopSearchPick('${s.id}')">
      <span class="ssn">${esc(s.name)}</span><span class="sss">${esc(s.id)} · ${esc(s.city||'')} ${esc(s.state||'')}</span>
    </div>`).join('');
  }
  box.classList.add('show');
}
function onStopSearchPick(stopId){
  closeStopSearch();
  document.getElementById('stop-search-input').value = '';
  openSiteDrawer(stopId);
}
function closeStopSearch(){
  const box = document.getElementById('stop-search-results');
  if(box){ box.classList.remove('show'); box.innerHTML = ''; }
}
function onStopSearchKey(ev){
  const box = document.getElementById('stop-search-results');
  if(!box || !box.classList.contains('show')) return;
  const rows = Array.from(box.querySelectorAll('.stop-search-row[data-sid]'));
  if(!rows.length) return;
  let idx = rows.findIndex(r => r.classList.contains('active'));
  if(idx < 0) idx = 0;
  if(ev.key === 'ArrowDown'){ ev.preventDefault(); rows[idx]?.classList.remove('active'); idx = (idx+1)%rows.length; rows[idx].classList.add('active'); }
  else if(ev.key === 'ArrowUp'){ ev.preventDefault(); rows[idx]?.classList.remove('active'); idx = (idx-1+rows.length)%rows.length; rows[idx].classList.add('active'); }
  else if(ev.key === 'Enter'){ ev.preventDefault(); const sid = rows[idx]?.dataset.sid; if(sid) onStopSearchPick(sid); }
  else if(ev.key === 'Escape'){ closeStopSearch(); }
}
```

- [ ] **Step 3: Syntax check.** Expected: `syntax ok`.

- [ ] **Step 4: Browser smoke test**

Verify:
1. Reload page, log in as GS. Search input appears in the topbar between the GS selector and user info.
2. Type "115" → dropdown shows matching stops in your territory.
3. Type a stop name fragment → matches.
4. Press ↓/↑ to navigate, Enter to select → drawer opens.
5. Click a result → drawer opens.
6. Press Esc → dropdown closes.
7. Switch to manager (PIN 9999) in All-GS rollup → search now spans the whole network.
8. Click outside the dropdown → it closes (the `onblur` 150ms grace lets the `onmousedown` row pick fire first).

---

## Task 9: Wire CRM task tile stop name as drawer trigger

**Files:**
- Modify: `gs-command-center.html` (`renderTaskCard` function around line 1833)

- [ ] **Step 1: Locate the line to change**

```bash
grep -n "task-site" gs-command-center.html
```

In `renderTaskCard`, find:
```js
    (t.siteId?'<div class="task-site">'+esc(s?.name||t.siteId)+'</div>':'')+
```

- [ ] **Step 2: Replace with a clickable span that stops propagation**

Change that line to:
```js
    (t.siteId?'<div class="task-site"><span style="cursor:pointer;text-decoration:underline;text-decoration-style:dotted;color:var(--cyan)" onclick="event.stopPropagation();openSiteDrawer(\''+t.siteId+'\')">'+esc(s?.name||t.siteId)+'</span></div>':'')+
```

The `event.stopPropagation()` prevents the surrounding tile click from also firing `editTask()`.

- [ ] **Step 3: Syntax check.** Expected: `syntax ok`.

- [ ] **Step 4: Browser smoke test**

Log in as a GS, open CRM tab, find a task with a stop attached. Verify:
1. Stop name on the task tile is now an underlined cyan link.
2. Clicking the stop name → opens drawer (does NOT open Edit Task modal).
3. Clicking elsewhere on the tile (title, status, due date) → still opens Edit Task modal.

---

## Task 10: Final integration smoke test + commit

- [ ] **Step 1: Run full syntax check** (same `node -e` command from Task 2 Step 4). Expected: `syntax ok`.

- [ ] **Step 2: Run the end-to-end Phase 1 smoke checklist**

Open `gs-command-center.html` in a browser. For each item, verify it works:

  - [ ] Log in as PIN 1001 (or any per-GS PIN).
  - [ ] On the Dashboard tab: see "My Stops" table at the bottom with at least one row. Click a row → drawer opens.
  - [ ] In the drawer, see the new sections in this order: Location, Site Details, **Membership & Site Contact** (purple), **Fuel Business — {month}** (cyan), **Vendor Programs (N enrolled)** (green), Calculations, Activity Log.
  - [ ] Edit Membership Cost field, tab out → "Saved" toast.
  - [ ] Close drawer with X. Reload page. Re-open same stop → membership cost persists.
  - [ ] Open devtools, verify `localStorage['gs_cmd_<gsName>_stopdata']` contains the stop record.
  - [ ] Type a stop name in the topbar search → autocomplete dropdown appears, ↓ navigates, Enter opens drawer.
  - [ ] Go to CRM tab. Click the stop name link on a task tile → drawer opens (not Edit Task).
  - [ ] Click the rest of the same task tile → Edit Task modal opens (not drawer).
  - [ ] Switch to manager mode (logout, PIN 9999) → My Stops still works (shows all stops in All-GS); membership/site-contact fields shown but read-only behavior is visually editable but won't persist (acceptable — explicit per-GS read-only enforcement is Section/Modes work scheduled into Phase 4 with the share button gating).

- [ ] **Step 3: Commit**

```bash
git add gs-command-center.html
git commit -m "$(cat <<'EOF'
GS Command Center Phase 1: Stop Deep-Dive Drawer

- Extend openSiteDrawer with three new cards: Membership & Site Contact
  (editable: cost, name, email, phone), Fuel Business (Total/Fleet/Aggregator
  with MoM+YoY+YTD), Vendor Programs stub (Phase 2 fills names).
- New helpers: stopFleetGallons, stopAggregatorGallons, stopTotalGallons,
  fmtTrendPill, ytdGallonsForStop, loadStopRecord, saveStopRecord.
- New per-GS storage key: gs_cmd_<gsName>_stopdata, hooked into
  loadData/saveData lifecycle.
- New entry points: 'My Stops' sortable table on Per-GS Dashboard;
  global stop search box in topbar with autocomplete and ↓/↑/Enter
  keyboard navigation.
- CRM task tile stop name is now a click-through link that opens the
  drawer (with stopPropagation so the rest of the tile still opens
  Edit Task).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verify the commit**

```bash
git log -1 --stat
git status --short
```

Expected: one new commit on `gs-command-center-workstation`, only `gs-command-center.html` modified, working tree clean.

- [ ] **Step 5: Push**

```bash
git push origin gs-command-center-workstation
```

---

## Out-of-scope reminders (Phase 1 explicitly does not cover these)

- **Vendor names + program badges + contact info** on the Vendor Programs card — Phase 2.
- **GS Management migration** (USA territory map, manager editor, ranking) — Phase 3.
- **Notes panel** + **Share Results buttons** (copy / mailto / print) — Phase 4.
- **Schedule Next Visit** + `.ics` / Google Calendar URL export — Phase 5.
- **Manager mode read-only enforcement** on the Membership card — handled in Phase 4 alongside the share-button gating logic; Phase 1's drawer is functionally editable in All-GS mode but writes are no-ops because `saveData()` early-returns when `getActiveGS()` is null. Documenting the behavior here so it's not mistaken for a bug.
