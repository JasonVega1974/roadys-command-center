# GS Command Center Phase 5 — GS Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the USA territory map + GS Manager Editor from `index.html` into `gs-command-center.html` as two new sub-tabs of the existing Territory tab. Map renders inline (no topojson runtime), Editor is manager-only with localStorage persistence and JSON import/export.

**Architecture:** Single-file edits to `gs-command-center.html`. SVG state paths are pre-baked once via a throwaway Node dev script, then inlined as a `STATE_PATHS` constant. `MANAGER_MAP` and `REGIONS` stay declared as `const` but their *contents* are mutated in place by editor actions; localStorage `gs_cmd_managers` overrides hardcoded defaults at app init. Existing 2-way `terSubTab` switcher extends to 3-way (map / list / editor).

**Tech Stack:** Pure HTML/JS/CSS, no build, no test framework. Verification = `node -e "new Function(<extracted-script>)"` syntax check + manual browser smoke test (consolidated at Task 11). One-time dev step (Task 1) requires Node + `npm install --no-save d3-geo topojson-client us-atlas`.

**Spec:** [docs/superpowers/specs/2026-05-01-phase-5-gs-management.md](../specs/2026-05-01-phase-5-gs-management.md).

**Phase boundary:** Phase 6 (Notes + Share) and Phase 7 (Schedule + Calendar) are out of scope.

---

## File Structure

**Modify only:** `gs-command-center.html`

**Throwaway dev artifact (not committed):** `scripts/build-state-paths.cjs` — Node script that fetches the us-atlas topojson, projects with d3-geo Albers-USA at 900×550, and writes `state-paths.json`. Used once in Task 1 to produce the inlined paths, then deleted (not part of the deployed app, not committed).

| Insertion point | What we add | Locator |
|---|---|---|
| After `PROCESSOR_RATES` array | New constants `STATE_PATHS`, `STATE_NAMES`, `ALL_STATES`, default snapshots, persistence helpers | `grep -n "^const PROCESSOR_RATES" gs-command-center.html` |
| After `let myStops = []` (~line 752) | Hydration call `loadManagerOverrides()` | `grep -n "^let myStops" gs-command-center.html` |
| `<style>` block | Map + editor CSS additions | After last existing CSS block |
| Territory sub-tab strip in `renderTerritory()` | New 👥 GS Manager Editor sub-tab (manager-only) | `grep -n "ter-sub-tab" gs-command-center.html` |
| `terSubTab()` body | Extend to 3-way switching | `grep -n "^function terSubTab" gs-command-center.html` |
| After `terDrill()` | New `renderTerritoryMap`, `renderUSAMapInline`, map helpers, `renderManagerEditor`, `renderMgrCards`, all `mgr*` functions | `grep -n "^function terDrill" gs-command-center.html` |

---

## Task 1: Generate `STATE_PATHS` (one-time dev step)

**Files:**
- Create (then delete): `scripts/build-state-paths.cjs`
- Read output: `state-paths.json`
- Modify: `gs-command-center.html` — paste `STATE_PATHS` constant at insertion point

- [ ] **Step 1: Create the dev script directory**

```bash
mkdir -p "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/scripts"
```

- [ ] **Step 2: Install one-shot npm packages (no-save, will be deleted)**

```bash
cd "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && npm install --no-save --no-package-lock d3-geo@3 topojson-client@3 us-atlas@3
```

Expected: `added N packages` — packages drop into `node_modules/` only; no `package.json` mutation.

- [ ] **Step 3: Write the build script**

Use Write to create `scripts/build-state-paths.cjs`:

```js
// One-time dev script: pre-bake Albers-USA projected SVG paths for all 50 states + DC.
// Run from repo root: node scripts/build-state-paths.cjs
// Output: state-paths.json
const fs = require('fs');
const path = require('path');

const FIPS_TO_STATE = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL',
  '13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME',
  '24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH',
  '34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI',
  '45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY'
};

(async () => {
  const topojson = require('topojson-client');
  const d3geo = require('d3-geo');
  const usAtlas = require('us-atlas/states-10m.json');
  const states = topojson.feature(usAtlas, usAtlas.objects.states);
  const projection = d3geo.geoAlbersUsa().fitSize([900, 550], states);
  const pathFn = d3geo.geoPath().projection(projection);
  const STATE_PATHS = {};
  states.features.forEach(f => {
    const fips = String(f.id).padStart(2, '0');
    const abbr = FIPS_TO_STATE[fips];
    if(abbr){
      const d = pathFn(f);
      if(d) STATE_PATHS[abbr] = d;
    }
  });
  // Sort keys alphabetically for diff stability
  const sorted = {};
  Object.keys(STATE_PATHS).sort().forEach(k => sorted[k] = STATE_PATHS[k]);
  fs.writeFileSync('state-paths.json', JSON.stringify(sorted, null, 2));
  console.log('Wrote state-paths.json with', Object.keys(sorted).length, 'states');
})();
```

- [ ] **Step 4: Run the build script**

```bash
cd "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && node scripts/build-state-paths.cjs
```

Expected: `Wrote state-paths.json with 51 states` (50 states + DC).

- [ ] **Step 5: Insert `STATE_PATHS` constant into `gs-command-center.html`**

Read `state-paths.json`. Locate the existing `PROCESSOR_RATES` array's closing `];` line:

```bash
grep -n "^];" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html" | head -5
```

The closing of `PROCESSOR_RATES` is around line 746. Use Edit to append a new constant block immediately after it. The `old_string` is the full `];` line that closes PROCESSOR_RATES (you'll need a few lines of preceding context to make it unique — use the last entry like `{agg:'On Ramp'...}` followed by `];`):

- `old_string`:
  ```
    {agg:'On Ramp',proc:'Cardless',rate:'1.25% / $2.00 Flat',note:''}
  ];
  ```
- `new_string`: that same block, followed by a blank line, the inlined STATE_PATHS object, then ALL_STATES + STATE_NAMES (Task 3 will cover hydration helpers; this task only inserts the data).

```js
  {agg:'On Ramp',proc:'Cardless',rate:'1.25% / $2.00 Flat',note:''}
];

// ═══════════════════════════════════════════════════════
// PHASE 5: USA TERRITORY MAP DATA
// ═══════════════════════════════════════════════════════
// Pre-baked Albers-USA projected SVG paths at viewBox 900×550.
// Generated once via scripts/build-state-paths.cjs (throwaway dev script).
const STATE_PATHS = <PASTE CONTENTS OF state-paths.json HERE>;

const STATE_NAMES = {
  'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas','CA':'California',
  'CO':'Colorado','CT':'Connecticut','DE':'Delaware','FL':'Florida','GA':'Georgia',
  'HI':'Hawaii','ID':'Idaho','IL':'Illinois','IN':'Indiana','IA':'Iowa',
  'KS':'Kansas','KY':'Kentucky','LA':'Louisiana','ME':'Maine','MD':'Maryland',
  'MA':'Massachusetts','MI':'Michigan','MN':'Minnesota','MS':'Mississippi','MO':'Missouri',
  'MT':'Montana','NE':'Nebraska','NV':'Nevada','NH':'New Hampshire','NJ':'New Jersey',
  'NM':'New Mexico','NY':'New York','NC':'North Carolina','ND':'North Dakota','OH':'Ohio',
  'OK':'Oklahoma','OR':'Oregon','PA':'Pennsylvania','RI':'Rhode Island','SC':'South Carolina',
  'SD':'South Dakota','TN':'Tennessee','TX':'Texas','UT':'Utah','VT':'Vermont',
  'VA':'Virginia','WA':'Washington','WV':'West Virginia','WI':'Wisconsin','WY':'Wyoming','DC':'D.C.'
};

const ALL_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
```

Replace `<PASTE CONTENTS OF state-paths.json HERE>` with the actual JSON object literal from `state-paths.json` (drop the outer wrap newlines if any, keep keys quoted as JSON does).

- [ ] **Step 6: Verify and clean up dev artifacts**

```bash
grep -c "^const STATE_PATHS" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^const STATE_NAMES" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^const ALL_STATES" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
node -e "const fs=require('fs');const html=fs.readFileSync('c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g);m.forEach((blk,i)=>{const js=blk.replace(/^<script>|<\/script>$/g,'');new Function(js);});console.log('syntax ok');"
```

Each grep prints `1`. Syntax check prints `syntax ok`.

Then delete the dev artifacts (they're throwaway, not committed):
```bash
rm -rf "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/scripts" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/state-paths.json" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/node_modules"
```

(`node_modules/` should already be in `.gitignore`. Confirm with `cat .gitignore`. If not, add it.)

DO NOT COMMIT. Phase 5 uses a single batched commit at Task 11.

---

## Task 2: CSS additions

**Files:**
- Modify: `gs-command-center.html` (CSS block, after the last Phase 4 CSS rule)

- [ ] **Step 1: Locate insertion point**

```bash
grep -n "@media print" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

The Phase 4 `@media print` block ends with a closing `}` near the top of the CSS. Find the very last CSS rule before `</style>`:

```bash
grep -n "^</style>" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Insert before `</style>`.

- [ ] **Step 2: Insert Phase 5 CSS rules immediately before `</style>`**

Use Edit. `old_string` is just the literal `</style>` line. `new_string` is the Phase 5 CSS block + the `</style>` line:

```css
/* Phase 5 — USA Territory Map */
.map-toolbar{display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap}
.map-mode-btn{padding:4px 12px;background:var(--bg2);color:var(--muted);border:1px solid var(--border);border-radius:4px;font-size:.72em;cursor:pointer;font-weight:600}
.map-mode-btn:hover{background:var(--bg3)}
.map-mode-btn.active{background:var(--cyan);color:var(--bg);border-color:var(--cyan)}
.map-mode-lbl{margin-left:auto;font-size:.72em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
#usa-map-wrap{position:relative;width:100%;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:14px;margin-bottom:14px}
#usa-map-svg{display:block;width:100%;height:auto;max-height:520px}
#usa-map-svg path{cursor:pointer;transition:opacity .15s}
#usa-map-svg path.selected{stroke:#fff;stroke-width:2;filter:drop-shadow(0 0 4px rgba(255,255,255,.6))}
#map-tooltip{position:fixed;background:var(--bg2);border:1px solid var(--cyan);border-radius:6px;padding:8px 12px;font-size:.78em;color:var(--text);pointer-events:none;display:none;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.4);min-width:180px}
#map-tooltip .tt-state{font-weight:800;color:var(--cyan);margin-bottom:4px}
#map-tooltip .tt-row{display:flex;justify-content:space-between;font-size:.86em;padding:1px 0}
#map-tooltip .tt-lbl{color:var(--muted)}
.map-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:1em;pointer-events:none}
/* Phase 5 — GS Manager Editor */
.mgr-toolbar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;padding:10px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:6px}
.mgr-toolbar .btn{font-size:.74em}
.mgr-cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.mgr-card{background:var(--bg2);border:1px solid var(--border);border-left:3px solid var(--cyan);border-radius:6px;padding:10px 12px}
.mgr-card-hd{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.mgr-card-hd .mgr-name{font-size:1em;font-weight:800}
.mgr-card-hd .mgr-region{font-size:.72em;color:var(--muted);margin-top:2px}
.mgr-card-hd .mgr-stats-line{font-size:.7em;color:var(--green);margin-top:2px}
.mgr-edit-btn{background:transparent;color:var(--muted);border:1px solid var(--border);padding:3px 8px;border-radius:4px;font-size:.7em;cursor:pointer}
.mgr-edit-btn:hover{background:var(--bg3);color:var(--text)}
.mgr-edit-btn.save{color:var(--green);border-color:var(--green)}
.mgr-edit-btn.cancel{color:var(--red);border-color:var(--red)}
.mgr-state-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.mgr-state-chip{font-size:.66em;padding:2px 6px;border-radius:3px;display:inline-flex;align-items:center;gap:4px}
.mgr-state-chip .chip-x{cursor:pointer;font-weight:700;opacity:.6}
.mgr-state-chip .chip-x:hover{opacity:1}
.mgr-edit-row{display:none;flex-wrap:wrap;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);align-items:flex-end}
.mgr-card.editing .mgr-edit-row{display:flex}
.mgr-edit-input{background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:.78em}
.add-mgr-form{display:none;margin-bottom:14px;padding:12px;background:var(--bg2);border:1px solid var(--cyan);border-radius:6px}
.add-mgr-form.show{display:block}
.add-mgr-form .form-row{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:8px}
.add-mgr-form select[multiple]{min-height:120px;min-width:200px}
```

- [ ] **Step 3: Verify CSS classes inserted**

```bash
grep -c "^\\.map-mode-btn{" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^\\.mgr-cards-grid{" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^#map-tooltip{" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^\\.mgr-edit-row{" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Each prints `1`.

- [ ] **Step 4: Syntax check**

```bash
node -e "const fs=require('fs');const html=fs.readFileSync('c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g);m.forEach((blk,i)=>{const js=blk.replace(/^<script>|<\/script>$/g,'');new Function(js);});console.log('syntax ok, '+m.length+' script blocks');"
```

Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 3: Persistence layer + hydration

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Insert defaults snapshots + persistence helpers immediately after `ALL_STATES`**

Locate the `ALL_STATES` constant (added in Task 1). Use Edit:

- `old_string`:
  ```
  const ALL_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
  ```
- `new_string`:

```js
const ALL_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

// Frozen deep-clone snapshots used by Reset-to-Defaults
const MANAGER_MAP_DEFAULTS = Object.freeze(JSON.parse(JSON.stringify(MANAGER_MAP)));
const REGIONS_DEFAULTS = Object.freeze(JSON.parse(JSON.stringify(REGIONS)));

// ─── Phase 5: Manager-config persistence ──────────────────────────────
function loadManagerOverrides(){
  try {
    const raw = localStorage.getItem('gs_cmd_managers');
    if(!raw) return;
    const saved = JSON.parse(raw);
    if(!saved || typeof saved !== 'object') return;
    if(!saved.MANAGER_MAP || !saved.REGIONS) return;
    // Validate REGIONS shape
    for(const k of Object.keys(saved.REGIONS)){
      const r = saved.REGIONS[k];
      if(!r || !Array.isArray(r.states)) return;
      if(r.color && !/^#[0-9a-fA-F]{6}$/.test(r.color)) return;
    }
    // Replace contents in place (preserve object identity)
    Object.keys(MANAGER_MAP).forEach(k => delete MANAGER_MAP[k]);
    Object.assign(MANAGER_MAP, saved.MANAGER_MAP);
    Object.keys(REGIONS).forEach(k => delete REGIONS[k]);
    Object.assign(REGIONS, saved.REGIONS);
  } catch(e){ console.warn('Phase 5: loadManagerOverrides failed', e); }
}
function saveManagerOverrides(){
  try {
    const payload = { MANAGER_MAP, REGIONS, version: 1, savedAt: new Date().toISOString() };
    localStorage.setItem('gs_cmd_managers', JSON.stringify(payload));
    if(typeof initGSSelector === 'function') initGSSelector();
  } catch(e){ console.warn('Phase 5: saveManagerOverrides failed', e); }
}
function resetManagerDefaults(){
  Object.keys(MANAGER_MAP).forEach(k => delete MANAGER_MAP[k]);
  Object.assign(MANAGER_MAP, JSON.parse(JSON.stringify(MANAGER_MAP_DEFAULTS)));
  Object.keys(REGIONS).forEach(k => delete REGIONS[k]);
  Object.assign(REGIONS, JSON.parse(JSON.stringify(REGIONS_DEFAULTS)));
  try { localStorage.removeItem('gs_cmd_managers'); } catch(e){}
  if(typeof populateGSSelector === 'function') populateGSSelector();
}
```

⚠️ The `MANAGER_MAP` and `REGIONS` constants must already be declared before this block (they are — at lines 565 and 693 respectively). Also, `MANAGER_MAP` runs a one-time post-declaration mutation at line 576 (`OPEN`→`Logan Resinkin`). The defaults snapshot is taken AFTER that mutation, so resetting restores the post-mutation state.

- [ ] **Step 2: Insert hydration call immediately after `let myStops = [];`**

Locate the line `let myStops = [];`:

```bash
grep -n "^let myStops" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Use Edit:
- `old_string`: `let myStops = [];`
- `new_string`:
```
let myStops = [];

// Phase 5: hydrate manager overrides from localStorage (must run before any render)
loadManagerOverrides();
```

- [ ] **Step 3: Verify**

```bash
grep -c "^function loadManagerOverrides" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function saveManagerOverrides" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function resetManagerDefaults" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^const MANAGER_MAP_DEFAULTS" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^const REGIONS_DEFAULTS" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "loadManagerOverrides();" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1, 1, 1, 2 (one definition call + one hydration call).

- [ ] **Step 4: Syntax check** (same `node -e ...` as before). Expected: `syntax ok, 1 script blocks`.

DO NOT COMMIT.

---

## Task 4: Sub-tab strip refactor + stub renderers

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Add the editor sub-tab to the strip**

Locate the existing 2-way sub-tab strip in `renderTerritory()`:

```bash
grep -n "ter-sub-tab.*Territory Map\|ter-sub-tab.*Stop List" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Use Edit:
- `old_string`:
  ```
      <div class="ter-sub-tabs">
        <div class="ter-sub-tab active" onclick="terSubTab('map',this)">🗺️ Territory Map</div>
        <div class="ter-sub-tab" onclick="terSubTab('list',this)">📋 Stop List</div>
      </div>
  ```
- `new_string`:
  ```
      <div class="ter-sub-tabs">
        <div class="ter-sub-tab active" onclick="terSubTab('map',this)">🗺️ Territory Map</div>
        <div class="ter-sub-tab" onclick="terSubTab('list',this)">📋 Stop List</div>
        ${currentUser?.isManager ? `<div class="ter-sub-tab" onclick="terSubTab('editor',this)">👥 GS Manager Editor</div>` : ''}
      </div>
  ```

- [ ] **Step 2: Add a third view container after `ter-view-list`**

Locate `<div id="ter-view-list" style="display:none">`. The closing `</div>` for that view ends with `</table></div></div>`. Find the unique closing line for `ter-view-list` (look for its closing `</div>` before the final template closing `</div>`):

```bash
grep -n "id=\"ter-view-list\"" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Use Edit. Find the unique line just before the template's final closing `\``:
- `old_string`:
  ```
        <div class="tbl-wrap"><table id="tbl-territory">
          <thead><tr><th data-no-sort="1">#</th><th>ID</th><th>Name</th><th>City/State</th><th>Type</th><th>Group</th><th>Phone</th><th>Manager</th><th>Last Contact</th><th data-no-sort="1">Actions</th></tr></thead>
          <tbody id="ter-tbody"></tbody>
        </table></div>
      </div>`;
  ```
- `new_string`:
  ```
        <div class="tbl-wrap"><table id="tbl-territory">
          <thead><tr><th data-no-sort="1">#</th><th>ID</th><th>Name</th><th>City/State</th><th>Type</th><th>Group</th><th>Phone</th><th>Manager</th><th>Last Contact</th><th data-no-sort="1">Actions</th></tr></thead>
          <tbody id="ter-tbody"></tbody>
        </table></div>
      </div>

      <div id="ter-view-editor" style="display:none"></div>`;
  ```

- [ ] **Step 3: Extend `terSubTab` to 3-way**

Locate:
```bash
grep -n "^function terSubTab" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Use Edit:
- `old_string`:
  ```
  function terSubTab(view,el){
    document.querySelectorAll('.ter-sub-tab').forEach(t=>t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('ter-view-map').style.display=view==='map'?'block':'none';
    document.getElementById('ter-view-list').style.display=view==='list'?'block':'none';
  }
  ```
- `new_string`:
  ```
  function terSubTab(view,el){
    document.querySelectorAll('.ter-sub-tab').forEach(t=>t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('ter-view-map').style.display=view==='map'?'block':'none';
    document.getElementById('ter-view-list').style.display=view==='list'?'block':'none';
    const ed=document.getElementById('ter-view-editor');
    if(ed) ed.style.display=view==='editor'?'block':'none';
    if(view==='map' && typeof renderTerritoryMap==='function') renderTerritoryMap();
    if(view==='editor' && typeof renderManagerEditor==='function') renderManagerEditor();
  }
  ```

- [ ] **Step 4: Add stubs for the new renderers + map mode globals + tooltip element**

Locate the existing `terDrill` function (somewhere after `renderTerritory`):

```bash
grep -n "^function terDrill" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Right above `terDrill`, insert globals + stubs:

Use Edit:
- `old_string`: `function terDrill(gsName){`
- `new_string`:
  ```
  // ─── Phase 5: Map state ──────────────────────────────────────────────
  let mapMode = (() => { try { return localStorage.getItem('gs_cmd_map_mode') || 'gallons'; } catch(e){ return 'gallons'; } })();
  function mapSetMode(mode){
    mapMode = mode;
    try { localStorage.setItem('gs_cmd_map_mode', mode); } catch(e){}
    if(typeof renderUSAMapInline === 'function') renderUSAMapInline();
    document.querySelectorAll('.map-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    const lbl = document.getElementById('usa-map-mode-lbl');
    if(lbl) lbl.textContent = mode==='gallons'?'Showing: Gallon Volume by Territory':mode==='revenue'?'Showing: Estimated Revenue by Territory':'Showing: Month-over-Month Growth';
  }
  // Stubs replaced in Tasks 5/6/8
  function renderTerritoryMap(){ /* Task 5 */ }
  function renderUSAMapInline(){ /* Task 6 */ }
  function renderManagerEditor(){ /* Task 8 */ }
  function renderMgrCards(){ /* Task 8 */ }

  function terDrill(gsName){
  ```

- [ ] **Step 5: Verify**

```bash
grep -c "function renderTerritoryMap" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "function renderUSAMapInline" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "function renderManagerEditor" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "id=\"ter-view-editor\"" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "GS Manager Editor" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1, 1, ≥1.

- [ ] **Step 6: Syntax check.** Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 7: Browser smoke**

Open `gs-command-center.html`, log in. Click Territory tab. Confirm sub-tab strip shows 2 entries for non-manager (Map · List). Log out, log in as Manager (PIN 9999). Confirm strip shows 3 entries (Map · List · GS Manager Editor). Click Editor → empty pane (renderer is a stub), no errors in console. DO NOT COMMIT.

---

## Task 5: Map skeleton — toolbar, SVG container, GS cards row

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Replace the `renderTerritoryMap` stub**

Use Edit:
- `old_string`: `function renderTerritoryMap(){ /* Task 5 */ }`
- `new_string`:

```js
function renderTerritoryMap(){
  const wrap = document.getElementById('ter-view-map');
  if(!wrap) return;
  const gsCardsHTML = renderGSCardsRow();
  wrap.innerHTML = `
    <div class="map-toolbar">
      <button class="map-mode-btn ${mapMode==='gallons'?'active':''}" data-mode="gallons" onclick="mapSetMode('gallons')">⛽ Gallons</button>
      <button class="map-mode-btn ${mapMode==='revenue'?'active':''}" data-mode="revenue" onclick="mapSetMode('revenue')">💰 Revenue</button>
      <button class="map-mode-btn ${mapMode==='growth'?'active':''}" data-mode="growth" onclick="mapSetMode('growth')">📈 Growth</button>
      <span class="map-mode-lbl" id="usa-map-mode-lbl"></span>
    </div>
    <div id="usa-map-wrap">
      <svg id="usa-map-svg" viewBox="0 0 900 550" xmlns="http://www.w3.org/2000/svg">
        <g id="states-group"></g>
      </svg>
      <div class="map-empty" id="map-empty" style="display:none">No data</div>
    </div>
    <div id="map-tooltip">
      <div class="tt-state" id="tt-state"></div>
      <div class="tt-row"><span class="tt-lbl">GS</span><span id="tt-mgr"></span></div>
      <div class="tt-row"><span class="tt-lbl">Stops</span><span id="tt-stops"></span></div>
      <div class="tt-row"><span class="tt-lbl">Gallons</span><span id="tt-gallons"></span></div>
      <div class="tt-row"><span class="tt-lbl">Est. Revenue</span><span id="tt-rev"></span></div>
    </div>
    <div class="card"><div class="card-hd">🗺️ Growth Strategist Territories</div>
      <div class="gs-cards-grid">${gsCardsHTML}</div>
    </div>
    <div id="ter-drill" style="display:none"></div>
  `;
  // Initialize mode label
  mapSetMode(mapMode);
  // Paint map
  renderUSAMapInline();
}

function renderGSCardsRow(){
  const gsNames = Object.keys(REGIONS).sort();
  const m = currentMonthKey();
  return gsNames.map(name => {
    const r = REGIONS[name];
    const stops = MEMBERS.filter(mb => mb.status==='active' && mb.group!=='None' && r.states.includes(mb.state));
    const groups = {};
    stops.forEach(s => { groups[s.group] = (groups[s.group]||0) + 1; });
    const overdue = stops.filter(s => { const lc = getLastContact(s.id); return ageDays(lc?.date) > 30; }).length;
    return `<div class="gs-card" style="border-left-color:${r.color}" data-gs="${esc(name)}" onclick="terDrill(this.dataset.gs)">
      <div class="gs-name" style="color:${r.color}">${esc(name)}</div>
      <div class="gs-region">${esc(r.label)} · ${stops.length} stops · ${r.states.length} states</div>
      <div class="state-pills">${r.states.map(st => '<span class="state-pill">'+esc(st)+'</span>').join('')}</div>
      <div class="gs-stats" style="margin-top:10px">
        <div class="gs-stat"><div class="gs-stat-val" style="color:var(--green)">${groups["Roady's"]||0}</div><div class="gs-stat-lbl">Roady's</div></div>
        <div class="gs-stat"><div class="gs-stat-val" style="color:var(--purple)">${groups['PTP']||0}</div><div class="gs-stat-lbl">PTP</div></div>
        <div class="gs-stat"><div class="gs-stat-val" style="color:${overdue?'var(--red)':'var(--green)'}">${overdue}</div><div class="gs-stat-lbl">Overdue</div></div>
      </div>
    </div>`;
  }).join('');
}
```

This replaces the `gsCards` HTML rendering currently inlined in `renderTerritory`. The existing `renderTerritory` will be left in place — it now produces the sub-tab strip and the empty `#ter-view-map` container, which `renderTerritoryMap()` fills on first map open. **Important**: locate the existing `renderTerritory` block where it produces gsCards inside `<div id="ter-view-map">` and trim that section. Specifically:

Find:
```
      <div id="ter-view-map">
        <div class="card"><div class="card-hd">🗺️ Growth Strategist Territories</div>
          <div class="gs-cards-grid">
            ${gsCards.map(g=>`<div class="gs-card" style="border-left-color:${g.region.color}" data-gs="${g.name}" onclick="terDrill(this.dataset.gs)">
              ...
            </div>`).join('')}
          </div>
        </div>

        <div id="ter-drill" style="display:none"></div>
      </div>
```

Replace its body to be empty (the new `renderTerritoryMap()` populates it lazily). Use Edit:

- `old_string`: the block above (verify exact match by reading the file first — it's around line ~1797–1814).
- `new_string`:
  ```
        <div id="ter-view-map"></div>
  ```

Also remove the now-unused `gsCards` build step at the top of `renderTerritory()`. Find the lines that compute `const gsNames=Object.keys(REGIONS);` through the end of `const gsCards=gsNames.map(...)` block. Use Edit to remove them. Keep only the necessary parts of `renderTerritory()` that build the sub-tab strip + the `#ter-view-list` filter UI.

⚠️ This is a refactor of `renderTerritory()`. Read the function in full first to scope the edit correctly. After the refactor, `renderTerritory()` should produce only the sub-tab strip + `#ter-view-map` (empty) + `#ter-view-list` (with filters) + `#ter-view-editor` (empty), then call `renderTerritoryMap()` to populate the map view (since that's the active sub-tab on first open).

- [ ] **Step 2: Hook initial map render into `renderTerritory()`**

After the `document.getElementById('ter-content').innerHTML = html;` line in `renderTerritory()`, add:

Use Edit. Find:
- `old_string`: `document.getElementById('ter-content').innerHTML=html;\n  filterTerritory();`
- `new_string`:
  ```
  document.getElementById('ter-content').innerHTML=html;
    renderTerritoryMap();
    filterTerritory();
  ```

- [ ] **Step 3: Verify**

```bash
grep -c "^function renderTerritoryMap" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function renderGSCardsRow" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "id=\"usa-map-svg\"" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "id=\"map-tooltip\"" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1, 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 5: Browser smoke**

Reload, click Territory. Map sub-tab now shows: 3 mode buttons (Gallons active), an empty SVG container, the GS cards row below (3-column grid). Clicking a GS card opens the existing drill panel. Mode buttons toggle visually but the map paths haven't been painted yet (Task 6). DO NOT COMMIT.

---

## Task 6: Map fill logic — paint paths, hover tooltip, click handler

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Replace the `renderUSAMapInline` stub + add helpers**

Use Edit:
- `old_string`: `function renderUSAMapInline(){ /* Task 6 */ }`
- `new_string`:

```js
function renderUSAMapInline(){
  const sg = document.getElementById('states-group');
  if(!sg) return;
  const m = currentMonthKey();
  const pm = priorMonthKey(m);
  const empty = document.getElementById('map-empty');
  // Build per-state aggregates
  const stateData = {};
  ALL_STATES.forEach(st => {
    const stops = MEMBERS.filter(mb => mb.state === st);
    const g = stops.reduce((s, mb) => s + stopTotalGallons(mb.id, m), 0);
    const gp = pm ? stops.reduce((s, mb) => s + stopTotalGallons(mb.id, pm), 0) : 0;
    const rev = estRevenueGS(g);
    const mgr = MANAGER_MAP[st] || 'Unassigned';
    const growth = (gp > 0) ? ((g - gp) / gp * 100) : null;
    stateData[st] = { stops: stops.length, g, gp, rev, mgr, growth };
  });
  // Determine max for opacity scaling
  let maxVal = 1;
  Object.values(stateData).forEach(sd => {
    const v = mapMode==='gallons' ? sd.g : mapMode==='revenue' ? sd.rev : Math.abs(sd.growth || 0);
    if(v > maxVal) maxVal = v;
  });
  const totalStops = MEMBERS.length;
  if(empty) empty.style.display = totalStops === 0 ? 'flex' : 'none';
  // Build SVG
  let html = '';
  Object.entries(STATE_PATHS).forEach(([st, path]) => {
    const sd = stateData[st] || { g:0, rev:0, mgr:'Unassigned', stops:0, growth:null };
    const baseColor = REGIONS[sd.mgr]?.color || '#3A4A6B';
    const val = mapMode==='gallons' ? sd.g : mapMode==='revenue' ? sd.rev : Math.abs(sd.growth || 0);
    const intensity = maxVal > 0 ? Math.min(1, val / maxVal) : 0;
    const opacity = 0.2 + intensity * 0.7;
    let fill;
    if(sd.mgr === 'Unassigned'){
      fill = 'rgba(58,74,107,0.2)';
    } else if(mapMode === 'growth' && sd.growth !== null){
      fill = sd.growth > 0 ? `rgba(0,214,143,${opacity})` : `rgba(255,71,87,${opacity})`;
    } else if(mapMode === 'growth' && sd.growth === null){
      fill = 'rgba(58,74,107,0.2)';
    } else {
      fill = hexToRgba(baseColor, opacity);
    }
    const cx = getCentroid(path, 'x');
    const cy = getCentroid(path, 'y');
    html += `<path id="state-${st}" d="${path}" fill="${fill}" stroke="#0a0e1a" stroke-width="1" data-st="${st}" data-mgr="${esc(sd.mgr)}" onmouseenter="mapShowTip(event,'${st}')" onmouseleave="mapHideTip()" onclick="mapClickState('${st}','${esc(sd.mgr)}')"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,0.92)" font-size="9" font-weight="700" font-family="var(--ff)" pointer-events="none" style="text-shadow:0 1px 2px rgba(0,0,0,.6)">${st}</text>`;
  });
  sg.innerHTML = html;
}

function hexToRgba(hex, alpha){
  if(typeof hex !== 'string') return `rgba(58,74,107,${alpha})`;
  if(hex.startsWith('rgb')) return hex.replace(')', `,${alpha})`).replace('rgb(', 'rgba(');
  const h = hex.replace('#','');
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getCentroid(pathStr, axis){
  const parts = pathStr.split(/[MLZCQASTHVmlzcqasthv,\s]+/).filter(s => s && !isNaN(parseFloat(s)));
  const nums = parts.map(Number);
  let xs = [], ys = [];
  for(let i = 0; i < nums.length - 1; i += 2){ xs.push(nums[i]); ys.push(nums[i+1]); }
  if(xs.length === 0) return 0;
  if(axis === 'x') return (Math.min(...xs) + Math.max(...xs)) / 2;
  return (Math.min(...ys) + Math.max(...ys)) / 2;
}

function mapShowTip(e, st){
  const m = currentMonthKey();
  const sd = document.getElementById('state-' + st);
  if(sd) sd.classList.add('selected');
  const stops = MEMBERS.filter(mb => mb.state === st);
  const g = stops.reduce((s, mb) => s + stopTotalGallons(mb.id, m), 0);
  const rev = estRevenueGS(g);
  const mgr = MANAGER_MAP[st] || 'Unassigned';
  const fmt = n => Math.round(+n||0).toLocaleString();
  const tt = document.getElementById('map-tooltip');
  if(!tt) return;
  document.getElementById('tt-state').textContent = STATE_NAMES[st] || st;
  document.getElementById('tt-mgr').textContent = mgr;
  document.getElementById('tt-stops').textContent = stops.length + ' stops';
  document.getElementById('tt-gallons').textContent = fmt(g) + ' gal';
  document.getElementById('tt-rev').textContent = '$' + fmt(rev);
  tt.style.display = 'block';
  tt.style.left = (e.clientX + 12) + 'px';
  tt.style.top = (e.clientY - 10) + 'px';
}
function mapHideTip(){
  const tt = document.getElementById('map-tooltip');
  if(tt) tt.style.display = 'none';
  document.querySelectorAll('#usa-map-svg path.selected').forEach(p => p.classList.remove('selected'));
}
function mapClickState(st, mgr){
  if(!mgr || mgr === 'Unassigned'){ toast(STATE_NAMES[st] + ' is unassigned'); return; }
  terDrill(mgr, st);
  const drill = document.getElementById('ter-drill');
  if(drill) drill.scrollIntoView({behavior:'smooth', block:'start'});
}
```

- [ ] **Step 2: Verify**

```bash
grep -c "^function renderUSAMapInline" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function hexToRgba" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function getCentroid" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function mapShowTip" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function mapClickState" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1, 1, 1.

- [ ] **Step 3: Syntax check.** Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 4: Browser smoke**

Reload, Territory tab. Map renders all 51 paths colored by GS. Hover any state — tooltip pops up at cursor with state name, GS, stop count, gallons, revenue. Click a state → drill panel opens for that GS, scrolls into view. Toggle mode buttons → colors recompute (green/red for Growth, GS-tinted for Gallons/Revenue). Unassigned states (e.g., HI, AK if not in REGIONS) render as muted grey. DO NOT COMMIT.

---

## Task 7: Drill panel — state highlight extension

**Files:**
- Modify: `gs-command-center.html` (`terDrill` function)

- [ ] **Step 1: Read current terDrill signature**

```bash
grep -n "^function terDrill" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Read the full function. The current signature is `function terDrill(gsName)`. We need to add an optional 2nd `highlightState` parameter and apply it to the state-card render.

- [ ] **Step 2: Extend signature + apply highlight**

Use Edit:
- `old_string`: `function terDrill(gsName){`
- `new_string`: `function terDrill(gsName, highlightState){`

Then find the state-card render line inside `terDrill` (the `byState` map). The current code wraps each state-card in a div like:
```
<div class="state-card" onclick="">
```

Use Edit:
- `old_string`: `<div class="state-card" onclick="">`
- `new_string`: `<div class="state-card" style="${highlightState===state?'border:2px solid '+r.color+';background:'+r.color+'18':''}" onclick="">`

⚠️ The exact `state-card` markup may vary slightly — read the surrounding context first. The state variable inside the `.map(state => ...)` callback may be named differently (e.g., `state` or `st`). Use the actual variable name from the existing code. If the existing code has `${byState ? ... : ...}` style logic, integrate inline.

- [ ] **Step 3: Verify**

```bash
grep -c "function terDrill(gsName, highlightState)" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "highlightState===" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 5: Browser smoke**

Reload. Click MI on the map (Logan's territory) → drill panel opens for Logan, MI's state-card has a colored border + tinted background indicating it was the click source. Click DE on the map → drill panel updates, DE highlighted instead.

---

## Task 8: Manager Editor — toolbar + collapsed cards

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Replace `renderManagerEditor` + `renderMgrCards` stubs**

Use Edit. Find:
- `old_string`:
  ```
  function renderManagerEditor(){ /* Task 8 */ }
  function renderMgrCards(){ /* Task 8 */ }
  ```
- `new_string`:

```js
function renderManagerEditor(){
  const wrap = document.getElementById('ter-view-editor');
  if(!wrap) return;
  wrap.innerHTML = `
    <div class="mgr-toolbar">
      <button class="btn" onclick="mgrShowAddForm()">➕ Add Manager</button>
      <button class="btn btn-green" onclick="mgrSaveAll()">💾 Save All</button>
      <button class="btn" onclick="mgrImportConfig()">📥 Import Config</button>
      <button class="btn" onclick="mgrExportConfig()">📤 Export Config</button>
      <button class="btn btn-red" onclick="mgrResetDefaults()" style="margin-left:auto">↺ Reset to Defaults</button>
    </div>
    <div id="mgr-add-form" class="add-mgr-form">
      <div class="form-row">
        <div style="display:flex;flex-direction:column;gap:2px">
          <label style="font-size:.62em;color:var(--muted);text-transform:uppercase">Name</label>
          <input id="add-mgr-name" type="text" class="mgr-edit-input" placeholder="e.g., Jane Doe" style="width:200px"/>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px">
          <label style="font-size:.62em;color:var(--muted);text-transform:uppercase">Color</label>
          <input id="add-mgr-color" type="color" value="#00C8FF" style="width:34px;height:28px;border:1px solid var(--border);border-radius:5px;background:transparent"/>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px">
          <label style="font-size:.62em;color:var(--muted);text-transform:uppercase">Region Label</label>
          <input id="add-mgr-label" type="text" class="mgr-edit-input" placeholder="e.g., Midwest" style="width:140px"/>
        </div>
      </div>
      <div class="form-row">
        <div style="display:flex;flex-direction:column;gap:2px">
          <label style="font-size:.62em;color:var(--muted);text-transform:uppercase">Initial States (Ctrl/Cmd to multi-select)</label>
          <select id="add-mgr-states" multiple>
            ${ALL_STATES.map(st => `<option value="${st}">${st} — ${STATE_NAMES[st]||st}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-green" onclick="mgrAddManager()" style="margin-top:auto">➕ Create</button>
        <button class="btn" onclick="mgrHideAddForm()" style="margin-top:auto">Cancel</button>
      </div>
    </div>
    <div class="mgr-cards-grid" id="mgr-cards-grid"></div>
  `;
  renderMgrCards();
}

function renderMgrCards(){
  const el = document.getElementById('mgr-cards-grid');
  if(!el) return;
  const managers = Object.keys(REGIONS).sort();
  const m = currentMonthKey();
  const fmt = n => Math.round(+n||0).toLocaleString();
  el.innerHTML = managers.map(mgr => {
    const r = REGIONS[mgr] || {states:[], color:'#3A4A6B', label:'—'};
    const color = r.color || '#3A4A6B';
    const label = r.label || '—';
    const states = (r.states || []).slice();
    const stops = MEMBERS.filter(mb => mb.status==='active' && mb.group!=='None' && states.includes(mb.state));
    const g = stops.reduce((s, mb) => s + stopTotalGallons(mb.id, m), 0);
    const eid = mgr.replace(/[^a-zA-Z0-9]/g, '_');
    const safeMgr = mgr.replace(/'/g, "\\'");
    const unassigned = ALL_STATES.filter(st => !MANAGER_MAP[st] || MANAGER_MAP[st] === 'Unassigned');
    const reassignable = ALL_STATES.filter(st => MANAGER_MAP[st] && MANAGER_MAP[st] !== 'Unassigned' && MANAGER_MAP[st] !== mgr);
    return `<div class="mgr-card" id="mgrcard-${eid}" style="border-left-color:${color}">
      <div class="mgr-card-hd">
        <div style="flex:1">
          <div class="mgr-name" style="color:${color}">${esc(mgr)}</div>
          <div class="mgr-region">${esc(label)} · ${states.length} states · ${stops.length} stops</div>
          <div class="mgr-stats-line">${fmt(g)} gallons / month</div>
        </div>
        <button class="mgr-edit-btn" id="mgrtoggle-${eid}" onclick="mgrToggleEdit('${eid}','${safeMgr}')" title="Edit territories">✏️ Edit</button>
      </div>
      <div class="mgr-state-chips" id="mgrchips-${eid}">
        ${states.map(st => `<span class="mgr-state-chip" style="background:${color}26;color:${color};border:1px solid ${color}55">${esc(st)}<span class="chip-x" onclick="mgrRemoveState('${safeMgr}','${esc(st)}','${eid}')" title="Remove ${esc(st)}">✕</span></span>`).join('')}
      </div>
      <div class="mgr-edit-row" id="mgredit-${eid}">
        <div style="display:flex;flex-direction:column;gap:2px">
          <label style="font-size:.62em;color:var(--muted);text-transform:uppercase">Add State</label>
          <select class="mgr-edit-input" id="mgraddst-${eid}" style="width:140px">
            <option value="">— Add —</option>
            ${unassigned.map(st => `<option value="${st}">${st} — ${esc(STATE_NAMES[st]||st)}</option>`).join('')}
            <optgroup label="Reassign from other GS">
              ${reassignable.map(st => `<option value="${st}">${st} (${esc(MANAGER_MAP[st])})</option>`).join('')}
            </optgroup>
          </select>
        </div>
        <button class="mgr-edit-btn" onclick="mgrAddStateTo('${safeMgr}','${eid}')" style="margin-top:auto">+ Add</button>
        <div style="display:flex;flex-direction:column;gap:2px">
          <label style="font-size:.62em;color:var(--muted);text-transform:uppercase">Region Label</label>
          <input type="text" class="mgr-edit-input" id="mgrlabel-${eid}" value="${esc(label)}" style="width:120px"/>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px">
          <label style="font-size:.62em;color:var(--muted);text-transform:uppercase">Color</label>
          <input type="color" id="mgrcolor-${eid}" value="${esc(color)}" style="width:34px;height:28px;border:1px solid var(--border);border-radius:5px;background:transparent"/>
        </div>
        <button class="mgr-edit-btn save" onclick="mgrSaveCard('${safeMgr}','${eid}')" style="margin-top:auto">💾 Save</button>
        <button class="mgr-edit-btn cancel" onclick="mgrToggleEdit('${eid}','${safeMgr}')" style="margin-top:auto">Cancel</button>
        <button class="mgr-edit-btn" onclick="mgrEditName('${safeMgr}')" style="margin-top:auto">✏️ Rename</button>
        <button class="mgr-edit-btn cancel" onclick="mgrRemoveMgr('${safeMgr}')" style="margin-top:auto">✕ Remove</button>
      </div>
    </div>`;
  }).join('');
}
function mgrShowAddForm(){
  const el = document.getElementById('mgr-add-form');
  if(el) el.classList.add('show');
}
function mgrHideAddForm(){
  const el = document.getElementById('mgr-add-form');
  if(el){
    el.classList.remove('show');
    document.getElementById('add-mgr-name').value = '';
    document.getElementById('add-mgr-label').value = '';
  }
}
```

- [ ] **Step 2: Verify**

```bash
grep -c "^function renderManagerEditor(){" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function renderMgrCards(){" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function mgrShowAddForm" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "id=\"mgr-add-form\"" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1, 1.

- [ ] **Step 3: Syntax check.** Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 4: Browser smoke**

Manager mode (PIN 9999), Territory tab, click "👥 GS Manager Editor" sub-tab. Toolbar shows 5 buttons. Below: 6 manager cards (alphabetical). Each card shows color stripe, name in color, label/state count/stop count, gallons/month, state chips. Editor row hidden by default. Click `✏️ Edit` on Logan — edit row expands with: Add State dropdown, color picker, label input, Save/Cancel/Rename/Remove buttons. None of the edit actions wired yet — handled in Task 9. DO NOT COMMIT.

---

## Task 9: Manager Editor — inline edit actions

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Add the 6 inline edit helpers**

Locate the `mgrHideAddForm` function (last function added in Task 8). Use Edit:
- `old_string`:
  ```
  function mgrHideAddForm(){
    const el = document.getElementById('mgr-add-form');
    if(el){
      el.classList.remove('show');
      document.getElementById('add-mgr-name').value = '';
      document.getElementById('add-mgr-label').value = '';
    }
  }
  ```
- `new_string`:

```js
function mgrHideAddForm(){
  const el = document.getElementById('mgr-add-form');
  if(el){
    el.classList.remove('show');
    document.getElementById('add-mgr-name').value = '';
    document.getElementById('add-mgr-label').value = '';
  }
}

function mgrToggleEdit(eid, mgr){
  const card = document.getElementById('mgrcard-'+eid);
  if(!card) return;
  card.classList.toggle('editing');
  const btn = document.getElementById('mgrtoggle-'+eid);
  if(!btn) return;
  if(card.classList.contains('editing')){
    btn.textContent = '▾ Editing';
    btn.style.borderColor = 'var(--cyan)';
    btn.style.color = 'var(--cyan)';
  } else {
    btn.textContent = '✏️ Edit';
    btn.style.borderColor = '';
    btn.style.color = '';
  }
}

function mgrAddStateTo(mgr, eid){
  const sel = document.getElementById('mgraddst-'+eid);
  const st = sel?.value;
  if(!st){ toast('Select a state to add'); return; }
  if(!ALL_STATES.includes(st)){ toast('Invalid state'); return; }
  const oldMgr = MANAGER_MAP[st];
  if(oldMgr && oldMgr !== 'Unassigned' && oldMgr !== mgr){
    if(!confirm(`${st} is currently assigned to ${oldMgr}. Reassign to ${mgr}?`)) return;
    if(REGIONS[oldMgr]) REGIONS[oldMgr].states = REGIONS[oldMgr].states.filter(s => s !== st);
  }
  MANAGER_MAP[st] = mgr;
  if(!REGIONS[mgr]) REGIONS[mgr] = { states:[st], color:'#00C8FF', label:mgr };
  else if(!REGIONS[mgr].states.includes(st)) REGIONS[mgr].states.push(st);
  saveManagerOverrides();
  renderMgrCards();
  if(typeof renderUSAMapInline === 'function') renderUSAMapInline();
  setTimeout(() => { const card = document.getElementById('mgrcard-'+mgr.replace(/[^a-zA-Z0-9]/g,'_')); if(card) card.classList.add('editing'); }, 50);
  toast(`${st} → ${mgr}`);
}

function mgrRemoveState(mgr, st, eid){
  if(!confirm(`Remove ${st} (${STATE_NAMES[st]||st}) from ${mgr}?`)) return;
  MANAGER_MAP[st] = 'Unassigned';
  if(REGIONS[mgr]) REGIONS[mgr].states = REGIONS[mgr].states.filter(s => s !== st);
  saveManagerOverrides();
  renderMgrCards();
  if(typeof renderUSAMapInline === 'function') renderUSAMapInline();
  setTimeout(() => { const card = document.getElementById('mgrcard-'+eid); if(card) card.classList.add('editing'); }, 50);
  toast(`${st} removed from ${mgr}`);
}

function mgrSaveCard(mgr, eid){
  const newLabel = document.getElementById('mgrlabel-'+eid)?.value.trim();
  const newColor = document.getElementById('mgrcolor-'+eid)?.value;
  if(!REGIONS[mgr]){ toast('Manager not found'); return; }
  if(newColor && !/^#[0-9a-fA-F]{6}$/.test(newColor)){ toast('Invalid color'); return; }
  if(newLabel) REGIONS[mgr].label = newLabel;
  if(newColor) REGIONS[mgr].color = newColor;
  saveManagerOverrides();
  renderMgrCards();
  if(typeof renderUSAMapInline === 'function') renderUSAMapInline();
  toast(`${mgr} updated`);
}

function mgrEditName(oldName){
  const newName = (prompt('Rename manager:', oldName) || '').trim();
  if(!newName || newName === oldName) return;
  if(REGIONS[newName]){ toast('Name already in use'); return; }
  Object.keys(MANAGER_MAP).forEach(st => { if(MANAGER_MAP[st] === oldName) MANAGER_MAP[st] = newName; });
  if(REGIONS[oldName]){ REGIONS[newName] = REGIONS[oldName]; delete REGIONS[oldName]; }
  saveManagerOverrides();
  renderMgrCards();
  if(typeof renderUSAMapInline === 'function') renderUSAMapInline();
  toast('Renamed to ' + newName);
}

function mgrRemoveMgr(mgr){
  if(!confirm(`Remove ${mgr} and unassign all their states?`)) return;
  Object.keys(MANAGER_MAP).forEach(st => { if(MANAGER_MAP[st] === mgr) MANAGER_MAP[st] = 'Unassigned'; });
  delete REGIONS[mgr];
  saveManagerOverrides();
  renderMgrCards();
  if(typeof renderUSAMapInline === 'function') renderUSAMapInline();
  toast(mgr + ' removed');
}
```

- [ ] **Step 2: Verify**

```bash
grep -c "^function mgrToggleEdit" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function mgrAddStateTo" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function mgrRemoveState" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function mgrSaveCard" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function mgrEditName" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function mgrRemoveMgr" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1, 1, 1, 1.

- [ ] **Step 3: Syntax check.** Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 4: Browser smoke**

Manager mode → Editor sub-tab. Click ✏️ Edit on Logan: edit row opens. Add a state (e.g., select WI from dropdown → click + Add → confirm reassign from Stefanie → state moves; map color updates). Click ✕ on a chip → confirm → state moves to Unassigned (chip disappears, map shows grey for that state). Change Logan's color via the color picker, click 💾 Save → map repaints with new Logan color. Click ✏️ Rename on Logan → prompt asks new name → enter "Logan R." → all references update everywhere. Click ✕ Remove on Burt → confirm → Burt's card disappears, all of Burt's states show as Unassigned on map. Refresh page → all changes persist. DO NOT COMMIT.

---

## Task 10: Manager Editor — toolbar actions

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Add the 5 toolbar action helpers**

Locate `mgrRemoveMgr` (last function added in Task 9). Use Edit:
- `old_string`:
  ```
  function mgrRemoveMgr(mgr){
    if(!confirm(`Remove ${mgr} and unassign all their states?`)) return;
    Object.keys(MANAGER_MAP).forEach(st => { if(MANAGER_MAP[st] === mgr) MANAGER_MAP[st] = 'Unassigned'; });
    delete REGIONS[mgr];
    saveManagerOverrides();
    renderMgrCards();
    if(typeof renderUSAMapInline === 'function') renderUSAMapInline();
    toast(mgr + ' removed');
  }
  ```
- `new_string`:

```js
function mgrRemoveMgr(mgr){
  if(!confirm(`Remove ${mgr} and unassign all their states?`)) return;
  Object.keys(MANAGER_MAP).forEach(st => { if(MANAGER_MAP[st] === mgr) MANAGER_MAP[st] = 'Unassigned'; });
  delete REGIONS[mgr];
  saveManagerOverrides();
  renderMgrCards();
  if(typeof renderUSAMapInline === 'function') renderUSAMapInline();
  toast(mgr + ' removed');
}

function mgrAddManager(){
  const name = (document.getElementById('add-mgr-name')?.value || '').trim();
  const color = document.getElementById('add-mgr-color')?.value;
  const label = (document.getElementById('add-mgr-label')?.value || '').trim() || name.split(' ')[0];
  const sel = document.getElementById('add-mgr-states');
  const states = sel ? Array.from(sel.selectedOptions).map(o => o.value) : [];
  if(!name){ toast('Manager name required'); return; }
  if(REGIONS[name]){ toast('Name already in use'); return; }
  if(color && !/^#[0-9a-fA-F]{6}$/.test(color)){ toast('Invalid color'); return; }
  for(const st of states){
    if(!ALL_STATES.includes(st)){ toast('Invalid state: '+st); return; }
  }
  REGIONS[name] = { states: states.slice(), color: color || '#00C8FF', label };
  states.forEach(st => { MANAGER_MAP[st] = name; });
  saveManagerOverrides();
  mgrHideAddForm();
  renderMgrCards();
  if(typeof renderUSAMapInline === 'function') renderUSAMapInline();
  toast(`${name} added with ${states.length} states`);
}

function mgrSaveAll(){
  saveManagerOverrides();
  toast('All manager assignments saved');
}

function mgrExportConfig(){
  const payload = { MANAGER_MAP, REGIONS, version: 1, savedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `gs_cmd_managers_${today}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 100);
  toast('Config exported');
}

function mgrImportConfig(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = e => {
    const file = e.target.files?.[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if(!data || !data.MANAGER_MAP || !data.REGIONS){ toast('Invalid config: missing MANAGER_MAP or REGIONS'); return; }
        for(const k of Object.keys(data.REGIONS)){
          const r = data.REGIONS[k];
          if(!r || !Array.isArray(r.states)){ toast('Invalid config: REGIONS shape'); return; }
          if(r.color && !/^#[0-9a-fA-F]{6}$/.test(r.color)){ toast('Invalid config: bad color in '+k); return; }
        }
        if(!confirm('Overwrite current manager assignments with imported config?')) return;
        Object.keys(MANAGER_MAP).forEach(k => delete MANAGER_MAP[k]);
        Object.assign(MANAGER_MAP, data.MANAGER_MAP);
        Object.keys(REGIONS).forEach(k => delete REGIONS[k]);
        Object.assign(REGIONS, data.REGIONS);
        saveManagerOverrides();
        renderMgrCards();
        if(typeof renderUSAMapInline === 'function') renderUSAMapInline();
        toast('Config imported');
      } catch(err){ toast('Import failed: '+err.message); }
    };
    reader.readAsText(file);
  };
  input.click();
}

function mgrResetDefaults(){
  if(!confirm('Reset all manager assignments to defaults? This cannot be undone.')) return;
  resetManagerDefaults();
  renderMgrCards();
  if(typeof renderUSAMapInline === 'function') renderUSAMapInline();
  toast('Defaults restored');
}
```

- [ ] **Step 2: Verify**

```bash
grep -c "^function mgrAddManager" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function mgrSaveAll" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function mgrExportConfig" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function mgrImportConfig" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function mgrResetDefaults" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1, 1, 1.

- [ ] **Step 3: Syntax check.** Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 4: Browser smoke**

Manager mode → Editor sub-tab.
1. Click ➕ Add Manager → form expands. Enter name "Test GS", color #ff00ff, label "Test", select states {OK, KS}. Click ➕ Create → confirm → new card appears, states move on map.
2. Click 📤 Export Config → file `gs_cmd_managers_<date>.json` downloads. Inspect — has all current assignments.
3. Edit something (e.g., remove Test GS via ✕ Remove).
4. Click 📥 Import Config → pick the previously downloaded file → confirm overwrite → Test GS reappears with its states.
5. Click ↺ Reset to Defaults → confirm → manager list returns to original 6 GS, Test GS gone, map repaints with default colors.
6. Click 💾 Save All → toast confirms.

DO NOT COMMIT.

---

## Task 11: GS selector sync + final smoke + commit + push

**Files:**
- Modify: `gs-command-center.html` (`populateGSSelector` extension)

- [ ] **Step 1: Verify `initGSSelector` is reachable from `saveManagerOverrides`**

The existing `initGSSelector()` at line ~1158 already populates the topbar GS dropdown from `Object.keys(REGIONS)`. `saveManagerOverrides` (added in Task 3) calls it via `if(typeof initGSSelector === 'function') initGSSelector();`. No new helper needed.

However, `initGSSelector()` rebuilds the dropdown but does NOT preserve the currently selected value. After a rename, the previously-selected manager name will be gone, so the dropdown defaults to its first option. Add value preservation. Use Edit:

- `old_string`:
  ```
  function initGSSelector(){
    const sel = document.getElementById('gs-selector');
    if(!sel) return;
    const opts = [`<option value="${ALL_GS}">${ALL_GS} (rollup)</option>`]
      .concat(Object.keys(REGIONS).map(name => `<option value="${esc(name)}">${esc(name)}</option>`));
    sel.innerHTML = opts.join('');
  }
  ```
- `new_string`:
  ```
  function initGSSelector(){
    const sel = document.getElementById('gs-selector');
    if(!sel) return;
    const current = sel.value;
    const gsNames = Object.keys(REGIONS);
    const opts = [`<option value="${ALL_GS}">${ALL_GS} (rollup)</option>`]
      .concat(gsNames.map(name => `<option value="${esc(name)}">${esc(name)}</option>`));
    sel.innerHTML = opts.join('');
    // Preserve current selection if it still exists
    if(current && (current === ALL_GS || gsNames.includes(current))) sel.value = current;
    else if(current && !gsNames.includes(current)) {
      // Currently-selected GS was renamed/removed — fall back to ALL_GS
      sel.value = ALL_GS;
      if(typeof managerSelection !== 'undefined') managerSelection = ALL_GS;
    }
  }
  ```

Verify:
```bash
grep -c "Preserve current selection" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```
Expected: 1.

- [ ] **Step 2: Verify hydration order is correct**

```bash
grep -n "loadManagerOverrides()" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

`loadManagerOverrides()` should be called once at module load (added in Task 3 right after `let myStops = [];`). Confirm this. The call should run BEFORE any render — currently `let myStops = [];` is near the top of the script block, so this should be fine.

- [ ] **Step 3: Final overall syntax check**

```bash
node -e "const fs=require('fs');const html=fs.readFileSync('c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g);m.forEach((blk,i)=>{const js=blk.replace(/^<script>|<\/script>$/g,'');new Function(js);});console.log('syntax ok, '+m.length+' script blocks');"
```

Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 4: Total diff stat**

```bash
git -C "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" diff --stat gs-command-center.html
```

Should show ~1200 lines added, no removals beyond the renderTerritory refactor in Task 5.

- [ ] **Step 5: Browser smoke checklist**

Hard-reload `gs-command-center.html`.

  - [ ] **Default load (any user)** — Territory tab shows sub-tab strip: 🗺️ Territory Map active, 📋 Stop List, plus 👥 GS Manager Editor only when logged in as Manager.
  - [ ] **Map sub-tab** — SVG renders all 50 states + DC, colored by GS. Mode buttons toggle Gallons / Revenue / Growth, label updates accordingly.
  - [ ] **Hover** — tooltip displays state name + GS + stop count + gallons + revenue. State path highlights with white stroke.
  - [ ] **Click state** — drill panel opens for that state's GS, with the state row highlighted in the breakdown.
  - [ ] **Click GS card below map** — drill panel opens for that GS, no state highlight.
  - [ ] **Manager (PIN 9999) → Editor sub-tab** — visible. Cards render alphabetically.
  - [ ] **Inline edit** — Logan's color → purple → map repaints. Add MT to Logan from Steph → state moves. Click ✕ on a chip → state moves to Unassigned (grey on map).
  - [ ] **Rename** — Logan → "Logan R." → all references update (cards, map, drill panel, topbar selector).
  - [ ] **Remove manager** — confirm → all states unassigned, manager removed from REGIONS, GS selector loses entry.
  - [ ] **Add manager** — toolbar ➕ → form → save → new card appears, states reassigned.
  - [ ] **Persistence** — refresh page → all changes preserved.
  - [ ] **Export** → JSON file downloads. Edit something. Import the file back → confirm overwrite → state restored.
  - [ ] **Reset** → confirm → defaults restored. Map repaints with original colors.
  - [ ] **Non-manager (per-GS PIN)** — Territory tab strip shows only Map + List sub-tabs. GS Manager Editor sub-tab not visible.
  - [ ] **Mode persistence** — switch to Revenue mode, refresh, confirm Revenue still active.

- [ ] **Step 6: Commit Phase 5**

```bash
cd "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && git add gs-command-center.html "docs/superpowers/plans/2026-05-02-phase-5-gs-management.md" && git commit -m "$(cat <<'EOF'
GS Command Center Phase 5: GS Management migration

Migrate USA territory map + Manager Editor from index.html into
gs-command-center.html as new sub-tabs of the existing Territory tab.
Inline pre-baked SVG paths (no topojson runtime, no d3 CDN).

- New constants STATE_PATHS (~50 KB Albers-USA projected paths for 50
  states + DC), STATE_NAMES, ALL_STATES.
- Persistence layer: loadManagerOverrides / saveManagerOverrides /
  resetManagerDefaults read/write localStorage 'gs_cmd_managers'.
  Frozen MANAGER_MAP_DEFAULTS / REGIONS_DEFAULTS for reset.
- Territory tab sub-tab strip extends to 3-way: 🗺️ Territory Map ·
  📋 Stop List · 👥 GS Manager Editor (manager-only).
- Map sub-tab: 3 mode buttons (Gallons / Revenue / Growth, persisted to
  gs_cmd_map_mode), inline SVG with state paths, hover tooltip with
  state/GS/stops/gallons/revenue, click-to-drill with state highlight.
  GS cards row below map (clickable, opens drill panel).
- Manager Editor sub-tab: per-GS card with color stripe, name, label,
  state chips (per-chip ✕). Inline edit row: Add State (with reassign-
  from-other-GS), Color, Label, Save, Cancel, Rename, Remove.
- Toolbar: ➕ Add Manager (form with name/color/label/initial states),
  💾 Save All, 📥 Import Config, 📤 Export Config (JSON download
  gs_cmd_managers_<date>.json), ↺ Reset to Defaults.
- terDrill extends with optional highlightState param — clicked state
  on map gets a colored border in the drill panel state breakdown.
- changeGSSelection / GS topbar dropdown sync via populateGSSelector
  call inside saveManagerOverrides (so rename / add / remove updates
  the selector immediately).

Spec: docs/superpowers/specs/2026-05-01-phase-5-gs-management.md
Plan: docs/superpowers/plans/2026-05-02-phase-5-gs-management.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Push**

```bash
git -C "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" push origin gs-command-center-workstation
```

---

## Out-of-scope reminders

- **Phase 6 (renumbered):** Notes panel + Share Results buttons.
- **Phase 7 (renumbered):** Schedule Next Visit + .ics / Google Calendar URL export.
- **Cross-device sync.** Manual via JSON export/import.
- **Audit log of editor changes.** Not tracked.
- **Conflict resolution / multi-user simultaneous edit.** Single-user-per-browser assumed.
- **Permission tier between manager and view-only.** Out of scope.
- **Schema migration tooling** for `gs_cmd_managers`. Future-version concern.
- **Print stylesheet for the map.** Out of scope.
