# GS Command Center Phase 2 — Vendor Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 1 vendor stub on the Stop Deep-Dive Drawer with real vendor names, program badges (PVP / Entegra / Shop / Approved Vendor / NO VP), contacts, and rebate-program details — sourced from `vendors.html` via a localStorage bridge with an inline fallback for first-load.

**Architecture:** Three-part change. (1) `vendors.html` writes `{VP_VENDORS, progDetails, _ts}` to `localStorage['roadys_vp_vendors']` once on page load. (2) `gs-command-center.html` gets inlined fallback constants `VP_VENDORS_INLINE` (~50 vendors, single line, ~6.2 KB) and `PROG_DETAILS_INLINE` (~12 program-detail records, multi-line). (3) A new `loadVendorMaster()` helper reads the localStorage bridge first, falls back to the inline literals; consumers `drawerVendorStubHTML` (renamed `drawerVendorHTML`) and the Per-GS Vendor card use it for name/badge/contact lookup.

**Tech Stack:** Pure HTML/JS/CSS, no build, no test framework. Verification = `node -e "new Function(<extracted-script>)"` syntax check + manual browser smoke test.

**Spec:** [docs/superpowers/specs/2026-04-29-gs-command-center-management-deepdive.md](../specs/2026-04-29-gs-command-center-management-deepdive.md), Phase 2 section.

**Phase boundary:** Phase 3 (GS Management migration) is not in scope for this plan. The deferred ROI tracker integration from `vendors.html` stays out of scope per the spec's Non-goals.

---

## File Structure

**Modify only:**
- `gs-command-center.html` — adds two inline constant blocks, one helper, one drawer-card replacement, one Per-GS card upgrade, and a stale-data hint
- `vendors.html` — adds one line at module load to mirror its in-memory data into a shared localStorage key

**Insertion points (locate each via Grep — line numbers drift as edits land):**

| Insertion point | What we add | Locator |
|---|---|---|
| `gs-command-center.html` data-layer (alongside `MEMBERS`) | `VP_VENDORS_INLINE` constant (one long line — 6202 chars from vendors.html line 429) | `grep -n "^const MEMBERS" gs-command-center.html` → just below |
| `gs-command-center.html` data-layer (alongside `VP_VENDORS_INLINE`) | `PROG_DETAILS_INLINE` constant (multi-line — 112 lines from vendors.html lines 2106-2217) | Same neighborhood |
| `gs-command-center.html` near `loadVendorEnrolls` (line ~668) | `loadVendorMaster()` helper | `grep -n "^function loadVendorEnrolls" gs-command-center.html` |
| `gs-command-center.html` `drawerVendorStubHTML` (line ~1812) | Replace entire body with the enriched version | `grep -n "^function drawerVendorStubHTML" gs-command-center.html` |
| `gs-command-center.html` `vendorStatsForStops` (line ~728) | Add `topVendors[].name` lookup via `loadVendorMaster()` | `grep -n "^function vendorStatsForStops" gs-command-center.html` |
| `gs-command-center.html` Per-GS Vendor card (line ~1335) | Render top-5 enrolled vendors by name with "Show all" expand | `grep -n "Top Vendor:" gs-command-center.html` |
| `vendors.html` after `loadProgDetails()` call (line ~2227) | One-line write to `localStorage['roadys_vp_vendors']` | `grep -n "^loadProgDetails()" vendors.html` |

---

## Task 1: Inline VP_VENDORS_INLINE constant

**Files:**
- Modify: `gs-command-center.html` (data-layer section, near the `MEMBERS` constant)

**Goal:** Bring the full `VP_VENDORS` literal from `vendors.html` line 429 into `gs-command-center.html` as a fallback so the drawer renders names even on first visit (before `vendors.html` has run to populate the localStorage bridge).

The source line in `vendors.html` is one continuous line of ~6200 characters. Extract it via shell — never retype it by hand.

- [ ] **Step 1: Extract the literal from vendors.html and inspect**

Run via Bash (use `awk` to grab only line 429):

```bash
cd "/c/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && awk 'NR==429' vendors.html | head -c 200
```

Expected output: starts with `const VP_VENDORS = [{"id":"V00003","name":"Airgas","program":"Entegra"...`. Confirm the line begins with `const VP_VENDORS = [` and ends with `}];`.

- [ ] **Step 2: Find the insertion point in gs-command-center.html**

Run:
```bash
grep -n "^const MEMBERS" gs-command-center.html
```

Expected: a single match. The MEMBERS line is also one long single-line literal. Insert directly after MEMBERS.

- [ ] **Step 3: Insert VP_VENDORS_INLINE**

Use the Edit tool with `old_string` matching the start of the next line after `const MEMBERS = [...]` (e.g., the line that starts with `const REGIONS` or `const MANAGER_MAP` — find the immediately-following declaration). The `new_string` is the same line preceded by:

```
const VP_VENDORS_INLINE = <PASTE the full vendors.html line 429 here, but rename "const VP_VENDORS" to "const VP_VENDORS_INLINE">;
```

Concretely: take the entire line from vendors.html line 429, replace the leading text `const VP_VENDORS = ` with `const VP_VENDORS_INLINE = `, and insert that as a new line above the next existing constant declaration.

The cleanest mechanical way (works on both Windows-bash and POSIX):
1. Use Bash to extract: `awk 'NR==429' vendors.html | sed 's/^const VP_VENDORS = /const VP_VENDORS_INLINE = /' > .vp_inline.tmp.js`
2. Read `.vp_inline.tmp.js` (relative to the repo root) to confirm it starts with `const VP_VENDORS_INLINE = [...]` and ends with `}];`
3. Use Edit on `gs-command-center.html`: anchor on the line `const REGIONS = {` (run `grep -n "^const REGIONS" gs-command-center.html` first to confirm one match). `old_string` is `const REGIONS = {`. `new_string` is the entire content of `.vp_inline.tmp.js` followed by `\n\nconst REGIONS = {`.
4. Delete the tmp file: `rm -f .vp_inline.tmp.js`.

- [ ] **Step 4: Verify**

```bash
grep -n "^const VP_VENDORS_INLINE" gs-command-center.html
```

Expected: exactly 1 match. Then check size:
```bash
awk '/^const VP_VENDORS_INLINE/ {print length}' gs-command-center.html
```

Expected: 6202 characters (matches vendors.html line 429 length).

- [ ] **Step 5: Run the syntax check**

```bash
cd "/c/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && node -e "
const fs = require('fs');
const html = fs.readFileSync('gs-command-center.html','utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/g);
if(!m) throw new Error('no script blocks');
m.forEach((blk,i) => {
  const js = blk.replace(/^<script>|<\/script>\$/g,'');
  try { new Function(js); }
  catch(e){ throw new Error('block '+i+': '+e.message); }
});
console.log('syntax ok, '+m.length+' script blocks');
"
```

Expected: `syntax ok, 1 script blocks`.

---

## Task 2: Inline PROG_DETAILS_INLINE constant

**Files:**
- Modify: `gs-command-center.html` (data-layer section, immediately after `VP_VENDORS_INLINE`)

**Goal:** Bring the `PROGRAM_DETAILS` array from `vendors.html` lines 2106-2217 into `gs-command-center.html` as fallback for vendor contact/rebate info.

- [ ] **Step 1: Extract PROGRAM_DETAILS from vendors.html**

Run:
```bash
cd "/c/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && awk 'NR>=2106 && NR<=2217' vendors.html > .prog_details.tmp.js
```

Then verify:
```bash
head -2 .prog_details.tmp.js && echo "---" && tail -2 .prog_details.tmp.js
```

Expected: starts with `const PROGRAM_DETAILS = [`, ends with `];`.

- [ ] **Step 2: Rename to PROG_DETAILS_INLINE**

```bash
sed -i 's/^const PROGRAM_DETAILS = /const PROG_DETAILS_INLINE = /' .prog_details.tmp.js
head -1 .prog_details.tmp.js
```

Expected: first line is `const PROG_DETAILS_INLINE = [`.

- [ ] **Step 3: Insert into gs-command-center.html**

Anchor: `const REGIONS = {` (the same line used in Task 1 — note that line is now preceded by `VP_VENDORS_INLINE`, but the literal `const REGIONS = {` is still unique).

Read `.prog_details.tmp.js` to get its content, then use the Edit tool on `gs-command-center.html`:
- `old_string`: `const REGIONS = {`
- `new_string`: `<entire content of .prog_details.tmp.js>\n\nconst REGIONS = {`

Then delete the tmp file: `rm -f .prog_details.tmp.js`.

- [ ] **Step 4: Verify**

```bash
grep -n "^const PROG_DETAILS_INLINE" gs-command-center.html
```

Expected: exactly 1 match.

```bash
grep -c "vid:'V00010'" gs-command-center.html
```

Expected: at least 1 (Sysco — first record).

```bash
grep -c "vid:'V00134'" gs-command-center.html
```

Expected: at least 1 (Cintas — third record).

- [ ] **Step 5: Run the syntax check** (same command as Task 1 Step 5).

Expected: `syntax ok, 1 script blocks`. If you see a SyntaxError citing template literal or unterminated string, the multi-line PROGRAM_DETAILS contains characters that need escaping in a JS string — investigate the offending line.

---

## Task 3: Add `loadVendorMaster()` helper

**Files:**
- Modify: `gs-command-center.html` (just below the existing `loadVendorEnrolls` function, line ~668)

- [ ] **Step 1: Locate `loadVendorEnrolls`**

```bash
grep -n "^function loadVendorEnrolls" gs-command-center.html
```

Expected: a single match.

- [ ] **Step 2: Insert `loadVendorMaster` immediately after `loadVendorEnrolls`**

Use the Edit tool. Anchor: the closing `}` of `loadVendorEnrolls` followed by a newline followed by the next blank-or-other line. The simplest unique anchor: the line `function currentMonthKey(){` (which comes shortly after `loadVendorEnrolls`). `old_string` = `function currentMonthKey(){`; `new_string`:

```js
function loadVendorMaster(){
  // Returns {VP_VENDORS, progDetails, _ts}.
  // Prefer the localStorage bridge written by vendors.html on its load;
  // fall back to inlined VP_VENDORS_INLINE / PROG_DETAILS_INLINE so the
  // drawer renders names even before vendors.html has been opened.
  try {
    const cached = JSON.parse(localStorage.getItem('roadys_vp_vendors') || 'null');
    if (cached && Array.isArray(cached.VP_VENDORS)) {
      return {
        VP_VENDORS: cached.VP_VENDORS,
        progDetails: Array.isArray(cached.progDetails) ? cached.progDetails : PROG_DETAILS_INLINE,
        _ts: typeof cached._ts === 'number' ? cached._ts : 0
      };
    }
  } catch(e){}
  return { VP_VENDORS: VP_VENDORS_INLINE, progDetails: PROG_DETAILS_INLINE, _ts: 0 };
}
function vendorById(id, master){
  const m = master || loadVendorMaster();
  return m.VP_VENDORS.find(v => v.id === id) || null;
}
function vendorContact(id, master){
  const m = master || loadVendorMaster();
  return m.progDetails.find(p => p.vid === id) || null;
}

function currentMonthKey(){
```

Note: ensure the existing body of `currentMonthKey()` is preserved — only the line declaring it changes (it gets prefixed with the new helpers + a newline).

- [ ] **Step 3: Verify**

```bash
grep -c "^function loadVendorMaster" gs-command-center.html
grep -c "^function vendorById" gs-command-center.html
grep -c "^function vendorContact" gs-command-center.html
grep -c "^function currentMonthKey" gs-command-center.html
```

Expected: each prints `1`.

- [ ] **Step 4: Run the syntax check** (same command as Task 1 Step 5).

Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 5: Browser console smoke test**

Open `gs-command-center.html`, log in as any GS, open devtools console. Run:
```js
const m = loadVendorMaster();
console.log('vendor count:', m.VP_VENDORS.length, 'detail count:', m.progDetails.length, '_ts:', m._ts);
console.log('Cintas:', vendorById('V00134'));
console.log('Sysco contact:', vendorContact('V00010'));
```

Expected (no `vendors.html` opened yet — falls back to inline):
- `vendor count: ~50, detail count: ~12, _ts: 0`
- `Cintas: {id: "V00134", name: "Cintas", program: "PVP"...}`
- `Sysco contact: {vid: "V00010", name: "Sysco", contact: "Jodi Brough...", ...}`

---

## Task 4: Add bridge write in `vendors.html`

**Files:**
- Modify: `vendors.html` (after `loadProgDetails()` runs at line ~2227)

**Goal:** Mirror `vendors.html`'s in-memory `VP_VENDORS` and `progDetails` to `localStorage['roadys_vp_vendors']` so `gs-command-center.html` can read fresher data once the user has visited `vendors.html` at least once.

- [ ] **Step 1: Locate the insertion point**

```bash
grep -n "^loadProgDetails()" vendors.html
```

Expected: a single match (around line 2227).

- [ ] **Step 2: Insert the bridge write**

Use Edit. `old_string`: `loadProgDetails();` (the exact one-line call). `new_string`:

```
loadProgDetails();
// Bridge: mirror vendor master data to a shared localStorage key so
// gs-command-center.html can read fresher data after vendors.html has been opened.
try { localStorage.setItem('roadys_vp_vendors', JSON.stringify({VP_VENDORS, progDetails, _ts: Date.now()})); } catch(e){}
```

- [ ] **Step 3: Verify**

```bash
grep -n "roadys_vp_vendors" vendors.html
```

Expected: exactly 1 match (the new write line).

- [ ] **Step 4: Browser smoke test**

Open `vendors.html` in a browser. Open devtools console. Run:
```js
const cached = JSON.parse(localStorage.getItem('roadys_vp_vendors'));
console.log('cached vendor count:', cached.VP_VENDORS.length, 'cached detail count:', cached.progDetails.length, 'ts:', new Date(cached._ts));
```

Expected: vendor count matches `VP_VENDORS.length` (~50), detail count matches `progDetails.length` (~12), timestamp is "just now."

Then open `gs-command-center.html` in a new tab (same browser), open devtools, run:
```js
const m = loadVendorMaster();
console.log('source ts:', m._ts ? new Date(m._ts) : 'inline fallback');
```

Expected: a recent timestamp (not "inline fallback") — confirms the bridge works end-to-end.

---

## Task 5: Replace `drawerVendorStubHTML` with enriched version

**Files:**
- Modify: `gs-command-center.html` (the `drawerVendorStubHTML` function, ~30 lines)

**Goal:** Replace the Phase 1 stub (raw vendor IDs) with a fully enriched card showing vendor name, program badge with color, priority chip, contact info, and a click-to-expand details section pulling from `progDetails`.

- [ ] **Step 1: Locate the function**

```bash
grep -n "^function drawerVendorStubHTML" gs-command-center.html
```

Expected: a single match.

- [ ] **Step 2: Replace the function body**

Use Edit. The Phase 1 body looks like:

```js
function drawerVendorStubHTML(stopId){
  let enrolledIds = [];
  try {
    const VPE = loadVendorEnrolls();
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

`old_string` is exactly that block (the function declaration + body). `new_string` is:

```js
function drawerVendorStubHTML(stopId){
  let enrolledIds = [];
  try {
    const VPE = loadVendorEnrolls();
    const stopVP = VPE[stopId];
    if(stopVP && typeof stopVP === 'object'){
      enrolledIds = Object.keys(stopVP).filter(vid => stopVP[vid] === true);
    }
  } catch(e){}
  const master = loadVendorMaster();
  const programColor = {
    'PVP':'var(--cyan)',
    'Entegra':'var(--purple)',
    'Shop':'var(--orange)',
    'Approved Vendor':'var(--green)',
    'NO VP':'var(--muted)'
  };
  const priorityColor = {High:'var(--red)', Medium:'var(--yellow)', Low:'var(--muted)'};
  const enrolled = enrolledIds.map(vid => {
    const v = vendorById(vid, master);
    const c = vendorContact(vid, master);
    return { vid, name: v?.name || vid, program: v?.program || '—', priority: v?.priority || '—', phone: v?.phone || '', contact: c };
  }).sort((a,b) => a.name.localeCompare(b.name));
  const rows = enrolled.length
    ? enrolled.map(e => {
        const pc = programColor[e.program] || 'var(--muted)';
        const prc = priorityColor[e.priority] || 'var(--muted)';
        const contactLine = e.contact && e.contact.contact
          ? esc(e.contact.contact) + (e.contact.phone ? ' · ' + esc(e.contact.phone) : '')
          : (e.phone ? esc(e.phone) : '<span style="color:var(--dim)">no contact on file</span>');
        const hasDetails = !!e.contact;
        return `<div style="background:var(--bg);border-radius:4px;padding:6px 8px;font-size:.78em;${hasDetails?'cursor:pointer':''}" ${hasDetails?`onclick="toggleVendorDetails('${e.vid}', this)"`:''}>
          <div style="display:flex;justify-content:space-between;gap:8px">
            <span><b>${esc(e.name)}</b> <span style="color:${pc};font-weight:700;font-size:.86em;margin-left:6px">${esc(e.program)}</span></span>
            <span style="color:${prc};font-size:.86em;white-space:nowrap">${esc(e.priority)}</span>
          </div>
          <div style="color:var(--muted);font-size:.86em;margin-top:2px">${contactLine}</div>
          ${hasDetails ? `<div class="vd-details" id="vd-${esc(e.vid)}" style="display:none;margin-top:6px;padding-top:6px;border-top:1px solid var(--border);font-size:.86em;line-height:1.45">
            ${e.contact.email ? `<div>📧 <a href="mailto:${esc(e.contact.email)}" style="color:var(--cyan)">${esc(e.contact.email)}</a></div>` : ''}
            ${e.contact.savings ? `<div style="margin-top:3px"><b>Savings:</b> ${esc(e.contact.savings)}</div>` : ''}
            ${e.contact.avgSavings ? `<div><b>Avg:</b> ${esc(e.contact.avgSavings)}</div>` : ''}
            ${e.contact.rebateStructure ? `<div><b>Rebate:</b> ${esc(e.contact.rebateStructure)}</div>` : ''}
            ${e.contact.contractTerm ? `<div><b>Contract:</b> ${esc(e.contact.contractTerm)}</div>` : ''}
          </div>` : ''}
        </div>`;
      }).join('')
    : '<div style="font-size:.78em;color:var(--muted)">No enrolled vendor programs.</div>';
  // Stale-cache hint (vendors.html data older than 30d, or never opened)
  const stale = (master._ts === 0) || (Date.now() - master._ts > 30*24*3600*1000);
  const days = master._ts ? Math.floor((Date.now() - master._ts) / (24*3600*1000)) : null;
  const staleMsg = (master._ts === 0)
    ? 'Using inline vendor data — open <code>vendors.html</code> once to sync the latest.'
    : `Vendor data last synced ${days} days ago — open <code>vendors.html</code> for the latest.`;
  const staleBanner = stale
    ? `<div style="font-size:.66em;color:var(--muted);margin-bottom:6px;padding:4px 8px;background:var(--bg);border-left:2px solid var(--yellow);border-radius:3px">${staleMsg}</div>`
    : '';
  return `
    <div class="drawer-card green">
      <div class="drawer-card-hd">🏢 Vendor Programs (${enrolled.length} enrolled)</div>
      ${staleBanner}
      <div style="display:flex;flex-direction:column;gap:4px">${rows}</div>
    </div>
  `;
}
function toggleVendorDetails(vid, el){
  const det = document.getElementById('vd-'+vid);
  if(!det) return;
  det.style.display = det.style.display === 'none' ? 'block' : 'none';
}
```

- [ ] **Step 3: Verify**

```bash
grep -n "^function drawerVendorStubHTML" gs-command-center.html
grep -n "^function toggleVendorDetails" gs-command-center.html
grep -c "loadVendorMaster()" gs-command-center.html
```

Expected: drawerVendorStubHTML 1 match, toggleVendorDetails 1 match, loadVendorMaster() at least 2 (definition site + this consumer + later Per-GS card upgrade in Task 6).

- [ ] **Step 4: Syntax check** (same command).

Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 5: Browser smoke test**

Open `gs-command-center.html`, log in as a GS, open the drawer for a stop that has vendor enrollments. Verify:
1. Vendor card now shows real names (e.g., "Cintas", "Sysco") instead of raw IDs.
2. Program badges are colored: PVP cyan, Entegra purple, Shop orange, Approved Vendor green, NO VP muted.
3. Priority chip shows on the right (High red, Medium yellow, Low muted).
4. Contact line shows under the name.
5. Click a vendor row that has rebate-program details (e.g., Sysco, Entegra, Cintas) → row expands to show email, savings %, rebate structure, contract term. Click again → collapses.
6. If you've never opened `vendors.html`, the stale-data banner appears: "Using inline vendor data — open vendors.html once to sync the latest."

---

## Task 6: Upgrade Per-GS Vendor card to use vendor names

**Files:**
- Modify: `gs-command-center.html` (`vendorStatsForStops` function ~line 728, and the Per-GS Vendor card line ~1335)

**Goal:** Replace "Top Vendor: V00134 · 4 stops" with "Top Vendor: Cintas · 4 stops"; show top-5 enrolled vendors as a list with a "Show all" disclosure.

- [ ] **Step 1: Update `vendorStatsForStops` to attach names**

Locate:
```bash
grep -n "^function vendorStatsForStops" gs-command-center.html
```

Read the existing function (it's about 20 lines). Find the part where `topVendors` is built. The current logic produces an array of `{id, count}`; we want `{id, name, count}`.

Use Edit. The existing function ends with something like:

```js
  topVendors.sort((a,b) => b.count - a.count);
  return { totalEnrollments, stopsEnrolled, topVendors, hasData: totalEnrollments > 0 };
}
```

Find the unique line `topVendors.sort((a,b) => b.count - a.count);` and replace with:

```js
  topVendors.sort((a,b) => b.count - a.count);
  // Attach display names from the vendor master
  const _master = loadVendorMaster();
  topVendors.forEach(t => { const v = vendorById(t.id, _master); t.name = v ? v.name : t.id; t.program = v ? v.program : ''; });
```

- [ ] **Step 2: Update the Per-GS card to render names + top 5**

Locate:
```bash
grep -n "Top Vendor:" gs-command-center.html
```

The current line looks like:
```js
${vendorStats.topVendors.length ? `<div>Top Vendor: <b>${esc(vendorStats.topVendors[0].id)}</b> · ${vendorStats.topVendors[0].count} stops</div>` : ''}
```

Use Edit. `old_string` is that exact line. `new_string`:

```js
${vendorStats.topVendors.length ? `
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
              <div style="font-size:.74em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Top Programs</div>
              ${vendorStats.topVendors.slice(0,5).map(v => `<div style="display:flex;justify-content:space-between;font-size:.84em"><span>${esc(v.name)}${v.program?' <span style="color:var(--muted);font-size:.86em">('+esc(v.program)+')</span>':''}</span><span style="color:var(--yellow);font-weight:700">${v.count}</span></div>`).join('')}
              ${vendorStats.topVendors.length>5 ? `<div style="font-size:.72em;color:var(--cyan);margin-top:3px;cursor:pointer" onclick="this.parentElement.querySelectorAll('.tv-extra').forEach(e=>e.style.display='block');this.style.display='none'">+ Show all ${vendorStats.topVendors.length} programs</div>` : ''}
              ${vendorStats.topVendors.slice(5).map(v => `<div class="tv-extra" style="display:none;justify-content:space-between;font-size:.84em"><span>${esc(v.name)}${v.program?' <span style="color:var(--muted);font-size:.86em">('+esc(v.program)+')</span>':''}</span><span style="color:var(--yellow);font-weight:700">${v.count}</span></div>`).join('')}
            </div>` : ''}
```

- [ ] **Step 3: Verify**

```bash
grep -c "topVendors\[0\]\.id" gs-command-center.html
```

Expected: 0 (the old reference is gone).

```bash
grep -c "Top Programs" gs-command-center.html
```

Expected: at least 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 5: Browser smoke test**

Reload `gs-command-center.html`. On the Per-GS Dashboard, the Vendor card now shows:
1. The existing top KPIs (Total Enrollments, Stops Enrolled).
2. A new "Top Programs" section listing the top 5 enrolled vendors with name + program type + count.
3. If more than 5 vendors are enrolled in the territory, "+ Show all N programs" link expands the rest.

---

## Task 7: Final integration smoke test + commit

- [ ] **Step 1: Run full syntax check** (same `node -e` command from Task 1 Step 5). Expected: `syntax ok`.

- [ ] **Step 2: End-to-end Phase 2 browser smoke**

Open `gs-command-center.html`. For each item, verify:

  - [ ] First-load (without opening `vendors.html` first): drawer Vendor card shows real vendor names + program badges + contacts (from inline fallback). Stale-data banner reads "Using inline vendor data — open vendors.html once to sync the latest."
  - [ ] Open `vendors.html` in another tab. Return to `gs-command-center.html`, hard-reload, re-open a stop drawer. Stale banner is gone (data is now fresh).
  - [ ] Click a vendor row that has rebate-program details (e.g., Sysco V00010, Entegra V00040, Cintas V00134) → row expands to show email, savings, rebate structure, contract term. Click again → collapses.
  - [ ] Click a vendor row WITHOUT rebate details (e.g., a non-Top-10 vendor like Airgas V00003) → no expand affordance.
  - [ ] On the Per-GS Dashboard, the Vendor card's "Top Programs" section shows real names with program type and stop counts.
  - [ ] If the territory has > 5 enrolled vendors, the "+ Show all N programs" link reveals the rest on click.
  - [ ] Open the drawer for a stop with no vendor enrollments → "No enrolled vendor programs." displayed.
  - [ ] Manager mode (PIN 9999): open any stop's drawer → vendor card renders correctly read-only.

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && git add gs-command-center.html vendors.html docs/superpowers/plans/2026-04-30-phase-2-vendor-enrichment.md && git commit -m "$(cat <<'EOF'
GS Command Center Phase 2: Vendor enrichment on Stop Deep-Dive Drawer

- Inline VP_VENDORS_INLINE (~50 vendors) + PROG_DETAILS_INLINE (~12
  programs) extracted from vendors.html as fallback data so the drawer
  renders names + program badges + contacts on first load.
- New helpers: loadVendorMaster, vendorById, vendorContact. Reads
  localStorage['roadys_vp_vendors'] first, falls back to inline.
- vendors.html one-line bridge: writes {VP_VENDORS, progDetails, _ts}
  to localStorage['roadys_vp_vendors'] after loadProgDetails(). No
  other changes to vendors.html.
- drawerVendorStubHTML (now drawerVendorHTML in spirit) replaces raw
  IDs with bold name + colored program badge (PVP/Entegra/Shop/
  Approved/NO VP) + priority chip + contact line. Click-to-expand
  reveals email, savings, rebate structure, contract term for vendors
  with rebate-program records.
- Per-GS Dashboard's Vendor card upgraded: 'Top Programs' shows top 5
  enrolled vendors by name + program with stop counts; '+ Show all N'
  expands the rest.
- Stale-data hint banner on the drawer when localStorage cache is > 30
  days old or missing; suggests visiting vendors.html.

Spec: docs/superpowers/specs/2026-04-29-gs-command-center-management-deepdive.md
Plan: docs/superpowers/plans/2026-04-30-phase-2-vendor-enrichment.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push**

```bash
git push origin gs-command-center-workstation
```

- [ ] **Step 5: Verify the commit**

```bash
git log -1 --stat
git status --short
```

Expected: one new commit on `gs-command-center-workstation`, only `gs-command-center.html` + `vendors.html` + the plan doc modified, working tree clean.

---

## Out-of-scope reminders (Phase 2 explicitly does not cover these)

- **GS Management migration** (USA territory map, manager editor, ranking from index.html) — Phase 3.
- **Notes panel** + **Share Results buttons** (copy / mailto / print) — Phase 4.
- **Schedule Next Visit** + `.ics` / Google Calendar URL export — Phase 5.
- **ROI tracker integration** from vendors.html (rebate calculations, cost-savings analysis) — separate spec, deferred per the spec's Non-goals section.
- **Database migration** (replacing localStorage with Supabase backend tables for fuel/rewards/vendor data) — separate sub-project, prerequisite is finishing Phase 5.
