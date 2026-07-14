# CRM Independent Truck Stop Prospect Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 8 fabricated example leads in the Business Development CRM (`index.html`) with real, sourced independent truck stop prospects covering all 48 contiguous states, and extend the lead schema to hold address/highway/lanes info those records need.

**Architecture:** Single-file edits to `index.html` for the schema/UI (Tasks 1-3), a small Supabase column migration (Task 4), then a data pipeline built from one-off Node scripts in `scratchpad/` plus 8 parallel research agents (Tasks 5-7) that produces one JS array literal, which gets injected into `index.html` in place of `crmSampleData()`'s contents (Task 8), followed by manual verification (Task 9).

**Tech Stack:** Vanilla ES2019 inline JS in `index.html`; localStorage + Supabase; no build step, no test runner. Verification = `node -e "new Function(<extracted-script>)"` syntax check + Node validation scripts for the data pipeline + manual browser smoke test.

**Spec:** [docs/superpowers/specs/2026-07-13-crm-prospect-research-design.md](../specs/2026-07-13-crm-prospect-research-design.md)

## Global Constraints

- Never fabricate a phone number, email, or contact name. If a field can't be confidently sourced, leave it `''` — do not guess.
- Exclude all 369 entries in the `MEMBERS` array (`index.html:2779`, every `group`: `Roady's`, `Roady's Lite`, `PTP`) and the national chains: Pilot, Flying J, Love's, TA, Petro.
- No DOT-info field — dropped from scope per user confirmation (doesn't apply to truck stops).
- New lead fields use this exact naming: `street`, `city`, `zip`, `exit`, `lanes` (matches the existing `MEMBERS` array's field-naming convention).
- New `CRM_SOURCES` value: `'Market Research'`.
- New-record defaults: `stage:'Prospect'`, `priority:'Medium'`, `owner:''`, `locations:1`, `estGallons:0`, `dealValue:0`, `followUp:''`, `created:'2026-07-13'`.
- `crm_leads` Supabase table is confirmed empty — the JS array in `index.html` is the shared source of truth; no Supabase insert/seed script needed, only the column migration.
- Log/report any state with thin or zero qualifying results rather than silently under-filling.
- Preserve CRLF line endings in `index.html` (Windows repo convention).
- Only edit files listed in File Structure below; leave unrelated uncommitted files alone. Commit after each task.

---

## File Structure

| File | Change |
|---|---|
| `index.html` | Modify: `CRM_SOURCES` (add `'Market Research'`), `crmBuildForm`, `crmSaveLead`, `renderCRMKanban`, `renderCRMTable`, `crmSaveLeadToSupabase`, `crmLoadFromSupabase`, `crmSampleData()` |
| `sql/2026-07-13-crm-leads-location-fields.sql` | Create: migration adding `street`, `city`, `zip`, `exit`, `lanes` columns to `crm_leads` |
| `scratchpad/gen-crm-exclusion-list.js` | Create: one-off generator extracting the exclusion list from `MEMBERS` |
| `scratchpad/crm-exclusion-list.json` | Create: generated output of the above |
| `scratchpad/crm-research-raw/region-1-northeast.json` … `region-8-west.json` | Create: raw output from each of the 8 research agents |
| `scratchpad/gen-crm-prospects.js` | Create: dedupe/validate/assign-defaults generator |
| `scratchpad/crm-prospects-final.js` | Create: final JS array literal ready for injection |

---

### Task 1: Extend the lead schema — form fields + CRM_SOURCES

**Files:**
- Modify: `index.html:12486` (`CRM_SOURCES`)
- Modify: `index.html:12684-12731` (`crmBuildForm`)
- Modify: `index.html:12733-12765` (`crmSaveLead`)

**Interfaces:**
- Produces: lead objects now carry `street`, `city`, `zip`, `exit`, `lanes` string fields (all default `''`), consumed by Task 2 (rendering) and Task 3 (Supabase mapping).

- [ ] **Step 1: Add the new source option**

Locate:
```js
const CRM_SOURCES  = ['Referral','Cold Call','Trade Show','Conference','Website','GS Lead','Existing Member','Other'];
```
Replace with:
```js
const CRM_SOURCES  = ['Referral','Cold Call','Trade Show','Conference','Website','GS Lead','Existing Member','Market Research','Other'];
```

- [ ] **Step 2: Add form inputs for the new fields**

In `crmBuildForm`, locate:
```js
  h+='<div>'+lbl('State(s)')+fi('cmf-state','text',l&&l.state,'e.g. TX, OK')+'</div>';
```
Insert immediately after it:
```js
  h+='<div>'+lbl('Street')+fi('cmf-street','text',l&&l.street,'e.g. 1695 Silver City Hwy NW')+'</div>';
  h+='<div>'+lbl('City')+fi('cmf-city','text',l&&l.city)+'</div>';
  h+='<div>'+lbl('ZIP')+fi('cmf-zip','text',l&&l.zip)+'</div>';
  h+='<div>'+lbl('Highway / Exit')+fi('cmf-exit','text',l&&l.exit,'e.g. Exit 82 / I-10')+'</div>';
  h+='<div>'+lbl('Lanes of Travel')+fi('cmf-lanes','text',l&&l.lanes,'e.g. I-40 E-W corridor')+'</div>';
```

- [ ] **Step 3: Read the new fields on save**

In `crmSaveLead`, locate:
```js
    state:(document.getElementById('cmf-state')?.value||'').trim(),
```
Insert immediately after it:
```js
    street:(document.getElementById('cmf-street')?.value||'').trim(),
    city:(document.getElementById('cmf-city')?.value||'').trim(),
    zip:(document.getElementById('cmf-zip')?.value||'').trim(),
    exit:(document.getElementById('cmf-exit')?.value||'').trim(),
    lanes:(document.getElementById('cmf-lanes')?.value||'').trim(),
```

- [ ] **Step 4: Syntax check**

```bash
cd "/c/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && node -e "
const fs = require('fs');
const html = fs.readFileSync('index.html','utf8');
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
Expected: `syntax ok, N script blocks` (N = however many `<script>` blocks the file has; no error thrown).

- [ ] **Step 5: Commit**

```bash
git add index.html && git commit -m "feat(crm): add street/city/zip/exit/lanes fields to lead form"
```

---

### Task 2: Surface the new fields in Kanban card + Leads table

**Files:**
- Modify: `index.html:12594-12606` (`renderCRMKanban` card template)
- Modify: `index.html:12627-12665` (`renderCRMTable`)

**Interfaces:**
- Consumes: `l.city`, `l.state`, `l.exit` from Task 1's lead objects.

- [ ] **Step 1: Add city + exit to the Kanban card**

Locate:
```js
      html+='<div style="font-size:.68em;color:var(--muted);margin-bottom:6px">'+crmEsc(l.contact)+' &middot; '+crmEsc(l.state)+'</div>';
```
Replace with:
```js
      html+='<div style="font-size:.68em;color:var(--muted);margin-bottom:2px">'+crmEsc(l.contact)+' &middot; '+crmEsc(l.city)+(l.city&&l.state?', ':'')+crmEsc(l.state)+'</div>';
      if(l.exit) html+='<div style="font-size:.63em;color:var(--dim);margin-bottom:6px">'+crmEsc(l.exit)+'</div>';
```

- [ ] **Step 2: Add a Location column to the Leads table header**

Locate:
```js
  thead.innerHTML='<tr><th>ID</th><th>Company</th><th>Contact</th><th>Stage</th><th>Priority</th><th>Owner</th><th>State</th><th>Locs</th><th>Gallons</th><th>Deal $</th><th>Follow-Up</th><th></th></tr>';
```
Replace with:
```js
  thead.innerHTML='<tr><th>ID</th><th>Company</th><th>Contact</th><th>Location</th><th>Stage</th><th>Priority</th><th>Owner</th><th>Locs</th><th>Gallons</th><th>Deal $</th><th>Follow-Up</th><th></th></tr>';
```

- [ ] **Step 3: Update the colspan and add the Location cell**

Locate:
```js
  if(!rows.length){ tbody.innerHTML='<tr><td colspan="12" style="text-align:center;padding:30px;color:var(--muted)">No leads match filters</td></tr>'; return; }
```
Replace with:
```js
  if(!rows.length){ tbody.innerHTML='<tr><td colspan="11" style="text-align:center;padding:30px;color:var(--muted)">No leads match filters</td></tr>'; return; }
```

Locate:
```js
      '<td style="font-size:.78em">'+crmEsc(l.state)+'</td>'+
```
Replace with:
```js
      '<td style="font-size:.78em"><div>'+crmEsc(l.city)+(l.city&&l.state?', ':'')+crmEsc(l.state)+'</div>'+(l.exit?'<div style="font-size:.7em;color:var(--muted)">'+crmEsc(l.exit)+'</div>':'')+'</td>'+
```

- [ ] **Step 4: Also fix the search filter to keep matching on state**

Locate:
```js
    if(q&&![l.company,l.contact,l.state,l.notes].some(v=>(v||'').toLowerCase().indexOf(q)>=0)) return false;
```
Replace with:
```js
    if(q&&![l.company,l.contact,l.state,l.city,l.notes].some(v=>(v||'').toLowerCase().indexOf(q)>=0)) return false;
```

- [ ] **Step 5: Syntax check** (same command as Task 1 Step 4). Expected: `syntax ok, N script blocks`.

- [ ] **Step 6: Manual smoke check**

Open `index.html` in a browser, go to Business Dev CRM → Kanban Pipeline. Confirm no JS errors in console and existing 8 sample cards still render with city/exit line (blank exit line hidden since sample data has no `exit`/`city` yet — fine, that's expected until Task 8).

- [ ] **Step 7: Commit**

```bash
git add index.html && git commit -m "feat(crm): show city/exit on Kanban cards and add Location column to leads table"
```

---

### Task 3: Wire new fields through Supabase load/save

**Files:**
- Modify: `index.html:16549-16567` (`crmLoadFromSupabase`)
- Modify: `index.html:16584-16602` (`crmSaveLeadToSupabase`)

**Interfaces:**
- Consumes: Supabase columns `street`, `city`, `zip`, `exit`, `lanes` added in Task 4.

- [ ] **Step 1: Add fields to the Supabase → app mapping**

Locate:
```js
        state:      r.state||'',
```
Replace with:
```js
        state:      r.state||'',
        street:     r.street||'',
        city:       r.city||'',
        zip:        r.zip||'',
        exit:       r.exit||'',
        lanes:      r.lanes||'',
```

- [ ] **Step 2: Add fields to the app → Supabase mapping**

Locate:
```js
      state:       lead.state||'',
```
Replace with:
```js
      state:       lead.state||'',
      street:      lead.street||'',
      city:        lead.city||'',
      zip:         lead.zip||'',
      exit:        lead.exit||'',
      lanes:       lead.lanes||'',
```

- [ ] **Step 3: Syntax check** (same command as Task 1 Step 4). Expected: `syntax ok, N script blocks`.

- [ ] **Step 4: Commit**

```bash
git add index.html && git commit -m "feat(crm): map street/city/zip/exit/lanes through Supabase sync"
```

---

### Task 4: Supabase migration — add the new columns

**Files:**
- Create: `sql/2026-07-13-crm-leads-location-fields.sql`

- [ ] **Step 1: Write the migration**

```sql
BEGIN;

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS city  text,
  ADD COLUMN IF NOT EXISTS zip   text,
  ADD COLUMN IF NOT EXISTS exit  text,
  ADD COLUMN IF NOT EXISTS lanes text;

COMMIT;

-- Verification (run manually in the Supabase SQL editor after applying):
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'crm_leads'
-- order by ordinal_position;
```

- [ ] **Step 2: Commit**

```bash
git add sql/2026-07-13-crm-leads-location-fields.sql && git commit -m "feat(crm): migration adding location fields to crm_leads"
```

Note: this file must be run manually by the user in the Supabase SQL editor — there is no CLI access in this project (see CLAUDE.md). Flag this to the user after the commit.

---

### Task 5: Build the exclusion list from MEMBERS

**Files:**
- Create: `scratchpad/gen-crm-exclusion-list.js`
- Create: `scratchpad/crm-exclusion-list.json`

**Interfaces:**
- Produces: `scratchpad/crm-exclusion-list.json` — a JSON array of `{company, name, city, state, group}`, consumed by Task 6 (per-region prompt building) and Task 7 (dedupe/filter).

- [ ] **Step 1: Write the generator**

```js
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/const MEMBERS = (\[[\s\S]*?\]);/);
if (!m) throw new Error('MEMBERS array not found in index.html');
const members = JSON.parse(m[1]);
const exclusion = members.map(x => ({
  company: x.company || '',
  name: x.name || '',
  city: x.city || '',
  state: x.state || '',
  group: x.group || '',
}));
fs.writeFileSync('scratchpad/crm-exclusion-list.json', JSON.stringify(exclusion, null, 2));
const byGroup = {};
exclusion.forEach(e => { byGroup[e.group] = (byGroup[e.group] || 0) + 1; });
console.log('total', exclusion.length, 'by group', byGroup);
```

- [ ] **Step 2: Run it**

```bash
cd "/c/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && node scratchpad/gen-crm-exclusion-list.js
```
Expected: `total 369 by group { ... }` (counts across `Roady's`, `Roady's Lite`, `PTP`; exact numbers may drift slightly if `MEMBERS` has changed since 2026-07-13 — that's fine, use whatever the live count is).

- [ ] **Step 3: Commit**

```bash
git add scratchpad/gen-crm-exclusion-list.js scratchpad/crm-exclusion-list.json && git commit -m "chore(crm): generate exclusion list from MEMBERS for prospect research"
```

---

### Task 6: Dispatch the 8 regional research agents

**Files:**
- Create: `scratchpad/crm-research-raw/region-1-northeast.json`
- Create: `scratchpad/crm-research-raw/region-2-midatlantic.json`
- Create: `scratchpad/crm-research-raw/region-3-southeast.json`
- Create: `scratchpad/crm-research-raw/region-4-southgulf.json`
- Create: `scratchpad/crm-research-raw/region-5-midwest-east.json`
- Create: `scratchpad/crm-research-raw/region-6-midwest-west.json`
- Create: `scratchpad/crm-research-raw/region-7-mountain.json`
- Create: `scratchpad/crm-research-raw/region-8-west.json`

**Interfaces:**
- Consumes: `scratchpad/crm-exclusion-list.json` (Task 5).
- Produces: 8 JSON files, each an array of records with keys `company, street, city, state, zip, phone, contact, email, exit, lanes, source_note`, consumed by Task 7.

- [ ] **Step 1: Build the 8 state groups**

These are fixed — every one of the 48 contiguous states appears exactly once:

| Region file | States |
|---|---|
| `region-1-northeast.json` | ME, NH, VT, MA, RI, CT |
| `region-2-midatlantic.json` | NY, NJ, PA, DE, MD, WV |
| `region-3-southeast.json` | VA, NC, SC, GA, FL, AL |
| `region-4-southgulf.json` | MS, TN, KY, AR, LA, OK |
| `region-5-midwest-east.json` | OH, MI, IN, IL, WI, MN |
| `region-6-midwest-west.json` | IA, MO, KS, NE, SD, ND |
| `region-7-mountain.json` | MT, WY, CO, UT, ID, NV |
| `region-8-west.json` | WA, OR, CA, AZ, NM, TX |

- [ ] **Step 2: For each region, filter `scratchpad/crm-exclusion-list.json` down to entries whose `state` is in that region's list**, and build the prompt below with `{STATES}` replaced by the comma-separated state list and `{EXCLUSION_JSON}` replaced by the filtered array (JSON-stringified, compact):

```
You are researching real independent truck stops / travel centers for Roady's Truck Stop Network's Business Development CRM. This is legitimate market research for a real sales pipeline — the records you produce may be used for actual business outreach, so accuracy matters more than volume.

Assigned states: {STATES}

Find as many DISTINCT independent (non-chain) truck stops / travel centers as you can in these states via real web search. "Independent" means NOT one of: Pilot, Flying J, Love's, TA (Travel Centers of America), Petro Stopping Centers. Also exclude any business matching one of these existing Roady's/Roady's Lite/PTP network partners (already in our network — do not re-prospect them):
{EXCLUSION_JSON}

For each qualifying business you find, record:
- company: the business's real legal or trade name
- street, city, state, zip: its physical address
- phone: ONLY if you found it on the business's own website, Google Business listing, or another reliable directory — leave "" if not confidently found
- contact: an owner/manager name ONLY if publicly listed (e.g. on an "About/Contact" page) — leave "" otherwise
- email: ONLY if publicly listed — leave "" otherwise
- exit: highway/exit info if stated anywhere (e.g. "Exit 82 / I-10") — leave "" if not found
- lanes: a short note on what major highway corridor(s) it sits on (e.g. "I-40 E-W corridor") if determinable from its location — leave "" if not determinable
- source_note: one short sentence on where this info came from (e.g. "Name/address/phone from Google Business listing; independently owned per state fuel-tax dealer list")

CRITICAL: never invent or guess a phone number, email, contact name, or address. If you can't confidently source a field, leave it as an empty string — do not fill it with a plausible-looking placeholder.

Do not cap yourself at a fixed number — find as many distinct, real, qualifying locations as you can across these 6 states. If a state turns up thin or empty, that's fine — just don't include a record you couldn't verify to compensate.

Return ONLY a JSON array (no prose, no markdown code fence) where each element has exactly these keys: company, street, city, state, zip, phone, contact, email, exit, lanes, source_note.
```

- [ ] **Step 3: Dispatch all 8 as background agents in a single message** (one `Agent` tool call per region, `subagent_type: "general-purpose"`, `run_in_background: true` — default), each with its filled-in prompt from Step 2.

- [ ] **Step 4: As each agent completes, save its raw final text to the matching file**

For each region, write the agent's returned text verbatim to its file, e.g. `scratchpad/crm-research-raw/region-1-northeast.json`. If an agent wrapped its output in a ```` ```json ```` fence despite instructions, strip the fence before saving (keep only the JSON array text).

- [ ] **Step 5: Validate all 8 files parse and have the right shape**

```bash
cd "/c/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && node -e "
const fs = require('fs');
const files = fs.readdirSync('scratchpad/crm-research-raw').filter(f => f.endsWith('.json'));
if (files.length !== 8) throw new Error('expected 8 region files, found ' + files.length);
let total = 0;
files.forEach(f => {
  const raw = fs.readFileSync('scratchpad/crm-research-raw/' + f, 'utf8');
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) throw new Error(f + ': not an array');
  arr.forEach((r, i) => {
    if (!r.company || !r.city || !r.state) throw new Error(f + ' record ' + i + ': missing company/city/state');
  });
  console.log(f, arr.length, 'records');
  total += arr.length;
});
console.log('total raw records', total);
"
```
Expected: prints a line per file with a record count, no thrown error, and a total.

- [ ] **Step 6: Commit**

```bash
git add scratchpad/crm-research-raw && git commit -m "chore(crm): save raw regional prospect research output"
```

---

### Task 7: Synthesize the final prospect array

**Files:**
- Create: `scratchpad/gen-crm-prospects.js`
- Create: `scratchpad/crm-prospects-final.js`

**Interfaces:**
- Consumes: `scratchpad/crm-research-raw/*.json` (Task 6), `scratchpad/crm-exclusion-list.json` (Task 5).
- Produces: `scratchpad/crm-prospects-final.js` containing `const CRM_RESEARCHED_LEADS = [ ...compact lead-literal strings... ];`, consumed by Task 8.

- [ ] **Step 1: Write the generator**

```js
const fs = require('fs');

const CHAIN_KEYWORDS = ['pilot', 'flying j', "love's", 'loves travel', 'ta travel', 'travelcenters of america', 'petro stopping'];

function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const exclusion = JSON.parse(fs.readFileSync('scratchpad/crm-exclusion-list.json', 'utf8'));
const exclusionKeys = new Set(exclusion.map(e => norm(e.company) + '|' + e.state + '|' + norm(e.city)));
const exclusionNames = new Set(exclusion.map(e => norm(e.company)));

const files = fs.readdirSync('scratchpad/crm-research-raw').filter(f => f.endsWith('.json'));
let raw = [];
files.forEach(f => {
  const arr = JSON.parse(fs.readFileSync('scratchpad/crm-research-raw/' + f, 'utf8'));
  raw = raw.concat(arr);
});

const seen = new Set();
const kept = [];
const stateCounts = {};
raw.forEach(r => {
  const nCompany = norm(r.company);
  const nCity = norm(r.city);
  const key = nCompany + '|' + r.state + '|' + nCity;
  if (seen.has(key)) return;
  if (exclusionKeys.has(key) || exclusionNames.has(nCompany)) return;
  if (CHAIN_KEYWORDS.some(k => nCompany.includes(k))) return;
  seen.add(key);
  kept.push(r);
  stateCounts[r.state] = (stateCounts[r.state] || 0) + 1;
});

const today = '2026-07-13';
const escJs = s => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const lines = kept.map((r, i) => {
  const id = 'CRM-' + String(i + 1).padStart(3, '0');
  const notes = (r.source_note || '') + (r.phone ? '' : ' Phone not confirmed.') + (r.email ? '' : ' Email not confirmed.');
  return "  {id:'" + id + "',company:'" + escJs(r.company) + "',contact:'" + escJs(r.contact) + "',phone:'" + escJs(r.phone) +
    "',email:'" + escJs(r.email) + "',street:'" + escJs(r.street) + "',city:'" + escJs(r.city) + "',state:'" + escJs(r.state) +
    "',zip:'" + escJs(r.zip) + "',exit:'" + escJs(r.exit) + "',lanes:'" + escJs(r.lanes) +
    "',stage:'Prospect',priority:'Medium',owner:'',source:'Market Research',locations:1,estGallons:0,dealValue:0,followUp:''," +
    "notes:'" + escJs(notes.trim()) + "',created:'" + today + "',activity:[{text:'Identified via market research',date:'" + today + "',by:'Research',type:'note'}]}";
});

const out = "const CRM_RESEARCHED_LEADS = [\n" + lines.join(',\n') + "\n];\n";
fs.writeFileSync('scratchpad/crm-prospects-final.js', out);

const allStates = ['AL','AZ','AR','CA','CO','CT','DE','FL','GA','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const thin = allStates.filter(s => (stateCounts[s] || 0) < 1);
console.log('raw', raw.length, 'kept', kept.length, 'excluded', raw.length - kept.length);
console.log('per-state counts', stateCounts);
console.log('states with zero qualifying results:', thin);
```

- [ ] **Step 2: Run it**

```bash
cd "/c/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && node scratchpad/gen-crm-prospects.js
```
Expected: prints raw/kept/excluded counts, a per-state breakdown, and a (hopefully short or empty) list of states with zero results. Report this list to the user verbatim — do not silently drop it.

- [ ] **Step 3: Validate the generated file parses as JS**

```bash
cd "/c/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && node -e "
const fs = require('fs');
const src = fs.readFileSync('scratchpad/crm-prospects-final.js', 'utf8');
new Function(src + '\nreturn CRM_RESEARCHED_LEADS;')();
console.log('parses ok');
"
```
Expected: `parses ok`.

- [ ] **Step 4: Commit**

```bash
git add scratchpad/gen-crm-prospects.js scratchpad/crm-prospects-final.js && git commit -m "chore(crm): synthesize deduped final prospect list"
```

---

### Task 8: Inject the final array into index.html

**Files:**
- Modify: `index.html:12503-12512` (`crmSampleData()`)

**Interfaces:**
- Consumes: `scratchpad/crm-prospects-final.js` (`CRM_RESEARCHED_LEADS`, Task 7).

- [ ] **Step 1: Write the injector**

Use function-replacement (`String.replace` with a function argument), never a raw string replacement — record `notes`/`source_note` text may contain `$` sequences that String.replace would otherwise interpret as replacement patterns.

```js
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const seedSrc = fs.readFileSync('scratchpad/crm-prospects-final.js', 'utf8');
const m = seedSrc.match(/const CRM_RESEARCHED_LEADS = (\[[\s\S]*\]);/);
if (!m) throw new Error('CRM_RESEARCHED_LEADS not found in generated file');
const arrayLiteral = m[1];

const anchor = /function crmSampleData\(\)\{ return \[[\s\S]*?\];\}/;
const matches = html.match(anchor);
if (!matches || matches.length !== 1) throw new Error('expected exactly 1 match for crmSampleData(), found ' + (matches ? matches.length : 0));

const replacement = 'function crmSampleData(){ return ' + arrayLiteral + ';}';
const newHtml = html.replace(anchor, () => replacement);
fs.writeFileSync('index.html', newHtml);
console.log('injected, new file length', newHtml.length);
```

Save this as `scratchpad/inject-crm-prospects.js` and run it:

```bash
cd "/c/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && node scratchpad/inject-crm-prospects.js
```
Expected: `injected, new file length N` with no thrown error.

- [ ] **Step 2: Syntax check** (same command as Task 1 Step 4). Expected: `syntax ok, N script blocks`.

- [ ] **Step 3: Confirm the record count landed**

```bash
cd "/c/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && node -e "
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/function crmSampleData\(\)\{ return (\[[\s\S]*?\]);\}/);
const arr = JSON.parse(m[1].replace(/(\w+):/g, '\"\$1\":').replace(/'/g, '\"'));
console.log('lead count in index.html', arr.length);
"
```
Note: this quick check assumes no embedded single-quotes/colons inside string values collide with the naive quote-swap — if it throws, just eyeball the count instead by counting `{id:'CRM-` occurrences: `grep -o "{id:'CRM-" index.html | wc -l`.

- [ ] **Step 4: Commit**

```bash
git add index.html && git commit -m "feat(crm): replace example leads with researched independent truck stop prospects"
```

---

### Task 9: Manual verification + coverage report

**Files:** none (verification only)

- [ ] **Step 1: Full syntax check** (same command as Task 1 Step 4). Expected: `syntax ok`.

- [ ] **Step 2: Browser smoke test**

Open `index.html` directly from disk in a browser. Navigate to the Business Dev CRM tab:
  - [ ] Kanban Pipeline → Prospect column shows the researched companies, not the old 8 examples (Mountain Fuel Centers, Heartland Travel Plazas, etc. are gone).
  - [ ] Click a card → modal opens, shows street/city/zip/exit/lanes fields populated (or blank where genuinely unconfirmed) alongside company/contact/phone.
  - [ ] Switch to Leads tab → table renders the same records with the new Location column.
  - [ ] Filter/search by company name and by state — both still work.
  - [ ] Add-new-lead flow still works (opens blank form with the new fields present, saves a test lead, then delete it to leave the CRM clean).

- [ ] **Step 3: Spot-check accuracy**

Pick 5 records spread across different regions. For each, verify the `source_note` claim is plausible (e.g. actually search the company name + city to confirm it's a real, independently-operated location, not a chain or an existing Roady's site by another name).

- [ ] **Step 4: Report coverage to the user**

Summarize: total records, per-state breakdown (from Task 7's console output), and the list of any states with zero or thin (1-2) results — call these out explicitly rather than letting them pass silently.

- [ ] **Step 5: Final commit (only if Step 2 turned up fixes)**

If the smoke test required any code fixes, commit them separately with a clear message before considering this plan complete.
