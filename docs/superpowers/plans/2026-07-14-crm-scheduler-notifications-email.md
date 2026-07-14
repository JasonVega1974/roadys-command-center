# CRM Scheduler, Notifications & Email Automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the Business Development CRM into a standalone `CRM.html`, add a `Qualified` pipeline stage and an in-modal call scheduler, surface a glowing Notifications card on the dashboard, and (Phase B) automate reminder emails + prospect self-booking via a Supabase Edge Function.

**Architecture:** Static multi-page HTML app on GitHub Pages sharing one Supabase project via the anon key. Phase A is 100% client-side + one migration. Phase B adds a Deno Edge Function (Resend), `pg_cron`, SECURITY DEFINER RPCs, and a token-gated public booking page mirroring `truck-stop-optin.html`.

**Tech Stack:** Vanilla HTML/CSS/JS, Supabase JS SDK (anon key) + Postgres/RLS, Supabase Edge Functions (Deno/TypeScript), Resend, `pg_cron` + `pg_net`.

**Companion spec:** `docs/superpowers/specs/2026-07-14-crm-scheduler-notifications-email-design.md` (contains full verbatim SQL/edge-function artifacts in Appendices A–D; tasks below reference them by appendix).

## Global Constraints

- **New-table checklist (CLAUDE.md):** every new table MUST, in the same migration, `ENABLE ROW LEVEL SECURITY` + explicit `CREATE POLICY` rows + `GRANT SELECT,INSERT,UPDATE,DELETE ... TO anon, authenticated`. Exception: `crm_booking_offers` is deliberately RLS-on + **zero policies + no grants** (server-only).
- **SECURITY DEFINER functions MUST pin** `set search_path = public, pg_temp`.
- **SQL files:** `sql/YYYY-MM-DD-<slug>.sql`, wrapped in `begin; … commit;`, with a commented verification query at the bottom.
- **Pipeline is data-driven:** all stage UI derives from `CRM_STAGES` / `CRM_STAGE_COLORS` — never hardcode stage lists elsewhere.
- **Lead field names (camelCase in JS):** `id, company, contact, phone, email, state, street, city, zip, exit, lanes, stage, priority, owner, source, locations, estGallons, dealValue, followUp, notes, created, activity[]`. Supabase columns are snake_case (`est_gallons`, `deal_value`, `follow_up`, `created_at`).
- **Owners:** `CRM_OWNERS = ['Robert Watson','Angel Long']` (+ 'Logan' exists in territory data; scheduler "with who" uses `Unassigned` + `CRM_OWNERS`).
- **Call types (exact strings):** `Initial Call`, `Follow-up Call`, `3rd Call`, `Call Back`.
- **Call statuses:** `scheduled`, `done`, `cancelled`. **Call sources:** `manual`, `prospect`.
- **Public base URL:** `https://jasonvega1974.github.io/roadys-command-center`.
- **Branch:** `feat/crm-scheduler`. Commit frequently; PR into `main` when done.
- **Testing:** no automated harness — each task ends with explicit **browser** and/or **Supabase SQL Editor** verification steps, then a commit.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `sql/2026-07-14-crm-scheduled-calls.sql` | `crm_scheduled_calls` + `crm_owner_emails` tables | A1 |
| `CRM.html` (new) | Standalone CRM: all existing tabs + new scheduler + notifications header | A2–A6 |
| `index.html` (modify) | Remove CRM block; rewire nav/registry/unlock; hash redirect; add dashboard Notifications card | A2, A5 |
| `implementation.html` (modify) | Add hash-redirect guard only | A2 |
| `sql/2026-07-14-crm-booking.sql` (new) | `crm_booking_offers` + 3 RPCs | B1 |
| `supabase/functions/crm-emails/index.ts` (new) | Reminder + availability + confirmation email actions | B2 |
| `sql/2026-07-14-crm-cron.sql` (new) | `pg_cron` reminder jobs | B3 |
| `call-booking.html` (new) | Public token-gated "pick a time" page | B4 |
| `docs/crm-email-setup.md` (new) | Ordered deployment/setup runbook | B6 |

---

# PHASE A — client-side (ships without external infra)

### Task A1: Migration — `crm_scheduled_calls` + `crm_owner_emails`

**Files:**
- Create: `sql/2026-07-14-crm-scheduled-calls.sql`

**Interfaces:**
- Produces (DB): table `public.crm_scheduled_calls(id text pk, lead_id, company, owner, call_type, scheduled_at timestamptz, status, note, source, reminder_1h_sent bool, reminder_dod_sent bool, created_at, updated_at)`; table `public.crm_owner_emails(owner text pk, email, timezone, updated_at)`.

- [ ] **Step 1: Create the migration file** with the exact content of the spec **Appendix A**. (Tables, `enable row level security`, the four `crm_sched_*` policies + three `crm_owner_*` policies, grants to `anon, authenticated`, indexes `crm_sched_by_time` / `crm_sched_by_lead`, `touch_updated_at` triggers, and the 3 seed `crm_owner_emails` rows with `REPLACE.me` placeholders.)

- [ ] **Step 2: Precondition check** — confirm `public.touch_updated_at()` exists (CLAUDE.md says it was created 2026-05-27). In the Supabase SQL Editor run:
```sql
select proname, prosecdef from pg_proc where proname = 'touch_updated_at';
```
Expected: one row. If **zero rows**, prepend the search-path-pinned function from the CLAUDE.md template to the migration before the triggers.

- [ ] **Step 3: Run the migration** in the Supabase SQL Editor. Expected: `COMMIT` with no error.

- [ ] **Step 4: Verify** — run:
```sql
select count(*) from public.crm_scheduled_calls;              -- expect 0
select owner, email from public.crm_owner_emails order by owner; -- expect 3 placeholder rows
insert into public.crm_scheduled_calls(id,lead_id,call_type,scheduled_at)
  values('call_test','CRM-001','Initial Call', now()+interval '2 hours');
select id,status,source,reminder_1h_sent from public.crm_scheduled_calls where id='call_test'; -- status=scheduled, source=manual, false
delete from public.crm_scheduled_calls where id='call_test';
```
Expected: insert succeeds via anon defaults; status/source/flags defaulted correctly.

- [ ] **Step 5: Commit**
```bash
git add sql/2026-07-14-crm-scheduled-calls.sql
git commit -m "feat(crm): migration — crm_scheduled_calls + crm_owner_emails tables"
```

---

### Task A2: Extract `CRM.html` + rewire entry points + redirects

This task moves the CRM out of `index.html` into a standalone file and rewires every entry point. Verify the extracted page renders identically before touching anything else.

**Files:**
- Create: `CRM.html`
- Modify: `index.html` (nav line ~857; registry ~9806; post-unlock fallback ~18343; CRM page block ~1198–1300; CRM JS ~12486–13830; sync ~17302–17388; add boot-time hash redirect)
- Modify: `implementation.html` (add hash-redirect guard near boot)

**Interfaces:**
- Produces: `CRM.html` self-contained page reusing `getRoadysSB()`, `ROADYS_SB_URL/ANON`, `toast()`, CSS tokens, PIN gate. Reads `?lead=<id>&call=1` on load. All existing CRM functions (`pgCRM`, `crmTab`, `renderCRMKanban`, `crmOpenLeadModal`, `crmBuildForm`, `crmSaveLead`, `crmExport`, calendar/scheduler/email/analytics renderers) live here unchanged.

- [ ] **Step 1: Scaffold `CRM.html`** — `<!DOCTYPE html>` + `<head>` with the same `<meta>`, the Supabase SDK `<script src>` used by `index.html`, and a `<style>` block containing the CSS `:root` design tokens + the base classes the CRM markup uses (`.crm-panel`, `.ec-tab`, `.ec-tabs`, `.kpi-grid`, `.kc`, `.btn`, `.mem-tbl`, `.toast`, modal overlay styles, etc.). Copy these from `index.html` verbatim.

- [ ] **Step 2: Move the CRM HTML** — cut the `pg-crm` inner markup (the KPI strip, `#crm-tabs`, all six `.crm-panel` divs, and the `#crm-modal` overlay) from `index.html` into `CRM.html`'s `<body>`. Wrap in a top-level container; drop the `.page`/`pg-` toggling wrapper (no SPA nav here).

- [ ] **Step 3: Move the CRM JS** — cut the CRM constants + functions (`index.html` ~12486–13830) and the CRM Supabase sync (`crmLoadFromSupabase`, `crmSaveLeadToSupabase`, `crmDeleteLeadFromSupabase`, ~17302–17388) into a `<script>` at the end of `CRM.html`'s body. Also copy the shared helpers the CRM calls: `getRoadysSB`, `ROADYS_SB_URL`, `ROADYS_SB_ANON`, `roadysSB` init, `toast`, `sbShowSyncing/sbHideSyncing`.

- [ ] **Step 4: Add the PIN gate + boot** to `CRM.html`. Reproduce the lock check (CRM is a locked page). On unlock, call an init that runs `pgCRM()` then `crmLoadFromSupabase()` (inline the body of the old `pgCRMWithSync`). Then append the deep-link handler:
```js
// deep-link: /CRM.html?lead=<id>&call=1
(function crmDeepLink(){
  const p = new URLSearchParams(location.search);
  const id = p.get('lead');
  if(id){ crmOpenLeadModal(id); if(p.get('call')==='1'){ const s=document.getElementById('cmf-sched-section'); if(s) s.scrollIntoView({behavior:'smooth'}); } }
})();
```
(`#cmf-sched-section` is added in Task A4; the guard tolerates its absence until then.)

- [ ] **Step 5: Verify the extracted page in the browser** — open `CRM.html` (through the PIN). Confirm: Kanban renders all columns, Lead Table loads, Calendar/Auto-Scheduler/Email/Analytics tabs switch, Add Lead modal opens and saves, and Supabase load works (no console errors). This must match the old in-`index.html` behavior before proceeding.

- [ ] **Step 6: Remove the CRM from `index.html`** — delete the now-moved `pg-crm` markup, the CRM JS block, and the CRM sync functions from `index.html`. Delete the `else if(id==='crm') pgCRMWithSync();` route (~3194/3205).

- [ ] **Step 7: Rewire `index.html` entry points:**
  - Nav item (~857): `<div class="ni" data-nav-id="crm" onclick="location.href='CRM.html'"><span class="ni-icon">📞</span>Business Development CRM</div>`
  - Registry entry (~9806) `{id:'crm',…}`: change its handler to `location.href='CRM.html'` when selected (follow how the registry dispatches; if it calls `nav(id)`, special-case `crm`).
  - Post-unlock fallback (~18343): replace `nav('crm', …)` with `location.href='CRM.html'`.

- [ ] **Step 8: Add the boot-time hash redirect** near the top of `index.html`'s first inline script:
```js
if (['#crm','#/crm','#/CRM','#CRM'].includes(location.hash)) location.replace('CRM.html');
```

- [ ] **Step 9: Add the same guard to `implementation.html`** near its boot script (it has a `nav('crm')` unlock fallback at ~8373). Insert:
```js
if (['#crm','#/crm','#/CRM','#CRM'].includes(location.hash)) location.replace('CRM.html');
```

- [ ] **Step 10: Verify wiring in the browser:**
  - From `index.html`, click the CRM nav item → lands on `CRM.html`.
  - Visit `index.html#crm` → auto-redirects to `CRM.html`.
  - Confirm `index.html` still loads with the CRM block removed (no console errors, no empty `pg-crm` reference).

- [ ] **Step 11: Commit**
```bash
git add CRM.html index.html implementation.html
git commit -m "feat(crm): extract CRM into standalone CRM.html; rewire nav + hash redirect"
```

---

### Task A3: Add the `Qualified` stage

**Files:**
- Modify: `CRM.html` (the `CRM_STAGES` and `CRM_STAGE_COLORS` constants)

**Interfaces:**
- Consumes: `CRM_STAGES`, `CRM_STAGE_COLORS`.
- Produces: `Qualified` present in all stage-derived UI (Kanban, modal dropdown, Lead-Table filter, advance logic, analytics).

- [ ] **Step 1: Edit the constants** in `CRM.html`:
```js
const CRM_STAGES = ['Prospect','Qualified','Contacted','Meeting Scheduled',
                    'Proposal Sent','Negotiation','Closed Won','Closed Lost'];
```
and add to `CRM_STAGE_COLORS`:
```js
'Qualified':'#14b8a6',
```
(insert the key between `'Prospect'` and `'Contacted'` for readability).

- [ ] **Step 2: Verify in the browser** — reload `CRM.html`:
  - Kanban shows a **Qualified** column (teal header) between Prospect and Contacted.
  - Open any lead → Stage dropdown lists **Qualified**.
  - Lead Table → Stage filter lists **Qualified**.
  - Analytics → "Pipeline by Stage" chart includes **Qualified**.
  - Select a Prospect lead, click **→ Advance** → it moves to **Qualified** (not Contacted).

- [ ] **Step 3: Commit**
```bash
git add CRM.html
git commit -m "feat(crm): add Qualified pipeline stage between Prospect and Contacted"
```

---

### Task A4: In-modal call scheduler + mini-calendar + scheduled-calls CRUD

**Files:**
- Modify: `CRM.html` (`crmBuildForm`; add scheduler helpers + Supabase call sync)

**Interfaces:**
- Consumes: `CRM_LEADS`, `CRM_OWNERS`, `crmEditId`, `getRoadysSB()`, `toast()`, existing `crmLogActivity`-style activity append.
- Produces (JS): `CRM_CALLS` (array), `crmLoadCallsFromSupabase()`, `crmSaveCallToSupabase(call)`, `crmScheduleCall(leadId)`, `crmRenderLeadCalls(leadId)`, `crmCancelCall(callId)`, `crmMiniCalendar(hostId, onPick)`, and DOM ids `cmf-sched-section`, `cmf-sched-who`, `cmf-sched-type`, `cmf-sched-date`, `cmf-sched-time`, `cmf-sched-note`, `cmf-sched-cal`, `cmf-lead-calls`.
- Produces (DB writes): rows in `crm_scheduled_calls` (id `'call_'+Date.now()`).

- [ ] **Step 1: Add the calls data layer** near the CRM constants in `CRM.html`:
```js
let CRM_CALLS = [];
function crmCallsLoadLocal(){ try{ const s=localStorage.getItem('roadys_crm_calls'); if(s) CRM_CALLS=JSON.parse(s);}catch(e){} }
function crmCallsSaveLocal(){ try{ localStorage.setItem('roadys_crm_calls', JSON.stringify(CRM_CALLS)); }catch(e){} }
async function crmLoadCallsFromSupabase(){
  try{ const sb=getRoadysSB(); const {data,error}=await sb.from('crm_scheduled_calls').select('*').order('scheduled_at',{ascending:true});
    if(error) throw error;
    CRM_CALLS=(data||[]).map(r=>({id:r.id,leadId:r.lead_id,company:r.company,owner:r.owner,callType:r.call_type,scheduledAt:r.scheduled_at,status:r.status,note:r.note,source:r.source}));
    crmCallsSaveLocal();
  }catch(e){ console.warn('calls load',e); }
}
async function crmSaveCallToSupabase(c){
  try{ const sb=getRoadysSB(); const row={id:c.id,lead_id:c.leadId,company:c.company,owner:c.owner,call_type:c.callType,scheduled_at:c.scheduledAt,status:c.status,note:c.note,source:c.source};
    const {error}=await sb.from('crm_scheduled_calls').upsert(row,{onConflict:'id'}); if(error) throw error;
  }catch(e){ console.warn('call save',e); toast('Call saved locally (cloud sync failed)','terr'); }
}
```

- [ ] **Step 2: Add the mini-calendar renderer** (self-contained month grid; no dependency on the Calendar tab):
```js
function crmMiniCalendar(hostId, onPick){
  const host=document.getElementById(hostId); if(!host) return;
  let y=new Date().getFullYear(), m=new Date().getMonth(), sel=null;
  function draw(){
    const first=new Date(y,m,1), start=first.getDay(), days=new Date(y,m+1,0).getDate();
    const today=new Date(); today.setHours(0,0,0,0);
    let h=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <button type="button" class="btn" data-nav="-1">‹</button>
      <b style="font-size:.85em">${first.toLocaleString('en-US',{month:'long'})} ${y}</b>
      <button type="button" class="btn" data-nav="1">›</button></div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;font-size:.72em;text-align:center">`;
    ['S','M','T','W','T','F','S'].forEach(d=>h+=`<div style="color:var(--muted)">${d}</div>`);
    for(let i=0;i<start;i++) h+='<div></div>';
    for(let d=1;d<=days;d++){ const dt=new Date(y,m,d); const iso=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const past=dt<today; const isSel=sel===iso;
      h+=`<div data-day="${iso}" style="padding:5px 0;border-radius:5px;cursor:${past?'not-allowed':'pointer'};
        ${isSel?'background:var(--accent);color:#fff;':past?'color:var(--faint);':'background:var(--surface-2,#1c2431);'}">${d}</div>`; }
    h+='</div>'; host.innerHTML=h;
    host.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{ m+=+b.dataset.nav; if(m<0){m=11;y--;} if(m>11){m=0;y++;} draw(); });
    host.querySelectorAll('[data-day]').forEach(c=>c.onclick=()=>{ const iso=c.dataset.day; if(new Date(iso)<today) return; sel=iso; draw(); onPick(iso); });
  }
  draw();
}
```

- [ ] **Step 3: Inject the scheduler section into `crmBuildForm`.** After the existing fields (before the activity logger), append this to the form HTML string. Gate: show when the lead's stage index ≥ 1 (Qualified+) **or** stage is Prospect with a phone on file:
```js
const _si = CRM_STAGES.indexOf(l.stage||defaultStage);
const _showSched = _si>=1 || ((l.stage||defaultStage)==='Prospect' && (l.phone||'').trim());
const _sched = !_showSched ? '' : `
<div id="cmf-sched-section" style="grid-column:1/-1;border-top:1px solid var(--border);margin-top:12px;padding-top:12px">
  <div style="font-weight:800;font-size:.85em;color:var(--accent);margin-bottom:10px">📞 Schedule a Call</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
    <label>With who<select id="cmf-sched-who">${['Unassigned',...CRM_OWNERS].map(o=>`<option ${o===(l.owner||'Unassigned')?'selected':''}>${o}</option>`).join('')}</select></label>
    <label>Call type<select id="cmf-sched-type">${['Initial Call','Follow-up Call','3rd Call','Call Back'].map(t=>`<option>${t}</option>`).join('')}</select></label>
    <div><label>Date</label><div id="cmf-sched-cal" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px"></div><input type="hidden" id="cmf-sched-date"></div>
    <div><label>Time<select id="cmf-sched-time">${crmTimeOptions()}</select></label>
      <label style="margin-top:8px;display:block">Note<input id="cmf-sched-note" placeholder="optional"></label>
      <button type="button" class="btn btn-accent" style="margin-top:8px" onclick="crmScheduleCall('${l.id||''}')">Schedule Call</button></div>
  </div>
  <div id="cmf-lead-calls" style="margin-top:12px"></div>
</div>`;
```
Insert `_sched` into the returned form markup, and add the time-options helper:
```js
function crmTimeOptions(){ let o=''; for(let h=7;h<=19;h++) for(const mm of ['00','15','30','45']){ const hh=String(h).padStart(2,'0'); const d=new Date(2000,0,1,h,+mm); o+=`<option value="${hh}:${mm}">${d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</option>`; } return o; }
```

- [ ] **Step 4: After the modal renders, mount the mini-calendar and existing calls.** In `crmOpenLeadModal` (after `crmBuildForm` fills the body), add:
```js
if(document.getElementById('cmf-sched-cal')){ crmMiniCalendar('cmf-sched-cal', iso=>{ document.getElementById('cmf-sched-date').value=iso; }); crmRenderLeadCalls(id); }
```

- [ ] **Step 5: Implement schedule / render / cancel:**
```js
function crmScheduleCall(leadId){
  const date=document.getElementById('cmf-sched-date').value;
  const time=document.getElementById('cmf-sched-time').value;
  if(!date){ toast('Pick a date','terr'); return; }
  const lead=CRM_LEADS.find(l=>l.id===leadId)||{};
  const c={ id:'call_'+Date.now(), leadId:leadId||lead.id||('CRM-'+Date.now()), company:lead.company||'',
    owner:document.getElementById('cmf-sched-who').value, callType:document.getElementById('cmf-sched-type').value,
    scheduledAt:new Date(`${date}T${time}:00`).toISOString(), status:'scheduled', note:document.getElementById('cmf-sched-note').value||'', source:'manual' };
  CRM_CALLS.push(c); crmCallsSaveLocal(); crmSaveCallToSupabase(c);
  if(lead.activity){ lead.activity.unshift({text:`Scheduled ${c.callType} for ${new Date(c.scheduledAt).toLocaleString()}`,date:new Date().toISOString().slice(0,10),by:c.owner,type:'call'}); crmSave&&crmSave(); }
  toast('Call scheduled','tok'); crmRenderLeadCalls(leadId);
  if(typeof renderCRMCalendar==='function') renderCRMCalendar();
}
function crmRenderLeadCalls(leadId){
  const host=document.getElementById('cmf-lead-calls'); if(!host) return;
  const list=CRM_CALLS.filter(c=>c.leadId===leadId && c.status!=='cancelled').sort((a,b)=>a.scheduledAt<b.scheduledAt?-1:1);
  host.innerHTML = list.length? '<div style="font-size:.78em;color:var(--muted);margin-bottom:4px">Scheduled calls</div>'+list.map(c=>
    `<div style="display:flex;justify-content:space-between;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:6px 8px;margin-bottom:4px;font-size:.8em">
      <span>${new Date(c.scheduledAt).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})} — ${c.callType} (${c.owner})</span>
      <button type="button" class="btn" onclick="crmCancelCall('${c.id}','${leadId}')">Cancel</button></div>`).join('') : '';
}
function crmCancelCall(callId, leadId){
  const c=CRM_CALLS.find(x=>x.id===callId); if(!c) return; c.status='cancelled';
  crmCallsSaveLocal(); crmSaveCallToSupabase(c); crmRenderLeadCalls(leadId);
  if(typeof renderCRMCalendar==='function') renderCRMCalendar(); toast('Call cancelled','tok');
}
```

- [ ] **Step 6: Load calls on CRM init** — in the `CRM.html` init (after `crmLoadFromSupabase()`), call `crmCallsLoadLocal(); crmLoadCallsFromSupabase();`.

- [ ] **Step 7: Verify in the browser:**
  - Open a **Qualified** lead → the "📞 Schedule a Call" section shows; pick a date on the mini-calendar (past days unclickable), a time, owner, type → **Schedule Call** → toast, the call appears in the list, and an activity entry is logged.
  - Open a **Prospect** lead **with** a phone → scheduler shows. Open a Prospect **without** a phone → scheduler hidden.
  - In Supabase: `select * from crm_scheduled_calls order by created_at desc limit 3;` → your call row present with correct `scheduled_at`, `owner`, `call_type`, `status='scheduled'`, `source='manual'`.
  - **Cancel** a call → row `status='cancelled'`, leaves the list.

- [ ] **Step 8: Commit**
```bash
git add CRM.html
git commit -m "feat(crm): in-modal call scheduler with mini-calendar + crm_scheduled_calls sync"
```

---

### Task A5: Glowing Notifications card (dashboard + CRM header)

**Files:**
- Modify: `index.html` (add `@keyframes` + `.crm-note-*` CSS; add card container to the home dashboard; add `renderCRMNotifications()` + 60s interval; ensure Supabase client available)
- Modify: `CRM.html` (mirror the same card in the CRM header; reuse `CRM_CALLS`)

**Interfaces:**
- Consumes: `getRoadysSB()`; `crm_scheduled_calls`.
- Produces (JS): `renderCRMNotifications(hostId)` bucketing calls into overdue/within-hour (red), later-today (amber), upcoming-7d (neutral); DOM host `#crm-notifications`.

- [ ] **Step 1: Add CSS to `index.html`** (and the same to `CRM.html`):
```css
@keyframes crmPulse { 0%,100%{box-shadow:0 0 0 rgba(0,0,0,0)} 50%{box-shadow:0 0 16px var(--pulse)} }
.crm-note-red   { --pulse:#ef4444aa; border-left:3px solid #ef4444; animation:crmPulse 1.6s ease-in-out infinite; }
.crm-note-amber { --pulse:#f59e0baa; border-left:3px solid #f59e0b; animation:crmPulse 2.2s ease-in-out infinite; }
.crm-note-row   { background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:9px 11px;margin-bottom:7px;display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:.82em }
```

- [ ] **Step 2: Add the card container** to the `index.html` home dashboard (near the top KPI area):
```html
<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px">
  <div style="font-weight:800;font-size:.85em;letter-spacing:.06em;color:var(--accent);margin-bottom:10px">🔔 CALL NOTIFICATIONS</div>
  <div id="crm-notifications"><div style="color:var(--muted);font-size:.82em">Loading…</div></div>
</div>
```

- [ ] **Step 3: Implement `renderCRMNotifications`** in `index.html` (self-contained; queries Supabase directly):
```js
async function renderCRMNotifications(hostId='crm-notifications'){
  const host=document.getElementById(hostId); if(!host) return;
  let calls=[];
  try{ const sb=getRoadysSB(); const {data}=await sb.from('crm_scheduled_calls').select('*').eq('status','scheduled').order('scheduled_at',{ascending:true}); calls=data||[]; }
  catch(e){ host.innerHTML='<div style="color:var(--muted);font-size:.82em">Notifications unavailable.</div>'; return; }
  const now=Date.now(), hour=36e5, endToday=new Date(); endToday.setHours(23,59,59,999);
  const week=now+7*24*hour;
  const rows=calls.filter(c=>new Date(c.scheduled_at).getTime()<=week).map(c=>{
    const t=new Date(c.scheduled_at).getTime();
    let cls=''; if(t<now+hour) cls='crm-note-red'; else if(t<=endToday.getTime()) cls='crm-note-amber';
    const when=new Date(c.scheduled_at).toLocaleString('en-US',{weekday:'short',hour:'numeric',minute:'2-digit'});
    const link=`CRM.html?lead=${encodeURIComponent(c.lead_id)}&call=1`;
    return `<div class="crm-note-row ${cls}"><span><b>${c.company||c.lead_id}</b> — ${c.call_type} · ${when} · ${c.owner||'Unassigned'}</span>
      <a class="btn" href="${link}">Open in CRM →</a></div>`;
  }).join('');
  host.innerHTML = rows || '<div style="color:var(--muted);font-size:.82em">No calls scheduled.</div>';
}
```

- [ ] **Step 4: Call it on dashboard load + interval.** In `index.html`'s home render path (and on `DOMContentLoaded`), add:
```js
renderCRMNotifications(); setInterval(()=>renderCRMNotifications(), 60000);
```

- [ ] **Step 5: Mirror in `CRM.html`** — add a `#crm-notifications` card to the CRM header and a slimmer `renderCRMNotifications` that reuses in-memory `CRM_CALLS` (map `scheduledAt/callType/leadId`), called from the CRM init and after schedule/cancel.

- [ ] **Step 6: Verify in the browser:**
  - Schedule a call for **now + 30 min** → dashboard card row is **red + pulsing**.
  - Schedule one for **later today** (e.g. +5 h) → **amber + pulsing**.
  - Schedule one **3 days out** → neutral row.
  - Click **Open in CRM →** → opens `CRM.html` with that lead's modal + scheduler in view.
  - Cancel a call → it drops off the card within 60 s (or immediately in `CRM.html`).

- [ ] **Step 7: Commit**
```bash
git add index.html CRM.html
git commit -m "feat(crm): glowing call Notifications card on dashboard + CRM header"
```

---

### Task A6: Wire scheduled calls into Calendar + Auto-Scheduler tabs

**Files:**
- Modify: `CRM.html` (`renderCRMCalendar`, `renderCRMScheduler`)

**Interfaces:**
- Consumes: `CRM_CALLS`, existing `renderCRMCalendar` / `renderCRMScheduler`.

- [ ] **Step 1: Overlay calls on the Calendar tab.** In `renderCRMCalendar`, when building each day cell, also render any `CRM_CALLS` with `status==='scheduled'` whose `scheduledAt` falls on that day (label: `time · company · callType`, colored by owner). Keep the existing follow-up/meeting rendering.

- [ ] **Step 2: Feed the Auto-Scheduler "Overdue & Due Today".** In `renderCRMScheduler`, include `CRM_CALLS` where `status==='scheduled'`: `scheduledAt < now` → Overdue bucket; today → Due Today bucket, each with an "Open" button → `crmOpenLeadModal(leadId)`.

- [ ] **Step 3: Verify in the browser:**
  - Calendar tab → a scheduled call shows on its day.
  - Auto-Scheduler tab → a past scheduled call appears under Overdue; a today call under Due Today; "Open" launches the lead modal.

- [ ] **Step 4: Commit**
```bash
git add CRM.html
git commit -m "feat(crm): surface scheduled calls in Calendar + Auto-Scheduler tabs"
```

**► Phase A complete — usable now. Do the Section-6 setup step 1 (Task A1 migration) to enable cloud sync.**

---

# PHASE B — email automation + prospect self-booking (requires external infra)

> Build the code artifacts now (they land in the repo); deployment/setup is the user's runbook (Task B6). Tasks B1–B4 are file-creation with SQL-editor/browser verification where possible.

### Task B1: Migration — `crm_booking_offers` + RPCs

**Files:**
- Create: `sql/2026-07-14-crm-booking.sql`

**Interfaces:**
- Produces (DB): table `public.crm_booking_offers`; functions `resolve_booking_offer(uuid)`, `submit_booking_choice(uuid, timestamptz)`, `list_open_offers()` — all SECURITY DEFINER, search_path-pinned; execute granted to `anon, authenticated`.

- [ ] **Step 1: Create the file** with the exact content of spec **Appendix B** (table with RLS-on + **no** policies/grants; the three functions; the three `grant execute` lines).

- [ ] **Step 2: Run it** in the Supabase SQL Editor. Expected: `COMMIT`, no error.

- [ ] **Step 3: Verify** the RPCs and the deliberate lockout:
```sql
select public.resolve_booking_offer('00000000-0000-0000-0000-000000000000'::uuid); -- {"ok":false,"reason":"not_found"}
-- seed a test offer + booking round-trip:
insert into public.crm_booking_offers(lead_id,company,owner,prospect_email,offered_slots)
  values('CRM-001','Test Co','Robert Watson','p@example.com',
         jsonb_build_array((now()+interval '2 days')::text,(now()+interval '3 days')::text))
  returning token;  -- copy <TOK>
select public.resolve_booking_offer('<TOK>');  -- ok:true with slots
select public.submit_booking_choice('<TOK>', (select (jsonb_array_elements_text(offered_slots))::timestamptz from crm_booking_offers where token='<TOK>' limit 1));
select status,chosen_slot from crm_booking_offers where token='<TOK>';  -- booked
select id,source,call_type from crm_scheduled_calls where lead_id='CRM-001' order by created_at desc limit 1; -- source=prospect
-- cleanup
delete from crm_scheduled_calls where source='prospect' and lead_id='CRM-001';
delete from crm_booking_offers where token='<TOK>';
```
Also confirm anon lockout on the table itself (should error / return nothing under RLS): the RPC path works but direct `select` as anon is blocked.

- [ ] **Step 4: Commit**
```bash
git add sql/2026-07-14-crm-booking.sql
git commit -m "feat(crm): booking offers table + resolve/submit/list RPCs (SECURITY DEFINER)"
```

---

### Task B2: Edge Function `crm-emails`

**Files:**
- Create: `supabase/functions/crm-emails/index.ts`

**Interfaces:**
- Consumes (env/secrets): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto), `RESEND_API_KEY`, `FROM_EMAIL`, `APP_BASE_URL`, `CRON_SECRET`.
- Produces (HTTP): POST actions `reminder_1h`, `reminder_dod` (require `x-cron-secret`), `send_availability`, `send_confirmation`. Reads/writes `crm_scheduled_calls`, `crm_booking_offers`, `crm_owner_emails`, `crm_leads`.

- [ ] **Step 1: Create the file** at `supabase/functions/crm-emails/index.ts` with the exact content of spec **Appendix C**.

- [ ] **Step 2: Static sanity check** — confirm the four `action` branches exist, cron actions check `x-cron-secret`, `send_availability` validates lead existence + `slots.length<=6` + email regex, and `sendEmail` posts to `api.resend.com`. (Deployment/live test is Task B6.)

- [ ] **Step 3: Commit**
```bash
git add supabase/functions/crm-emails/index.ts
git commit -m "feat(crm): crm-emails edge function — reminders + availability + confirmation"
```

---

### Task B3: `pg_cron` schedule SQL

**Files:**
- Create: `sql/2026-07-14-crm-cron.sql`

- [ ] **Step 1: Create the file** with the exact content of spec **Appendix D** (`create extension` for `pg_cron`/`pg_net`; two `cron.schedule` calls with `<PROJECT_REF>` + `<CRON_SECRET>` placeholders; management comments).

- [ ] **Step 2: Verify (documentation-level)** — the file must clearly state that `<PROJECT_REF>` and `<CRON_SECRET>` are replaced before running, and that `0 13 * * *` UTC = 07:00 MDT / 06:00 MST (both CRM owners — Robert Watson, Angel Long — are Mountain time). (Actual scheduling happens in Task B6.)

- [ ] **Step 3: Commit**
```bash
git add sql/2026-07-14-crm-cron.sql
git commit -m "feat(crm): pg_cron schedules for 1h + start-of-day reminders"
```

---

### Task B4: Public booking page `call-booking.html`

**Files:**
- Create: `call-booking.html`

**Interfaces:**
- Consumes: RPCs `resolve_booking_offer`, `submit_booking_choice`; edge action `send_confirmation`. Uses the anon Supabase client (RPC-only; no table access), styled after `truck-stop-optin.html`.

- [ ] **Step 1: Scaffold** the page (copy the visual shell + `--o-*` tokens from `truck-stop-optin.html`). Include the Supabase SDK and create an anon client with `ROADYS_SB_URL` / `ROADYS_SB_ANON`.

- [ ] **Step 2: Read token + resolve:**
```js
const token=new URLSearchParams(location.search).get('token');
async function load(){
  if(!token){ show('Invalid link.'); return; }
  const {data,error}=await sb.rpc('resolve_booking_offer',{p_token:token});
  if(error||!data?.ok){ show(reason(data?.reason)); return; }
  renderSlots(data.company, data.slots);
}
function reason(r){ return r==='booked'?'This time was already booked. Thank you!':r==='expired'?'This scheduling link has expired.':'Sorry, this link is no longer valid.'; }
```

- [ ] **Step 3: Render slots as buttons + submit:**
```js
function renderSlots(company, slots){
  document.getElementById('title').textContent=`Pick a time to talk — ${company||'Roady\\'s'}`;
  document.getElementById('slots').innerHTML=slots.map(s=>{
    const d=new Date(s); return `<button class="slot" data-slot="${s}">${d.toLocaleString('en-US',{weekday:'long',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</button>`;
  }).join('');
  document.querySelectorAll('.slot').forEach(b=>b.onclick=()=>choose(b.dataset.slot));
}
async function choose(slotIso){
  const {data,error}=await sb.rpc('submit_booking_choice',{p_token:token,p_slot:slotIso});
  if(error||!data?.ok){ show(reason(data?.reason)); return; }
  try{ await sb.functions.invoke('crm-emails',{body:{action:'send_confirmation',token}}); }catch(e){}
  show(`You're booked for ${new Date(slotIso).toLocaleString()} — a confirmation email is on its way.`);
}
```

- [ ] **Step 4: Verify (after B1 is applied, before full B6 deploy)** — seed a real offer (from Task B1 Step 3), open `call-booking.html?token=<TOK>` locally/served: slots render; picking one shows the confirmation message; `crm_scheduled_calls` gets a `source=prospect` row; re-opening shows "already booked". (The confirmation email itself needs B6.)

- [ ] **Step 5: Commit**
```bash
git add call-booking.html
git commit -m "feat(crm): public token-gated call-booking page (RPC-only)"
```

---

### Task B5: "Send availability" UI in the CRM modal

**Files:**
- Modify: `CRM.html` (`crmBuildForm` scheduler section; add `crmSendAvailability`)

**Interfaces:**
- Consumes: `getRoadysSB().functions.invoke('crm-emails', {action:'send_availability'})`; lead `id`, `email`; picked slots.
- Produces (JS): `crmSendAvailability(leadId)`, multi-slot selection UI (reuses `crmMiniCalendar` + time picker to collect up to 6 slots), DOM ids `cmf-avail-slots`, `cmf-avail-email`.

- [ ] **Step 1: Add an "Availability" sub-block** inside `#cmf-sched-section` (Qualified+ only): a prospect-email input (defaulting to the lead's `email`), an "Add slot" button that pushes the currently-picked date+time into a chip list (cap 6), and a **"✉️ Send availability"** button → `crmSendAvailability(leadId)`.

- [ ] **Step 2: Implement `crmSendAvailability`:**
```js
async function crmSendAvailability(leadId){
  const lead=CRM_LEADS.find(l=>l.id===leadId)||{};
  const email=(document.getElementById('cmf-avail-email').value||lead.email||'').trim();
  if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)){ toast('Valid prospect email required','terr'); return; }
  if(!window._crmAvailSlots||!window._crmAvailSlots.length){ toast('Add at least one slot','terr'); return; }
  try{ const sb=getRoadysSB();
    const {data,error}=await sb.functions.invoke('crm-emails',{body:{action:'send_availability',lead_id:leadId,prospect_email:email,slots:window._crmAvailSlots}});
    if(error||data?.error) throw error||new Error(data.error);
    toast('Availability email sent','tok'); window._crmAvailSlots=[]; crmRenderAvailSlots();
  }catch(e){ toast('Send failed (is the edge function deployed?)','terr'); console.warn(e); }
}
```
(`window._crmAvailSlots` holds ISO strings; `crmRenderAvailSlots` renders the chip list.)

- [ ] **Step 3: Verify (after B6 deploy)** — on a Qualified lead, add 2 slots, enter a test prospect email, **Send availability** → toast success; prospect inbox gets the link; booking round-trip creates the call. Before deploy, expect the "Send failed" toast (graceful).

- [ ] **Step 4: Commit**
```bash
git add CRM.html
git commit -m "feat(crm): send-availability action wiring in lead modal"
```

---

### Task B6: Deployment runbook

**Files:**
- Create: `docs/crm-email-setup.md`

- [ ] **Step 1: Write the runbook** — reproduce spec Section 6 (setup checklist) as an actionable doc: run `sql/2026-07-14-crm-scheduled-calls.sql`; fill `crm_owner_emails` (including the `timezone='America/Denver'` correction for the Phase-A-seeded rows); create a Resend account **for `roadys.com`** + verify the domain (DNS SPF/DKIM — access confirmed available); run `sql/2026-07-14-crm-booking.sql`; create/deploy the `crm-emails` edge function; set secrets `RESEND_API_KEY`/`FROM_EMAIL` (`crm@roadys.com`)/`APP_BASE_URL`/`CRON_SECRET`; enable `pg_cron`+`pg_net`; run `sql/2026-07-14-crm-cron.sql` with the project ref + secret; run the Section-7 tests. Both **confirm-before-Phase-B** decisions are resolved (spec §7a, 2026-07-14): timezone hardcoded to `America/Denver` (both owners are Mountain time), sending domain is `roadys.com`.

- [ ] **Step 2: Commit**
```bash
git add docs/crm-email-setup.md
git commit -m "docs(crm): email automation deployment runbook"
```

---

## Final: PR

- [ ] Open a PR from `feat/crm-scheduler` into `main` summarizing Phase A (shippable) and Phase B (needs the runbook's setup steps). Note the follow-ups: local-`main` orphan reconciliation and `implementation.html` CRM extraction.

---

## Self-Review

**Spec coverage:**
- §3 A1 extract → **A2** ✓; A2 Qualified → **A3** ✓; A3 scheduler+mini-cal (incl. Prospect+phone) → **A4** ✓; A4 glowing card → **A5** ✓; A5 `crm_scheduled_calls` → **A1** ✓; "use in conjunction" Calendar/Auto-Scheduler → **A6** ✓.
- §4 B1 Resend → **B2/B6** ✓; B2 edge function → **B2** ✓; B3 pg_cron → **B3** ✓; B4 booking table+RPCs → **B1**, `call-booking.html` → **B4**, send-availability loop → **B5** ✓; B5 `crm_owner_emails` → **A1** (seed) + **B6** (fill) ✓.
- §6 setup checklist → **B6** ✓. §7 tests → distributed as per-task verify steps + B6 ✓. §7a open items → **B6** ✓. §8 follow-ups → Final PR note ✓.

**Placeholder scan:** intentional/documented only (`REPLACE.me`, `<PROJECT_REF>`, `<CRON_SECRET>`, `<TOK>`). No "TODO/handle edge cases/write tests for the above". Large verbatim artifacts (SQL/edge fn) are referenced to committed spec appendices, not left blank.

**Type consistency:** call object shape `{id, leadId, company, owner, callType, scheduledAt, status, note, source}` used consistently across A4/A5/A6/B5; DB columns snake_case (`lead_id, call_type, scheduled_at`) consistent in A1/A4/B1/B2. RPC names `resolve_booking_offer`/`submit_booking_choice`/`list_open_offers` and params `p_token`/`p_slot` consistent across B1/B4. Edge actions `reminder_1h`/`reminder_dod`/`send_availability`/`send_confirmation` consistent across B2/B4/B5/spec.
