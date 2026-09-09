# GS Travel Profiles (Phase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each person a travel profile (home airport, preferred hotel, airline + tier, PreCheck/Global Entry, notes) that pre-populates the trip when the master user selects them in `gs-travel-planner.html`.

**Architecture:** One new Postgres table reached with the public anon key. `gs-travel-planner.html` gains its first Supabase call, wrapped so that any cloud failure degrades to a `localStorage` mirror and never blocks route planning. A third `.viewTab` hosts the editor. No cryptography in this phase — the `sec` column is created and left null for Phase 2.

**Tech Stack:** Vanilla HTML/CSS/JS (single self-contained page, no build step), Supabase JS SDK v2 via CDN with the anon key, Postgres + RLS.

**Spec:** `docs/superpowers/specs/2026-09-08-gs-travel-profile-design.md` — read §4 and §7 before starting. This plan implements Phase 1 (§4) only.

## Global Constraints

- **New-table checklist (CLAUDE.md):** the migration MUST, in the same block, `ENABLE ROW LEVEL SECURITY` + explicit `CREATE POLICY` rows + `GRANT SELECT, INSERT, UPDATE, DELETE ... TO anon, authenticated`. Without the GRANT, a permissive policy still returns 403.
- **SECURITY DEFINER functions MUST pin** `set search_path = public, pg_temp`.
- **SQL files:** `sql/YYYY-MM-DD-<slug>.sql`, wrapped in `begin; … commit;`, with a commented verification query at the bottom.
- **No local `.js` files.** No page in this repo loads one; everything stays inside the single HTML file. Third-party CDN scripts are the only external scripts.
- **Fallback discipline:** every Supabase call is wrapped so failure falls back to `localStorage` and logs a warning. **Route planning must never be blocked by a profile failure.**
- **The GS dropdown must never render empty** — it also determines trip ownership, and trips are local. See Task 5.
- **The profile card is screen-only.** It must not appear in the printed packet.
- **No cryptography in Phase 1.** Do not add loyalty-number or KTN fields.
- **Supabase is live and shared.** Test rows MUST use the reserved name `__plan_test__` and MUST be deleted in the same step that creates them.

## Verification setup (used by every browser step)

There is **no JS test framework in this repo** — no `package.json`, no vitest/jest/playwright. Verification is done by serving the page and running assertions in the DevTools console. Establish this once:

```bash
cd "<repo root>"
python -m http.server 8899
# then open http://localhost:8899/gs-travel-planner.html and use the DevTools console
```

Kill the server when done: `taskkill //F //IM python.exe` (Windows) or `pkill -f http.server`.

Each browser step below gives console code and the exact expected output. A step **passes only if the printed output matches**. Paste the code, read the result, don't assume.

---

### Task 1: Migration — `gs_travel_profiles`

**Files:**
- Create: `sql/2026-09-08-gs-travel-profiles.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.gs_travel_profiles` with columns `gs_name text pk, home_airport text, hotel_brand text, hotel_notes text, airline text, airline_tier text, has_precheck boolean, has_globalentry boolean, notes text, sec jsonb, updated_at timestamptz`. Every later task reads and writes these exact column names.

- [ ] **Step 1: Write the migration**

```sql
-- gs_travel_profiles — per-person travel preferences for the GS Travel Planner.
-- Phase 1 of docs/superpowers/specs/2026-09-08-gs-travel-profile-design.md
-- `sec` is created here but stays NULL until Phase 2 (encrypted vault), so that
-- phase needs no migration against a populated table.
begin;

create table if not exists public.gs_travel_profiles (
  gs_name         text primary key,
  home_airport    text,
  hotel_brand     text,
  hotel_notes     text,
  airline         text,
  airline_tier    text,
  has_precheck    boolean default false,
  has_globalentry boolean default false,
  notes           text,
  sec             jsonb,
  updated_at      timestamptz default now()
);

alter table public.gs_travel_profiles enable row level security;

create policy gs_travel_profiles_read
  on public.gs_travel_profiles for select using (true);
create policy gs_travel_profiles_insert
  on public.gs_travel_profiles for insert with check (true);
create policy gs_travel_profiles_update
  on public.gs_travel_profiles for update using (true) with check (true);
-- DELETE is a real requirement: removing a departed person from the roster.
create policy gs_travel_profiles_delete
  on public.gs_travel_profiles for delete using (true);

grant select, insert, update, delete on public.gs_travel_profiles to anon, authenticated;

create or replace function public.touch_gs_travel_profiles_updated_at() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists gs_travel_profiles_touch on public.gs_travel_profiles;
create trigger gs_travel_profiles_touch
  before update on public.gs_travel_profiles
  for each row execute function public.touch_gs_travel_profiles_updated_at();

commit;

-- ── Verification (run these after the migration) ──────────────────────
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='gs_travel_profiles';
--   -- expect rowsecurity = true
--
-- select policyname, cmd from pg_policies
--   where tablename='gs_travel_profiles' order by cmd;
--   -- expect 4 rows: DELETE, INSERT, SELECT, UPDATE
--
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name='gs_travel_profiles' and grantee in ('anon','authenticated')
--   order by grantee, privilege_type;
--   -- expect 8 rows: anon and authenticated each with DELETE/INSERT/SELECT/UPDATE
--
-- select p.proname, p.prosecdef, p.proconfig from pg_proc p
--   join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='touch_gs_travel_profiles_updated_at';
--   -- expect prosecdef = true and proconfig containing search_path=public,pg_temp
```

- [ ] **Step 2: Run the migration** in the Supabase SQL Editor. Expected: `COMMIT`, no error.

- [ ] **Step 3: Run the four verification queries** from the comment block. Expected, in order: `rowsecurity = true`; 4 policy rows; 8 grant rows; one function row with `prosecdef = true` and `proconfig` containing `search_path=public, pg_temp`.

If the grants query returns **zero rows**, the GRANT did not apply — fix it before continuing. This is the specific failure CLAUDE.md warns about, and every later task will fail with 403 without it.

- [ ] **Step 4: Commit**

```bash
git add sql/2026-09-08-gs-travel-profiles.sql
git commit -m "feat(travel-planner): add gs_travel_profiles table with RLS and grants"
```

---

### Task 2: Profile data layer

**Files:**
- Modify: `gs-travel-planner.html` (add a new script block before the closing `</script>` of the main block)

**Interfaces:**
- Consumes: table from Task 1.
- Produces:
  - `tpKey(name) -> string` — case/punctuation-insensitive identity key
  - `tpNorm(name) -> string` — trimmed, whitespace-collapsed display name
  - `tpMirrorKey(name) -> string` — `'gsp2:profile:' + tpKey(name)`
  - `async tpFetchAll() -> Array<profile> | null` (null = cloud unavailable)
  - `async tpSave(profile) -> boolean`
  - `tpReadMirror(name) -> profile | null`
  - `tpWriteMirror(profile) -> void`
  - `TP_FIELDS` — array of the eight editable column names (`gs_name` is the key, not an editable field)

- [ ] **Step 1: Copy the Supabase constants.** Open `gs-command-center.html`, find `ROADYS_SB_URL` and `ROADYS_SB_ANON`, and copy **both lines verbatim** into `gs-travel-planner.html` near the top of the main script. Do not retype the key by hand.

- [ ] **Step 2: Add the data layer**

```js
// ── TRAVEL_PROFILES ──────────────────────────────────────────────
// The planner's first cloud call. Every path here is best-effort: a
// profile failure must never stop someone planning or saving a trip,
// which is why each function returns null/false rather than throwing.
const TP_FIELDS = ['home_airport','hotel_brand','hotel_notes','airline',
                   'airline_tier','has_precheck','has_globalentry','notes'];
const tpNorm     = n => String(n??'').trim().replace(/\s+/g,' ');
const tpKey      = n => tpNorm(n).toLowerCase().replace(/[^a-z0-9]/g,'');
const tpMirrorKey= n => 'gsp2:profile:'+tpKey(n);

let _tpSB=null;
function tpEnsureLib(){
  if(typeof window!=='undefined' && window.supabase) return Promise.resolve(window.supabase);
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    s.onload=()=>window.supabase?resolve(window.supabase):reject(new Error('supabase-js loaded but window.supabase undefined'));
    s.onerror=()=>reject(new Error('supabase-js CDN load failed'));
    document.head.appendChild(s);
  });
}
function tpClient(){
  if(_tpSB) return _tpSB;
  if(typeof window!=='undefined' && window.supabase){
    try{ _tpSB=window.supabase.createClient(ROADYS_SB_URL,ROADYS_SB_ANON); return _tpSB; }
    catch(e){ console.warn('tpClient: '+e.message); return null; }
  }
  return null;
}
async function tpFetchAll(){
  try{
    await tpEnsureLib();
    const sb=tpClient(); if(!sb) return null;
    const {data,error}=await sb.from('gs_travel_profiles').select('*');
    if(error){ console.warn('tpFetchAll: '+error.message); return null; }
    (data||[]).forEach(tpWriteMirror);
    return data||[];
  }catch(e){ console.warn('tpFetchAll: '+e.message); return null; }
}
async function tpSave(profile){
  const row=Object.assign({},profile,{gs_name:tpNorm(profile.gs_name)});
  tpWriteMirror(row);                       // local first, so a cloud failure still persists the edit
  try{
    await tpEnsureLib();
    const sb=tpClient(); if(!sb) return false;
    const {error}=await sb.from('gs_travel_profiles').upsert(row,{onConflict:'gs_name'});
    if(error){ console.warn('tpSave: '+error.message); return false; }
    return true;
  }catch(e){ console.warn('tpSave: '+e.message); return false; }
}
function tpReadMirror(name){
  try{ return JSON.parse(localStorage.getItem(tpMirrorKey(name))||'null'); }catch(e){ return null; }
}
function tpWriteMirror(p){
  if(!p||!p.gs_name) return;
  try{ localStorage.setItem(tpMirrorKey(p.gs_name),JSON.stringify(p)); }catch(e){}
}
// ── /TRAVEL_PROFILES ─────────────────────────────────────────────
```

- [ ] **Step 3: Verify the pure helpers in the browser console**

```js
console.log([
  tpNorm('  Steph   Leslie ')==='Steph Leslie',
  tpKey("Steph  Leslie")===tpKey('steph leslie'),
  tpKey("O'Brien-Smith")==='obriensmith',
  tpMirrorKey('Steph Leslie')==='gsp2:profile:stephleslie'
].join(' '));
```

Expected: `true true true true`

- [ ] **Step 4: Verify a real anon round trip, then clean up**

```js
const t={gs_name:'__plan_test__',home_airport:'BOI',hotel_brand:'Best Western',
         airline:'Delta',airline_tier:'Gold',has_precheck:true,has_globalentry:false,
         hotel_notes:'',notes:'plan task 2'};
console.log('save ok:', await tpSave(t));
const all=await tpFetchAll();
const got=(all||[]).find(r=>r.gs_name==='__plan_test__');
console.log('read back:', got && got.home_airport==='BOI' && got.has_precheck===true);
console.log('mirror written:', !!tpReadMirror('__plan_test__'));
// cleanup — the table is live and shared
await tpClient().from('gs_travel_profiles').delete().eq('gs_name','__plan_test__');
localStorage.removeItem(tpMirrorKey('__plan_test__'));
const after=await tpFetchAll();
console.log('cleaned up:', !(after||[]).some(r=>r.gs_name==='__plan_test__'));
```

Expected: `save ok: true`, `read back: true`, `mirror written: true`, `cleaned up: true`.

If `save ok: false` with a 403, the GRANT from Task 1 is missing.

- [ ] **Step 5: Verify graceful failure.** In DevTools → Network, enable **Offline**, then run:

```js
console.log('offline fetch returns null:', (await tpFetchAll())===null);
console.log('offline save returns false:', (await tpSave({gs_name:'__plan_test__',home_airport:'BOI'}))===false);
console.log('but mirror still saved:', !!tpReadMirror('__plan_test__'));
localStorage.removeItem(tpMirrorKey('__plan_test__'));
```

Expected: `true`, `false` reported as `true`, `true`. Then turn Offline back off.

- [ ] **Step 6: Commit**

```bash
git add gs-travel-planner.html
git commit -m "feat(travel-planner): add travel-profile data layer with localStorage fallback"
```

---

### Task 3: Roster derivation

**Files:**
- Modify: `gs-travel-planner.html` (inside the `TRAVEL_PROFILES` block from Task 2)

**Interfaces:**
- Consumes: `tpNorm`, `tpKey` (Task 2).
- Produces:
  - `tpSeedNames() -> string[]` — names currently hardcoded in `#gsName`
  - `tpLocalTripNames() -> string[]` — names found in `gsp2:trip:` keys
  - `tpBuildRoster(cloudNames) -> string[]` — deduped, sorted union
  - `tpNearMatch(name, roster) -> string | null`

The roster is the union of cloud names (authoritative), the seed names, and names already used in local trips — so the dropdown is never empty even with no cloud and no profiles. See spec §4.4.

- [ ] **Step 1: Add the roster functions**

```js
function tpSeedNames(){
  const sel=document.getElementById('gsName'); if(!sel) return [];
  return [...sel.options].map(o=>o.value||o.text)
    .filter(v=>v && v!=='__other').map(tpNorm);
}
function tpLocalTripNames(){
  const out=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(!k || !k.startsWith('gsp2:trip:')) continue;
    try{ const d=JSON.parse(localStorage.getItem(k)); if(d && d.gs) out.push(tpNorm(d.gs)); }catch(e){}
  }
  return out;
}
function tpBuildRoster(cloudNames){
  const seen=new Map();                    // key -> display name; first writer wins
  const add=n=>{ const v=tpNorm(n); if(!v) return; const k=tpKey(v); if(k && !seen.has(k)) seen.set(k,v); };
  (cloudNames||[]).forEach(add);           // cloud first, so its casing is canonical
  tpSeedNames().forEach(add);
  tpLocalTripNames().forEach(add);
  return [...seen.values()].sort((a,b)=>a.localeCompare(b));
}
function tpNearMatch(name,roster){
  const k=tpKey(name); if(!k) return null;
  return (roster||[]).find(r=>tpKey(r)===k) || null;
}
```

- [ ] **Step 2: Verify in the browser console**

```js
const roster=tpBuildRoster(['Dana Fox','burt newman']);
console.log('cloud casing wins:', roster.includes('burt newman') && !roster.includes('Burt Newman'));
console.log('cloud-only name present:', roster.includes('Dana Fox'));
console.log('no duplicates:', roster.length===new Set(roster.map(tpKey)).size);
console.log('sorted:', JSON.stringify(roster)===JSON.stringify([...roster].sort((a,b)=>a.localeCompare(b))));
console.log('never empty with no cloud:', tpBuildRoster([]).length>0);
console.log('near match:', tpNearMatch('steph   leslie', roster)==='Steph Leslie');
console.log('no false match:', tpNearMatch('Brand New Person', roster)===null);
```

Expected: all seven print `true`.

- [ ] **Step 3: Commit**

```bash
git add gs-travel-planner.html
git commit -m "feat(travel-planner): derive travel-profile roster from cloud, seed and local trips"
```

---

### Task 4: Travel Profiles tab

**Files:**
- Modify: `gs-travel-planner.html` — nav at line ~388, print rule at line ~170, new `#viewProfiles` container after `#viewVisit`, `svSetView()` at line ~3054

**Interfaces:**
- Consumes: `tpFetchAll`, `tpSave`, `tpBuildRoster`, `tpNearMatch`, `tpNorm`, `TP_FIELDS`.
- Produces: `tpRenderTab()`, `tpLoadInto(name)`, `tpSaveFromForm()`, `tpAddPerson()`, and module state `tpRoster` (array) / `tpProfiles` (array).

- [ ] **Step 1: Add the tab button** — in the `.viewTabs` nav beside the existing two:

```html
<button class="viewTab" data-view="profiles">🧳 Travel Profiles</button>
```

- [ ] **Step 2: Hide it from print** — change the print rule (line ~170) from `#viewVisit` to also cover the new container:

```css
header,.wrap,#toast,.modalBG,.viewTabs,#viewVisit,#viewProfiles{display:none!important}
```

- [ ] **Step 3: Add the container** immediately after the `#viewVisit` div closes:

```html
<div id="viewProfiles" class="svWrap" style="display:none">
  <div class="card">
    <h2>Travel Profiles</h2>
    <p class="small">Preferences used when planning a trip for someone. Loyalty
      account numbers are not stored here yet.</p>
    <label class="f">Person</label>
    <select id="tpPerson"></select>
    <button class="hbtn" id="tpAdd" type="button">+ Add person…</button>
    <div class="grid2" style="margin-top:10px">
      <div><label class="f">Home airport (IATA)</label><input id="tp_home_airport" placeholder="BOI" maxlength="4"></div>
      <div><label class="f">Preferred hotel brand</label><input id="tp_hotel_brand" placeholder="Best Western"></div>
      <div><label class="f">Airline</label><input id="tp_airline" placeholder="Delta"></div>
      <div><label class="f">Airline tier</label><input id="tp_airline_tier" placeholder="Gold"></div>
    </div>
    <label class="f">Hotel notes</label><input id="tp_hotel_notes" placeholder="King room, ground floor">
    <label class="f"><input type="checkbox" id="tp_has_precheck"> TSA PreCheck</label>
    <label class="f"><input type="checkbox" id="tp_has_globalentry"> Global Entry</label>
    <label class="f">Notes</label>
    <textarea id="tp_notes" rows="3" placeholder="Anything else that helps when booking"></textarea>
    <button class="hbtn green" id="tpSave" type="button">Save profile</button>
    <span class="small" id="tpStamp"></span>
  </div>
</div>
```

- [ ] **Step 4: Register the view** — in `svSetView()`, wherever `viewVisit` visibility is toggled, add the same handling for `viewProfiles` (shown when `v==='profiles'`, hidden otherwise). Then call `tpRenderTab()` when `v==='profiles'`.

- [ ] **Step 5: Add the tab logic**

```js
let tpRoster=[], tpProfiles=[];
async function tpRenderTab(){
  const cloud=await tpFetchAll();
  tpProfiles = cloud || tpRoster.map(n=>tpReadMirror(n)).filter(Boolean);
  tpRoster   = tpBuildRoster((tpProfiles||[]).map(p=>p.gs_name));
  const sel=document.getElementById('tpPerson'), prev=sel.value;
  sel.innerHTML=tpRoster.map(n=>`<option>${esc(n)}</option>`).join('');
  if(prev && tpRoster.includes(prev)) sel.value=prev;
  tpLoadInto(sel.value);
}
function tpLoadInto(name){
  const p=(tpProfiles||[]).find(x=>tpKey(x.gs_name)===tpKey(name)) || tpReadMirror(name) || {};
  TP_FIELDS.forEach(f=>{
    const el=document.getElementById('tp_'+f); if(!el) return;
    if(el.type==='checkbox') el.checked=!!p[f]; else el.value=p[f]||'';
  });
  document.getElementById('tpStamp').textContent =
    p.updated_at ? 'Last updated '+new Date(p.updated_at).toLocaleString() : 'No profile saved yet';
}
async function tpSaveFromForm(){
  const name=document.getElementById('tpPerson').value;
  if(!name){ toast('Pick a person first'); return; }
  const row={gs_name:name};
  TP_FIELDS.forEach(f=>{
    const el=document.getElementById('tp_'+f); if(!el) return;
    row[f] = el.type==='checkbox' ? el.checked : el.value.trim();
  });
  row.home_airport=(row.home_airport||'').toUpperCase();
  const ok=await tpSave(row);
  toast(ok?`💾 Saved ${name}'s travel profile`
          :`⚠ Saved on this device only — cloud unavailable`);
  await tpRenderTab();
}
function tpAddPerson(){
  const raw=prompt('Full name of the person to add:');
  if(raw===null) return;
  const name=tpNorm(raw);
  if(name.length<2){ toast('Enter a full name'); return; }
  const near=tpNearMatch(name,tpRoster);
  if(near){
    document.getElementById('tpPerson').value=near;
    tpLoadInto(near);
    toast(`${near} is already on the list — opened their profile`);
    return;
  }
  tpRoster=[...tpRoster,name].sort((a,b)=>a.localeCompare(b));
  const sel=document.getElementById('tpPerson');
  sel.innerHTML=tpRoster.map(n=>`<option>${esc(n)}</option>`).join('');
  sel.value=name; tpLoadInto(name);
  toast(`${name} added — fill in their profile and hit Save`);
}
```

- [ ] **Step 6: Wire the controls** — in the same place the other buttons are bound during boot:

```js
document.getElementById('tpSave').onclick   = tpSaveFromForm;
document.getElementById('tpAdd').onclick    = tpAddPerson;
document.getElementById('tpPerson').onchange= e=>tpLoadInto(e.target.value);
```

- [ ] **Step 7: Verify in the browser.** Click **Travel Profiles**. Then:

```js
const sel=document.getElementById('tpPerson');
console.log('roster populated:', sel.options.length>0);
console.log('handlers wired:', typeof tpAddPerson==='function'
  && typeof document.getElementById('tpAdd').onclick==='function'
  && typeof document.getElementById('tpSave').onclick==='function');
console.log('form fields present:', TP_FIELDS.every(f=>!!document.getElementById('tp_'+f)));
```

Expected: `roster populated: true`, `handlers wired: true`, `form fields present: true`

Then by hand: click **+ Add person…**, enter `__plan_test__`, fill Home airport `BOI` and hotel brand `Best Western`, click **Save profile**. Expected: a toast confirming the save, and the stamp changes to "Last updated …".

Reload the page, open the tab, select `__plan_test__`. Expected: `BOI` and `Best Western` are still there (proves the cloud round trip).

- [ ] **Step 8: Verify the duplicate guard.** Click **+ Add person…** and enter `__PLAN_TEST__` (different case). Expected: toast says it is already on the list and opens the existing profile — **no second entry appears** in the dropdown.

- [ ] **Step 9: Clean up the test row**

```js
await tpClient().from('gs_travel_profiles').delete().eq('gs_name','__plan_test__');
localStorage.removeItem(tpMirrorKey('__plan_test__'));
console.log('cleaned:', !((await tpFetchAll())||[]).some(r=>r.gs_name==='__plan_test__'));
```

Expected: `cleaned: true`

- [ ] **Step 10: Commit**

```bash
git add gs-travel-planner.html
git commit -m "feat(travel-planner): add Travel Profiles tab with validated add-person"
```

---

### Task 5: Roster-driven GS dropdown + home-airport prefill

**Files:**
- Modify: `gs-travel-planner.html` — `#gsName` handling (line ~1926), `hydrateUI()` (line ~1886)

**Interfaces:**
- Consumes: `tpBuildRoster`, `tpFetchAll`, `tpReadMirror`, `tpKey` (Tasks 2–3).
- Produces: `tpPopulateGSDropdown()`, `tpApplyProfileToTrip(name)`, `tpAirport(code) -> [iata,label,lat,lng] | undefined`.

**This task carries the offline regression guard.** `#gsName` decides trip ownership and trips are local, so an empty dropdown would break saving a trip offline — behaviour that works today.

- [ ] **Step 1: Add the airport lookup and dropdown population**

```js
const tpAirport = code => AIRPORTS.find(a=>a[0]===String(code||'').toUpperCase());
async function tpPopulateGSDropdown(){
  const sel=document.getElementById('gsName'); if(!sel) return;
  const keep=curGS();
  const cloud=await tpFetchAll();                 // null when unavailable
  const roster=tpBuildRoster((cloud||[]).map(p=>p.gs_name));
  if(!roster.length) return;                      // never blank the control
  sel.innerHTML = roster.map(n=>`<option>${esc(n)}</option>`).join('')
                + '<option value="__other">Other…</option>';
  if(keep && roster.includes(keep)) sel.value=keep;
}
```

Call `tpPopulateGSDropdown()` once during boot, **after** the existing resume-last-trip logic so it cannot interfere with restoring a trip.

- [ ] **Step 2: Add the prefill**

```js
// Fills the start point only when it is empty. If a trip already has an
// origin, offer a chip instead -- silently replacing it would destroy
// planned work.
function tpApplyProfileToTrip(name){
  const p=tpReadMirror(name)||(tpProfiles||[]).find(x=>tpKey(x.gs_name)===tpKey(name));
  const chip=document.getElementById('tpChip');
  if(chip) chip.style.display='none';
  if(!p || !p.home_airport) return;
  const a=tpAirport(p.home_airport); if(!a) return;
  const origin={label:`${a[0]} — ${a[1]}`, lat:a[2], lng:a[3]};
  if(!state.origin){
    state.origin=origin;
    document.getElementById('originIn').value=origin.label;
    document.getElementById('originMeta').textContent=`✓ Pinned at ${a[2].toFixed(4)}, ${a[3].toFixed(4)}`;
    markDirty();
  } else if(chip && state.origin.label!==origin.label){
    chip.textContent=`Use ${name.split(' ')[0]}'s home airport (${a[0]})`;
    chip.style.display='inline-block';
    chip.onclick=()=>{
      state.origin=origin;
      document.getElementById('originIn').value=origin.label;
      document.getElementById('originMeta').textContent=`✓ Pinned at ${a[2].toFixed(4)}, ${a[3].toFixed(4)}`;
      chip.style.display='none'; markDirty();
    };
  }
}
```

Add the chip element next to `#originMeta`:

```html
<button class="hbtn" id="tpChip" type="button" style="display:none"></button>
```

Then extend the existing `#gsName` `onchange` handler (line ~1926) to also call `tpApplyProfileToTrip(curGS())`.

- [ ] **Step 3: Verify prefill into an empty origin**

```js
state.origin=null; document.getElementById('originIn').value='';
tpWriteMirror({gs_name:'__plan_test__',home_airport:'BOI'});
tpApplyProfileToTrip('__plan_test__');
console.log('prefilled:', !!state.origin && state.origin.label.startsWith('BOI'));
console.log('chip hidden:', document.getElementById('tpChip').style.display==='none');
```

Expected: `prefilled: true`, `chip hidden: true`

- [ ] **Step 4: Verify an existing origin is NOT overwritten**

```js
state.origin={label:'SEA — Seattle',lat:47.45,lng:-122.31};
tpApplyProfileToTrip('__plan_test__');
console.log('origin preserved:', state.origin.label==='SEA — Seattle');
console.log('chip offered:', document.getElementById('tpChip').style.display!=='none');
document.getElementById('tpChip').click();
console.log('chip applies on click:', state.origin.label.startsWith('BOI'));
localStorage.removeItem(tpMirrorKey('__plan_test__'));
```

Expected: `origin preserved: true`, `chip offered: true`, `chip applies on click: true`

- [ ] **Step 5: Verify the offline regression guard.** DevTools → Network → **Offline**, then reload the page and run:

```js
await tpPopulateGSDropdown();
const sel=document.getElementById('gsName');
console.log('dropdown not empty offline:', sel.options.length>1);
state.gs=sel.value=sel.options[0].value; state.trip='offline probe';
document.getElementById('tripName').value='offline probe';
saveTrip(true);
console.log('trip still saves offline:', !!localStorage.getItem(tripKey(curGS(),'offline probe')));
localStorage.removeItem(tripKey(curGS(),'offline probe'));
```

Expected: both `true`. Turn Offline off. **If either is false, stop — this is the regression the spec calls out in §4.4.**

- [ ] **Step 6: Commit**

```bash
git add gs-travel-planner.html
git commit -m "feat(travel-planner): roster-driven GS dropdown and home-airport prefill"
```

---

### Task 6: Screen-only profile card

**Files:**
- Modify: `gs-travel-planner.html` — planner sidebar near `#originMeta`

**Interfaces:**
- Consumes: `tpReadMirror`, `tpKey`, `tpAirport`.
- Produces: `tpRenderCard(name)`.

- [ ] **Step 1: Add the card container** in the planner column, and make sure it sits **inside** an element already covered by the print-hide rule (`.wrap`), so it cannot reach the packet:

```html
<div id="tpCard" class="small" style="display:none;margin-top:8px"></div>
```

- [ ] **Step 2: Add the renderer**

```js
function tpRenderCard(name){
  const el=document.getElementById('tpCard'); if(!el) return;
  const p=tpReadMirror(name)||(tpProfiles||[]).find(x=>tpKey(x.gs_name)===tpKey(name));
  if(!p){ el.style.display='none'; el.innerHTML=''; return; }
  const bits=[];
  if(p.home_airport) bits.push(`🛫 <b>${esc(p.home_airport)}</b>`);
  if(p.hotel_brand)  bits.push(`🏨 ${esc(p.hotel_brand)}${p.hotel_notes?' — '+esc(p.hotel_notes):''}`);
  if(p.airline)      bits.push(`✈ ${esc(p.airline)}${p.airline_tier?' ('+esc(p.airline_tier)+')':''}`);
  const clear=[p.has_precheck?'PreCheck':null,p.has_globalentry?'Global Entry':null].filter(Boolean);
  if(clear.length)   bits.push('🪪 '+clear.join(' · '));
  if(p.notes)        bits.push(esc(p.notes));
  if(!bits.length){ el.style.display='none'; el.innerHTML=''; return; }
  el.innerHTML=bits.join('<br>');
  el.style.display='block';
}
```

Call `tpRenderCard(curGS())` from the same `#gsName` handler extended in Task 5.

- [ ] **Step 3: Verify it renders**

```js
tpWriteMirror({gs_name:'__plan_test__',home_airport:'BOI',hotel_brand:'Best Western',
               airline:'Delta',airline_tier:'Gold',has_precheck:true,notes:'Aisle seat'});
tpRenderCard('__plan_test__');
const c=document.getElementById('tpCard');
console.log('card visible:', c.style.display==='block');
console.log('has airport + hotel + precheck:',
  /BOI/.test(c.innerHTML) && /Best Western/.test(c.innerHTML) && /PreCheck/.test(c.innerHTML));
tpRenderCard('nobody-here');
console.log('hidden when no profile:', document.getElementById('tpCard').style.display==='none');
```

Expected: `true`, `true`, `true`

- [ ] **Step 4: Verify it stays out of the printed packet**

`buildPrint()` reads `state.schedule` (`gs-travel-planner.html:1712`) and throws
when it is null, so **build a real route first** — set a start airport, add two
stops, and click **Build My Route**. Only then run:

```js
tpRenderCard('__plan_test__');
const dest=state.sameEnd?state.origin:state.dest;
const ordered=state.route.ordered.map(u=>state.stops.find(s=>s.uid===u)).filter(Boolean);
buildPrint(ordered,dest);
const printed=document.getElementById('printRoot').innerHTML;
console.log('no profile data in packet:',
  !/Best Western/.test(printed) && !/PreCheck/.test(printed) && !/Aisle seat/.test(printed));
localStorage.removeItem(tpMirrorKey('__plan_test__'));
```

Expected: `no profile data in packet: true`

`buildPrint()` writes into `#printRoot` (`gs-travel-planner.html:1750`), which the print CSS reveals at line 171. The card lives inside `.wrap`, which the same rule hides, so it cannot reach the packet.

Also confirm visually: **File → Print preview** shows no travel-profile block.

- [ ] **Step 5: Commit**

```bash
git add gs-travel-planner.html
git commit -m "feat(travel-planner): screen-only travel profile card in the planner"
```

---

### Task 7: Hotel-brand bias

**Files:**
- Modify: `gs-travel-planner.html` — `findHotels()`, the `el.innerHTML=hs.map(...)` line

**Interfaces:**
- Consumes: `tpReadMirror`, `tpKey`.
- Produces: `tpPreferredBrand() -> string`.

`findHotels()` already flags Best Western with `<span class="bw">BW</span>`. This generalises that one hook rather than adding a parallel path.

- [ ] **Step 1: Add the brand lookup**

```js
function tpPreferredBrand(){
  const p=tpReadMirror(curGS()); return (p&&p.hotel_brand)?p.hotel_brand:'';
}
```

- [ ] **Step 2: Replace the hardcoded Best Western test.** In `findHotels()`, change the flag expression from the `best western` regex to:

```js
const brand=tpPreferredBrand();
const brandRe=brand?new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'):/best western/i;
const tag=brand?brand.split(/\s+/)[0].slice(0,3).toUpperCase():'BW';
```

and in the `hs.map(...)` template use `brandRe.test(h.name+h.brand)` where the old regex was, emitting `<span class="bw">${esc(tag)}</span>`.

The regex escape matters: a brand containing `+` or `(` would otherwise throw and break the whole hotel list.

- [ ] **Step 3: Verify the fallback and the override**

```js
localStorage.removeItem(tpMirrorKey(curGS()));
console.log('falls back to BW when no profile:', tpPreferredBrand()==='');
tpWriteMirror({gs_name:curGS(),hotel_brand:'Holiday Inn Express'});
console.log('reads brand:', tpPreferredBrand()==='Holiday Inn Express');
tpWriteMirror({gs_name:curGS(),hotel_brand:'Motel 6 (Budget)'});
let threw=false;
try{ new RegExp(tpPreferredBrand().replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'); }catch(e){ threw=true; }
console.log('regex-unsafe brand does not throw:', !threw);
localStorage.removeItem(tpMirrorKey(curGS()));
```

Expected: `true`, `true`, `true`

- [ ] **Step 4: Verify against a real route.** Build a route with an overnight stop and confirm the hotel list renders and the preferred brand is tagged. Confirm no console errors.

- [ ] **Step 5: Commit**

```bash
git add gs-travel-planner.html
git commit -m "feat(travel-planner): bias hotel suggestions to the selected person's brand"
```

---

## Final verification (after all tasks)

- [ ] Deploy check: the fixes are only live once pushed — `git push origin main`, then confirm the served file changed:

```bash
curl -s "https://jasonvega1974.github.io/roadys-command-center/gs-travel-planner.html?cb=$(date +%s)" | grep -c "TRAVEL_PROFILES"
```

Expected: a non-zero count. GitHub Pages takes ~40s plus a `max-age=600` CDN cache; hard-reload before judging.

- [ ] No `__plan_test__` rows remain:

```js
console.log('table clean:', !((await tpFetchAll())||[]).some(r=>/^__plan_test__$/.test(r.gs_name)));
```

- [ ] **Supabase-only outage** (spec §4.6). Full Offline also blocks OSRM, so route
  building cannot be judged there. Instead, in DevTools → Network → **Block request
  domain**, block only `*.supabase.co`, reload, then build a real route with an
  overnight stop. Expected: the route builds normally, the hotel list renders, and
  the profile card is simply absent — no console error, no blocked interaction.
  Unblock afterwards.

- [ ] Regression sweep — the map still follows stop edits per the CLAUDE.md manual test (add / reorder / remove a stop with no rebuild in between).

---

## Notes for the implementer

- **`gs-travel-planner.html` is ~3,130 lines.** Keep all new JS inside the `// ── TRAVEL_PROFILES ──` sentinels so the block can be reviewed and lifted out as one unit.
- **Do not add loyalty-number or KTN fields.** They are Phase 2 and require the encrypted vault; adding a plaintext field would put identity data in a world-readable table.
- **Three of the nine people are not in this codebase.** They are added through the UI by the master; do not hardcode names.
