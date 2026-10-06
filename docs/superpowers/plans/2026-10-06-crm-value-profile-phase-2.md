# CRM × Value Profile — Phase 2 (CRM Surfaces) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a lead's value profile visible and reachable everywhere the CRM already shows that lead — the Kanban card, the lead detail, the Lead Table, the CSV export and the analytics — and let the calculator open pre-filled from a lead.

**Architecture:** Phase 1 put profiles in `bd_value_profiles` and built `RoadysBD.profiles` to read them. Phase 2 adds no new storage. `CRM.html` loads every visible lead's profile in **one** batch call alongside its existing lead load, caches it in a map, and renders from that map. The display logic that decides *what a profile says* moves into `roadysBD.js` as pure functions, so it is unit-testable — Phase 1's final review found four blockers in exactly the kind of untested glue this phase would otherwise repeat.

**Tech Stack:** Vanilla ES5-style browser JS, no build step; `@supabase/supabase-js@2`; `node --test` for unit tests; the shared UMD modules `roadysBD.js` / `bdpgStats.js`.

**Spec:** `docs/superpowers/specs/2026-10-05-crm-value-profile-integration-design.md` §4

## Global Constraints

- **No formula change.** `busDevGallonsCalculator.js` is untouched. `node --test *.test.js` starts at **262 passing** and must never go down.
- **New display logic goes in `roadysBD.js`, not in the HTML.** Phase 1's final review: *"Eight reviews read this code and none caught that `currentCloudId` outlives the card's identity. A mockable seam would have."* Every pure decision in this phase is a tested function.
- **ES5 in `roadysBD.js`** (`var`/`function`, no `let`/`const`/arrow/`async`). Test files may use modern syntax.
- **One round trip for the board.** `RoadysBD.profiles.forLeads(ids)` exists and is batched. Never call `forLead()` per card.
- **No existing CRM feature regresses:** Kanban drag-and-drop, calendar, auto-scheduler, email templates, notes, scheduled calls, CSV import/export, deleted-lead restore, analytics, the `?lead=&call=` deep link, the 90-second background refresh.
- **Two id spaces stay separate** (Phase 1, Task 6): `BDPG.currentProfileId` = local tracker record; `BDPG.currentCloudId` = `bd_value_profiles` row. Never assign one from the other.
- **`crmWhoAmI()` retirement IS in scope** (Task 9). `CRM_OWNERS` still is not — it answers "who owns this lead", a controlled vocabulary the analytics group by, which is a different question from "who am I". Do not touch `CRM_OWNERS`.
- Branch off `main` before the first commit. The user runs `git push`; this plan commits locally only.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `roadysBD.js` | + `profiles.summary(p)` and `profiles.gallonsFor(lead, p)` — the pure display/aggregation decisions | Modify |
| `roadysBD.test.js` | Tests for both new functions | Modify |
| `CRM.html` | Profile cache, card summary, lead-detail section, table columns, CSV, analytics | Modify |
| `bus-dev-potential-gallons/index.html` | Save-button and toast wording (Task 8). The deep-link pre-fill it was going to carry already shipped — see Task 5. | Modify |

Nine tasks to build (Task 0 through Task 9, less the superseded Task 5). Task 1 is the tested foundation Tasks 3, 4, 6 and 7 all read through. **Task 5 is already delivered** on `feat/crm-value-prop-deeplink` and is retained below only as a record of what superseded it.

---

## Task 0: Cache-control meta tags for the calculator

Carried over from the Value Prop branch, where it was written and verified but pushed after the PR had already merged, so it never reached `main`.

**Files:**
- Modify: `bus-dev-potential-gallons/index.html` — `<head>`, after the viewport meta

**Interfaces:** none.

- [ ] **Step 1: Create the branch**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/crm-value-profile-phase-2
```

- [ ] **Step 2: Add the three tags**

`CRM.html` and `implementation.html` each declare these; the calculator is the only one of the three without them. Insert after `<meta name="viewport" …>` and before `<title>`, matching this file's own tag style (no self-closing slash):

```html
<!-- Matches CRM.html and implementation.html, which carry the same three. -->
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
```

**What these do and do not do**, so nobody re-derives it later: GitHub Pages serves all three pages with an identical `Cache-Control: max-age=600` header regardless of these tags — measured, not assumed — and browsers honour the HTTP header over `meta http-equiv` for the document itself. So they do **not** speed up how fast a deploy reaches a browser. They are here for consistency across the three pages, and because some proxies and older clients do read them.

The staleness that actually bites after a deploy is fresh HTML pairing with a cached `roadysBD.js`, which breaks the page rather than merely delaying it. The fix for that is versioning the script tags the way `BDPG.dataUrl()` already versions the JSON fetches (`?v=DATA_ASOF`). Not done here; noted for a later phase.

- [ ] **Step 3: Verify and commit**

Confirm the inline `<script>` still parses and `node --test *.test.js` is unchanged at **272 passing**.

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "chore(bdpg): add the cache-control meta tags its sibling pages carry"
```

---

## Task 1: Pure display helpers in `roadysBD.js`

Everything the CRM renders about a profile is decided here, where it can be tested, rather than inline in an 3,700-line HTML file.

**Files:**
- Modify: `roadysBD.js`
- Test: `roadysBD.test.js`

**Interfaces:**
- Consumes: `fromRow()` output shape from Phase 1 (`id, leadId, status, prospectName, city, stateCode, locationType, region, profile, roadway, inputs, results, officialSubtotal, finalGallons, recommendation, regionPctStamp, baselineStamp, author, updatedAt`).
- Produces:
  - `RoadysBD.profiles.summary(profile)` → always an object, never null:
    `{ has:boolean, isDraft:boolean, gallons:number|null, gallonsText:string, recommendation:string, pricingPct:number|null, pricingText:string, truckerPath:string, amenityLevel:string, region:string, profileType:string, savedAt:string }`
  - `RoadysBD.profiles.gallonsFor(lead, profile)` → `{ gallons:number, source:'profile'|'estimate'|'none' }`

- [ ] **Step 1: Write the failing tests**

Append to `roadysBD.test.js`:

```js
// ── profiles.summary ────────────────────────────────────────────────────

test('summary of no profile reports has:false and blanks, never null', () => {
  // The CRM renders this straight into a card; a null here would be a
  // TypeError on every unprofiled lead, which is most of the board.
  const s = RoadysBD.profiles.summary(null);
  assert.equal(s.has, false);
  assert.equal(s.isDraft, false);
  assert.equal(s.gallons, null);
  assert.equal(s.gallonsText, '—');
  assert.equal(s.recommendation, '');
  assert.equal(s.region, '');
});

test('summary of a final profile carries every field the CRM renders', () => {
  const s = RoadysBD.profiles.summary({
    status: 'final', finalGallons: 11153, recommendation: 'Good fit',
    region: 'Northeast', profile: 'Medium truck stop', roadway: 'Interstate',
    updatedAt: '2026-10-06T19:30:00.000Z',
    inputs: { pricingLevel: 0.025, truckerPathRating: 4.5, amenityLevel: 'Average' }
  });
  assert.equal(s.has, true);
  assert.equal(s.isDraft, false);
  assert.equal(s.gallons, 11153);
  assert.equal(s.gallonsText, '11,153');
  assert.equal(s.recommendation, 'Good fit');
  assert.equal(s.pricingPct, 0.025);
  assert.equal(s.pricingText, '+2.5%');
  assert.equal(s.truckerPath, '4.5');
  assert.equal(s.amenityLevel, 'Average');
  assert.equal(s.region, 'Northeast');
  assert.equal(s.profileType, 'Medium truck stop · Interstate');
  assert.equal(s.savedAt, '2026-10-06');
});

test('a draft is flagged as a draft', () => {
  const s = RoadysBD.profiles.summary({ status: 'draft', finalGallons: 9000 });
  assert.equal(s.has, true);
  assert.equal(s.isDraft, true);
});

test('a profile with no generated gallons shows a dash, not zero', () => {
  // A profile saved before Generate ran has null gallons. Rendering "0" would
  // assert a figure the calculator never produced.
  const s = RoadysBD.profiles.summary({ status: 'final', finalGallons: null });
  assert.equal(s.gallons, null);
  assert.equal(s.gallonsText, '—');
});

test('pricing of exactly zero renders as 0.0%, not as missing', () => {
  // 0 is the default posture and the single most common value; a truthiness
  // check would blank it on most profiles.
  const s = RoadysBD.profiles.summary({ status: 'final', inputs: { pricingLevel: 0 } });
  assert.equal(s.pricingPct, 0);
  assert.equal(s.pricingText, '0.0%');
});

test('summary survives a hand-edited row without leaking junk into the DOM', () => {
  const s = RoadysBD.profiles.summary({
    status: 'nonsense', finalGallons: 'lots', region: { x: 1 },
    profile: ['a'], inputs: 'not-an-object', updatedAt: 42
  });
  assert.equal(s.isDraft, true);          // unknown status degrades to draft
  assert.equal(s.gallons, null);
  assert.equal(s.region, '');
  assert.equal(s.profileType, '');
  assert.equal(s.pricingPct, null);
  assert.equal(s.savedAt, '');
});

// ── profiles.gallonsFor ─────────────────────────────────────────────────

test('gallonsFor prefers the profile figure and says so', () => {
  const r = RoadysBD.profiles.gallonsFor({ estGallons: 5000 }, { status: 'final', finalGallons: 11153 });
  assert.deepEqual(r, { gallons: 11153, source: 'profile' });
});

test('gallonsFor falls back to the hand-entered estimate', () => {
  const r = RoadysBD.profiles.gallonsFor({ estGallons: 5000 }, null);
  assert.deepEqual(r, { gallons: 5000, source: 'estimate' });
});

test('gallonsFor reports none when neither exists, without inventing a zero', () => {
  // source:'none' lets the caller exclude the lead from an average rather
  // than drag it down with a zero it never measured.
  const r = RoadysBD.profiles.gallonsFor({}, null);
  assert.deepEqual(r, { gallons: 0, source: 'none' });
});

test('a draft profile does NOT override the hand-entered estimate', () => {
  // A draft is in-progress work. Letting it displace estGallons would make
  // the leaderboard swing on a half-typed figure.
  const r = RoadysBD.profiles.gallonsFor({ estGallons: 5000 }, { status: 'draft', finalGallons: 99999 });
  assert.deepEqual(r, { gallons: 5000, source: 'estimate' });
});

test('a final profile with null gallons falls back rather than counting zero', () => {
  const r = RoadysBD.profiles.gallonsFor({ estGallons: 5000 }, { status: 'final', finalGallons: null });
  assert.deepEqual(r, { gallons: 5000, source: 'estimate' });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `node --test roadysBD.test.js`
Expected: FAIL — `RoadysBD.profiles.summary is not a function`.

- [ ] **Step 4: Implement**

In `roadysBD.js`, add before the `var RoadysBD = {` declaration:

```js
  // ── Display helpers ──────────────────────────────────────────────────
  //
  // Everything the CRM renders ABOUT a profile is decided here rather than
  // inline in CRM.html, so it can be unit-tested. Phase 1 shipped four
  // blocking defects in untested rendering glue; this is the seam that
  // stops that repeating.

  function fmtInt(n) {
    return Math.round(n).toLocaleString();
  }

  // Always returns an object, never null. The CRM renders this directly into
  // a Kanban card, and most leads have no profile — a null here would throw
  // on the common case.
  function summary(p) {
    var out = {
      has: false, isDraft: false, gallons: null, gallonsText: '—',
      recommendation: '', pricingPct: null, pricingText: '',
      truckerPath: '', amenityLevel: '', region: '',
      profileType: '', savedAt: ''
    };
    if (!p || typeof p !== 'object' || Array.isArray(p)) return out;
    out.has = true;
    // Anything that is not the literal 'final' is treated as a draft: an
    // unknown status must never be rendered as a finished profile.
    out.isDraft = str(p.status) !== 'final';
    out.gallons = num(p.finalGallons);
    if (out.gallons !== null) out.gallonsText = fmtInt(out.gallons);
    out.recommendation = str(p.recommendation);
    out.region = str(p.region);

    var prof = str(p.profile), road = str(p.roadway);
    out.profileType = (prof && road) ? (prof + ' · ' + road) : (prof || '');

    var i = obj(p.inputs);
    // num(), not truthiness: 0 is the default pricing posture and the most
    // common value on the board.
    out.pricingPct = num(i.pricingLevel);
    if (out.pricingPct !== null) {
      out.pricingText = (out.pricingPct >= 0 ? '+' : '') + (out.pricingPct * 100).toFixed(1) + '%';
    }
    // The rating is a number in state but can round-trip through jsonb as a
    // string; both render the same and neither is arithmetic here.
    var tp = i.truckerPathRating;
    out.truckerPath = (typeof tp === 'number' && isFinite(tp)) ? String(tp) : str(tp);
    out.amenityLevel = str(i.amenityLevel);

    // Sliced from the ISO string rather than Date-converted, matching the
    // calculator's own tracker: no "Invalid Date" for a junk value, and no
    // UTC-stored/local-rendered day shift.
    var u = str(p.updatedAt);
    out.savedAt = u.length >= 10 ? u.slice(0, 10) : '';
    return out;
  }

  // Which gallons figure represents this lead, and where it came from.
  //
  // A DRAFT never displaces the hand-entered estimate: a draft is in-progress
  // work, and letting a half-typed figure move the leaderboard would make the
  // pipeline total swing while somebody is still typing.
  //
  // source:'none' rather than a silent 0, so a caller can exclude the lead
  // from an average instead of dragging it down with a figure nobody measured.
  function gallonsFor(lead, p) {
    var s = summary(p);
    if (s.has && !s.isDraft && s.gallons !== null) {
      return { gallons: s.gallons, source: 'profile' };
    }
    var est = num(lead && lead.estGallons);
    if (est !== null && est > 0) return { gallons: est, source: 'estimate' };
    return { gallons: 0, source: 'none' };
  }
```

Add to the `profiles` export object: `summary: summary, gallonsFor: gallonsFor`.

- [ ] **Step 5: Run the tests**

Run: `node --test roadysBD.test.js`
Expected: PASS.

- [ ] **Step 6: Confirm the whole suite and report the real numbers**

Run: `node --test *.test.js`
Report the exact totals. Baseline is 262 and this task adds 11, so 273 is expected — but report what you actually see rather than matching a predicted figure.

- [ ] **Step 7: Commit**

```bash
git add roadysBD.js roadysBD.test.js
git commit -m "feat(bd): tested display helpers for profile summary and gallons source"
```

---

## Task 2: Profile cache in `CRM.html`

One batched fetch for the whole board, cached, refreshed with the leads.

**Files:**
- Modify: `CRM.html` — near `let CRM_LEADS` (`:1183`), `crmLoadFromSupabase()` (`:3426`), `crmStartBackgroundRefresh()` (`:3628`)

**Interfaces:**
- Consumes: `RoadysBD.profiles.forLeads(ids)`, `RoadysBD.profiles.summary(p)`.
- Produces: `CRM_PROFILES` (object keyed by leadId), `crmProfileFor(leadId)` → profile or null, `crmSummaryFor(leadId)` → the Task 1 summary object. Tasks 3, 4, 5 and 6 all read through `crmSummaryFor`.

- [ ] **Step 1: Add the cache and its accessors**

Beside `let CRM_LEADS = [];`:

```js
// Value profiles for the leads currently loaded, keyed by lead id. Filled by
// one batched call in crmLoadFromSupabase() — never one request per card; the
// board can hold hundreds of leads.
let CRM_PROFILES = {};
function crmProfileFor(leadId){ return (leadId && CRM_PROFILES[leadId]) || null; }
// Always an object, never null — see RoadysBD.profiles.summary().
function crmSummaryFor(leadId){ return RoadysBD.profiles.summary(crmProfileFor(leadId)); }
```

- [ ] **Step 2: Load profiles alongside the leads**

In `crmLoadFromSupabase()`, inside the `if(data&&data.length){` block, after `CRM_LEADS=data.map(...)` and before the `localStorage.setItem` line, make the function await the profiles:

```js
      // One round trip for every visible lead. Failure is non-fatal: the
      // board still renders, profiles simply show as absent, because a
      // missing profile is already a state every renderer handles.
      try{
        CRM_PROFILES = await RoadysBD.profiles.forLeads(CRM_LEADS.map(l=>l.id));
      }catch(e){ console.warn('crm profile load',e); CRM_PROFILES={}; }
```

`crmLoadFromSupabase` is already `async`, so `await` is available here.

- [ ] **Step 3: Verify the background refresh picks profiles up**

`crmStartBackgroundRefresh()` calls `crmLoadFromSupabase()` every 90 s, so profiles refresh with the leads and need no separate hook. Confirm by reading that nothing else repopulates `CRM_LEADS` without going through `crmLoadFromSupabase`, and state what you found in your report.

- [ ] **Step 4: Verify the script still parses and the suite is unchanged**

Run: `node --test *.test.js` — must be unchanged from Task 1's total.
Confirm `CRM.html`'s inline `<script>` still parses and say how.

- [ ] **Step 5: Commit**

```bash
git add CRM.html
git commit -m "feat(crm): batch-load value profiles alongside leads"
```

---

## Task 3: Profile summary on the Kanban card

**Files:**
- Modify: `CRM.html` — the card HTML inside `renderCRMKanban()` (`:2067`)

**Interfaces:**
- Consumes: `crmSummaryFor(leadId)`.
- Produces: nothing other tasks read.

- [ ] **Step 1: Add the summary row to the card**

Cards are 200–230 px wide and already carry eight facts, so this adds **one** row: gallons and either the recommendation or a draft badge. The remaining fields live in the lead detail (Task 4).

In `renderCRMKanban()`, immediately after the line that renders the `estGallons` / priority row, insert:

```js
      var vp = crmSummaryFor(l.id);
      if(vp.has){
        html+='<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:.65em;margin-bottom:6px;padding-top:5px;border-top:1px dashed var(--border)">'+
          '<span style="color:var(--accent);font-weight:700">'+vp.gallonsText+' gal/mo</span>'+
          (vp.isDraft
            ? '<span class="badge" style="background:rgba(255,214,10,.15);color:var(--yellow);padding:1px 7px">&#9998; draft</span>'
            : (vp.recommendation
                ? '<span style="color:var(--muted);font-weight:600">'+crmEsc(vp.recommendation)+'</span>'
                : ''))+
        '</div>';
      }
```

A lead with no profile gets no row at all — an empty placeholder on every unprofiled card would be noise on a board that is mostly unprofiled early on.

- [ ] **Step 2: Verify in the browser**

Serve the repo, sign in, and confirm on the Pipeline tab:
- a lead with a final profile shows `11,153 gal/mo` and its recommendation
- a lead with only a draft shows the gallons and a yellow `✎ draft` badge
- a lead with no profile is visually unchanged from today
- drag-and-drop, Advance and Edit still work on all three

```bash
node -e "const h=require('http'),f=require('fs'),p=require('path'),u=require('url');const t={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'};h.createServer((q,s)=>{let x=decodeURIComponent(u.parse(q.url).pathname);if(x.endsWith('/'))x+='index.html';const g=p.join(process.cwd(),x);f.readFile(g,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'Content-Type':t[p.extname(g)]||'application/octet-stream'});s.end(d)})}).listen(8731,()=>console.log('http://127.0.0.1:8731/CRM.html'))"
```

- [ ] **Step 3: Commit**

```bash
git add CRM.html
git commit -m "feat(crm): value-profile summary row on the Kanban card"
```

---

## Task 4: Value Profile section in the lead detail

**Files:**
- Modify: `CRM.html` — `crmBuildForm()` (`:2255`), beside the `cmf-sched-section` block (`:2272`)

**Interfaces:**
- Consumes: `crmSummaryFor(leadId)`.
- Produces: `crmOpenInCalculator(leadId)` — used by this task's own buttons only.

**Three states, three button sets.** The section is not has/hasn't; it is:

| state | badge | buttons |
|---|---|---|
| no profile | — | **Build value profile** |
| draft exists | yellow `draft` | **Open draft** · **Update** |
| final exists | green `final` | **View profile** · **Update** |

Every one navigates to `crmOpenInCalculator(leadId)`. The destination does not change, only the rep's intent does — a separate read-only view would be a second renderer of the same data, which the spec's §1 argues against.

- [ ] **Step 1: Build the section**

Follow the file's existing full-width section pattern — `grid-column:1/-1` with a `border-top`, exactly as `cmf-sched-section` does. Add to `crmBuildForm` beside `_sched`:

```js
  const _vp = (function(){
    if(!l) return '';   // a brand-new lead has no id to link a profile to
    const s = crmSummaryFor(l.id);
    const row = (k,v)=>'<div><div style="font-size:.68em;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">'+k+'</div>'+
                       '<div style="font-size:.85em">'+(v||'&mdash;')+'</div></div>';
    const open = '<button class="btn" onclick="crmOpenInCalculator(\''+crmEsc(l.id)+'\')">&#8599; Open in Potential Gallons</button>';
    if(!s.has){
      return `
<div id="cmf-vp-section" style="grid-column:1/-1;border-top:1px solid var(--border);margin-top:12px;padding-top:12px">
  <div style="font-weight:800;font-size:.85em;color:var(--accent);margin-bottom:10px">&#9981; Value Profile</div>
  <div style="font-size:.8em;color:var(--muted);margin-bottom:10px">No value profile yet for this lead.</div>
  <button class="btn btn-accent" onclick="crmOpenInCalculator('${crmEsc(l.id)}')">&#43; Build value profile</button>
</div>`;
    }
    return `
<div id="cmf-vp-section" style="grid-column:1/-1;border-top:1px solid var(--border);margin-top:12px;padding-top:12px">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
    <div style="font-weight:800;font-size:.85em;color:var(--accent)">&#9981; Value Profile</div>
    ${s.isDraft?'<span class="badge by">&#9998; draft — not saved to Prospects yet</span>':'<span class="badge bg">final</span>'}
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:12px">
    ${row('Projected gallons','<b style="color:var(--accent)">'+s.gallonsText+'</b> gal/mo')}
    ${row('Recommendation',crmEsc(s.recommendation))}
    ${row('Discount Pricing Strategy',crmEsc(s.pricingText))}
    ${row('Trucker Path',crmEsc(s.truckerPath))}
    ${row('Amenities',crmEsc(s.amenityLevel))}
    ${row('Region',crmEsc(s.region))}
    ${row('Location profile',crmEsc(s.profileType))}
    ${row('Saved',crmEsc(s.savedAt))}
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    ${open}
    <button class="btn btn-accent" onclick="crmOpenInCalculator('${crmEsc(l.id)}')">&#9998; Update profile</button>
  </div>
</div>`;
  })();
```

Insert `${_vp}` into the returned template immediately after `${_sched}`.

Note **Open** and **Update** deliberately do the same thing — both open the calculator on this lead. They are two labels for one action because the rep's intent differs ("let me look" vs "let me change it") while the destination does not; a separate read-only view would be a second renderer of the same data, which §1 of the spec argues against.

- [ ] **Step 2: Add the navigator**

Near the other `crm*` helpers:

```js
// The calculator reads ?lead= and pre-fills from it (Phase 2, Task 5).
// Opened in a new tab so the rep does not lose an open lead modal, and so
// the CRM's 90-second background refresh keeps running behind them.
function crmOpenInCalculator(leadId){
  if(!leadId) return;
  window.open('bus-dev-potential-gallons/?lead='+encodeURIComponent(leadId),'_blank');
}
```

- [ ] **Step 3: Verify in the browser**

With the server from Task 3 running and signed in:
- open a lead **with** a final profile → the section shows all eight fields and a green `final` badge
- open a lead whose only profile is a **draft** → yellow draft badge, same fields
- open a lead with **no** profile → "No value profile yet" and a single **Build value profile** button
- open a **brand-new** lead (`+ Add to Prospect`) → no Value Profile section at all, and saving still works
- click **Open in Potential Gallons** → a new tab opens at `bus-dev-potential-gallons/?lead=<id>`
- confirm the Schedule a Call section, the activity log and Save all still work

- [ ] **Step 4: Commit**

```bash
git add CRM.html
git commit -m "feat(crm): Value Profile section in the lead detail"
```

---

## Task 5: Calculator pre-fills from the deep-linked lead — **SUPERSEDED, DO NOT BUILD**

Delivered ahead of this plan on branch `feat/crm-value-prop-deeplink`, by a
different mechanism than this task described.

This task specified a `prefillFromLead(leadId)` that **fetches** the lead from
`crm_leads`. What shipped instead passes the lead's fields as **query
parameters** on the deep link, parsed by the tested
`RoadysBD.leadParamsFrom(search)` and applied by `BDPG.applyLeadParams(p)`.

Why the shipped version is the one to keep:

- It pre-fills with no database round trip, so the card is populated the
  instant the page paints rather than after a fetch resolves.
- It still works if the fetch would have failed.
- The parsing — the step that can silently mangle a company name or a state
  code — is unit-tested, which a fetch-and-assign would not have been.

What it costs, recorded rather than hidden: the company and city travel in the
URL, so they appear in browser history and in any proxy log between the rep
and GitHub Pages. The page is behind auth, so this is not public exposure, but
it is less private than fetching by id. The user was shown this trade-off and
chose parameters.

Anything in this plan that assumed `prefillFromLead` should read
`BDPG.applyLeadParams` instead. Nothing else in Phase 2 depends on it.

---

## Task 6: Lead Table columns and CSV export

**Files:**
- Modify: `CRM.html` — `renderCRMTable()` (`:2208`), `crmExport()` (`:2570`)

**Interfaces:**
- Consumes: `crmSummaryFor(leadId)`.

- [ ] **Step 1: Add four table columns**

In `renderCRMTable()`, extend `cols` after `{k:'locations',l:'Locs'}`:

```js
{k:'vpGallons',l:'Proj. Gal'},{k:'vpRec',l:'Recommendation'},{k:'vpStatus',l:'Profile'},{k:'vpSaved',l:'Profiled'}
```

and add the four cells before the actions `<td>`:

```js
    const vp=crmSummaryFor(l.id);
    // …
      '<td style="text-align:right;font-size:.82em;color:'+(vp.has?'var(--accent)':'var(--muted)')+'">'+vp.gallonsText+'</td>'+
      '<td style="font-size:.8em">'+(vp.recommendation?crmEsc(vp.recommendation):'&mdash;')+'</td>'+
      '<td style="font-size:.78em">'+(vp.has?(vp.isDraft?'<span style="color:var(--yellow)">draft</span>':'<span style="color:var(--green)">final</span>'):'&mdash;')+'</td>'+
      '<td style="font-size:.78em;color:var(--muted)">'+(vp.savedAt||'&mdash;')+'</td>'+
```

Update the empty-state `colspan="8"` to `colspan="12"` — four new columns plus the actions column.

**Sorting:** the four new keys are not properties of a lead, so `crmTblSortBy` cannot read them off `l`. In `crmTableFilteredLeads()`'s sort comparator, map them:

```js
    const vpKey=k=>({vpGallons:'gallons',vpRec:'recommendation',vpStatus:'isDraft',vpSaved:'savedAt'})[k];
    // inside the comparator, before the existing property read:
    const vk=vpKey(crmTblSort.col);
    if(vk){
      const av=crmSummaryFor(a.id)[vk], bv=crmSummaryFor(b.id)[vk];
      // Nulls and blanks sort last in both directions -- a lead with no
      // profile is missing data, not the smallest value.
      if(av===null||av===''||av===undefined) return 1;
      if(bv===null||bv===''||bv===undefined) return -1;
      return (av>bv?1:av<bv?-1:0)*(crmTblSort.dir==='asc'?1:-1);
    }
```

- [ ] **Step 2: Add six CSV columns**

A spreadsheet has no width limit, so the CSV gets the four table fields plus region and location profile. In `crmExport()`, append to `cols`:

```js
    ['Projected Gallons',   l=>crmSummaryFor(l.id).gallons],
    ['Recommendation',      l=>crmSummaryFor(l.id).recommendation],
    ['Profile Status',      l=>{const s=crmSummaryFor(l.id); return s.has?(s.isDraft?'draft':'final'):'';}],
    ['Profiled Date',       l=>crmSummaryFor(l.id).savedAt],
    ['Region',              l=>crmSummaryFor(l.id).region],
    ['Location Profile',    l=>crmSummaryFor(l.id).profileType]
```

Export the raw `gallons` number, not `gallonsText` — the formatted string carries a thousands comma that a spreadsheet reads as a text cell, and an em dash for "none" that reads as text too. A blank cell is the honest empty value.

- [ ] **Step 3: Verify in the browser**

- Lead Table shows the four new columns; a lead with no profile shows dashes
- click each new header → sorts, and unprofiled leads sink to the bottom in **both** directions
- export CSV, open it → the six new columns are present, gallons is a number (right-aligned in the spreadsheet, not left), blanks where there is no profile
- the "No leads match filters" empty state still spans the full table width
- CSV **import** still works — it is unchanged, but confirm a round trip

- [ ] **Step 4: Commit**

```bash
git add CRM.html
git commit -m "feat(crm): profile columns in the Lead Table and CSV export"
```

---

## Task 7: Analytics use profile gallons, and say when they are mixed

**Files:**
- Modify: `CRM.html` — `renderCRMAnalytics()` (`:3355`), the owner chart (`:3374`) and the leaderboard (`:3406`)

**Interfaces:**
- Consumes: `RoadysBD.profiles.gallonsFor(lead, profile)`, `crmProfileFor(leadId)`.

- [ ] **Step 1: Switch both aggregations to the shared helper**

Owner chart — replace the `og` accumulation:

```js
        const og={};
        CRM_LEADS.forEach(l=>{
          if(!og[l.owner])og[l.owner]=0;
          og[l.owner]+=RoadysBD.profiles.gallonsFor(l,crmProfileFor(l.id)).gallons;
        });
```

Leaderboard — the same substitution inside its existing `forEach`:

```js
      og[l.owner]+=RoadysBD.profiles.gallonsFor(l,crmProfileFor(l.id)).gallons;
```

Leave `ov` (deal value) and `ol` (lead count) exactly as they are.

- [ ] **Step 2: Count the sources and show the mix**

A figure that is part calculator output and part hand-typed guess should not read as one measurement. Add beside the leaderboard render:

```js
    // Two very different confidence levels land in one number here. Saying
    // so costs a line and stops the total reading as a single measurement.
    const srcs={profile:0,estimate:0,none:0};
    CRM_LEADS.filter(l=>l.stage!=='Closed Lost'&&l.stage!=='Not Qualified')
      .forEach(l=>{srcs[RoadysBD.profiles.gallonsFor(l,crmProfileFor(l.id)).source]++;});
    const srcNote=document.getElementById('crm-gal-source');
    if(srcNote){
      const total=srcs.profile+srcs.estimate+srcs.none;
      srcNote.textContent = total
        ? srcs.profile+' of '+total+' leads use a calculated value profile; '+
          srcs.estimate+' use the hand-entered estimate'+
          (srcs.none?', '+srcs.none+' have neither':'')+'.'
        : '';
    }
```

And add the element under the leaderboard heading in the Analytics panel markup:

```html
<div id="crm-gal-source" style="font-size:.68em;color:var(--muted);margin-bottom:8px"></div>
```

- [ ] **Step 3: Verify in the browser**

- Analytics tab: the gallons-by-owner chart and the leaderboard both change when a lead gains a final profile whose gallons differ from its `estGallons`
- a lead whose only profile is a **draft** still counts its `estGallons`, not the draft figure
- the caption reads e.g. `3 of 23 leads use a calculated value profile; 18 use the hand-entered estimate, 2 have neither.`
- win-rate, pipeline value and the stage chart are unchanged

- [ ] **Step 4: Final suite run**

Run: `node --test *.test.js` — report the exact totals.

- [ ] **Step 5: Commit**

```bash
git add CRM.html
git commit -m "feat(crm): analytics prefer profile gallons and state the mix"
```

---

## Task 8: Rename the save button to say what it does

**Files:**
- Modify: `bus-dev-potential-gallons/index.html` — `saveToProspectsHtml()` (button + hints), `onSaveProfile()` and `finishUp()` (toasts)

**Interfaces:** none produced or consumed.

The button reads **Save to Prospects**, which named the tool's own local tracker tab. Since Phase 1 it also writes a cloud profile and links or creates a CRM lead, so the label undersells what it does.

- [ ] **Step 1: Rename the button**

In `saveToProspectsHtml()`, change the button text to **`💾 Save to CRM`**.

Not "Save to CRM / Contacted": the Contacted move is *prompted* and conditional â only offered for leads at Prospect or Qualified, never applied without consent, and never offered at all from Meeting Scheduled onward. A label asserting it would claim an outcome that happens only sometimes, which is the exact defect Phase 1's Task 7 spent five rounds removing.

Leave the `btn-accent` class and the `disabled` binding on `BDPG._saving` exactly as they are.

- [ ] **Step 2: Update the hint lines**

The three hint strings under the button mention "the Prospects tab". They stay true — the dual write does populate that tab — but the CRM lead is now the headline effect, so reword each to name the CRM first and the local tab second.

- [ ] **Step 3: Update the toasts**

`onSaveProfile()` emits `'Saved to Prospects — '` / `'Updated in Prospects — '` on the local write, and `finishUp()` emits `'Saved to Prospects — '` in two more places. All four take the new vocabulary. Keep the three-outcome structure (`problems` → `terr`, `warnings` → `twarn`, clean → `tok`) exactly as it is.

- [ ] **Step 4: Do NOT rename the calculator's own Prospects tab**

`#bdpg-tab-prospects` and the `prospectsHtml()` tracker stay called **Prospects**. They are a different thing from the CRM — a local list of saved profiles — and renaming them too would claim that tab shows CRM data, which it does not.

- [ ] **Step 5: Verify and commit**

Confirm the inline `<script>` parses and `node --test *.test.js` is unchanged, then:

```bash
git add bus-dev-potential-gallons/index.html
git commit -m "feat(bdpg): save button names the CRM, not just the local tab"
```

---

## Task 9: Retire `crmWhoAmI()` in favour of the session email

**Files:**
- Modify: `CRM.html` — the dropdown markup (`:854`), `CRM_WHOAMI_KEY` / `crmWhoAmI` / `crmSetWhoAmI` / `crmInitWhoAmI` (`:1150-1164`), the `crmInitWhoAmI()` call in `crmInit()`, and the call sites below

**Interfaces:**
- Consumes: `RoadysBD.auth.email()`.

Two notions of identity in one app is one too many: they can disagree, and the one that is merely *claimed* is the one writing to the audit trail.

**There are 10 call sites, not the 4 that spec §4.1 names.** Verified against the file:

| line | feeds | switch to the email? |
|---|---|---|
| 2188 | `activity[].by` — stage move | yes |
| 2488 | `activity[].by` — email sent | yes |
| 2544 | `activity[].by` — lead created | yes |
| 2572 | `activity[].by` — logged activity | yes |
| 2685 | `activity[].by` — CSV import | yes |
| 2868 | `activity[].by` — follow-up completed | yes |
| 3224 | note `owner` — edit | yes |
| 3226 | note `owner` — create | yes |
| 3354 | note `owner` — quick note | yes |
| **2473** | **email-template `{{owner}}`** | **NO — see Step 2** |

- [ ] **Step 1: Make `crmWhoAmI()` read the session**

Change the body, so nine call sites switch at once rather than editing nine lines:

```js
// The session email -- the identity that was actually proven. This used to
// read a "who are you?" dropdown out of localStorage: a second, merely
// claimed identity that could disagree with the signed-in user and still be
// what the audit trail recorded.
function crmWhoAmI(){
  try{ return RoadysBD.auth.email() || 'Unknown'; }catch(e){ return 'Unknown'; }
}
```

- [ ] **Step 2: Fix the one call site this would otherwise break**

`:2473` builds `vars` for the email-template merge, and `{{owner}}` is substituted into the **subject and body of a message sent to the prospect**. Falling back to the session email would put `robert@roadyscorp.com` into outbound copy where a person's name belongs.

Change that one site to fall back to nothing:

```js
  // No crmWhoAmI() fallback here: {{owner}} lands in the subject and body of
  // an email the prospect receives, and an address is not a signature. An
  // unowned lead renders {{owner}} blank, which is visible in the preview
  // before sending, so the rep can assign an owner instead.
  const vars={contact:l.contact||'',company:l.company||'',owner:l.owner||'',state:l.state||'',locations:l.locations||''};
```

- [ ] **Step 3: Remove the dropdown and its storage**

Delete the `<select id="crm-whoami">` markup, `crmSetWhoAmI()`, `crmInitWhoAmI()`, the `CRM_WHOAMI_KEY` constant, and the `crmInitWhoAmI();` call inside `crmInit()`. Then grep for `crm-whoami` and `CRM_WHOAMI_KEY` and confirm zero remain.

The stored `roadys_crm_whoami` key becomes dead. Leave it on disk: it is a one-word local preference, not Supabase-backed data, and a migration to delete it would be more code than the key is worth. Say so in your report.

- [ ] **Step 4: Historical entries are not rewritten**

Existing `activity[].by` and note `owner` values keep whatever name they were written with. They are an audit trail; rewriting them to match today's identity scheme would falsify it. Confirm nothing in your change touches stored rows.

- [ ] **Step 5: Verify in the browser**

- a stage move, a logged activity and a new note each record the session email
- the email-template preview renders `{{owner}}` as the lead's owner, or blank for an unowned lead — never an email address
- the topbar no longer shows the "Who are you?" select, and nothing throws on load
- `node --test *.test.js` unchanged

- [ ] **Step 6: Commit**

```bash
git add CRM.html
git commit -m "refactor(crm): session email replaces the who-am-I dropdown"
```

---

## Self-Review

**Spec coverage (§4).** Lead card summary → Task 3 (compact, per the user's ruling that the card shows a summary and the detail shows the breakdown). Value Profile section with Open / Update / Build → Task 4. Deep link pre-filled with the lead's fields → **delivered ahead of this plan** on `feat/crm-value-prop-deeplink` via query parameters, not the fetch Task 5 described. Task 5 is marked superseded. Lead Table + CSV → Task 6. Analytics with `estGallons` fallback → Task 7. §4.1 `crmWhoAmI()` retirement → Task 9, now **in scope**. It is 10 call sites, not the 4 §4.1 names; nine switch to the session email via the function body, and the tenth (`:2473`) deliberately does not, because `{{owner}}` is merged into email sent to the prospect.

Beyond §4: the user's scope list added two items the spec did not have — the save-button rename (Task 8) and the three explicit lead-detail states (folded into Task 4).

**Placeholder scan.** No TBD/TODO. Every code step carries the code. The one judgement left to an implementer is Task 2 Step 3 (confirm nothing else repopulates `CRM_LEADS`), which is a verification with a stated report-back, not an unspecified edit.

**Type consistency.** `summary()` returns the same 12 keys everywhere it is consumed (Tasks 3, 4, 6). `gallonsFor()` returns `{gallons, source}` and only Task 7 consumes it. `crmSummaryFor` is defined in Task 2 and used in Tasks 3, 4 and 6. `crmProfileFor` is defined in Task 2 and used in Task 7. `crmOpenInCalculator` is defined and used only in Task 4. `BDPG.prefillFromLead` is defined and used only in Task 5. Test counts are stated as "report what you see" rather than as targets, because Phase 1 showed a predicted total becomes pressure to edit a passing test.

**Known limits, stated rather than hidden.** `CRM.html` has no automated coverage and this plan adds none to it — Task 1 is the response, moving every pure decision into a tested module. The browser checks in Tasks 3, 4, 6 and 7 are the only verification the rendering itself gets, and they need a signed-in session.
