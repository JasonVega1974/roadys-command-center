# GS Command Center Phase 6 — Notes Panel + Share Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a threaded Notes panel (drawer + Stop Detail Page) and Share Results buttons (Copy + Email) to `gs-command-center.html`. Notes are append-only entries persisted to the existing `gs_cmd_<gs>_stopdata[stopId].notes` array. Share buttons produce a tight plain-text snapshot suitable for clipboard or `mailto:` body.

**Architecture:** Single-file edits to `gs-command-center.html`. Reuses existing `loadStopRecord`, `saveData`, `getActiveGS`, `currentMonthKey`, `stopTotalGallons`, `priorMonthKey`, `ytdGallonsForStop`, `estRevenueGS`, `estProfitGS`, `computeStopROI`, `loadFuelGD`, `loadVendorEnrolls`, `vendorOpportunityForStop`, `getLastContact`, `MEMBERS`, `MANAGER_MAP`, `esc`, `toast`. New helpers: `formatMonthLabel`, `notesEntriesHTML`, `pageNotesHTML`, `addNoteFromInput`, `toggleNotesExpand`, `buildShareSummary`, `copyShareSummary`, `copyShareSummaryFallback`, `emailShareSummary`.

**Tech Stack:** Pure HTML/JS/CSS, no build, no test framework. Verification = `node -e "new Function(<extracted-script>)"` syntax check + manual browser smoke test (consolidated at Task 8).

**Spec:** [docs/superpowers/specs/2026-05-04-phase-6-notes-and-share.md](../specs/2026-05-04-phase-6-notes-and-share.md).

**Phase boundary:** Phase 7 (Schedule Next Visit + .ics + Calendar URL) is out of scope.

---

## File Structure

**Modify only:** `gs-command-center.html`

| Insertion point | What we add | Locator |
|---|---|---|
| `<style>` block | Notes panel CSS rules | After last existing CSS rule, before `</style>` |
| Above `function openSiteDrawer` | `formatMonthLabel`, `notesEntriesHTML`, `pageNotesHTML`, `addNoteFromInput`, `toggleNotesExpand`, `buildShareSummary`, `copyShareSummary`, `copyShareSummaryFallback`, `emailShareSummary` | `grep -n "^function openSiteDrawer" gs-command-center.html` |
| Inside `openSiteDrawer` body | New `<div class="drawer-section"><h4>📝 Notes…</h4>…</div>` placed after Activity Log section | After the existing Activity Log `</div>` |
| Inside `renderStopDetailPage` left column | New `${pageNotesHTML(stopId)}` slot after `${pageActivityLogHTML(stopId)}` | Inside the LEFT `.sd-col` |
| `pageHeaderHTML` `.sd-actions` | Two new buttons `📋 Copy` + `📧 Email` placed before the existing Print + Export CSV | Inside `.sd-actions` div |

---

## Task 1: CSS additions

**Files:**
- Modify: `gs-command-center.html` (CSS block, immediately before `</style>`)

- [ ] **Step 1: Locate insertion point**

```bash
grep -n "^</style>" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: a single match. New rules go on the line directly before `</style>`.

- [ ] **Step 2: Insert Phase 6 CSS rules immediately before `</style>`**

Use the Edit tool. `old_string` is the literal `</style>` line. `new_string` is the new CSS block followed by `</style>`:

```css
/* Phase 6 — Notes panel */
.notes-list{display:flex;flex-direction:column;gap:0;margin-top:8px}
.notes-entry{padding:8px 0;border-top:1px solid var(--border);font-size:.82em}
.notes-entry:first-child{border-top:0}
.notes-entry-meta{font-size:.68em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.notes-entry-body{margin-top:4px;white-space:pre-wrap;line-height:1.4}
.notes-empty{font-size:.78em;color:var(--muted);font-style:italic;padding:6px 0}
.notes-input{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--text);font-family:var(--ff);font-size:.84em;resize:vertical;min-height:60px}
.notes-input:focus{outline:none;border-color:var(--cyan)}
.notes-save-row{display:flex;justify-content:flex-end;margin-top:6px}
.notes-toggle{display:inline-block;cursor:pointer;color:var(--cyan);font-size:.78em;font-weight:700;padding:6px 0;margin-top:4px}
.notes-extra{display:none}
.notes-list.expanded .notes-extra{display:block}
</style>
```

- [ ] **Step 3: Verify CSS classes inserted**

```bash
grep -c "^\\.notes-entry{" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^\\.notes-input{" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^\\.notes-toggle{" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^\\.notes-empty{" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Each prints `1`.

- [ ] **Step 4: Syntax check**

```bash
node -e "const fs=require('fs');const html=fs.readFileSync('c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g);m.forEach((blk,i)=>{const js=blk.replace(/^<script>|<\/script>$/g,'');new Function(js);});console.log('syntax ok, '+m.length+' script blocks');"
```

Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT (Phase 6 uses a single batched commit at Task 8).

---

## Task 2: Notes infrastructure (`notesEntriesHTML`, `pageNotesHTML`, `addNoteFromInput`, `toggleNotesExpand`)

**Files:**
- Modify: `gs-command-center.html` (insert helpers above `function openSiteDrawer`)

- [ ] **Step 1: Locate the insertion point**

```bash
grep -n "^function openSiteDrawer" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: a single match. The new helpers go on the lines immediately above this function.

- [ ] **Step 2: Insert the 4 Notes helpers**

Use the Edit tool:
- `old_string`: `function openSiteDrawer(siteId){`
- `new_string`:

```js
// ─── Phase 6: Notes panel ─────────────────────────────────────────────
function notesEntriesHTML(stopId, opts){
  // opts.surface = 'drawer' | 'page'  — used to namespace the textarea id
  const surface = (opts && opts.surface) || 'page';
  const rec = loadStopRecord(stopId);
  const notes = Array.isArray(rec.notes) ? rec.notes : [];
  const allMode = isAllGSMode();
  const TOP_N = 10;
  const inputId = `notes-input-${surface}-${stopId}`;
  const composeRow = allMode ? '' : `
    <textarea class="notes-input" id="${inputId}" rows="3" placeholder="Add a note for this stop..."></textarea>
    <div class="notes-save-row">
      <button class="btn btn-cyan" onclick="addNoteFromInput('${esc(stopId)}','${surface}')" style="font-size:.74em">💾 Save Note</button>
    </div>
  `;
  const fmtTs = iso => {
    if(!iso) return '—';
    const d = new Date(iso);
    if(isNaN(d.getTime())) return '—';
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  const renderEntry = (n, isExtra) => `<div class="notes-entry${isExtra ? ' notes-extra' : ''}">
    <div class="notes-entry-meta">${fmtTs(n.date)} · ${esc(n.author||'—')}</div>
    <div class="notes-entry-body">${esc(n.body||'')}</div>
  </div>`;
  let listHTML = '';
  if(!notes.length){
    listHTML = `<div class="notes-empty">No notes yet.${allMode ? '' : ' Use the box above to start.'}</div>`;
  } else {
    const visible = notes.slice(0, TOP_N).map(n => renderEntry(n, false)).join('');
    const extras = notes.slice(TOP_N).map(n => renderEntry(n, true)).join('');
    const extraCount = notes.length - TOP_N;
    const toggle = extraCount > 0
      ? `<div class="notes-toggle" data-count="${extraCount}" onclick="toggleNotesExpand(this)">+ Show all ${extraCount} more</div>`
      : '';
    listHTML = `<div class="notes-list">${visible}${extras}${toggle}</div>`;
  }
  return composeRow + listHTML;
}

function pageNotesHTML(stopId){
  const rec = loadStopRecord(stopId);
  const count = Array.isArray(rec.notes) ? rec.notes.length : 0;
  return `
    <div class="drawer-card">
      <div class="drawer-card-hd">📝 Notes (${count})</div>
      ${notesEntriesHTML(stopId, {surface:'page'})}
    </div>
  `;
}

function addNoteFromInput(stopId, surface){
  if(isAllGSMode()){ toast('Pick a specific GS to add notes'); return; }
  const inputId = `notes-input-${surface}-${stopId}`;
  const ta = document.getElementById(inputId);
  if(!ta) return;
  const body = (ta.value || '').trim();
  if(!body){ toast('Empty note'); return; }
  const rec = loadStopRecord(stopId);
  if(!Array.isArray(rec.notes)) rec.notes = [];
  rec.notes.unshift({
    id: 'note_' + Date.now(),
    date: new Date().toISOString(),
    author: getActiveGS() || 'Manager',
    body
  });
  saveData();
  ta.value = '';
  toast('Note added');
  // Re-render whichever surface this came from. The drawer and the
  // Stop Detail Page own their own DOM, so we re-render only the one
  // the user is interacting with — not both.
  if(surface === 'drawer'){
    if(typeof openSiteDrawer === 'function') openSiteDrawer(stopId);
  } else {
    if(typeof renderStopDetailPage === 'function') renderStopDetailPage(stopId);
  }
}

function toggleNotesExpand(btn){
  const list = btn.parentElement;
  if(!list) return;
  const expanded = list.classList.toggle('expanded');
  const count = btn.dataset.count || '0';
  btn.textContent = expanded ? '− Show fewer' : '+ Show all ' + count + ' more';
}

function openSiteDrawer(siteId){
```

- [ ] **Step 3: Verify**

```bash
grep -c "^function notesEntriesHTML" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function pageNotesHTML" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function addNoteFromInput" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function toggleNotesExpand" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1, 1.

- [ ] **Step 4: Syntax check**

```bash
node -e "const fs=require('fs');const html=fs.readFileSync('c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g);m.forEach((blk,i)=>{const js=blk.replace(/^<script>|<\/script>$/g,'');new Function(js);});console.log('syntax ok, '+m.length+' script blocks');"
```

Expected: `syntax ok, 1 script blocks`.

DO NOT COMMIT.

---

## Task 3: Drawer integration — add Notes section after Activity Log

**Files:**
- Modify: `gs-command-center.html` (`openSiteDrawer` body)

- [ ] **Step 1: Locate the Activity Log section in `openSiteDrawer`**

```bash
grep -n "📋 Activity Log" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Read 30-40 lines starting at the match in `openSiteDrawer` to see the exact closing of the Activity Log `<div class="drawer-section">` block (it ends with `</div>` followed by the closing template-literal backtick of the `innerHTML` template).

- [ ] **Step 2: Insert the new Notes section after the Activity Log section's closing `</div>`**

The Activity Log section in `openSiteDrawer` ends with this closing pattern (read the actual lines first — exact whitespace matters):

```
        </div>`).join(''):'<div style="padding:16px;text-align:center;color:var(--muted);font-size:.82em">No activity logged. Click + Add to start.</div>'}
      </div>
    </div>
  `;
```

The first `</div>` closes the inner scrollable list, the second `</div>` closes the Activity Log `drawer-section`, and the next line closes the `innerHTML` template literal.

Use the Edit tool. The `old_string` is the trailing 3 lines (the inner `</div>`, the section `</div>`, and the literal-closing backtick line). The `new_string` is the same 3 lines with the Notes section inserted between the section `</div>` and the literal close:

- `old_string`:
```
        </div>`).join(''):'<div style="padding:16px;text-align:center;color:var(--muted);font-size:.82em">No activity logged. Click + Add to start.</div>'}
      </div>
    </div>
  `;
```

- `new_string`:
```
        </div>`).join(''):'<div style="padding:16px;text-align:center;color:var(--muted);font-size:.82em">No activity logged. Click + Add to start.</div>'}
      </div>
    </div>

    <div class="drawer-section">
      <h4>📝 Notes (${(loadStopRecord(siteId).notes||[]).length})</h4>
      ${notesEntriesHTML(siteId, {surface:'drawer'})}
    </div>
  `;
```

⚠️ Read the function body first to confirm exact indentation. The drawer's `innerHTML` template uses 4-space indentation for sections; preserve it.

- [ ] **Step 3: Verify**

```bash
grep -c "📝 Notes (\${(loadStopRecord(siteId).notes" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "notesEntriesHTML(siteId, {surface:'drawer'})" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1.

- [ ] **Step 4: Syntax check** (same `node -e` command from Task 1 Step 4). Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 4: Stop Detail Page integration — add Notes card after Activity Log

**Files:**
- Modify: `gs-command-center.html` (`renderStopDetailPage` left column)

- [ ] **Step 1: Locate the left column slot order in `renderStopDetailPage`**

```bash
grep -n "pageActivityLogHTML(stopId)" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 2 matches — one is the function definition, one is the call inside `renderStopDetailPage`. Read the second match's surrounding 5 lines.

- [ ] **Step 2: Insert `${pageNotesHTML(stopId)}` after `${pageActivityLogHTML(stopId)}`**

Use the Edit tool. The exact `old_string` is the line containing `${pageActivityLogHTML(stopId)}` plus the line below it (which closes the LEFT `.sd-col` `<div>`):

- `old_string`:
```
        ${pageActivityLogHTML(stopId)}
      </div>
```

- `new_string`:
```
        ${pageActivityLogHTML(stopId)}
        ${pageNotesHTML(stopId)}
      </div>
```

⚠️ This pattern appears once in `renderStopDetailPage` (the closing of the LEFT `.sd-col`). The right column's closing `</div>` is preceded by `${pageHistoryTableHTML(stopId)}`, not `${pageActivityLogHTML(stopId)}`, so this Edit is unambiguous.

- [ ] **Step 3: Verify**

```bash
grep -c "\\${pageNotesHTML(stopId)}" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

- [ ] **Step 5: Browser smoke test (intermediate)**

Hard-reload `gs-command-center.html`, log in as a per-GS PIN. Click any stop → drawer opens → 📝 Notes section visible after Activity Log. Type "first note" → click 💾 Save Note → entry appears, textarea clears, toast confirms. Click 🗗 Full Page → Stop Detail Page → Notes card visible in left column with the same entry. Add a 2nd note from the page side → entry appears at the top.

DO NOT COMMIT.

---

## Task 5: Share infrastructure — `formatMonthLabel` + `buildShareSummary`

**Files:**
- Modify: `gs-command-center.html` (insert helpers above the Notes helpers added in Task 2)

- [ ] **Step 1: Locate the insertion point**

```bash
grep -n "^// ─── Phase 6: Notes panel ─" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1 match. The new Share helpers go on the lines immediately above the Notes panel comment.

- [ ] **Step 2: Insert `formatMonthLabel` + `buildShareSummary`**

Use the Edit tool:
- `old_string`: `// ─── Phase 6: Notes panel ─────────────────────────────────────────────`
- `new_string`:

```js
// ─── Phase 6: Share Results ───────────────────────────────────────────
function formatMonthLabel(monthKey){
  const [y, mo] = monthKey.split('-').map(Number);
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mo-1] + ' ' + y;
}

function buildShareSummary(stopId){
  const stop = MEMBERS.find(m => m.id === stopId);
  if(!stop) return '';
  const m = currentMonthKey();
  const pm = priorMonthKey(m);
  const monthLbl = formatMonthLabel(m);
  const gsName = MANAGER_MAP[stop.state] || 'Unassigned';

  const totalMtd = stopTotalGallons(stopId, m);
  const totalPrior = stopTotalGallons(stopId, pm);
  const totalYtd = ytdGallonsForStop(stopId, m, 'total');
  const revMtd = estRevenueGS(totalMtd);
  const profitMtd = estProfitGS(totalMtd);

  const fmtN = n => Math.round(+n||0).toLocaleString();
  const fmt$ = n => '$' + Math.round(+n||0).toLocaleString();
  const fmtMillions = n => {
    const v = Math.round(+n||0);
    return v >= 1000000 ? (v/1000000).toFixed(2) + 'M'
         : v >= 1000    ? (v/1000).toFixed(1) + 'k'
         : String(v);
  };
  const trendStr = (cur, prior) => {
    if(!prior || prior <= 0) return '';
    const d = ((cur - prior) / prior) * 100;
    return ' (' + (d >= 0 ? '▲' : '▼') + ' ' + Math.abs(d).toFixed(1) + '% MoM)';
  };

  // Aggregator / fleet counts from current-month GD record
  let aggCount = 0, fleetCount = 0;
  try {
    const GD = loadFuelGD();
    const rec = GD[stopId]?.[m];
    if(rec){
      aggCount = (rec.aggregators||[]).length;
      fleetCount = (rec.fleets||[]).length;
    }
  } catch(e){}

  // Vendor enrolled count + missed top-10 count
  const VPE = loadVendorEnrolls();
  const stopVP = VPE[stopId];
  const enrolledCount = (stopVP && typeof stopVP === 'object')
    ? Object.values(stopVP).filter(v => v === true).length
    : 0;
  const missedCount = Math.min(vendorOpportunityForStop(stopId).length, 10);

  // ROI
  const roi = computeStopROI(stopId);
  const roiCurrent = roi.netCurrent != null ? fmt$(roi.netCurrent) + '/mo current' : '—';
  const roiPotential = roi.netPotential != null ? fmt$(roi.netPotential) + '/mo potential' : '—';

  // Last contact
  const lc = getLastContact(stopId);
  let lastContactLine;
  if(!lc){
    lastContactLine = 'Last contact: no contact logged';
  } else {
    const days = ageDays(lc.date);
    const ageStr = days === 0 ? 'today' : days === 1 ? '1d ago' : days + 'd ago';
    const subj = lc.subject ? ' — ' + (lc.type ? lc.type + ' with ' : '') + lc.subject : '';
    lastContactLine = 'Last contact: ' + ageStr + subj;
  }

  return [
    `${stop.name} (${stop.id}) — ${stop.city || ''}, ${stop.state || ''}`,
    `GS: ${gsName} · ${monthLbl}`,
    '',
    `Gallons: ${fmtN(totalMtd)} MTD · ${fmtMillions(totalYtd)} YTD${trendStr(totalMtd, totalPrior)}`,
    `Revenue (est): ${fmt$(revMtd)} MTD`,
    `Profit (est):  ${fmt$(profitMtd)} MTD`,
    `ROI net:       ${roiCurrent} · ${roiPotential}`,
    '',
    `Aggregators: ${aggCount} · Fleets: ${fleetCount}`,
    `Vendor programs: ${enrolledCount} enrolled · ${missedCount} missed (top 10)`,
    lastContactLine,
    '',
    '— Sent from GS Command Center'
  ].join('\n');
}

// ─── Phase 6: Notes panel ─────────────────────────────────────────────
```

- [ ] **Step 3: Verify**

```bash
grep -c "^function formatMonthLabel" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function buildShareSummary" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 6: Share handlers — `copyShareSummary` + `copyShareSummaryFallback` + `emailShareSummary`

**Files:**
- Modify: `gs-command-center.html` (insert below `buildShareSummary`)

- [ ] **Step 1: Locate the insertion point**

```bash
grep -n "^function buildShareSummary" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Read 60 lines from the match to find the closing `}` of the function. The new helpers go on the lines immediately after.

- [ ] **Step 2: Insert the 3 share handlers**

`buildShareSummary` ends with `].join('\n');\n}` followed by the comment line `// ─── Phase 6: Notes panel ─`. Use Edit:

- `old_string`:
```
  ].join('\n');
}

// ─── Phase 6: Notes panel ─────────────────────────────────────────────
```

- `new_string`:
```
  ].join('\n');
}

function copyShareSummary(stopId){
  const text = buildShareSummary(stopId);
  if(!text){ toast('Stop not found'); return; }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(
      () => toast('Summary copied to clipboard'),
      () => copyShareSummaryFallback(text)
    );
  } else {
    copyShareSummaryFallback(text);
  }
}

function copyShareSummaryFallback(text){
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch(e){ ok = false; }
  document.body.removeChild(ta);
  toast(ok ? 'Summary copied to clipboard' : 'Copy failed — select text and copy manually');
}

function emailShareSummary(stopId){
  const stop = MEMBERS.find(m => m.id === stopId);
  if(!stop){ toast('Stop not found'); return; }
  const month = formatMonthLabel(currentMonthKey());
  const subject = `${stop.name} — ${month} snapshot`;
  const body = buildShareSummary(stopId);
  const url = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  window.location.href = url;
}

// ─── Phase 6: Notes panel ─────────────────────────────────────────────
```

- [ ] **Step 3: Verify**

```bash
grep -c "^function copyShareSummary" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function copyShareSummaryFallback" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function emailShareSummary" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 7: Header bar buttons — Copy + Email in `pageHeaderHTML`

**Files:**
- Modify: `gs-command-center.html` (`pageHeaderHTML` `.sd-actions` div)

- [ ] **Step 1: Locate the Print + Export buttons in `pageHeaderHTML`**

```bash
grep -n "🖨 Print Report\|📊 Export CSV" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Read the surrounding 6 lines — the two buttons live inside a `<div class="sd-actions">…</div>` block in `pageHeaderHTML`.

- [ ] **Step 2: Insert Copy + Email buttons before the existing Print button**

Use Edit. The exact `old_string` is the existing pair of action buttons:

- `old_string`:
```
      <div class="sd-actions">
        <button class="btn" onclick="printStopDetail()">🖨 Print Report</button>
        <button class="btn btn-green" onclick="exportStopDetailCSV('${esc(stopId)}')">📊 Export CSV</button>
      </div>
```

- `new_string`:
```
      <div class="sd-actions">
        <button class="btn" onclick="copyShareSummary('${esc(stopId)}')">📋 Copy</button>
        <button class="btn" onclick="emailShareSummary('${esc(stopId)}')">📧 Email</button>
        <button class="btn" onclick="printStopDetail()">🖨 Print Report</button>
        <button class="btn btn-green" onclick="exportStopDetailCSV('${esc(stopId)}')">📊 Export CSV</button>
      </div>
```

- [ ] **Step 3: Verify**

```bash
grep -c "copyShareSummary('\\${esc(stopId)}')" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "emailShareSummary('\\${esc(stopId)}')" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "📋 Copy" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "📧 Email" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1, 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 8: Final smoke + commit + push

**Files:**
- (No code changes; verification + commit + push only.)

- [ ] **Step 1: Final overall syntax check**

```bash
node -e "const fs=require('fs');const html=fs.readFileSync('c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g);m.forEach((blk,i)=>{const js=blk.replace(/^<script>|<\/script>$/g,'');new Function(js);});console.log('syntax ok, '+m.length+' script blocks');"
```

Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 2: Diff stat**

```bash
git -C "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" diff --stat gs-command-center.html
```

Expected: ~200 lines added, no removals beyond the 4 lines that got rewritten in Tasks 3 / 4 / 7.

- [ ] **Step 3: Browser smoke checklist**

Hard-reload `gs-command-center.html`.

- [ ] **Drawer Notes section** — open a stop's drawer → 📝 Notes section visible immediately after Activity Log. Empty state shown.
- [ ] **Save a note from drawer** — type "first note" → 💾 Save → entry appears at top, textarea clears, toast "Note added".
- [ ] **Save a note from page** — drawer's 🗗 Full Page → Stop Detail Page → Notes card in left column → type "second note" → 💾 Save → entry at top of list, prior note still below.
- [ ] **Persistence** — refresh page → log back in → reopen drawer → both notes still present.
- [ ] **Show-all toggle** — add 11+ notes → top 10 visible, `+ Show all <N> more` link below → click → all expand → click `− Show fewer` → collapse.
- [ ] **Header buttons present** — Stop Detail Page header shows: Back · Copy · Email · Print Report · Export CSV.
- [ ] **Copy** — click `📋 Copy` → toast "Summary copied to clipboard" → paste into a text editor → verify multi-line summary matches the spec format.
- [ ] **Email** — click `📧 Email` → mail app opens → subject `<Stop Name> — <Month YYYY> snapshot` → body matches the share summary.
- [ ] **Manager mode (PIN 9999, All-GS)** — open same stop → Notes section/card shows entries; compose textarea + Save button hidden. Copy + Email still work.
- [ ] **Manager picks specific GS** — full read/write returns; can add notes normally.
- [ ] **Print** — click 🖨 Print Report → preview shows Notes card inline with other left-column cards. Copy/Email/Print/Export buttons hidden in print output.
- [ ] **Phase 4/5 regression** — KPI hero strip, charts, Map, Manager Editor (manager only), drill panel state highlight all still work.

- [ ] **Step 4: Commit Phase 6**

```bash
cd "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && git add gs-command-center.html "docs/superpowers/plans/2026-05-04-phase-6-notes-and-share.md" && git commit -m "$(cat <<'EOF'
GS Command Center Phase 6: Notes panel + Share Results

Threaded Notes panel and Copy/Email share buttons for the Stop Detail
Page (Phase 4) and slide-in drawer (Phases 1-3). Append-only notes
persisted to existing gs_cmd_<gs>_stopdata[stopId].notes array.

- New helpers: notesEntriesHTML, pageNotesHTML, addNoteFromInput,
  toggleNotesExpand, formatMonthLabel, buildShareSummary,
  copyShareSummary, copyShareSummaryFallback, emailShareSummary.
- Notes panel renders in both drawer (after Activity Log section) and
  Stop Detail Page (left column after pageActivityLogHTML). Same
  notesEntriesHTML used by both surfaces, namespaced via surface arg.
- Compose row (textarea + Save Note button) hidden in Manager All-GS
  mode — entries display read-only.
- Top-10 entries visible, rest behind "+ Show all <N> more" toggle
  (mirrors Phase 3.1 Vendor Opportunity pattern).
- Header bar: 📋 Copy + 📧 Email buttons placed before existing Print
  Report and Export CSV. buildShareSummary is the single source of
  truth so both produce identical text output.
- Copy uses navigator.clipboard.writeText with execCommand fallback
  for non-HTTPS / older-browser contexts.
- Email opens mailto: with no recipient pre-fill — user fills To:
  themselves. Subject: '<Stop Name> — <Month YYYY> snapshot'.
- formatMonthLabel extracted as a reusable utility (existing inline
  call sites in pageRevProfitHTML / pageHistoryTableHTML left alone —
  not a refactor).

Spec: docs/superpowers/specs/2026-05-04-phase-6-notes-and-share.md
Plan: docs/superpowers/plans/2026-05-04-phase-6-notes-and-share.md

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

- **Phase 7:** Schedule Next Visit + .ics download + Google Calendar URL.
- **Edit / delete notes** — append-only by design.
- **Cross-stop notes view** — future enhancement.
- **Slack / Teams / SMS share targets** — no reliable cross-platform standard.
- **Hosted snapshot URLs** — needs backend.
- **PDF generation library** — Print covers via browser Save-as-PDF.
- **Backend / multi-device sync of notes** — separate Auth migration sub-project.
- **@mentions, tags, search, attachments** — out of scope for v1.
