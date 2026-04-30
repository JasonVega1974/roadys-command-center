# GS Command Center Phase 3 — Stop Drawer Sales Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Stop Deep-Dive Drawer into a sales tool — drop redundant Site Details fields, add a $295 Price File Fee toggle, add Rewards (YTD adds/redeems/rate) + Value Prop Gallons + Vendor Opportunity drawer cards, add a dual-column ROI Calculator (Current vs Potential), and add a generic per-stop CSV import flow that supersedes the morning's devtools-paste import.

**Architecture:** Single-file edits to `gs-command-center.html`. Reuses two existing patterns: SheetJS lazy-load (`ensureSheetJS()`) for the CSV import; direct REST against the Supabase `value_props` table (already used by `value-props.html`) for the new Value Prop card. Three new fields on `stopdata`: `priceFileFeeRemoved` (bool), `rewardsYtdAdds` (number), `rewardsYtdRedeems` (number). The redemption rate is derived on render. All new helpers (`drawerRewardsHTML`, `loadValueProps`, `valuePropForStop`, `relativeAge`, `parseAvgSavings`, `vendorOpportunityForStop`, `vendorSavingsForStop`, `computeStopROI`, `drawerROIHTML`, `handleImportStopData`, …) sit above `openSiteDrawer` alongside the Phase 1/2 helpers.

**Tech Stack:** Pure HTML/JS/CSS, no build, no test framework. Verification = `node -e "new Function(<extracted-script>)"` syntax check + manual browser smoke test (consolidated at Task 12).

**Spec:** [docs/superpowers/specs/2026-04-30-phase-3-stop-drawer-sales-tools.md](../specs/2026-04-30-phase-3-stop-drawer-sales-tools.md).

**Phase boundary:** Phases 4-6 (renumbered: GS Management migration, Notes + Share, Schedule + Calendar) are out of scope for this plan. Backend/Auth migration of `stopdata` is a separate sub-project.

---

## File Structure

**Modify only:** `gs-command-center.html`

**Insertion points (locate each via Grep — line numbers drift as edits land):**

| Insertion point | What we add | Locator |
|---|---|---|
| `<style>` block | New `.drawer-card.amber` color variant + `.roi-*` classes | `grep -n "\.drawer-card{" gs-command-center.html` |
| `openSiteDrawer` Site Details section | Remove 3 of 4 sub-fields (keep Has Rewards) | `grep -n "Site Details" gs-command-center.html` |
| `drawerMembershipHTML` | Add Price File Fee toggle row only (rewards moves to its own card) | `grep -n "^function drawerMembershipHTML" gs-command-center.html` |
| Above `openSiteDrawer` | New helpers: `drawerRewardsHTML` (Task 4), `loadValueProps`, `valuePropForStop`, `relativeAge`, `drawerValuePropHTML`, `parseAvgSavings`, `vendorOpportunityForStop`, `vendorSavingsForStop`, `drawerVendorOpportunityHTML`, `computeStopROI`, `parseDollarString`, `drawerROIHTML`, plus updated `onMembershipChange` to handle the boolean + numeric fields | `grep -n "^function openSiteDrawer" gs-command-center.html` |
| `openSiteDrawer` template | New `${drawerRewardsHTML(siteId)}`, `${drawerVendorOpportunityHTML(siteId)}`, `${drawerValuePropHTML(siteId)}`, `${drawerROIHTML(siteId)}` calls in the right places | Same |
| Per-GS Dashboard render (`renderMyStopsCard`) | New "📥 Import Stop Data" button on the My Stops card header | `grep -n "^function renderMyStopsCard" gs-command-center.html` |
| Above `openSiteDrawer` | New `handleImportStopData`, `previewStopDataImport`, `commitStopDataImport`, `closeStopDataModal` helpers | Same |
| Body HTML (before `</body>`) | New `<div id="stopdata-import-modal">` modal markup | `grep -n "^</body>" gs-command-center.html` |

---

## Task 1: CSS additions

**Files:**
- Modify: `gs-command-center.html` (CSS block, after the Phase 1 `.drawer-card` rules)

- [ ] **Step 1: Locate the existing drawer-card color rules**

```bash
grep -n "\.drawer-card.green{" gs-command-center.html
```

Expected: a single match. Phase 1 added `.drawer-card.purple`, `.drawer-card.cyan`, `.drawer-card.green` color variants. We're adding amber.

- [ ] **Step 2: Insert new CSS rules immediately after `.drawer-card.green .drawer-card-hd{color:var(--green)}`**

Use Edit. Find this exact line in the file:

```css
.drawer-card.green .drawer-card-hd{color:var(--green)}
```

Replace with:

```css
.drawer-card.green .drawer-card-hd{color:var(--green)}
.drawer-card.amber{border-left-color:var(--yellow)}
.drawer-card.amber .drawer-card-hd{color:var(--yellow)}
.drawer-card.red{border-left-color:var(--red)}
.drawer-card.red .drawer-card-hd{color:var(--red)}
.opp-row{background:var(--bg);border-radius:4px;padding:6px 8px;font-size:.78em;cursor:pointer;display:flex;justify-content:space-between;gap:8px;align-items:center}
.opp-row:hover{background:var(--bg3)}
.opp-savings{color:var(--yellow);font-weight:700;white-space:nowrap}
.roi-row{display:flex;justify-content:space-between;font-size:.84em;padding:3px 0}
.roi-row.subtotal{border-top:1px solid var(--border);margin-top:4px;padding-top:6px;font-weight:700}
.roi-row.net{border-top:2px solid var(--border);margin-top:8px;padding-top:8px;font-size:1em;font-weight:800}
.roi-row.net.positive{color:var(--green)}
.roi-row.net.negative{color:var(--red)}
.roi-row .label{color:var(--muted)}
.roi-row.net .label{color:var(--text)}
.roi-row.net.positive .value::after{content:" ✓";font-weight:800}
.roi-row.net.negative .value::after{content:" ✗";font-weight:800}
.roi-row.missing .value{color:var(--muted);font-style:italic}
.roi-foot{font-size:.66em;color:var(--muted);margin-top:8px;padding-top:6px;border-top:1px solid var(--border);line-height:1.5}
#stopdata-import-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:300;display:none;align-items:center;justify-content:center;padding:20px}
#stopdata-import-modal.show{display:flex}
.import-modal-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;width:600px;max-width:96vw;max-height:90vh;overflow:auto;padding:20px}
.import-preview-tbl{width:100%;border-collapse:collapse;font-size:.78em;margin-top:10px}
.import-preview-tbl th,.import-preview-tbl td{padding:4px 6px;border-bottom:1px solid var(--border);text-align:left}
.import-preview-tbl th{font-size:.66em;text-transform:uppercase;color:var(--muted)}
```

- [ ] **Step 3: Run the syntax check**

```bash
cd "/c/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && node -e "
const fs = require('fs');
const html = fs.readFileSync('gs-command-center.html','utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/g);
if(!m) throw new Error('no script blocks');
m.forEach((blk,i) => { const js = blk.replace(/^<script>|<\/script>\$/g,''); try { new Function(js); } catch(e){ throw new Error('block '+i+': '+e.message); } });
console.log('syntax ok, '+m.length+' script blocks');
"
```

Expected: `syntax ok, 1 script blocks`. (CSS-only changes don't affect JS, but run anyway as a safety net.)

- [ ] **Step 4: Verify CSS classes inserted**

```bash
grep -c "^\.drawer-card\.amber{" gs-command-center.html
grep -c "^\.opp-row{" gs-command-center.html
grep -c "^\.roi-row\.net" gs-command-center.html
grep -c "^#stopdata-import-modal{" gs-command-center.html
```

Each should print `1`.

---

## Task 2: Site Details cleanup

**Files:**
- Modify: `gs-command-center.html` (`openSiteDrawer` Site Details section, around line 2159)

**Goal:** Remove three redundant free-text fields (`Vendor Programs`, `Contacts`, `Site Notes`) from the Site Details `drawer-section`. Keep only `Has Rewards`.

- [ ] **Step 1: Locate the block**

```bash
grep -n "<h4>⚙️ Site Details</h4>" gs-command-center.html
```

Expected: single match.

- [ ] **Step 2: Replace the Site Details block**

Use Edit. The current block in `openSiteDrawer` looks like:

```js
    <div class="drawer-section"><h4>⚙️ Site Details</h4>
      <div class="info-grid">
        <div class="info-item"><div class="lbl">Has Rewards</div>
          <div class="val"><label style="cursor:pointer"><input type="checkbox" ${extras.hasRewards?'checked':''} onchange="toggleExtra('${siteId}','hasRewards',this.checked)"> Yes</label></div>
        </div>
        <div class="info-item"><div class="lbl">Vendor Programs</div>
          <div class="val"><input style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text);font-size:.85em;width:100%" value="${esc(extras.vendorPrograms||'')}" onchange="updateExtra('${siteId}','vendorPrograms',this.value)" placeholder="Programs..."></div>
        </div>
        <div class="info-item"><div class="lbl">Contacts</div>
          <div class="val"><input style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text);font-size:.85em;width:100%" value="${esc(extras.contacts||'')}" onchange="updateExtra('${siteId}','contacts',this.value)" placeholder="Names..."></div>
        </div>
        <div class="info-item"><div class="lbl">Site Notes</div>
          <div class="val"><input style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text);font-size:.85em;width:100%" value="${esc(extras.siteNotes||'')}" onchange="updateExtra('${siteId}','siteNotes',this.value)" placeholder="Notes..."></div>
        </div>
      </div>
    </div>
```

`old_string`: that entire block (verbatim).

`new_string`:

```js
    <div class="drawer-section"><h4>⚙️ Site Details</h4>
      <div class="info-grid">
        <div class="info-item"><div class="lbl">Has Rewards</div>
          <div class="val"><label style="cursor:pointer"><input type="checkbox" ${extras.hasRewards?'checked':''} onchange="toggleExtra('${siteId}','hasRewards',this.checked)"> Yes</label></div>
        </div>
      </div>
    </div>
```

- [ ] **Step 3: Verify**

```bash
grep -c "extras.vendorPrograms" gs-command-center.html
grep -c "extras.contacts" gs-command-center.html
grep -c "extras.siteNotes" gs-command-center.html
grep -c "extras.hasRewards" gs-command-center.html
```

Expected: 0, 0, 0, 1 — the 3 redundant fields gone, Has Rewards still present.

- [ ] **Step 4: Syntax check** (same command as Task 1 Step 3). Expected: `syntax ok, 1 script blocks`.

---

## Task 3: Add Price File Fee + Fuelman/R-Check toggles + YTD Gallons to Membership card

**Files:**
- Modify: `gs-command-center.html` (`drawerMembershipHTML` function, around line 1840)
- Modify: `gs-command-center.html` (`onMembershipChange` function, immediately below)

**Goal:** Add four new editable inputs to the Membership card: a $295 Price File Fee Removed checkbox, an "Accepts Fuelman" checkbox, an "Accepts R-Check" checkbox, and a YTD Total Gallons number input. The card also shows a derived "Avg/mo" gallons figure (YTD ÷ current month number) — read-only, auto-computed on render.

The 4 existing contact fields (membership cost, site manager name, email, phone) stay unchanged. Per-stop rewards data lives on its own Rewards card (Task 4).

Four new `stopdata` fields: `priceFileFeeRemoved` (boolean), `acceptsFuelman` (boolean), `acceptsRcheck` (boolean), `ytdTotalGallons` (number). The monthly average is derived on render — not stored.

- [ ] **Step 1: Locate the function**

```bash
grep -n "^function drawerMembershipHTML" gs-command-center.html
```

Expected: single match.

- [ ] **Step 2: Replace the entire `drawerMembershipHTML` function body**

Use Edit. Find the full function body and replace it.

`old_string`:

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

`new_string`:

```js
function drawerMembershipHTML(stopId){
  const rec = loadStopRecord(stopId);
  const inS = 'background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px 7px;color:var(--text);font-size:.82em;width:100%';
  const lblS = 'font-size:.6em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em';
  const ytdGal = (typeof rec.ytdTotalGallons === 'number' && !isNaN(rec.ytdTotalGallons)) ? rec.ytdTotalGallons : null;
  const monthsElapsed = new Date().getMonth() + 1; // 1-12, current real-world month
  const avgGal = (ytdGal != null && monthsElapsed > 0) ? Math.round(ytdGal / monthsElapsed) : null;
  const avgLabel = avgGal != null
    ? `<b>${avgGal.toLocaleString()}</b> gal (= YTD &divide; ${monthsElapsed})`
    : '<span style="color:var(--muted);font-style:italic">enter YTD to compute</span>';
  return `
    <div class="drawer-card purple">
      <div class="drawer-card-hd">💳 Membership &amp; Site Contact</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label style="display:block">
          <span style="${lblS}">Membership Cost / mo</span>
          <input id="sd-mem-${stopId}" style="${inS};margin-top:3px" value="${esc(rec.membershipCost||'')}" placeholder="$0.00" onblur="onMembershipChange('${stopId}', 'membershipCost', this.value)"/>
        </label>
        <label style="display:block">
          <span style="${lblS}">Site Manager</span>
          <input id="sd-mgrname-${stopId}" style="${inS};margin-top:3px" value="${esc(rec.siteMgrName||'')}" placeholder="Name" onblur="onMembershipChange('${stopId}', 'siteMgrName', this.value)"/>
        </label>
        <label style="display:block">
          <span style="${lblS}">Email</span>
          <input id="sd-mgremail-${stopId}" type="email" style="${inS};margin-top:3px" value="${esc(rec.siteMgrEmail||'')}" placeholder="email@stop.com" onblur="onMembershipChange('${stopId}', 'siteMgrEmail', this.value)"/>
        </label>
        <label style="display:block">
          <span style="${lblS}">Phone</span>
          <input id="sd-mgrphone-${stopId}" style="${inS};margin-top:3px" value="${esc(rec.siteMgrPhone||'')}" placeholder="(555) 555-5555" onblur="onMembershipChange('${stopId}', 'siteMgrPhone', this.value)"/>
        </label>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;font-size:.82em">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input id="sd-pff-${stopId}" type="checkbox" ${rec.priceFileFeeRemoved?'checked':''} onchange="onMembershipChange('${stopId}', 'priceFileFeeRemoved', this.checked)"/>
          <span>$295 Price File Fee — <b>Removed</b> for this site</span>
        </label>
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
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;align-items:end">
        <label style="display:block">
          <span style="${lblS}">YTD Total Gallons</span>
          <input id="sd-ytdgal-${stopId}" type="number" step="1" style="${inS};margin-top:3px" value="${ytdGal == null ? '' : ytdGal}" placeholder="0" onblur="onMembershipChange('${stopId}', 'ytdTotalGallons', this.value)"/>
        </label>
        <div>
          <span style="${lblS}">Avg / mo</span>
          <div style="margin-top:7px;font-size:.86em">${avgLabel}</div>
        </div>
      </div>
    </div>
  `;
}
function onMembershipChange(stopId, field, val){
  let coerced = val;
  if (field === 'priceFileFeeRemoved' || field === 'acceptsFuelman' || field === 'acceptsRcheck') {
    coerced = !!val;
  } else if (field === 'rewardsYtdAdds' || field === 'rewardsYtdRedeems' || field === 'ytdTotalGallons') {
    const n = parseFloat(String(val).replace(/[$,\s]/g, ''));
    coerced = isNaN(n) ? null : n;
  }
  saveStopRecord(stopId, {[field]: coerced});
  toast('Saved');
  // Re-render the drawer if open so the ROI / Rewards cards reflect the change
  const drawer = document.getElementById('site-drawer');
  if (drawer && drawer.classList.contains('open') && typeof openSiteDrawer === 'function') {
    openSiteDrawer(stopId);
  }
}
```

Note: `onMembershipChange` is shared between the Membership card (Task 3) and the Rewards card (Task 4). It coerces booleans (`priceFileFeeRemoved`, `acceptsFuelman`, `acceptsRcheck`) and numbers (`rewardsYtdAdds`, `rewardsYtdRedeems`, `ytdTotalGallons`). Other fields (text contact info, membership cost string) are stored verbatim.

- [ ] **Step 3: Verify**

```bash
grep -c "priceFileFeeRemoved" gs-command-center.html
grep -c "acceptsFuelman" gs-command-center.html
grep -c "acceptsRcheck" gs-command-center.html
grep -c "ytdTotalGallons" gs-command-center.html
grep -c "rewardsRevenueMonthly" gs-command-center.html
```

Expected: priceFileFeeRemoved ≥ 2; acceptsFuelman ≥ 2; acceptsRcheck ≥ 2; ytdTotalGallons ≥ 2; rewardsRevenueMonthly = 0 (this field is gone — replaced by Task 4's YTD adds/redeems).

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`.

---

## Task 4: Rewards card (drawerRewardsHTML + insert)

**Files:**
- Modify: `gs-command-center.html` (add helper above `openSiteDrawer`; insert call into drawer template)

**Goal:** Add a new "🎁 Rewards" drawer card with three values: YTD Adds (editable), YTD Redeems (editable), Redemption Rate (auto-calculated from `redeems / adds × 100`). Two new `stopdata` fields: `rewardsYtdAdds`, `rewardsYtdRedeems`. The redemption rate is derived on render — not stored. Card lives between the Vendor Programs Opportunity card (Task 7) and the Value Prop card (Task 5) when all are present.

- [ ] **Step 1: Add `drawerRewardsHTML` helper above `openSiteDrawer`**

Use the Edit tool. `old_string` = `function openSiteDrawer(siteId){`. `new_string`:

```js
function drawerRewardsHTML(stopId){
  const rec = loadStopRecord(stopId);
  const adds = (typeof rec.rewardsYtdAdds === 'number' && !isNaN(rec.rewardsYtdAdds)) ? rec.rewardsYtdAdds : null;
  const redeems = (typeof rec.rewardsYtdRedeems === 'number' && !isNaN(rec.rewardsYtdRedeems)) ? rec.rewardsYtdRedeems : null;
  const fmt = n => '$' + Number(n||0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  const inS = 'background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px 7px;color:var(--text);font-size:.82em;width:100%';
  const lblS = 'font-size:.6em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em';
  // Redemption rate: only computed when both inputs have values and adds > 0
  let rateLabel;
  if(adds == null || redeems == null){
    rateLabel = '<span style="color:var(--muted)">— Set YTD Adds and Redeems to compute</span>';
  } else if(adds <= 0){
    rateLabel = '<span style="color:var(--muted)">— (no adds YTD)</span>';
  } else {
    const rate = (redeems / adds) * 100;
    const color = rate >= 60 ? 'var(--green)' : (rate >= 30 ? 'var(--yellow)' : 'var(--red)');
    rateLabel = `<span style="color:${color};font-weight:700">${rate.toFixed(1)}%</span>`;
  }
  return `
    <div class="drawer-card amber">
      <div class="drawer-card-hd">🎁 Rewards — Year to Date</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label style="display:block">
          <span style="${lblS}">YTD Adds ($)</span>
          <input id="sd-radds-${stopId}" type="number" step="0.01" style="${inS};margin-top:3px" value="${adds == null ? '' : adds}" placeholder="0.00" onblur="onMembershipChange('${stopId}', 'rewardsYtdAdds', this.value)"/>
        </label>
        <label style="display:block">
          <span style="${lblS}">YTD Redeems ($)</span>
          <input id="sd-rred-${stopId}" type="number" step="0.01" style="${inS};margin-top:3px" value="${redeems == null ? '' : redeems}" placeholder="0.00" onblur="onMembershipChange('${stopId}', 'rewardsYtdRedeems', this.value)"/>
        </label>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:.84em;padding:6px 8px;background:var(--bg);border-radius:4px">
        <span style="color:var(--muted);text-transform:uppercase;font-size:.86em;letter-spacing:.06em">Redemption Rate</span>
        ${rateLabel}
      </div>
      ${(adds != null && redeems != null && adds > 0) ? `<div style="font-size:.66em;color:var(--muted);margin-top:6px">YTD Adds ${fmt(adds)} · YTD Redeems ${fmt(redeems)}</div>` : ''}
    </div>
  `;
}

function openSiteDrawer(siteId){
```

- [ ] **Step 2: Insert `${drawerRewardsHTML(siteId)}` into the drawer template**

The Rewards card sits between the Vendor Opportunity card and the Value Prop card. After Tasks 5 and 7 land, the relevant order is:

```js
    ${drawerVendorStubHTML(siteId)}            // Phase 2 enrolled
    ${drawerVendorOpportunityHTML(siteId)}     // Task 7 not-enrolled
    ${drawerValuePropHTML(siteId)}             // Task 5 value prop
    ${drawerCRMTasksHTML(siteId)}              // Phase 1.1 CRM
```

For THIS task (Task 4), only Phase 2's `drawerVendorStubHTML` exists; Tasks 5 and 7 haven't run yet. We insert `${drawerRewardsHTML(siteId)}` immediately after `${drawerVendorStubHTML(siteId)}` and before `${drawerCRMTasksHTML(siteId)}`. Tasks 5 and 7 will add the Value Prop and Vendor Opportunity cards around it later.

Read the current section to find the exact whitespace, then use Edit:
- `old_string`:
  ```
      ${drawerVendorStubHTML(siteId)}
  
      ${drawerCRMTasksHTML(siteId)}
  ```
- `new_string`:
  ```
      ${drawerVendorStubHTML(siteId)}
  
      ${drawerRewardsHTML(siteId)}
  
      ${drawerCRMTasksHTML(siteId)}
  ```

- [ ] **Step 3: Verify**

```bash
grep -c "^function drawerRewardsHTML" gs-command-center.html
grep -c "drawerRewardsHTML(siteId)" gs-command-center.html
grep -c "rewardsYtdAdds" gs-command-center.html
grep -c "rewardsYtdRedeems" gs-command-center.html
```

Expected: 1, 1, ≥3 each (definition + reads + handler match).

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`.

---

## Task 5: Value Prop helpers (loadValueProps, valuePropForStop)

**Files:**
- Modify: `gs-command-center.html` (insert above `function openSiteDrawer`)

- [ ] **Step 1: Locate insertion point**

```bash
grep -n "^function openSiteDrawer" gs-command-center.html
```

Expected: single match.

- [ ] **Step 2: Insert helpers above `openSiteDrawer`**

Use Edit. `old_string` = `function openSiteDrawer(siteId){`. `new_string`:

```js
// ─── Phase 3 helpers: Value Prop sync ────────────────────────────────
let _vpCache = null;
async function loadValueProps(){
  if(_vpCache) return _vpCache;
  try {
    const url = ROADYS_SB_URL + '/rest/v1/value_props?select=*&status=eq.active';
    const resp = await fetch(url, {
      headers:{'apikey':ROADYS_SB_ANON,'Authorization':'Bearer '+ROADYS_SB_ANON,'Accept':'application/json'}
    });
    if(!resp.ok) return null;
    _vpCache = await resp.json();
    return _vpCache;
  } catch(e){ return null; }
}
function valuePropForStop(stop){
  if(!_vpCache || !stop) return null;
  const sCity = (stop.city||'').toLowerCase().trim();
  const sState = (stop.state||'').toLowerCase().trim();
  if(!sCity || !sState) return null;
  return _vpCache.find(vp =>
    (vp.city||'').toLowerCase().trim() === sCity &&
    (vp.state||'').toLowerCase().trim() === sState
  ) || null;
}
function relativeAge(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '—';
  const ms = Date.now() - d.getTime();
  const days = Math.floor(ms / 86400000);
  if(days < 1) return 'today';
  if(days < 7) return days + 'd ago';
  if(days < 30) return Math.floor(days/7) + 'w ago';
  if(days < 365) return Math.floor(days/30) + 'mo ago';
  return Math.floor(days/365) + 'y ago';
}

function openSiteDrawer(siteId){
```

- [ ] **Step 3: Verify**

```bash
grep -c "^async function loadValueProps" gs-command-center.html
grep -c "^function valuePropForStop" gs-command-center.html
grep -c "^function relativeAge" gs-command-center.html
```

Expected: each prints `1`.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`.

---

## Task 6: Value Prop Gallons drawer card (helper + insert)

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Add `drawerValuePropHTML` helper above `openSiteDrawer`**

Use Edit. `old_string` = `function openSiteDrawer(siteId){`. `new_string`:

```js
function drawerValuePropHTML(stopId){
  const stop = MEMBERS.find(m => m.id === stopId);
  const vp = valuePropForStop(stop);
  if(!vp){
    const cityState = stop ? (esc(stop.city||'')+', '+esc(stop.state||'')) : 'this location';
    return `
    <div class="drawer-card cyan">
      <div class="drawer-card-hd">📊 Value Prop Gallons</div>
      <div style="font-size:.78em;color:var(--muted)">No value prop on file for ${cityState}.</div>
      <div style="margin-top:6px"><a href="value-props.html" target="_blank" style="color:var(--cyan);font-size:.78em">Open value-props.html →</a></div>
    </div>
  `;
  }
  const fmt = n => Math.round(+n||0).toLocaleString();
  const fmtK = n => { const v = +n||0; return v >= 1000 ? (v/1000).toFixed(0)+'k' : String(v); };
  const fleet = +vp.fleet_potential || 0;
  const agg = +vp.agg_potential || 0;
  const total = fleet + agg;
  const matches = Array.isArray(vp.fleet_matches) ? vp.fleet_matches : [];
  const topFleets = matches.slice().sort((a,b)=>(+b.gallons||0)-(+a.gallons||0)).slice(0,3);
  const topLine = topFleets.length
    ? topFleets.map(m => esc(m.fleet)+' ('+fmtK(m.gallons)+')').join(', ')
    : '';
  const lastRun = relativeAge(vp.updated_at || vp.created_at);
  const dateStr = vp.updated_at || vp.created_at || '';
  const dateShort = dateStr ? dateStr.slice(0,10) : '';
  return `
    <div class="drawer-card cyan">
      <div class="drawer-card-hd">📊 Value Prop Gallons${dateShort ? ' — Last run '+esc(dateShort)+' ('+lastRun+')' : ''}</div>
      <div class="roi-row"><span class="label">Fleet Potential</span><span class="value">${fmt(fleet)} gal/mo</span></div>
      <div class="roi-row"><span class="label">Aggregator Potential</span><span class="value">${fmt(agg)} gal/mo</span></div>
      <div class="roi-row subtotal"><span class="label">Total Potential</span><span class="value">${fmt(total)} gal/mo</span></div>
      ${topLine ? `<div style="font-size:.7em;color:var(--muted);margin-top:6px">Top fleets within ${vp.radius||50} miles: ${topLine}</div>` : ''}
    </div>
  `;
}

function openSiteDrawer(siteId){
```

- [ ] **Step 2: Trigger `loadValueProps()` from `openSiteDrawer`**

Find the body of `openSiteDrawer`. The current first lines:

```js
function openSiteDrawer(siteId){
  const s=MEMBERS.find(m=>m.id===siteId);if(!s)return;
```

Use Edit:
- `old_string`:
  ```js
  function openSiteDrawer(siteId){
    const s=MEMBERS.find(m=>m.id===siteId);if(!s)return;
  ```
- `new_string`:
  ```js
  function openSiteDrawer(siteId){
    const s=MEMBERS.find(m=>m.id===siteId);if(!s)return;
    // Phase 3: kick off async value-prop fetch on first drawer open this session
    if(!_vpCache) { loadValueProps().then(() => { if(document.getElementById('site-drawer')?.classList.contains('open')) openSiteDrawer(siteId); }); }
  ```

This fires the Supabase fetch in the background; on first open the value-prop card will say "No value prop on file" until the fetch completes (~200-500ms), then the drawer re-renders. Subsequent drawers in the session use the cache.

- [ ] **Step 3: Insert `${drawerValuePropHTML(siteId)}` into the drawer template**

Find the existing line:

```js
    ${drawerCRMTasksHTML(siteId)}
```

Use Edit:
- `old_string`: `    ${drawerCRMTasksHTML(siteId)}` (4-space indent)
- `new_string`:
  ```
      ${drawerValuePropHTML(siteId)}
  
      ${drawerCRMTasksHTML(siteId)}
  ```

This places the Value Prop card between the existing Vendor Programs (Phase 2) card and the CRM Tasks card (Phase 1.1). The Vendor Opportunity card (Task 7) will land between Vendor Programs and Value Prop.

- [ ] **Step 4: Verify**

```bash
grep -c "^function drawerValuePropHTML" gs-command-center.html
grep -c "drawerValuePropHTML(siteId)" gs-command-center.html
grep -c "loadValueProps().then" gs-command-center.html
```

Expected: 1, 1, 1.

- [ ] **Step 5: Syntax check.** Expected: `syntax ok, 1 script blocks`.

---

## Task 7: Vendor opportunity helpers

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Insert helpers above `openSiteDrawer`**

Use Edit. `old_string` = `function openSiteDrawer(siteId){`. `new_string`:

```js
// ─── Phase 3 helpers: Vendor opportunity ──────────────────────────────
function parseAvgSavings(text){
  if(!text) return 0;
  const m = String(text).match(/\$\s*([\d,]+(?:\.\d+)?)\s*\/\s*mo/i);
  return m ? parseFloat(m[1].replace(/,/g,'')) : 0;
}
function vendorSavingsForStop(stopId){
  const VPE = loadVendorEnrolls();
  const stopVP = VPE[stopId];
  if(!stopVP || typeof stopVP !== 'object') return 0;
  const master = loadVendorMaster();
  let sum = 0;
  for(const [vid, on] of Object.entries(stopVP)){
    if(!on) continue;
    const c = master.progDetails.find(p => p.vid === vid);
    if(c) sum += parseAvgSavings(c.avgSavings);
  }
  return sum;
}
function vendorOpportunityForStop(stopId){
  const VPE = loadVendorEnrolls();
  const enrolled = new Set();
  const stopVP = VPE[stopId];
  if(stopVP && typeof stopVP === 'object'){
    for(const [vid, on] of Object.entries(stopVP)){ if(on) enrolled.add(vid); }
  }
  const master = loadVendorMaster();
  const list = master.VP_VENDORS
    .filter(v => v.status === 'Active' && !enrolled.has(v.id))
    .map(v => {
      const c = master.progDetails.find(p => p.vid === v.id);
      return {
        vid: v.id, name: v.name, program: v.program, priority: v.priority,
        phone: v.phone || '', contact: c,
        savings: c ? parseAvgSavings(c.avgSavings) : 0
      };
    });
  list.sort((a,b) => b.savings - a.savings);
  return list;
}

function openSiteDrawer(siteId){
```

- [ ] **Step 2: Verify**

```bash
grep -c "^function parseAvgSavings" gs-command-center.html
grep -c "^function vendorSavingsForStop" gs-command-center.html
grep -c "^function vendorOpportunityForStop" gs-command-center.html
```

Expected: 1, 1, 1.

- [ ] **Step 3: Syntax check.** Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 4: Quick sanity test** — open `gs-command-center.html`, log in, open devtools, run:

```js
console.log('Sysco savings parse:', parseAvgSavings('7% average — ~$1,120/mo on $16,000/mo avg purchases'));
console.log('Vendor opportunity for first stop:', vendorOpportunityForStop(MEMBERS[0]?.id).slice(0,3));
console.log('Vendor savings for first stop:', vendorSavingsForStop(MEMBERS[0]?.id));
```

Expected: first call returns `1120`. Other calls return arrays / numbers (likely empty/zero if `roadys_vp_enroll` isn't populated in this browser — that's fine for the test, we're just checking the functions don't throw).

---

## Task 8: Vendor Programs Opportunity card (helper + insert)

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Add `drawerVendorOpportunityHTML` helper**

Use Edit. `old_string` = `function openSiteDrawer(siteId){`. `new_string`:

```js
function drawerVendorOpportunityHTML(stopId){
  const opps = vendorOpportunityForStop(stopId);
  if(!opps.length){
    return `
    <div class="drawer-card amber">
      <div class="drawer-card-hd">🎯 Opportunity — Vendors NOT Enrolled</div>
      <div style="font-size:.78em;color:var(--muted)">All active vendors are enrolled at this stop. 🎉</div>
    </div>
  `;
  }
  const programColor = {
    'PVP':'var(--cyan)', 'Entegra':'var(--purple)', 'Shop':'var(--orange)',
    'Approved Vendor':'var(--green)', 'NO VP':'var(--muted)'
  };
  const totalPotential = opps.reduce((sum, o) => sum + o.savings, 0);
  const fmtMoney = n => '$'+Math.round(n).toLocaleString();
  const rows = opps.map(o => {
    const pc = programColor[o.program] || 'var(--muted)';
    const savingsLabel = o.savings > 0 ? 'avg '+fmtMoney(o.savings)+'/mo' : (o.contact ? 'savings vary' : 'avg unknown');
    const hasDetails = !!o.contact;
    return `<div class="opp-row" ${hasDetails?`onclick="toggleVendorDetails('opp-${o.vid}', this)"`:''} style="${hasDetails?'':'cursor:default'}">
      <div style="flex:1">
        <span><b>${esc(o.name)}</b> <span style="color:${pc};font-weight:700;font-size:.86em;margin-left:6px">${esc(o.program)}</span></span>
      </div>
      <span class="opp-savings">${savingsLabel}</span>
      ${hasDetails ? '<span style="color:var(--muted);font-size:.86em;margin-left:6px">→</span>' : ''}
    </div>
    ${hasDetails ? `<div class="vd-details" id="vd-opp-${esc(o.vid)}" style="display:none;margin:0 0 4px 8px;padding:6px 10px;border-left:2px solid var(--border);font-size:.82em;line-height:1.5;background:var(--bg)">
      ${o.contact.email ? `<div>📧 <a href="mailto:${esc(o.contact.email)}" style="color:var(--cyan)">${esc(o.contact.email)}</a></div>` : ''}
      ${o.contact.savings ? `<div><b>Savings:</b> ${esc(o.contact.savings)}</div>` : ''}
      ${o.contact.rebateStructure ? `<div><b>Rebate:</b> ${esc(o.contact.rebateStructure)}</div>` : ''}
      ${o.contact.contractTerm ? `<div><b>Contract:</b> ${esc(o.contact.contractTerm)}</div>` : ''}
      ${o.contact.notes ? `<div style="margin-top:4px;color:var(--muted);font-size:.92em"><b>Why enroll:</b> ${esc(String(o.contact.notes).slice(0,300))}${String(o.contact.notes).length>300?'…':''}</div>` : ''}
      <div style="margin-top:6px"><a href="vendors.html" target="_blank" style="color:var(--cyan)">Enroll on vendors.html →</a></div>
    </div>` : ''}`;
  }).join('');
  return `
    <div class="drawer-card amber">
      <div class="drawer-card-hd">🎯 Opportunity — Vendors NOT Enrolled (${opps.length} missed)</div>
      <div style="display:flex;flex-direction:column;gap:4px">${rows}</div>
      ${totalPotential > 0 ? `<div class="roi-foot">Total potential savings if enrolled: <b style="color:var(--yellow)">${fmtMoney(totalPotential)}/mo</b><br>Excludes vendors without quantified savings.</div>` : ''}
    </div>
  `;
}

function openSiteDrawer(siteId){
```

⚠️ Note: the existing `toggleVendorDetails(vid, el)` from Phase 2 looks up `document.getElementById('vd-' + vid)`. We're passing `'opp-'+o.vid` as the vid, and the matching div has `id="vd-opp-${o.vid}"`. The function builds the id by prepending `'vd-'`, so `'vd-' + 'opp-V00010'` = `'vd-opp-V00010'` — matches. ✓

- [ ] **Step 2: Insert `${drawerVendorOpportunityHTML(siteId)}` into the drawer template**

The current order around the Vendor + Value Prop area (after Tasks 1-5) looks like:

```js
    ${drawerVendorStubHTML(siteId)}

    ${drawerValuePropHTML(siteId)}

    ${drawerCRMTasksHTML(siteId)}
```

Use Edit:
- `old_string`: `    ${drawerVendorStubHTML(siteId)}\n\n    ${drawerValuePropHTML(siteId)}` (with literal newlines as shown)

Actually use a more reliable two-line anchor. Read the file at the relevant section first to confirm exact whitespace, then use:
- `old_string`: 
  ```
      ${drawerVendorStubHTML(siteId)}
  
      ${drawerValuePropHTML(siteId)}
  ```
- `new_string`: 
  ```
      ${drawerVendorStubHTML(siteId)}
  
      ${drawerVendorOpportunityHTML(siteId)}
  
      ${drawerValuePropHTML(siteId)}
  ```

- [ ] **Step 3: Verify**

```bash
grep -c "^function drawerVendorOpportunityHTML" gs-command-center.html
grep -c "drawerVendorOpportunityHTML(siteId)" gs-command-center.html
```

Expected: 1, 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`.

---

## Task 9: ROI Calculator (computeStopROI helper + drawerROIHTML + insert)

**Files:**
- Modify: `gs-command-center.html`

**Goal:** Render a dual-column ROI card showing **Current** and **Potential** ROI side-by-side. Same costs in both columns. Current value = currently-enrolled vendor savings. Potential value = current + missed-vendor opportunity savings. Fuel gallons stay informational at the bottom (per design decision: keeping ROI math simple by not needing a per-stop $/gallon rate). Rewards data is shown on its own card (Task 4) — not in the ROI math.

- [ ] **Step 1: Insert `computeStopROI` and `drawerROIHTML` above `openSiteDrawer`**

Use Edit. `old_string` = `function openSiteDrawer(siteId){`. `new_string`:

```js
// ─── Phase 3 helpers: ROI Calculator ──────────────────────────────────
function parseDollarString(s){
  if(s == null) return null;
  if(typeof s === 'number') return isNaN(s) ? null : s;
  const cleaned = String(s).replace(/[$,\s]/g, '');
  if(!cleaned) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}
function computeStopROI(stopId){
  const rec = loadStopRecord(stopId);
  const membership = parseDollarString(rec.membershipCost);
  const priceFee = rec.priceFileFeeRemoved ? 0 : 295;
  const vendorSavingsCurrent = vendorSavingsForStop(stopId);
  const opps = vendorOpportunityForStop(stopId);
  const vendorSavingsOpportunity = opps.reduce((s, o) => s + (o.savings || 0), 0);
  const cost = (membership == null) ? null : membership + priceFee;
  const valueCurrent   = vendorSavingsCurrent;
  const valuePotential = vendorSavingsCurrent + vendorSavingsOpportunity;
  const netCurrent   = (cost == null) ? null : valueCurrent   - cost;
  const netPotential = (cost == null) ? null : valuePotential - cost;
  return {
    membership, priceFee, priceFileFeeRemoved: !!rec.priceFileFeeRemoved,
    cost,
    vendorSavingsCurrent, vendorSavingsOpportunity,
    valueCurrent, valuePotential,
    netCurrent, netPotential,
    membershipMissing: membership == null
  };
}
function drawerROIHTML(stopId){
  const r = computeStopROI(stopId);
  const fmt = n => '$' + Number(n||0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  // Fuel context — reuse Phase 1 helpers
  const m = currentMonthKey();
  const mtdGal = stopTotalGallons(stopId, m);
  const ytdGal = ytdGallonsForStop(stopId, m, 'total');
  const fmtGal = n => Math.round(n).toLocaleString();
  const memberCell = r.membershipMissing
    ? `<span class="value" style="color:var(--muted);font-style:italic">— *</span>`
    : `<span class="value">${fmt(r.membership)}</span>`;
  const priceFeeCell = `<span class="value">${r.priceFileFeeRemoved ? '$0.00 (✓ Removed)' : fmt(295)}</span>`;
  const costCell = `<span class="value">${r.cost == null ? '—' : fmt(r.cost)}</span>`;
  function netCell(net){
    if(net == null) return `<span class="value" style="color:var(--muted);font-style:italic">—</span>`;
    const cls = net > 0 ? 'positive' : 'negative';
    const sym = net > 0 ? ' ✓' : ' ✗';
    return `<span class="value" style="font-weight:800;color:${net>0?'var(--green)':'var(--red)'}">${fmt(net)}${sym}</span>`;
  }
  // Render two-column table: rows are "label · current · potential"
  return `
    <div class="drawer-card green">
      <div class="drawer-card-hd">💰 Site Value / ROI — Monthly</div>
      <table style="width:100%;font-size:.84em;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:1px solid var(--border)">
            <th style="text-align:left;padding:4px 0;font-size:.7em;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.06em"></th>
            <th style="text-align:right;padding:4px 8px;font-size:.7em;color:var(--text);font-weight:700;text-transform:uppercase;letter-spacing:.06em">Current</th>
            <th style="text-align:right;padding:4px 0;font-size:.7em;color:var(--text);font-weight:700;text-transform:uppercase;letter-spacing:.06em">Potential</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="color:var(--muted)">Membership cost</td><td style="text-align:right;padding:3px 8px">${memberCell}</td><td style="text-align:right;padding:3px 0">${memberCell}</td></tr>
          <tr><td style="color:var(--muted)">Price File Fee ($295)</td><td style="text-align:right;padding:3px 8px">${priceFeeCell}</td><td style="text-align:right;padding:3px 0">${priceFeeCell}</td></tr>
          <tr style="border-top:1px solid var(--border);font-weight:700"><td>COSTS</td><td style="text-align:right;padding:6px 8px 3px">${costCell}</td><td style="text-align:right;padding:6px 0 3px">${costCell}</td></tr>
          <tr><td style="color:var(--muted)">Vendor savings — currently enrolled *</td><td style="text-align:right;padding:3px 8px"><span class="value">${fmt(r.vendorSavingsCurrent)}</span></td><td style="text-align:right;padding:3px 0"><span class="value">${fmt(r.vendorSavingsCurrent)}</span></td></tr>
          <tr><td style="color:var(--muted)">+ Missed opportunity *</td><td style="text-align:right;padding:3px 8px"><span class="value" style="color:var(--muted)">—</span></td><td style="text-align:right;padding:3px 0"><span class="value" style="color:var(--yellow);font-weight:700">${fmt(r.vendorSavingsOpportunity)}</span></td></tr>
          <tr style="border-top:1px solid var(--border);font-weight:700"><td>VALUE</td><td style="text-align:right;padding:6px 8px 3px"><span class="value">${fmt(r.valueCurrent)}</span></td><td style="text-align:right;padding:6px 0 3px"><span class="value">${fmt(r.valuePotential)}</span></td></tr>
          <tr style="border-top:2px solid var(--border);font-size:1em;font-weight:800"><td style="padding-top:8px">NET / ROI</td><td style="text-align:right;padding:8px 8px 3px">${netCell(r.netCurrent)}</td><td style="text-align:right;padding:8px 0 3px">${netCell(r.netPotential)}</td></tr>
        </tbody>
      </table>
      <div class="roi-foot">
        Fuel context: ${fmtGal(mtdGal)} gal MTD · ${fmtGal(ytdGal)} gal YTD<br>
        ${r.membershipMissing ? '* Set Membership Cost on the Membership card above (or import via CSV) to compute ROI.<br>' : ''}
        * Vendor savings are estimates based on network averages.
      </div>
    </div>
  `;
}

function openSiteDrawer(siteId){
```

The dual-column table renders as:

```
                                        CURRENT       POTENTIAL
Membership cost                         $   500.00    $   500.00
Price File Fee ($295)                   $     0.00    $     0.00
─────────────────────────────────────────────────────────────────
COSTS                                   $   500.00    $   500.00

Vendor savings — currently enrolled     $ 1,425.00    $ 1,425.00
+ Missed opportunity                          —       $ 4,820.00
─────────────────────────────────────────────────────────────────
VALUE                                   $ 1,425.00    $ 6,245.00
─────────────────────────────────────────────────────────────────
NET / ROI                               $   925.00 ✓  $ 5,745.00 ✓

Fuel context: 324,580 gal MTD · 1,287,940 gal YTD
* Vendor savings are estimates based on network averages.
```

- [ ] **Step 2: Insert `${drawerROIHTML(siteId)}` into the drawer template**

Place between `${drawerCRMTasksHTML(siteId)}` and the existing Calculations section (`<div class="drawer-section"><h4>🧮 Calculations`).

Find:
```js
    ${drawerCRMTasksHTML(siteId)}

    <div class="drawer-section">
      <h4>🧮 Calculations
```

Use Edit:
- `old_string`: 
  ```
      ${drawerCRMTasksHTML(siteId)}
  
      <div class="drawer-section">
        <h4>🧮 Calculations
  ```
- `new_string`:
  ```
      ${drawerCRMTasksHTML(siteId)}
  
      ${drawerROIHTML(siteId)}
  
      <div class="drawer-section">
        <h4>🧮 Calculations
  ```

- [ ] **Step 3: Verify**

```bash
grep -c "^function computeStopROI" gs-command-center.html
grep -c "^function drawerROIHTML" gs-command-center.html
grep -c "drawerROIHTML(siteId)" gs-command-center.html
```

Expected: 1, 1, 1.

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`.

---

## Task 10: CSV Import — button + parse + match

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Add `handleImportStopData` helper above `openSiteDrawer`**

Use Edit. `old_string` = `function openSiteDrawer(siteId){`. `new_string`:

```js
// ─── Phase 3 helpers: Stop Data CSV Import ────────────────────────────
async function handleImportStopData(input){
  const file = input.files && input.files[0];
  if(!file){ return; }
  try {
    const X = await ensureSheetJS();
    const buf = await file.arrayBuffer();
    const wb = X.read(buf, {type:'array'});
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = X.utils.sheet_to_json(sheet, {raw:false, defval:''});
    if(!rows.length){ toast('CSV is empty'); input.value = ''; return; }
    // Normalize headers — case-insensitive lookup
    const headerMap = {};
    Object.keys(rows[0]).forEach(h => { headerMap[h.toLowerCase().trim()] = h; });
    const colStopId   = headerMap['stop id'] || headerMap['stopid'] || headerMap['site id'] || headerMap['siteid'];
    if(!colStopId){
      toast('CSV missing required "Stop ID" column');
      input.value = '';
      return;
    }
    const colMembership = headerMap['membership cost'];
    const colMgr        = headerMap['site manager'];
    const colEmail      = headerMap['email'];
    const colPhone      = headerMap['phone'];
    const colPff        = headerMap['price file fee removed'];
    const colFuelman    = headerMap['accepts fuelman']    || headerMap['fuelman'];
    const colRcheck     = headerMap['accepts r-check']    || headerMap['accepts rcheck'] || headerMap['r-check'] || headerMap['rcheck'];
    const colYtdGal     = headerMap['ytd total gallons']  || headerMap['ytd gallons']    || headerMap['gallons ytd'];
    const colRewardsAdds    = headerMap['rewards ytd adds']    || headerMap['rewards adds ytd']    || headerMap['ytd adds'];
    const colRewardsRedeems = headerMap['rewards ytd redeems'] || headerMap['rewards redeems ytd'] || headerMap['ytd redeems'];
    const truthy = v => /^(yes|true|1|y)$/i.test(String(v||'').trim());
    const parseDollarish = v => {
      if(v === '' || v == null) return null;
      const n = parseFloat(String(v).replace(/[$,\s]/g,''));
      return isNaN(n) ? null : n;
    };
    const parsed = [];
    let unmatched = 0;
    for(const r of rows){
      const csvLid = String(r[colStopId]||'').trim();
      if(!csvLid) continue;
      let stop = MEMBERS.find(m => m.id === csvLid);
      if(!stop){
        const padded = csvLid.replace(/^([A-Z])(\d+)$/, (_, p, n) => p + n.padStart(5, '0'));
        stop = MEMBERS.find(m => m.id === padded);
      }
      if(!stop){ unmatched++; continue; }
      const rec = {};
      if(colMembership && r[colMembership]) rec.membershipCost = String(r[colMembership]).trim();
      if(colMgr && r[colMgr]) rec.siteMgrName = String(r[colMgr]).trim();
      if(colEmail && r[colEmail]) rec.siteMgrEmail = String(r[colEmail]).trim();
      if(colPhone && r[colPhone]) rec.siteMgrPhone = String(r[colPhone]).trim();
      if(colPff && r[colPff] !== '') rec.priceFileFeeRemoved = truthy(r[colPff]);
      if(colFuelman && r[colFuelman] !== '') rec.acceptsFuelman = truthy(r[colFuelman]);
      if(colRcheck && r[colRcheck] !== '') rec.acceptsRcheck = truthy(r[colRcheck]);
      if(colYtdGal){
        const n = parseDollarish(r[colYtdGal]);
        if(n != null) rec.ytdTotalGallons = n;
      }
      if(colRewardsAdds){
        const n = parseDollarish(r[colRewardsAdds]);
        if(n != null) rec.rewardsYtdAdds = n;
      }
      if(colRewardsRedeems){
        const n = parseDollarish(r[colRewardsRedeems]);
        if(n != null) rec.rewardsYtdRedeems = n;
      }
      if(Object.keys(rec).length) parsed.push({stopId: stop.id, stopName: stop.name, rec});
    }
    previewStopDataImport(parsed, unmatched);
  } catch(e){
    console.error('Import error:', e);
    toast('Import failed: '+(e.message||e));
  } finally {
    input.value = '';
  }
}

function openSiteDrawer(siteId){
```

- [ ] **Step 2: Verify**

```bash
grep -c "^async function handleImportStopData" gs-command-center.html
```

Expected: `1`.

- [ ] **Step 3: Syntax check.** Expected: `syntax ok, 1 script blocks`.

---

## Task 11: CSV Import — preview modal + commit + button

**Files:**
- Modify: `gs-command-center.html`

- [ ] **Step 1: Add modal markup at end of body**

Find the closing `</body>` tag. Use Grep:

```bash
grep -n "^</body>" gs-command-center.html
```

Expected: a single match.

Use Edit:
- `old_string`: `</body>`
- `new_string`:
  ```html
  <!-- PHASE 3: STOP DATA CSV IMPORT MODAL -->
  <div id="stopdata-import-modal" onclick="if(event.target.id==='stopdata-import-modal')closeStopDataModal()">
    <div class="import-modal-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0">📥 Import Stop Data — Preview</h3>
        <button class="btn" onclick="closeStopDataModal()">✕</button>
      </div>
      <div id="stopdata-import-summary" style="font-size:.85em;line-height:1.6"></div>
      <div id="stopdata-import-preview"></div>
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" onclick="closeStopDataModal()">Cancel</button>
        <button class="btn btn-green" id="stopdata-import-commit" onclick="commitStopDataImport()">Confirm Import</button>
      </div>
    </div>
  </div>
  </body>
  ```

- [ ] **Step 2: Add `previewStopDataImport`, `commitStopDataImport`, `closeStopDataModal` helpers above `openSiteDrawer`**

Use Edit. `old_string` = `function openSiteDrawer(siteId){`. `new_string`:

```js
let _pendingImport = null;
function previewStopDataImport(parsed, unmatched){
  _pendingImport = parsed;
  const sum = document.getElementById('stopdata-import-summary');
  const prev = document.getElementById('stopdata-import-preview');
  const commitBtn = document.getElementById('stopdata-import-commit');
  if(!sum || !prev || !commitBtn) return;
  sum.innerHTML = `Matched: <b style="color:var(--green)">${parsed.length}</b> stops · Unmatched: <b style="color:${unmatched?'var(--red)':'var(--muted)'}">${unmatched}</b>`;
  if(parsed.length === 0){
    prev.innerHTML = '<div style="color:var(--muted);font-size:.82em;margin-top:8px">No matchable rows. Check that the CSV has a Stop ID column with values like R03650.</div>';
    commitBtn.disabled = true;
    commitBtn.style.opacity = '.4';
  } else {
    const sample = parsed.slice(0, 5);
    prev.innerHTML = `<table class="import-preview-tbl"><thead><tr><th>Stop ID</th><th>Stop Name</th><th>Fields Updated</th></tr></thead><tbody>`+
      sample.map(p => `<tr><td>${esc(p.stopId)}</td><td>${esc(p.stopName)}</td><td style="font-size:.92em;color:var(--muted)">${esc(Object.keys(p.rec).join(', '))}</td></tr>`).join('')+
      `</tbody></table>${parsed.length>5?`<div style="font-size:.72em;color:var(--muted);margin-top:6px">… and ${parsed.length-5} more</div>`:''}`;
    commitBtn.disabled = false;
    commitBtn.style.opacity = '1';
  }
  document.getElementById('stopdata-import-modal').classList.add('show');
}
function commitStopDataImport(){
  if(!_pendingImport || !_pendingImport.length){ closeStopDataModal(); return; }
  const gsList = Object.keys(REGIONS).filter(g => g && g !== 'Unassigned');
  for(const gs of gsList){
    const key = LS_KEY + gs + '_stopdata';
    let cur = {};
    try { cur = JSON.parse(localStorage.getItem(key) || '{}'); } catch(e){}
    for(const p of _pendingImport){
      cur[p.stopId] = Object.assign({}, cur[p.stopId] || {}, p.rec);
    }
    try { localStorage.setItem(key, JSON.stringify(cur)); } catch(e){}
  }
  // If the active GS is one of the imported ones, refresh in-memory stopdata
  const active = (typeof getActiveGS === 'function') ? getActiveGS() : null;
  if(active && gsList.includes(active)){
    try { stopdata = JSON.parse(localStorage.getItem(LS_KEY + active + '_stopdata') || '{}'); } catch(e){}
  }
  toast(`Imported ${_pendingImport.length} stops to ${gsList.length} GS namespaces`);
  closeStopDataModal();
  // Re-render dashboard so any visible drawer / cards refresh
  if(typeof renderDashboard === 'function') renderDashboard();
}
function closeStopDataModal(){
  _pendingImport = null;
  const m = document.getElementById('stopdata-import-modal');
  if(m){ m.classList.remove('show'); }
}

function openSiteDrawer(siteId){
```

- [ ] **Step 3: Add the Import button to the My Stops card on the Per-GS Dashboard**

Find `renderMyStopsCard` (Phase 1 helper). Read the function start to understand the markup. The card returns:

```js
return `<div class="card" style="margin-top:14px">
    <div class="card-hd">📍 My Stops (${stops.length})</div>
    <div style="overflow-x:auto"><table class="mystops-table" id="mystops-tbl">
```

Use Edit:
- `old_string`:
  ```
  return `<div class="card" style="margin-top:14px">
      <div class="card-hd">📍 My Stops (${stops.length})</div>
  ```
- `new_string`:
  ```
  return `<div class="card" style="margin-top:14px">
      <div class="card-hd" style="justify-content:space-between">
        <span>📍 My Stops (${stops.length})</span>
        <div style="display:flex;gap:6px">
          ${!isAllGSMode() ? `<label class="btn" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-size:.75em">📥 Import Stop Data
            <input type="file" accept=".csv,.xlsx,.xls" onchange="handleImportStopData(this)" style="display:none">
          </label>` : ''}
        </div>
      </div>
  ```

- [ ] **Step 4: Verify**

```bash
grep -c "^function previewStopDataImport" gs-command-center.html
grep -c "^function commitStopDataImport" gs-command-center.html
grep -c "^function closeStopDataModal" gs-command-center.html
grep -c "id=\"stopdata-import-modal\"" gs-command-center.html
grep -c "Import Stop Data" gs-command-center.html
```

Expected: 1, 1, 1, 1, at least 2.

- [ ] **Step 5: Syntax check.** Expected: `syntax ok, 1 script blocks`.

---

## Task 12: Final smoke test + Phase 3 commit

- [ ] **Step 1: Full syntax check** (same `node -e` command). Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 2: Browser smoke checklist** (run in `gs-command-center.html`)

  - [ ] Log in as a per-GS PIN (1001-1006).
  - [ ] **Site Details cleanup:** open any stop drawer. Site Details now shows ONLY "Has Rewards". No Vendor Programs / Contacts / Site Notes free-text fields.
  - [ ] **Membership card upgrades:**
    - Two new fields visible: "Rewards Revenue / mo" (number) and a "$295 Price File Fee — Removed" checkbox at the bottom.
    - Type a rewards value → blur → toast "Saved".
    - Toggle the Price File Fee checkbox → toast "Saved".
    - Reload → values persist.
  - [ ] **Vendor Programs Opportunity card:** new amber-bordered card appears between Vendor Programs (enrolled) and Value Prop. Lists Active vendors not enrolled, sorted by avg savings desc. Click a row with a `progDetails` record → expands to show email + savings + rebate + contract + "why enroll" + Enroll link. Click again → collapses.
  - [ ] **Value Prop Gallons card:** cyan-bordered card. With matching value-props record by city+state: shows Fleet Potential, Aggregator Potential, Total, Last run timestamp, top 3 fleets. Without match: shows "No value prop on file for {city}, {state}." with link to value-props.html.
  - [ ] **ROI Calculator card:** green-bordered, after CRM Tasks. With both Membership and Rewards filled: shows Costs / Value / Net with green ✓ if positive ROI. With Membership empty: Membership row shows "—", Net shows "—" with hint. With Rewards empty: Rewards row shows "—", Net shows "—". Vendor savings always shows a $ figure (may be $0). Fuel context line shows MTD/YTD gallons.
  - [ ] **CSV Import:** on the Per-GS Dashboard, the "📍 My Stops" card now has a "📥 Import Stop Data" button. Click → file picker → select a small test CSV with `Stop ID, Membership Cost, Rewards Revenue Monthly` columns → preview modal shows matched/unmatched counts + sample rows → click Confirm Import → toast "Imported N stops to M GS namespaces" → modal closes → reopen a drawer of an imported stop → updated values visible.
  - [ ] **All-GS rollup mode (PIN 9999):** Import button is hidden. Drawer renders read-only.

- [ ] **Step 3: Commit Phase 3**

```bash
cd "/c/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && git add gs-command-center.html "docs/superpowers/plans/2026-04-30-phase-3-stop-drawer-sales-tools.md" && git commit -m "$(cat <<'EOF'
GS Command Center Phase 3: Stop Drawer Sales Tools

- Site Details cleanup: drop redundant Vendor Programs / Contacts /
  Site Notes free-text fields (kept Has Rewards). Made redundant by
  Phase 1's Membership card and Phase 2's Vendor Programs card.
- Price File Fee status: new checkbox on Membership card writes
  stopdata.priceFileFeeRemoved. ROI card includes $295 cost when
  unchecked, $0 when checked.
- Per-stop Rewards Revenue field on Membership card writes
  stopdata.rewardsRevenueMonthly (number). Used by ROI card.
- Vendor Programs Opportunity card (amber): vendors NOT enrolled,
  sorted by avg savings desc, click-to-expand details + enroll link.
  New helpers: parseAvgSavings, vendorOpportunityForStop,
  vendorSavingsForStop.
- Value Prop Gallons card (cyan): pulls from Supabase value_props
  table, matches by city+state, shows fleet/aggregator potential,
  last-run timestamp, top 3 fleets within radius. New helpers:
  loadValueProps, valuePropForStop, relativeAge.
- ROI Calculator card (green): membership + price fee - rewards -
  vendor savings = Net to Site. Renders ✓ green when positive ROI,
  ✗ red when negative, '—' when inputs missing. New helpers:
  computeStopROI, drawerROIHTML, parseDollarString.
- Stop Data CSV Import tool: 📥 Import Stop Data button on My Stops
  card opens file picker → SheetJS parse → preview modal (matched /
  unmatched counts + sample rows) → Confirm writes to all 6 GS
  namespaces. Replaces the morning's devtools-paste approach.
  New helpers: handleImportStopData, previewStopDataImport,
  commitStopDataImport, closeStopDataModal.

Spec: docs/superpowers/specs/2026-04-30-phase-3-stop-drawer-sales-tools.md
Plan: docs/superpowers/plans/2026-04-30-phase-3-stop-drawer-sales-tools.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push**

```bash
git push origin gs-command-center-workstation
```

- [ ] **Step 5: Verify**

```bash
git log -1 --stat
```

Expected: one new commit; only `gs-command-center.html` and the plan doc modified.

---

## Out-of-scope reminders

- **Phase 4 (renumbered):** GS Management migration from `index.html`.
- **Phase 5 (renumbered):** Notes panel + Share Results.
- **Phase 6 (renumbered):** Schedule Next Visit + calendar export.
- **Backend / Auth migration of `stopdata`:** separate sub-project after Phase 6.
- **Per-stop fuel margin tracking:** would let the ROI Calculator include real fuel value. Currently fuel is informational only (gallon volume). Future spec.
- **value_props deep-link** ("Open value-props.html" goes to the page root, not pre-populated for this stop). Future enhancement; the link works as a navigation hint today.
