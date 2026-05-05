# GS Command Center Phase 9 — Site Review Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing standalone `site-visit.html` review form into `gs-command-center.html`. New entry points: `📋 Site Reviews` top-level tab, `📋 Site Review` button on Stop Detail Page header, `📋 Past Site Reviews` card on Stop Detail Page. New `Fleet Cards Accepted` checklist persisted on the stop record (`stopdata[stopId].acceptsFleetCards`). Pre-fill payload hands off via transient `localStorage['roadys_sitevisit_prefill']` key. Saved reviews get tagged with `stopId` for scopable UI.

**Architecture:** Two files modified — `gs-command-center.html` (260 new lines: FLEET_CARDS list + bridge writer, payload builders, startSiteReview, header button, past-reviews card, Site Reviews tab + render, Membership card chip strip) and `site-visit.html` (90 new lines: Fleet Cards section markup + inline FLEET_CARDS fallback, applyPrefill helper, init-time prefill detection, saveVisit stopId tagging). Reuses existing `roadys_site_visits` localStorage key (network-shared); new transient key `roadys_sitevisit_prefill` for one-shot handoff; new bridge key `roadys_fleet_cards` so `site-visit.html` reads the canonical FLEET_CARDS list.

**Tech Stack:** Pure HTML/JS/CSS, no build, no test framework. Verification = `node -e "new Function(<extracted-script>)"` syntax check after each task + browser smoke test consolidated at Task 10.

**Spec:** [docs/superpowers/specs/2026-05-04-phase-9-site-review-integration.md](../specs/2026-05-04-phase-9-site-review-integration.md).

**Phase boundary:** No data moves to Supabase in Phase 9 — that's Phase 8.5+. The new `acceptsFleetCards` field lives in `gs_cmd_<gs>_stopdata`; saved reviews live in `roadys_site_visits` (already cross-app shared).

---

## File Structure

| Insertion point | What we add | Locator |
|---|---|---|
| `gs-command-center.html` after PROCESSOR_RATES const | `FLEET_CARDS` master list + bridge writer | `grep -n "^const PROCESSOR_RATES" gs-command-center.html` |
| `gs-command-center.html` `loadStopRecord` | Add `acceptsFleetCards: {}` to default record | `grep -n "function loadStopRecord" gs-command-center.html` |
| `gs-command-center.html` above `function openSiteDrawer` | `startSiteReview`, `pagePastReviewsHTML`, `renderSiteReviews`, `siteReviewsForStop`, fleet-card chip helpers | `grep -n "^function openSiteDrawer" gs-command-center.html` |
| `gs-command-center.html` `pageHeaderHTML` `.sd-actions` | New `📋 Site Review` button between Email and Schedule Visit | `grep -n "scheduleVisit.*page" gs-command-center.html` |
| `gs-command-center.html` `renderStopDetailPage` left column | `${pagePastReviewsHTML(stopId)}` slot between Visits and Notes | Inside the LEFT `.sd-col` |
| `gs-command-center.html` tab strip | `📋 Site Reviews` tab between Critical and the hidden Stop Detail tab | After `data-tab="critical"` |
| `gs-command-center.html` panels block | `<div class="panel" id="p-site-reviews">` after Critical panel | After `id="p-critical"` div |
| `gs-command-center.html` `renderAll` | Add `renderSiteReviews()` call | Inside the existing render chain |
| `gs-command-center.html` `drawerMembershipHTML` | Fleet Cards chip strip below the existing Fuelman/R-Check checkboxes | Inside the function |
| `site-visit.html` after Merchant Console section | New `Fleet Cards Accepted` section | `grep -n "<!-- Gallon Report -->" site-visit.html` |
| `site-visit.html` near AGGREGATORS const | `FLEET_CARDS` inline fallback list + bridge reader | `grep -n "^const AGGREGATORS" site-visit.html` |
| `site-visit.html` `(function init` | Prefill detection + URL param handling | `grep -n "buildAggRows();" site-visit.html` (inside init) |
| `site-visit.html` `saveVisit` | Tag saved record with `stopId` | `grep -n "^function saveVisit" site-visit.html` |

---

## Task 1: FLEET_CARDS list + bridge writer in gs-command-center.html

**Files:**
- Modify: `gs-command-center.html` (insert after `PROCESSOR_RATES` const)

- [ ] **Step 1: Locate insertion point**

```bash
grep -n "^];\s*$" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html" | head -20
grep -n "^const PROCESSOR_RATES" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Find the `];` that closes `PROCESSOR_RATES` (the last entry is `Cardless`). Insert immediately after that closing line.

- [ ] **Step 2: Insert the FLEET_CARDS list + bridge**

Use the Edit tool. `old_string` is the exact closing of `PROCESSOR_RATES` (the entry is `{agg:'On Ramp',proc:'Cardless',rate:'1.25% / $2.00 Flat',note:''}` followed by `];`). Read the file around the match first to confirm exact whitespace.

- `old_string`:
```
  {agg:'On Ramp',proc:'Cardless',rate:'1.25% / $2.00 Flat',note:''}
];
```

- `new_string`:
```
  {agg:'On Ramp',proc:'Cardless',rate:'1.25% / $2.00 Flat',note:''}
];

// ─── Phase 9: Fleet Cards master list ─────────────────────────────────
// Mirrors what site-visit.html shows in its new Fleet Cards Accepted
// section. Bridge below writes this to localStorage so site-visit.html
// reads the canonical list (with its own inline copy as fallback).
const FLEET_CARDS = [
  { id: 'fuelman',     label: 'Fuelman' },
  { id: 'rcheck',      label: 'R-Check' },
  { id: 'comdata',     label: 'Comdata' },
  { id: 'efs',         label: 'EFS / WEX EFS' },
  { id: 'tchek',       label: 'T-Chek (TCH)' },
  { id: 'fleet_one',   label: 'Fleet One' },
  { id: 'wex',         label: 'WEX' },
  { id: 'voyager',     label: 'Voyager' },
  { id: 'mudflap',     label: 'Mudflap' },
  { id: 'atob',        label: 'AtoB' },
  { id: 'pilot_fj',    label: 'Pilot / Flying J Fleet' },
  { id: 'ta_petro',    label: 'TA / Petro UltraONE' },
  { id: 'shell_fleet', label: 'Shell Fleet' }
];
try { localStorage.setItem('roadys_fleet_cards', JSON.stringify(FLEET_CARDS)); } catch(e){}
```

- [ ] **Step 3: Verify**

```bash
grep -c "^const FLEET_CARDS" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "roadys_fleet_cards" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1.

- [ ] **Step 4: Syntax check**

```bash
node -e "const fs=require('fs');const html=fs.readFileSync('c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g);m.forEach((blk,i)=>{const js=blk.replace(/^<script>|<\/script>$/g,'');new Function(js);});console.log('syntax ok, '+m.length+' script blocks');"
```

Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 2: site-visit.html — Fleet Cards section + inline FLEET_CARDS

**Files:**
- Modify: `site-visit.html` (Fleet Cards section between Merchant Console and Gallon Report; inline FLEET_CARDS fallback near AGGREGATORS)

- [ ] **Step 1: Locate the Merchant Console section closing**

```bash
grep -n "<!-- Gallon Report -->" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/site-visit.html"
```

Read 4-5 lines above. The Merchant Console section ends with `    </div>` then a blank line then `    <!-- Gallon Report -->`.

- [ ] **Step 2: Insert the Fleet Cards section**

Use the Edit tool:

- `old_string`:
```
    <!-- Gallon Report -->
    <div class="section">
      <div class="section-hdr"><h3>📊 Gallon Report (3-month lookback)</h3></div>
```

- `new_string`:
```
    <!-- Fleet Cards Accepted (Phase 9) -->
    <div class="section">
      <div class="section-hdr"><h3>💳 Fleet Cards Accepted</h3></div>
      <div class="section-body">
        <div id="fleet-cards-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px"></div>
        <div class="comment-row"><label>Comments</label><textarea id="fleet-cards-comments" oninput="markDirty()" rows="2"></textarea></div>
      </div>
    </div>

    <!-- Gallon Report -->
    <div class="section">
      <div class="section-hdr"><h3>📊 Gallon Report (3-month lookback)</h3></div>
```

- [ ] **Step 3: Locate the AGGREGATORS const**

```bash
grep -n "^const AGGREGATORS" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/site-visit.html"
```

Read 8-10 lines from there to see the surrounding constants.

- [ ] **Step 4: Insert FLEET_CARDS fallback + bridge reader after AGGREGATORS / SIGNAGE_ITEMS / etc. const block, before `// ── STATE ──`**

Use the Edit tool:

- `old_string`:
```
const CONSIDER_VENDORS = ['Sysco','Heartland','DAS or Lynco','Entegra','Ecolab','Aramark','Coke','ATM','Farmer Bros Coffee','All Over Media','Truck Parking','Other 1','Other 2','Other 3','Other 4','Other 5'];

// ── STATE ──────────────────────────────────────────────
```

- `new_string`:
```
const CONSIDER_VENDORS = ['Sysco','Heartland','DAS or Lynco','Entegra','Ecolab','Aramark','Coke','ATM','Farmer Bros Coffee','All Over Media','Truck Parking','Other 1','Other 2','Other 3','Other 4','Other 5'];

// Phase 9 — Fleet Cards. gs-command-center.html writes the canonical
// list to localStorage['roadys_fleet_cards']; this inline fallback is
// used when the bridge key is absent (e.g. user opens site-visit.html
// directly without first loading gs-command-center.html).
let FLEET_CARDS = [
  { id: 'fuelman',     label: 'Fuelman' },
  { id: 'rcheck',      label: 'R-Check' },
  { id: 'comdata',     label: 'Comdata' },
  { id: 'efs',         label: 'EFS / WEX EFS' },
  { id: 'tchek',       label: 'T-Chek (TCH)' },
  { id: 'fleet_one',   label: 'Fleet One' },
  { id: 'wex',         label: 'WEX' },
  { id: 'voyager',     label: 'Voyager' },
  { id: 'mudflap',     label: 'Mudflap' },
  { id: 'atob',        label: 'AtoB' },
  { id: 'pilot_fj',    label: 'Pilot / Flying J Fleet' },
  { id: 'ta_petro',    label: 'TA / Petro UltraONE' },
  { id: 'shell_fleet', label: 'Shell Fleet' }
];
try {
  const bridged = JSON.parse(localStorage.getItem('roadys_fleet_cards') || 'null');
  if (Array.isArray(bridged) && bridged.length) FLEET_CARDS = bridged;
} catch(e){}

// ── STATE ──────────────────────────────────────────────
```

- [ ] **Step 5: Verify**

```bash
grep -c "Fleet Cards Accepted" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/site-visit.html"
grep -c "id=\"fleet-cards-grid\"" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/site-visit.html"
grep -c "^let FLEET_CARDS" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/site-visit.html"
```

Expected: 1, 1, 1.

- [ ] **Step 6: Syntax check (site-visit.html)**

```bash
node -e "const fs=require('fs');const html=fs.readFileSync('c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/site-visit.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g);m.forEach((blk,i)=>{const js=blk.replace(/^<script>|<\/script>$/g,'');new Function(js);});console.log('syntax ok, '+m.length+' script blocks');"
```

Expected: `syntax ok, N script blocks` (some N ≥ 1; site-visit.html may have multiple `<script>` blocks). DO NOT COMMIT.

---

## Task 3: site-visit.html — buildFleetCardRows + applyPrefill + helpers

**Files:**
- Modify: `site-visit.html` (insert helpers after `buildAggRows` function)

- [ ] **Step 1: Locate `buildAggRows`**

```bash
grep -n "^function buildAggRows" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/site-visit.html"
```

Read ~15 lines from that match to find the closing `}` of `buildAggRows`.

- [ ] **Step 2: Insert `buildFleetCardRows` and `applyPrefill` after `buildAggRows`'s closing brace**

The closing of `buildAggRows` looks like:

```js
function buildAggRows(){
  const c = document.getElementById('agg-rows');
  c.innerHTML = '';
  AGGREGATORS.forEach(a => {
    …
  });
}
```

Use the Edit tool. Find the literal closing `});\n}` of `buildAggRows`. Insert directly after.

The exact content to add after the closing `}`:

```js

// Phase 9 — build the Fleet Cards Accepted checkbox grid
function buildFleetCardRows(){
  const c = document.getElementById('fleet-cards-grid');
  if(!c) return;
  c.innerHTML = FLEET_CARDS.map(fc => `
    <label style="display:flex;align-items:center;gap:8px;font-size:.84em;padding:6px 8px;background:var(--bg2);border-radius:4px;cursor:pointer">
      <input type="checkbox" id="fleet-card-${fc.id}" oninput="markDirty()">
      <span>${fc.label}</span>
    </label>
  `).join('');
}

// Phase 9 — apply a prefill payload from gs-command-center.html.
// Single-use: caller deletes localStorage['roadys_sitevisit_prefill'] after.
function applyPrefill(payload){
  if(!payload || typeof payload !== 'object') return;
  // Flat ID → value map
  if(payload.fields && typeof payload.fields === 'object'){
    for(const [id, val] of Object.entries(payload.fields)){
      const el = document.getElementById(id);
      if(el) el.value = (val == null ? '' : val);
    }
  }
  // Aggregator discounts — name-match against AGGREGATORS list
  if(Array.isArray(payload.aggregatorDiscounts)){
    for(const ad of payload.aggregatorDiscounts){
      const matchName = (ad.name || '').toLowerCase();
      const hit = AGGREGATORS.find(a => matchName.includes(a.toLowerCase()) || a.toLowerCase().includes(matchName));
      if(!hit){ console.warn('Phase 9: aggregator name "' + ad.name + '" not in AGGREGATORS — skipping'); continue; }
      const slug = 'agg-' + hit.replace(/\W+/g,'-').toLowerCase();
      const r = document.getElementById(slug + '-r');
      const c = document.getElementById(slug + '-c');
      const b = document.getElementById(slug + '-better');
      if(r && ad.retailMinus != null) r.value = ad.retailMinus;
      if(c && ad.costPlus    != null) c.value = ad.costPlus;
      if(b && ad.betterOf    != null) b.value = ad.betterOf;
    }
  }
  // Current vendors — toggle the corresponding YN buttons to "yes"
  if(Array.isArray(payload.currentVendors)){
    for(const v of payload.currentVendors){
      const matchName = (v || '').toLowerCase();
      const hit = CURRENT_VENDORS.find(cv => matchName.includes(cv.toLowerCase()) || cv.toLowerCase().includes(matchName));
      if(!hit){ console.warn('Phase 9: vendor name "' + v + '" not in CURRENT_VENDORS — skipping'); continue; }
      const slug = 'cv-' + hit.replace(/\W+/g,'-').toLowerCase();
      // Match the existing yn-btn pattern: find the "yes" button for this id and click it
      const yesBtn = document.querySelector(`.yn-btn.yes[onclick*="'${slug}'"]`);
      if(yesBtn) yesBtn.click();
    }
  }
  // Fleet cards — set checkbox states
  if(payload.fleetCards && typeof payload.fleetCards === 'object'){
    for(const [id, on] of Object.entries(payload.fleetCards)){
      const cb = document.getElementById('fleet-card-' + id);
      if(cb) cb.checked = !!on;
    }
  }
  dirty = true; // pre-filled values count as a dirty draft
}
```

⚠️ The `cv-` prefix above assumes site-visit.html uses `cv-<slug>` for current-vendor YN buttons. **Read the actual `buildVendorTable` function first to confirm** — if it uses a different prefix (e.g. `vendor-` or `cur-`), adjust accordingly. Use:

```bash
grep -n "function buildVendorTable\|cv-\|vendor-\|cur-" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/site-visit.html" | head -20
```

Adjust the `slug = 'cv-' + …` line to match the real prefix before running the Edit.

- [ ] **Step 3: Verify**

```bash
grep -c "^function buildFleetCardRows" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/site-visit.html"
grep -c "^function applyPrefill" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/site-visit.html"
```

Expected: 1, 1.

- [ ] **Step 4: Syntax check** (same `node -e` as Task 2 Step 6). DO NOT COMMIT.

---

## Task 4: site-visit.html — init prefill detection + saveVisit stopId tagging

**Files:**
- Modify: `site-visit.html` (init function + saveVisit function)

- [ ] **Step 1: Locate the init IIFE**

```bash
grep -n "buildAggRows();" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/site-visit.html"
```

Expected: 1 match inside `(function init(){…})()`. Read the surrounding ~10 lines to see the full init body.

- [ ] **Step 2: Add `buildFleetCardRows()` to init + prefill detection**

The init IIFE currently looks like:

```js
(function init(){
  buildAggRows();
  buildYNSection('signage-rows', SIGNAGE_ITEMS, 'sign');
  buildYNSection('restroom-rows', RESTROOM_ITEMS, 'rest');
  buildYNSection('shower-rows', SHOWER_ITEMS, 'shower');
  buildAmenityRows();
  buildVendorTable('current-vendors-body', CURRENT_VENDORS, true);
  buildVendorTable(…);
  …
  document.getElementById('hdr-date').value = new Date().toISOString().slice(0,10);
  renderVisitList();
})();
```

Read the exact lines first via `Read` tool. Then use Edit:

- `old_string`: the existing `buildAggRows();` line (alone or with following `buildYNSection` lines — pick the smallest unique chunk).
- `new_string`: same line followed by `  buildFleetCardRows();`.

Then a SECOND Edit at the bottom of the IIFE to add prefill detection. The current bottom looks like:

```js
  document.getElementById('hdr-date').value = new Date().toISOString().slice(0,10);
  renderVisitList();
})();
```

Replace with:

```js
  document.getElementById('hdr-date').value = new Date().toISOString().slice(0,10);
  renderVisitList();

  // Phase 9 — prefill detection (URL params + transient localStorage payload)
  try {
    const params = new URLSearchParams(location.search);
    const reviewId = params.get('reviewId');
    const stopParam = params.get('stop');
    let prefill = null;
    try { prefill = JSON.parse(localStorage.getItem('roadys_sitevisit_prefill') || 'null'); }
    catch(e){ prefill = null; }
    localStorage.removeItem('roadys_sitevisit_prefill'); // single-use

    if (reviewId) {
      loadVisit(reviewId);
    } else if (prefill) {
      applyPrefill(prefill);
    } else if (stopParam) {
      // Minimal fallback: just stamp the Stop ID
      const idEl = document.getElementById('hdr-id');
      if (idEl) idEl.value = stopParam;
    }
  } catch(e){ console.warn('Phase 9 prefill error:', e); }
})();
```

- [ ] **Step 3: Locate `saveVisit`**

```bash
grep -n "^function saveVisit" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/site-visit.html"
```

Read 15 lines to see the full function body.

- [ ] **Step 4: Mutate `saveVisit` to tag with `stopId` and persist current `currentStopId` across saves**

The current saveVisit body:

```js
function saveVisit(){
  const data = collectData();
  const member = data['hdr-member'] || 'Unnamed Visit';
  const date = data['hdr-date'] || new Date().toISOString().slice(0,10);
  const id = currentVisitId || 'visit-'+Date.now();
  currentVisitId = id;
  const visits = loadVisits();
  visits[id] = { id, member, date, data, saved: new Date().toISOString() };
  localStorage.setItem('roadys_site_visits', JSON.stringify(visits));
  dirty = false;
  renderVisitList();
  toast('Visit saved — ' + member);
}
```

Use Edit:

- `old_string`:
```
function saveVisit(){
  const data = collectData();
  const member = data['hdr-member'] || 'Unnamed Visit';
  const date = data['hdr-date'] || new Date().toISOString().slice(0,10);
  const id = currentVisitId || 'visit-'+Date.now();
  currentVisitId = id;
  const visits = loadVisits();
  visits[id] = { id, member, date, data, saved: new Date().toISOString() };
  localStorage.setItem('roadys_site_visits', JSON.stringify(visits));
  dirty = false;
  renderVisitList();
  toast('Visit saved — ' + member);
}
```

- `new_string`:
```
function saveVisit(){
  const data = collectData();
  const member = data['hdr-member'] || 'Unnamed Visit';
  const date = data['hdr-date'] || new Date().toISOString().slice(0,10);
  const id = currentVisitId || 'visit-'+Date.now();
  currentVisitId = id;
  const visits = loadVisits();
  // Phase 9 — preserve stopId across resaves. Sources, in priority order:
  //   1. existing record's stopId (when re-saving an opened review)
  //   2. URL ?stop= param (set by gs-command-center.html when launching)
  //   3. hdr-id field as a last resort (manual entry)
  const existingStopId = visits[id] && visits[id].stopId;
  const urlStopId = (new URLSearchParams(location.search)).get('stop');
  const stopId = existingStopId || urlStopId || (data['hdr-id'] || '').trim() || null;
  visits[id] = { id, member, date, data, saved: new Date().toISOString(), stopId };
  localStorage.setItem('roadys_site_visits', JSON.stringify(visits));
  dirty = false;
  renderVisitList();
  toast('Visit saved — ' + member);
}
```

- [ ] **Step 5: Verify**

```bash
grep -c "buildFleetCardRows()" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/site-visit.html"
grep -c "roadys_sitevisit_prefill" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/site-visit.html"
grep -c "stopId," "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/site-visit.html"
```

Expected: at least 1, at least 2 (one read + one remove), 1.

- [ ] **Step 6: Syntax check (site-visit.html).** DO NOT COMMIT.

---

## Task 5: gs-command-center.html — startSiteReview + payload builders

**Files:**
- Modify: `gs-command-center.html` (insert helpers above `function openSiteDrawer`)

- [ ] **Step 1: Locate insertion point**

```bash
grep -n "^function openSiteDrawer" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1 match. New helpers go on the lines immediately above.

- [ ] **Step 2: Insert helpers**

Use the Edit tool:

- `old_string`: `function openSiteDrawer(siteId){`
- `new_string`:

```js
// ─── Phase 9: Site Review integration ─────────────────────────────────
// Build a one-shot prefill payload from a stop's existing data and
// hand off to site-visit.html via a transient localStorage key.

function siteReviewsForStop(stopId){
  // Returns reviews from roadys_site_visits tagged with this stopId,
  // sorted newest-saved first.
  let visits = {};
  try { visits = JSON.parse(localStorage.getItem('roadys_site_visits') || '{}') || {}; } catch(e){}
  return Object.values(visits)
    .filter(v => v && v.stopId === stopId)
    .sort((a,b) => (b.saved||'').localeCompare(a.saved||''));
}

function allSiteReviews(){
  let visits = {};
  try { visits = JSON.parse(localStorage.getItem('roadys_site_visits') || '{}') || {}; } catch(e){}
  return Object.values(visits).sort((a,b) => (b.saved||'').localeCompare(a.saved||''));
}

function buildSiteReviewPrefill(stopId){
  // Translate the stop's data into the field-ID map site-visit.html expects.
  const stop = MEMBERS.find(m => m.id === stopId);
  if(!stop) return null;
  const rec = loadStopRecord(stopId);
  const m = currentMonthKey();

  const fields = {
    'hdr-member': stop.id + ': ' + (stop.name || ''),
    'hdr-id':     stop.id,
    'hdr-date':   new Date().toISOString().slice(0,10),
    'hdr-with':   rec.siteMgrName || '',
    'hdr-by':     (currentUser && (currentUser.full_name || currentUser.name)) || '',
    'hdr-addr':   [stop.street, stop.city, stop.state, stop.zip].filter(x => x && String(x).trim()).join(', ') + (stop.phone ? ' · ' + stop.phone : '')
  };

  // Gallon report — last 3 months from roadys_fuel
  const m1 = priorMonthKey(m);
  const m2 = priorMonthKey(m1);
  const m3 = priorMonthKey(m2);
  const g1 = stopTotalGallons(stopId, m1);
  const g2 = stopTotalGallons(stopId, m2);
  const g3 = stopTotalGallons(stopId, m3);
  const avg = Math.round((g1 + g2 + g3) / 3);
  fields['gal-1mo'] = g1 ? Math.round(g1) : '';
  fields['gal-2mo'] = g2 ? Math.round(g2) : '';
  fields['gal-3mo'] = g3 ? Math.round(g3) : '';
  fields['gal-avg'] = avg || '';

  // Rack info — current month
  let rack = {};
  try { const GD = loadFuelGD(); rack = GD[stopId]?.[m]?.rack || {}; } catch(e){}
  fields['rack-city']    = rack.rack_index || '';
  fields['rack-freight'] = rack.freight    != null ? rack.freight    : '';
  fields['rack-fed']     = rack.federal_tax!= null ? rack.federal_tax: '';
  fields['rack-state']   = rack.state_excise!= null? rack.state_excise: '';
  fields['rack-env']     = rack.misc_tax   != null ? rack.misc_tax   : '';
  fields['rack-load']    = ''; // not in our schema

  // Rewards YTD
  if(rec.rewardsYtdAdds    != null) fields['rwd-adds-2025']    = rec.rewardsYtdAdds;
  if(rec.rewardsYtdRedeems != null) fields['rwd-redeems-2025'] = rec.rewardsYtdRedeems;
  if(rec.rewardsYtdAdds && rec.rewardsYtdRedeems){
    fields['rwd-rate-2025'] = ((rec.rewardsYtdRedeems / rec.rewardsYtdAdds) * 100).toFixed(1) + '%';
  }

  // Aggregator discounts — current month
  const aggregatorDiscounts = [];
  try {
    const GD = loadFuelGD();
    const aggs = GD[stopId]?.[m]?.aggregators || [];
    for(const a of aggs){
      aggregatorDiscounts.push({
        name: a.name || '',
        retailMinus: a.retail_minus != null ? a.retail_minus : '',
        costPlus:    a.cost_plus    != null ? a.cost_plus    : '',
        betterOf:    ''
      });
    }
  } catch(e){}

  // Current vendors enrolled
  const currentVendors = [];
  try {
    const VPE = loadVendorEnrolls();
    const stopVP = VPE[stopId];
    if(stopVP && typeof stopVP === 'object'){
      const master = loadVendorMaster();
      for(const [vid, on] of Object.entries(stopVP)){
        if(!on) continue;
        const v = master.VP_VENDORS.find(x => x.id === vid);
        if(v && v.name) currentVendors.push(v.name);
      }
    }
  } catch(e){}

  // Fleet cards — derive from stopdata.acceptsFleetCards (with legacy fallback)
  const fleetCards = {};
  const afc = rec.acceptsFleetCards || {};
  for(const fc of FLEET_CARDS){
    fleetCards[fc.id] = !!afc[fc.id];
  }
  // Legacy: bring across acceptsFuelman / acceptsRcheck booleans if the new map is empty
  if(!afc.fuelman && rec.acceptsFuelman) fleetCards.fuelman = true;
  if(!afc.rcheck  && rec.acceptsRcheck)  fleetCards.rcheck  = true;

  return {
    stopId,
    reviewId: null,
    fields,
    aggregatorDiscounts,
    currentVendors,
    fleetCards
  };
}

function startSiteReview(stopId){
  const payload = buildSiteReviewPrefill(stopId);
  if(!payload){ toast('Stop not found'); return; }
  try { localStorage.setItem('roadys_sitevisit_prefill', JSON.stringify(payload)); }
  catch(e){ toast('Could not stage prefill: ' + (e.message||e)); return; }
  // Bridge the canonical FLEET_CARDS list (idempotent — written at boot too).
  try { localStorage.setItem('roadys_fleet_cards', JSON.stringify(FLEET_CARDS)); } catch(e){}
  window.open('site-visit.html?stop=' + encodeURIComponent(stopId), '_blank', 'noopener');
}

function openSiteReview(reviewId){
  // Open an existing saved review (no fresh prefill).
  window.open('site-visit.html?reviewId=' + encodeURIComponent(reviewId), '_blank', 'noopener');
}

function pagePastReviewsHTML(stopId){
  const reviews = siteReviewsForStop(stopId);
  const fmtDateRel = iso => {
    if(!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    const days = Math.floor(ms / 86400000);
    if(days < 1) return 'today';
    if(days < 7) return days + 'd ago';
    if(days < 30) return Math.floor(days/7) + 'w ago';
    if(days < 365) return Math.floor(days/30) + 'mo ago';
    return Math.floor(days/365) + 'y ago';
  };
  if(!reviews.length){
    return `
      <div class="drawer-card">
        <div class="drawer-card-hd">📋 Past Site Reviews (0)</div>
        <div style="font-size:.78em;color:var(--muted);padding:6px 0">No site reviews on file. Click <b>📋 Site Review</b> on the header to start one.</div>
      </div>
    `;
  }
  const rows = reviews.map(r => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:var(--bg);border-radius:4px;margin-bottom:4px;font-size:.82em">
      <div>
        <b>${esc(r.date || '—')}</b>
        <span style="color:var(--muted);margin-left:8px;font-size:.86em">saved ${esc(fmtDateRel(r.saved))}</span>
      </div>
      <button class="btn btn-cyan" onclick="openSiteReview('${esc(r.id)}')" style="font-size:.7em;padding:3px 8px">Open →</button>
    </div>
  `).join('');
  return `
    <div class="drawer-card">
      <div class="drawer-card-hd">📋 Past Site Reviews (${reviews.length})</div>
      ${rows}
    </div>
  `;
}

function renderSiteReviews(){
  const el = document.getElementById('site-reviews-content');
  if(!el) return;
  const all = allSiteReviews();
  const allMode = isAllGSMode();
  const myStopIds = new Set(myStops.map(s => s.id));
  // Scope: GS sees reviews for their stops + legacy reviews with no stopId.
  // Manager All-GS sees everything.
  const scoped = allMode
    ? all
    : all.filter(r => !r.stopId || myStopIds.has(r.stopId));

  const fmtDateRel = iso => {
    if(!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    const days = Math.floor(ms / 86400000);
    if(days < 1) return 'today';
    if(days < 7) return days + 'd ago';
    if(days < 30) return Math.floor(days/7) + 'w ago';
    if(days < 365) return Math.floor(days/30) + 'mo ago';
    return Math.floor(days/365) + 'y ago';
  };

  el.innerHTML = `
    <div class="card">
      <div class="card-hd" style="justify-content:space-between">
        <span>📋 Site Reviews (${scoped.length}${allMode ? ' across network' : ' in your territory'})</span>
        <div style="display:flex;gap:6px">
          <input id="site-rev-search" placeholder="Search member / stop ID..." oninput="renderSiteReviews()" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text);font-size:.82em;min-width:220px">
        </div>
      </div>
      <div style="font-size:.72em;color:var(--muted);margin-bottom:10px">
        Click a row to open the review in a new tab. Reviews are saved network-wide; this list is scoped to ${allMode ? 'every territory' : 'your assigned stops'}.
      </div>
      <div id="site-reviews-list-wrap"></div>
    </div>
  `;

  const q = (document.getElementById('site-rev-search')?.value || '').toLowerCase().trim();
  const filtered = q
    ? scoped.filter(r =>
        (r.member || '').toLowerCase().includes(q) ||
        (r.stopId || '').toLowerCase().includes(q))
    : scoped;

  const wrap = document.getElementById('site-reviews-list-wrap');
  if(!filtered.length){
    wrap.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:.82em">No reviews match.</div>';
    return;
  }
  wrap.innerHTML = `<div class="tbl-wrap"><table id="tbl-site-reviews"><thead><tr>
    <th>Date</th><th>Member</th><th>Stop ID</th>${allMode?'<th>GS</th>':''}<th>Saved</th><th data-no-sort="1"></th>
  </tr></thead><tbody>${filtered.map(r => {
    const stop = r.stopId ? MEMBERS.find(s => s.id === r.stopId) : null;
    const gs = stop ? (MANAGER_MAP[stop.state] || '—') : '—';
    return `<tr class="clickable" onclick="openSiteReview('${esc(r.id)}')">
      <td>${esc(r.date || '—')}</td>
      <td><b>${esc(r.member || '—')}</b></td>
      <td style="font-size:.78em;color:var(--muted)">${esc(r.stopId || '—')}</td>
      ${allMode?`<td style="font-size:.78em">${esc(gs)}</td>`:''}
      <td style="font-size:.78em;color:var(--muted)">${esc(fmtDateRel(r.saved))}</td>
      <td><button class="btn btn-cyan" onclick="event.stopPropagation();openSiteReview('${esc(r.id)}')" style="font-size:.7em;padding:3px 8px">Open →</button></td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
  applySortability();
}

// Phase 9 — Membership card chip toggle for fleet cards
function toggleFleetCard(stopId, cardId){
  if(isAllGSMode()){ toast('Pick a specific GS to edit'); return; }
  const rec = loadStopRecord(stopId);
  if(!rec.acceptsFleetCards) rec.acceptsFleetCards = {};
  rec.acceptsFleetCards[cardId] = !rec.acceptsFleetCards[cardId];
  // Sync legacy booleans for the two cards that have them
  if(cardId === 'fuelman') rec.acceptsFuelman = !!rec.acceptsFleetCards.fuelman;
  if(cardId === 'rcheck')  rec.acceptsRcheck  = !!rec.acceptsFleetCards.rcheck;
  saveData();
  // Re-render whichever surface is open (drawer always has this card)
  if(typeof renderStopDetailPage === 'function' && _stopDetailActiveStopId === stopId) renderStopDetailPage(stopId);
  if(typeof openSiteDrawer === 'function' && _drawerActiveStopId === stopId) openSiteDrawer(stopId);
}

function openSiteDrawer(siteId){
```

- [ ] **Step 3: Verify**

```bash
grep -c "^function startSiteReview" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function buildSiteReviewPrefill" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function pagePastReviewsHTML" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function renderSiteReviews" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function siteReviewsForStop" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function toggleFleetCard" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1, 1, 1, 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 6: Site Review header button on Stop Detail Page

**Files:**
- Modify: `gs-command-center.html` (`pageHeaderHTML` `.sd-actions`)

- [ ] **Step 1: Locate the existing Schedule Visit button**

```bash
grep -n "scheduleVisit.*'page'" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1 match inside `pageHeaderHTML`.

- [ ] **Step 2: Insert Site Review button between Email and Schedule Visit**

Use the Edit tool:

- `old_string`:
```
        <button class="btn" onclick="emailShareSummary('${esc(stopId)}')">📧 Email</button>
        ${isAllGSMode() ? '' : `<button class="btn btn-cyan" onclick="scheduleVisit('${esc(stopId)}','page')">📅 Schedule Visit</button>`}
```

- `new_string`:
```
        <button class="btn" onclick="emailShareSummary('${esc(stopId)}')">📧 Email</button>
        <button class="btn btn-cyan" onclick="startSiteReview('${esc(stopId)}')">📋 Site Review</button>
        ${isAllGSMode() ? '' : `<button class="btn btn-cyan" onclick="scheduleVisit('${esc(stopId)}','page')">📅 Schedule Visit</button>`}
```

⚠️ Site Review stays available in All-GS mode (managers can launch reviews on any stop), unlike Schedule Visit which is GS-only.

- [ ] **Step 3: Verify**

```bash
grep -c "startSiteReview('\\${esc(stopId)}')" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 7: Past Site Reviews card on Stop Detail Page

**Files:**
- Modify: `gs-command-center.html` (`renderStopDetailPage` left column)

- [ ] **Step 1: Locate the Visits / Notes slot order**

```bash
grep -n "\\${pageVisitsHTML(stopId)}" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1 match.

- [ ] **Step 2: Insert `${pagePastReviewsHTML(stopId)}` between Visits and Notes**

Use the Edit tool:

- `old_string`:
```
        ${pageActivityLogHTML(stopId)}
        ${pageVisitsHTML(stopId)}
        ${pageNotesHTML(stopId)}
```

- `new_string`:
```
        ${pageActivityLogHTML(stopId)}
        ${pageVisitsHTML(stopId)}
        ${pagePastReviewsHTML(stopId)}
        ${pageNotesHTML(stopId)}
```

- [ ] **Step 3: Verify**

```bash
grep -c "\\${pagePastReviewsHTML(stopId)}" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 8: New Site Reviews tab + panel + render hook

**Files:**
- Modify: `gs-command-center.html` (tab strip, panels block, `renderAll`)

- [ ] **Step 1: Locate the Critical tab**

```bash
grep -n 'data-tab="critical"' "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1 match.

- [ ] **Step 2: Insert Site Reviews tab after Critical**

Use the Edit tool:

- `old_string`:
```
    <div class="tab" data-tab="critical" onclick="switchTab('critical',this)">🚨 Critical<span class="badge" id="crit-badge" style="display:none">0</span></div>
    <div class="tab" data-tab="stop-detail" id="tab-stop-detail" style="display:none" onclick="switchTab('stop-detail',this)">📊 Stop Detail</div>
```

- `new_string`:
```
    <div class="tab" data-tab="critical" onclick="switchTab('critical',this)">🚨 Critical<span class="badge" id="crit-badge" style="display:none">0</span></div>
    <div class="tab" data-tab="site-reviews" onclick="switchTab('site-reviews',this)">📋 Site Reviews</div>
    <div class="tab" data-tab="stop-detail" id="tab-stop-detail" style="display:none" onclick="switchTab('stop-detail',this)">📊 Stop Detail</div>
```

- [ ] **Step 3: Locate the Critical panel**

```bash
grep -n 'id="p-critical"' "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1 match.

- [ ] **Step 4: Insert Site Reviews panel after Critical**

Use the Edit tool:

- `old_string`:
```
  <!-- ═══ CRITICAL ═══ -->
  <div class="panel" id="p-critical"><div class="container" id="crit-content"></div></div>

  <!-- ═══ STOP DETAIL PAGE (Phase 4) ═══ -->
```

- `new_string`:
```
  <!-- ═══ CRITICAL ═══ -->
  <div class="panel" id="p-critical"><div class="container" id="crit-content"></div></div>

  <!-- ═══ SITE REVIEWS (Phase 9) ═══ -->
  <div class="panel" id="p-site-reviews"><div class="container" id="site-reviews-content"></div></div>

  <!-- ═══ STOP DETAIL PAGE (Phase 4) ═══ -->
```

- [ ] **Step 5: Add `renderSiteReviews()` to `renderAll`**

```bash
grep -n "^function renderAll" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Read the body — should be a single `renderDashboard()...renderCritical()` chain. Add `renderSiteReviews()` to the end:

- `old_string`:
```
function renderAll(){
  renderDashboard();renderTerritory();renderCRM();renderCalendar();renderRates();renderCalculator();renderFuelIntro();renderCritical();
  applySortability();
}
```

- `new_string`:
```
function renderAll(){
  renderDashboard();renderTerritory();renderCRM();renderCalendar();renderRates();renderCalculator();renderFuelIntro();renderCritical();renderSiteReviews();
  applySortability();
}
```

- [ ] **Step 6: Verify**

```bash
grep -c 'data-tab="site-reviews"' "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c 'id="p-site-reviews"' "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c 'renderSiteReviews()' "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, at least 2 (one in renderAll + one inside the function definition).

- [ ] **Step 7: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 9: Membership card Fleet Cards chip strip

**Files:**
- Modify: `gs-command-center.html` (`drawerMembershipHTML`)

- [ ] **Step 1: Locate the Fuelman / R-Check checkbox block in the Membership card**

```bash
grep -n "Accepts <b>Fuelman" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Read 15-20 lines around the match to see the full checkbox block.

- [ ] **Step 2: Add Fleet Cards chip strip below the existing Fuelman/R-Check checkboxes**

The existing block currently looks like (verify exact text in file):

```html
        <div style="display:flex;gap:14px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input id="sd-fm-${stopId}" type="checkbox" ${rec.acceptsFuelman?'checked':''} onchange="onMembershipChange('${stopId}', 'acceptsFuelman', this.checked)"/>
            <span>Accepts <b>Fuelman</b></span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input id="sd-rc-${stopId}" type="checkbox" ${rec.acceptsRcheck?'checked':''} onchange="onMembershipChange('${stopId}', 'acceptsRcheck', this.checked)"/>
            <span>Accepts <b>R-Check</b></span>
          </label>
        </div>
      </div>
```

The closing `</div>` at the end is the closing of the `display:flex;flex-direction:column` outer wrapper. We add the Fleet Cards chip strip BEFORE that outer-closing `</div>`. Use Edit:

- `old_string`:
```
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input id="sd-rc-${stopId}" type="checkbox" ${rec.acceptsRcheck?'checked':''} onchange="onMembershipChange('${stopId}', 'acceptsRcheck', this.checked)"/>
            <span>Accepts <b>R-Check</b></span>
          </label>
        </div>
      </div>
```

- `new_string`:
```
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input id="sd-rc-${stopId}" type="checkbox" ${rec.acceptsRcheck?'checked':''} onchange="onMembershipChange('${stopId}', 'acceptsRcheck', this.checked)"/>
            <span>Accepts <b>R-Check</b></span>
          </label>
        </div>
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
          <div style="font-size:.6em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;font-weight:700">Fleet Cards Accepted</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${(() => {
              const afc = rec.acceptsFleetCards || {};
              // Legacy fallback: derive from existing booleans if new map is empty
              if(!afc.fuelman && rec.acceptsFuelman) afc.fuelman = true;
              if(!afc.rcheck  && rec.acceptsRcheck)  afc.rcheck  = true;
              const allMode = isAllGSMode();
              return FLEET_CARDS.map(fc => {
                const on = !!afc[fc.id];
                const cursor = allMode ? 'default' : 'pointer';
                const onclick = allMode ? '' : ` onclick="toggleFleetCard('${esc(stopId)}','${esc(fc.id)}')"`;
                const style = on
                  ? 'background:rgba(34,211,238,.15);color:var(--cyan);border:1px solid rgba(34,211,238,.4)'
                  : 'background:var(--bg);color:var(--muted);border:1px solid var(--border)';
                return `<span${onclick} style="${style};padding:3px 8px;border-radius:4px;font-size:.74em;cursor:${cursor};user-select:none">${esc(fc.label)}${on?' ✓':''}</span>`;
              }).join('');
            })()}
          </div>
        </div>
      </div>
```

- [ ] **Step 3: Verify**

```bash
grep -c "Fleet Cards Accepted" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "toggleFleetCard" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, at least 2 (function definition + onclick reference).

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 10: Final smoke + commit + push

**Files:**
- (No code changes; verification + commit + push only.)

- [ ] **Step 1: Final overall syntax check (both files)**

```bash
node -e "const fs=require('fs');for(const f of ['gs-command-center.html','site-visit.html']){const html=fs.readFileSync('c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/'+f,'utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g)||[];m.forEach(blk=>{const js=blk.replace(/^<script>|<\/script>$/g,'');new Function(js);});console.log(f+': syntax ok, '+m.length+' script blocks');}"
```

Expected: both files pass.

- [ ] **Step 2: Diff stat**

```bash
git -C "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" status
git -C "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" diff --stat gs-command-center.html site-visit.html
```

Expected: ~+260 in gs-command-center.html, ~+90 in site-visit.html.

- [ ] **Step 3: Browser smoke checklist**

Hard-reload `gs-command-center.html` (after the Phase 8.1 runbook is complete; otherwise fall back to opening the file directly):

- [ ] **Site Reviews tab** — visible in tab strip between Critical and (hidden) Stop Detail. Empty list with "no reviews match" if none saved.
- [ ] **Header button** — open any stop's Stop Detail Page → header shows `📋 Site Review` between Email and Schedule Visit → click → new tab opens to `site-visit.html?stop=<id>`.
- [ ] **Pre-fill** — verify Member name + ID, address (with phone), today's date, Site Manager name (if set), Reviewer = your full_name, gallon report 3-month lookback values, rack info, aggregator discounts (if any tracked), rewards YTD adds/redeems, current vendors checked.
- [ ] **Fleet Cards section** — new section visible under Merchant Console with 13 checkbox cards. Default-checked cards match the stop's `acceptsFleetCards` (legacy `acceptsFuelman` / `acceptsRcheck` booleans cascade).
- [ ] **Save flow** — fill in a manual field → Save → toast confirms. Close tab. Reopen the Stop Detail Page → "Past Site Reviews" card now shows 1 entry with the date and "saved Xd ago" → click `Open →` → loads the saved review.
- [ ] **Site Reviews tab** — go back to gs-command-center → Site Reviews tab → table shows the saved review → search by member or stop ID works → row click opens it.
- [ ] **Membership card chips** — Stop Detail Page Membership card shows the 13-chip strip, fuelman/rcheck pre-checked from legacy booleans → click another chip (e.g. Comdata) → toggles → reload page → still toggled.
- [ ] **Sync with legacy booleans** — toggle Fuelman chip → verify `acceptsFuelman` checkbox above also toggled → toggle the existing checkbox → chip follows.
- [ ] **Manager All-GS mode** — log in as Manager All-GS → Site Reviews tab shows every review with `[GS]` tag → Membership chips read-only (cursor: default) → Site Review header button still works.
- [ ] **Legacy reviews** — saved reviews from before Phase 9 (no `stopId`) appear in the All-GS list with `Stop ID: —` and no GS tag; they don't appear on any Stop Detail Page card.
- [ ] **Print** — open a saved review → click Print → preview shows all sections inline incl. the new Fleet Cards section.
- [ ] **Phase 4-8 regression** — drawer, Stop Detail Page existing cards (Membership / Rewards / Fuel / Vendor / Notes / Visits), Calendar, CRM, Calculator, Manager Editor, Phase 7 visits, Phase 8.1 auth all unaffected.

- [ ] **Step 4: Commit Phase 9**

```bash
cd "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && git add gs-command-center.html site-visit.html "docs/superpowers/specs/2026-05-04-phase-9-site-review-integration.md" "docs/superpowers/plans/2026-05-04-phase-9-site-review-integration.md" && git commit -m "$(cat <<'EOF'
GS Command Center Phase 9: Site Review integration

Wire the existing standalone site-visit.html review form into
gs-command-center.html. New entry points: Site Reviews top-level
tab, Site Review button on Stop Detail Page header, Past Site
Reviews card on Stop Detail Page. New Fleet Cards Accepted
checklist persisted on the stop record. Pre-fill payload hands off
via transient localStorage key. Saved reviews tagged with stopId.

gs-command-center.html (+260 lines):
- New FLEET_CARDS master list (13 networks: Fuelman, R-Check,
  Comdata, EFS, T-Chek, Fleet One, WEX, Voyager, Mudflap, AtoB,
  Pilot/FJ, TA/Petro, Shell). Bridge writer to localStorage so
  site-visit.html reads the canonical list.
- New helpers: siteReviewsForStop, allSiteReviews,
  buildSiteReviewPrefill, startSiteReview, openSiteReview,
  pagePastReviewsHTML, renderSiteReviews, toggleFleetCard.
- Stop Detail Page header: new Site Review button between Email
  and Schedule Visit. Stays available in Manager All-GS mode.
- Stop Detail Page left column: new Past Site Reviews card
  between Visits and Notes.
- New Site Reviews top-level tab + panel. List scoped to GS's
  stops in GS mode; full network in Manager All-GS with [GS] tag.
  Sortable table, search by member or stop ID.
- Membership card extension: 13-chip Fleet Cards Accepted strip
  below the existing Fuelman/R-Check checkboxes. Click to toggle;
  legacy booleans stay in sync. Read-only in Manager All-GS mode.

site-visit.html (+90 lines):
- New Fleet Cards Accepted section under Merchant Console with a
  13-checkbox grid. FLEET_CARDS list inline as fallback; bridge
  reader picks up the canonical list from localStorage.
- New buildFleetCardRows + applyPrefill helpers. applyPrefill
  handles flat ID->value field map, aggregator discounts (name
  matching), current vendors (yn-btn click), fleet cards checkboxes.
- Init IIFE detects URL params (?stop=, ?reviewId=) and transient
  localStorage prefill payload. Single-use: payload key is removed
  after read.
- saveVisit tags the saved record with stopId (priority: existing
  record's stopId, URL ?stop= param, manually-typed Stop ID).

Pre-fill auto-fills: header (member, address, phone, manager,
reviewer, date), gallon report (3-month lookback + avg from
roadys_fuel), rack info, aggregator discounts (name-matched), YTD
rewards adds/redeems/rate, current vendors enrolled (from
roadys_vp_enroll), fleet cards (from acceptsFleetCards).

Manual entry: Merchant Console (WEX creds), Fleet Discounts,
Restrooms / Showers / Signage checklists, Pictures & Social Media,
Administrative checks, Online Reviews, Amenities, Marketing
details, Fraud Alerts, Vendor Interested flags, Swag, Wrap Up.

No data migration to Supabase in Phase 9. roadys_site_visits stays
network-shared localStorage; acceptsFleetCards lives in
gs_cmd_<gs>_stopdata. Migrates with the 8.x track.

Spec: docs/superpowers/specs/2026-05-04-phase-9-site-review-integration.md
Plan: docs/superpowers/plans/2026-05-04-phase-9-site-review-integration.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Push**

```bash
git -C "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" push origin gs-command-center-workstation
```

---

## Out-of-scope reminders

- **Supabase migration** for `roadys_site_visits` and `acceptsFleetCards` — happens in Phase 8.5 alongside other cross-app data migrations.
- **Edit / delete a saved review from gs-command-center.html** — out of scope for v1; users go through `site-visit.html` for that.
- **Email / Slack / shared-link export of reviews** — out of scope.
- **Per-section autosave / draft conflict resolution** — out of scope (matches today's behavior).
- **Mobile / responsive review form layout** — out of scope (the existing form is desktop-first).