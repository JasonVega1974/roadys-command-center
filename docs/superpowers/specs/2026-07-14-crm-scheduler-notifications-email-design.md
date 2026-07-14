# CRM Scheduler, Notifications & Email Automation — Design Spec

**Date:** 2026-07-14
**Branch:** `feat/crm-scheduler` (off `sync-gs`)
**Author:** Jason Vega + Claude
**Status:** Approved design — pending spec review, then implementation plan (`writing-plans`).

---

## 1. Goal

Turn the Business Development CRM into a standalone page (`CRM.html`) with a real
call-scheduling workflow: a new **Qualified** pipeline stage, an in-modal call
**scheduler**, a **glowing Notifications card** on the dashboard, automated
**email reminders**, and a **prospect self-booking** ("pick a time") flow. The
existing Calendar, Auto-Scheduler, and Email Templates tabs are reused, not
replaced.

Delivered in two phases:

- **Phase A — client-side only.** Ships immediately, no external infra. Extract
  `CRM.html`, add Qualified stage, in-modal scheduler + mini-calendar, glowing
  dashboard Notifications card, and the `crm_scheduled_calls` table.
- **Phase B — server-side email.** Resend + a Supabase Edge Function + `pg_cron`
  reminders, plus the token-gated public booking page (`call-booking.html`)
  mirroring the existing `truck-stop-optin.html` security pattern.

---

## 2. Current state (verified)

- Single-page `index.html` (~18,485 lines). "Pages" are toggled `<div>`s; nav via
  JS `onclick="nav('crm')"` (line 857), **not** URL-hash routing.
- CRM constants at **12486–12490**; the entire pipeline (Kanban columns, modal
  stage dropdown, Lead-Table filter, advance logic, analytics chart) derives from
  the single `CRM_STAGES` / `CRM_STAGE_COLORS` constants — one edit updates all.
- Lead modal: `crmOpenLeadModal(id, defaultStage)` (13396) → `crmBuildForm()`
  (13412) → `crmSaveLead()` (13466). Lead fields include
  `id, company, contact, phone, email, state, street, city, zip, exit, lanes,
  stage, priority, owner, source, locations, estGallons, dealValue, followUp,
  notes, created, activity[]`.
- Supabase: `getRoadysSB()` (2730), `crmLoadFromSupabase` (17302),
  `crmSaveLeadToSupabase` (17346), `crmDeleteLeadFromSupabase` (17380). Table
  `crm_leads` (snake_case columns). **No** email/edge-function code anywhere; Email
  Templates are copy-to-clipboard only. **No** `@keyframes` exist yet.
- Existing sub-tabs already present but shallow: Calendar (renders month grid),
  Auto-Scheduler ("smart follow-up rules"), Email Templates (clipboard).
- Hosting: **GitHub Pages** → public base
  `https://jasonvega1974.github.io/roadys-command-center/`. A token-gated public
  page already exists (`truck-stop-optin.html`) using **RPC-only** access
  (`resolve_optin_token`, `submit_optin`; SECURITY DEFINER; no direct table grants).

---

## 3. Phase A — client-side design

### A1. Extract `CRM.html` (single source of truth)

Move the CRM out of `index.html` into a new standalone `CRM.html`:

- **Move:** the `pg-crm` HTML block (1198–1300+), the CRM JS (~12486–13830), the
  `#crm-modal` overlay, and CRM Supabase sync (17302–17388).
- **Reuse (copy the shared prerequisites into `CRM.html`):** the Supabase SDK
  `<script>`, `ROADYS_SB_URL` / `ROADYS_SB_ANON`, `getRoadysSB()`, `toast()`, the
  CSS design tokens (`:root` variables + base classes used by the CRM), and the
  PIN-lock gate (CRM is in `LOCKED_NAV_IDS`).
- **Remove** the CRM block from `index.html` (no duplication / drift).
- **Rewire entry points in `index.html`:**
  - Line **857** nav item → `onclick="location.href='CRM.html'"` (keep icon/label).
  - Line **9806** registry entry `{id:'crm',…}` → open `CRM.html` when selected.
  - Line **18343** post-PIN-unlock fallback `nav('crm', …)` → route to `CRM.html`.
  - Delete/neutralize `pgCRMWithSync` routing (line 3194/3205) now that CRM left.
- **Old-bookmark redirect:** near the top of `index.html`'s boot code, detect a
  legacy hash and forward:
  ```js
  if (['#crm','#/crm','#/CRM','#CRM'].includes(location.hash)) location.replace('CRM.html');
  ```
- **`implementation.html` heads-up:** it also has `pgCRMWithSync()` (1409) and a
  `nav('crm')` unlock fallback (8373). Out of scope to extract, but apply the same
  hash-redirect guard so those paths don't dead-end. Tracked as a follow-up task.
- **Deep-link support in `CRM.html`:** on load, read `?lead=<id>&call=1` and, if
  present, open that lead's modal (and focus the scheduler). Used by the
  Notifications card "Open in CRM →" button.

### A2. Add the `Qualified` stage

Single-point edits to the constants (everything else follows automatically):

```js
const CRM_STAGES = ['Prospect','Qualified','Contacted','Meeting Scheduled',
                    'Proposal Sent','Negotiation','Closed Won','Closed Lost'];
const CRM_STAGE_COLORS = { ...,
  'Qualified':'#14b8a6',   // teal, inserted between Prospect(slate) and Contacted(blue)
  ... };
```

Effect: new Kanban column, modal stage `<option>`, Lead-Table stage filter,
advance-stage step, and analytics bar all include **Qualified** with no other
code changes. Existing leads keep their current stage.

### A3. In-modal call scheduler

`crmBuildForm()` gains a **"📞 Schedule a Call"** section, rendered when:

- the lead's stage is **Qualified or later** (`CRM_STAGES.indexOf(stage) >= 1`), **or**
- the lead is at **Prospect** **and** has a non-empty `phone` (immediate cold-call
  scheduling — the low-effort extra requested; it's just an added OR in the gate).

Fields:

| Field | Control | Values |
|---|---|---|
| With who | `<select>` | `Unassigned` + `CRM_OWNERS` (default = lead's owner) |
| Call type | `<select>` | `Initial Call · Follow-up Call · 3rd Call · Call Back` |
| Date | **mini month-calendar** | reuses the CRM Calendar render style; click a day |
| Time | `<select>` | 15-min steps, business hours (e.g. 07:00–19:00) |
| Note | `<input>` | optional |

**[Schedule Call]** → creates a `crm_scheduled_calls` record (Supabase upsert +
localStorage mirror), logs a lead `activity` entry (`type:'call'`), re-renders.
Scheduled calls for the lead list inside the modal, each with a **Cancel**
(sets `status='cancelled'`) control. These calls also feed the existing
**Calendar** tab (shown on their day) and **Auto-Scheduler** tab (surfaced under
Overdue/Due-today), per the "use in conjunction" requirement.

Client helpers: `crmScheduleCall(leadId)`, `crmRenderLeadCalls(leadId)`,
`crmCancelCall(callId)`, `crmSaveCallToSupabase(call)`,
`crmLoadCallsFromSupabase()`, plus a small `crmMiniCalendar(...)` renderer.

### A4. Glowing Notifications card (dashboard + CRM header)

A new card on the `index.html` home dashboard (and mirrored in `CRM.html`'s
header) that reads `crm_scheduled_calls` and buckets calls:

- **Overdue** or **within the next hour** → **red, pulsing**.
- **Later today** → **yellow, pulsing**.
- **Upcoming (next 7 days)** → static neutral row.

Each row shows **company (site) · call type · local time · owner** and an
**"Open in CRM →"** button → `CRM.html?lead=<id>&call=1`. Empty state: "No calls
scheduled." A new keyframe (none exist today):

```css
@keyframes crmPulse { 0%,100%{box-shadow:0 0 0 rgba(0,0,0,0)} 50%{box-shadow:0 0 16px var(--pulse)} }
.crm-note-red   { --pulse:#ef4444aa; animation:crmPulse 1.6s ease-in-out infinite; }
.crm-note-amber { --pulse:#f59e0baa; animation:crmPulse 2.2s ease-in-out infinite; }
```

Render function `renderCRMNotifications()` runs on dashboard load and on a light
interval (e.g. every 60s) so states escalate as call times approach. In
`index.html` this queries Supabase directly via `getRoadysSB()` (the dashboard
already initializes the client).

### A5. Table `crm_scheduled_calls`

Migration `sql/2026-07-14-crm-scheduled-calls.sql` — follows the CLAUDE.md
new-table checklist (RLS enabled + explicit policies + grants; text PK like the
`gs_*` tables; `updated_at` trigger reusing the search-path-pinned
`touch_updated_at`). Full SQL in **Appendix A**.

Columns: `id (text PK) · lead_id · company · owner · call_type · scheduled_at
(timestamptz) · status (scheduled|done|cancelled) · note · source
(manual|prospect) · reminder_1h_sent bool · reminder_dod_sent bool · created_at ·
updated_at`.

---

## 4. Phase B — email automation + prospect self-booking

> **All of Section 4 requires new external infrastructure. Nothing here runs
> until the Section 6 setup checklist is complete.** Items needing your action
> are marked 🔧.

### B1. Resend (external service) 🔧

- Free Resend account; **verify a sending domain** (add SPF/DKIM DNS records) so
  prospect-facing mail isn't spam-filtered. `onboarding@resend.dev` works for
  testing to your own address only.
- API key stored **only** as an Edge Function secret (`RESEND_API_KEY`).

### B2. Edge Function `crm-emails` (Supabase, Deno) 🔧

One function, deployed via the **Dashboard editor** (no CLI). Uses the
auto-injected `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (server-side, bypasses
RLS safely) plus secrets `RESEND_API_KEY`, `FROM_EMAIL`, `APP_BASE_URL`,
`CRON_SECRET`. Actions (dispatched on `body.action`):

- `reminder_1h` — (cron) calls due within 60 min, `status='scheduled'`,
  `reminder_1h_sent=false` → email the owner → set flag. **Requires** the
  `x-cron-secret` header.
- `reminder_dod` — (cron) per-owner digest of today's calls where
  `reminder_dod_sent=false` → email → set flag. **Requires** `x-cron-secret`.
- `send_availability` — (from `CRM.html`) create a `crm_booking_offers` row +
  email the prospect the booking link.
- `send_confirmation` — (from `call-booking.html` after a successful booking)
  email the prospect a confirmation + notify the owner.

Recipient lookup: `crm_owner_emails` (owner → email, timezone). Subject line for
reminders: **`CRM Call Reminder — <Company>`**; body includes company, phone,
call type, local time, and a link to `CRM.html?lead=<id>&call=1`. Full code in
**Appendix C**.

**Known limitation (flagged):** the project's existing security model uses the
anon key with permissive (`using(true)`) RLS, and `functions.invoke` from the
browser carries only the anon key. `send_availability` / `send_confirmation` are
therefore callable by anyone with the anon key. Guards: validate `lead_id` exists
in `crm_leads`, cap offered slots (≤6), basic email-format check, and offers
expire. This matches the app's current posture; upgrading to Supabase Auth is a
future option, noted but out of scope.

### B3. `pg_cron` schedules 🔧

Enable `pg_cron` + `pg_net` extensions (dashboard). Two jobs (SQL in **Appendix
D**):

- `crm-reminder-1h` — `*/15 * * * *` → POST `reminder_1h`.
- `crm-reminder-dod` — `0 13 * * *` (UTC) → POST `reminder_dod`.

**DST caveat (documented):** `pg_cron` runs in UTC; both CRM owners (Robert
Watson, Angel Long) are Mountain time. `13:00 UTC` = **07:00 MDT** (summer) /
**06:00 MST** (winter). The `reminder_dod` action itself computes "today" from
the *edge function's* `tzDayBoundsUTC("America/Denver")` — correct regardless
of when the cron actually fires — so the only DST exposure is the digest
landing an hour earlier in winter, not a wrong day. Acceptable for a morning
digest; the `reminder_dod_sent` flag makes re-runs idempotent. If exact 07:00
year-round is needed later, add a second guarded job.

### B4. Prospect self-booking

- Table **`crm_booking_offers`** — **server-only** (no anon/authenticated table
  grants; touched only by the service-role edge function and the SECURITY DEFINER
  RPCs), mirroring `truck-stop-optin.html`. Columns: `token (uuid PK) · lead_id ·
  company · owner · prospect_email · offered_slots (jsonb: ISO strings) · status
  (open|booked|expired) · chosen_slot · created_at · expires_at (default +14d)`.
- **RPCs** (SECURITY DEFINER, `search_path` pinned; SQL in **Appendix B**):
  - `resolve_booking_offer(p_token uuid)` → `{ok, company, owner, slots}` (only if
    `open` and unexpired; auto-expires stale offers).
  - `submit_booking_choice(p_token uuid, p_slot timestamptz)` → validates the slot
    is one of the offered ones, marks the offer `booked`, inserts a
    `crm_scheduled_calls` row (`source='prospect'`, `call_type='Initial Call'`),
    returns booking details.
  - `list_open_offers()` → safe columns for the CRM to show "awaiting response"
    (granted to anon/authenticated; app is PIN-gated).
- Public page **`call-booking.html`** — reads `?token=`, calls
  `resolve_booking_offer`, renders offered slots as buttons; on click calls
  `submit_booking_choice`, then `functions.invoke('crm-emails',
  {action:'send_confirmation', token})`. Styled after `truck-stop-optin.html`.
- **Loop in `CRM.html`:** Qualified lead modal → **"✉️ Send availability"** → pick
  3–5 slots on the mini-calendar → `functions.invoke('crm-emails',
  {action:'send_availability', lead_id, prospect_email, slots})` → prospect books →
  confirmation emails → booked call appears in `crm_scheduled_calls` → shows on the
  glowing Notifications card. Tokens are unguessable UUIDs, single-use, expiring.

### B5. Owner email map — table `crm_owner_emails` 🔧

`owner (text PK) · email · timezone (default America/Denver) · updated_at`.
RLS + grants per checklist. Seed rows for `Robert Watson`, `Angel Long`, `Logan`
with placeholder emails **you fill in**. SQL in **Appendix A**.

---

## 5. Data flow summary

```
Manual:   CRM modal → crm_scheduled_calls → dashboard card + Calendar/Auto-Scheduler tabs
Reminder: pg_cron → crm-emails(reminder_1h|reminder_dod) → Resend → owner inbox
Prospect: CRM "Send availability" → crm-emails(send_availability) → crm_booking_offers → prospect email
          prospect → call-booking.html?token → resolve_booking_offer / submit_booking_choice
                   → crm_scheduled_calls(source=prospect) → crm-emails(send_confirmation) → prospect + owner
```

---

## 6. Setup checklist (do in this order) 🔧

Phase A needs **only step 1**. Steps 2–8 are Phase B.

1. **Run `sql/2026-07-14-crm-scheduled-calls.sql`** (Appendix A: `crm_scheduled_calls`
   + `crm_owner_emails` tables, RLS, grants, trigger) in the Supabase SQL Editor.
   → *Phase A is now fully functional.*
2. **Fill `crm_owner_emails`** with real addresses (Robert Watson, Angel Long,
   Logan). One `update` per owner. The seed rows from Phase A default
   `timezone` to `'America/Chicago'` (fixed to `'America/Denver'` in this
   spec's Appendix A, but that migration already ran) — also run
   `update crm_owner_emails set timezone='America/Denver';` so the stored
   value is correct even though the edge function currently displays times
   using a hardcoded `TZ` constant rather than this column.
3. **Create a Resend account for `roadys.com`**, verify the domain (add the
   SPF/DKIM DNS records Resend shows — DNS access confirmed available), and
   copy the **API key**.
4. **Run `sql/2026-07-14-crm-booking.sql`** (Appendix B: `crm_booking_offers`
   table + the three RPCs).
5. **Create Edge Function `crm-emails`** in the Dashboard → Edge Functions, paste
   Appendix C, **Deploy**.
6. **Set function secrets**: `RESEND_API_KEY`, `FROM_EMAIL` (e.g.
   `crm@roadys.com`), `APP_BASE_URL`
   (`https://jasonvega1974.github.io/roadys-command-center`), `CRON_SECRET`
   (any long random string).
7. **Enable `pg_cron` + `pg_net`** extensions, then run
   `sql/2026-07-14-crm-cron.sql` (Appendix D) with your project ref + `CRON_SECRET`
   filled in.
8. **Test** (Section 7).

---

## 7. Testing plan

- **A2:** load `CRM.html`; confirm Qualified appears in Kanban, modal dropdown,
  Lead-Table filter, analytics; advance a Prospect → Qualified.
- **A3:** schedule a call on a Qualified lead and on a Prospect-with-phone;
  confirm row in `crm_scheduled_calls`, activity logged, appears on Calendar tab.
- **A4:** set a call time to now+30 min → dashboard card pulses red; +5 h today →
  amber; cancel → row leaves the card.
- **A1:** click dashboard CRM tab → lands on `CRM.html`; visit
  `index.html#crm` → redirects; `CRM.html?lead=<id>&call=1` opens that modal.
- **B2/B3:** insert a call at now+45 min, manually POST `reminder_1h` with the
  cron header → owner receives "CRM Call Reminder — …"; verify `reminder_1h_sent`
  flips and a second call doesn't re-send.
- **B4:** send availability → prospect email arrives with a working
  `call-booking.html?token=…` link → pick a slot → `crm_scheduled_calls` row
  created (`source=prospect`), offer `booked`, confirmation email to prospect +
  owner; re-opening the link shows "already booked"; expired/av tampered slot
  rejected.

---

## 7a. Decisions & open items

- **Accepted:** anon-key security posture for `send_availability`/`send_confirmation`
  (guards only; Supabase Auth is future hardening). Confirmed 2026-07-14.
- **Resolved — timezone:** the only two CRM owners (Robert Watson, Angel Long)
  are both Mountain time, so display TZ is hardcoded `America/Denver` (a single
  constant `TZ` in the edge function; see Appendix C) rather than per-owner
  formatting. `crm_owner_emails.timezone` stays in the schema as a documented,
  currently-inert column for future multi-timezone support. Confirmed
  2026-07-14. **Fixed alongside this:** the `reminder_dod` day-boundary
  calculation in Appendix C originally computed "today" from the edge
  function runtime's local time (UTC in Deno, not the owners' timezone) — a
  latent bug caught while resolving this decision. Replaced with
  `tzDayBoundsUTC(TZ)`, which derives the correct UTC day-window from `TZ`'s
  actual current offset (handles the MST/MDT transition correctly).
- **Resolved — sending domain:** `roadys.com`, with DNS access confirmed
  available. `FROM_EMAIL` defaults to `crm@roadys.com` (checklist step 6).
  Confirmed 2026-07-14.

## 8. Out of scope / follow-ups

- Reconciling the 5 orphan commits on local `main` (GS-header `7aa0baa` vs remote
  `e7546d5`, optin BO work) — tracked separately per your decision.
- Extracting the CRM references embedded in `implementation.html` (only the
  hash-redirect guard is added now).
- Supabase Auth (replacing anon-key posture) — future hardening.
- Two-way calendar sync (Google/Outlook) — not requested.

---

## Appendix A — `sql/2026-07-14-crm-scheduled-calls.sql`

```sql
begin;

-- ── crm_scheduled_calls ──────────────────────────────────────────────
create table if not exists public.crm_scheduled_calls (
  id                text primary key,
  lead_id           text not null,
  company           text,
  owner             text,
  call_type         text not null,
  scheduled_at      timestamptz not null,
  status            text not null default 'scheduled',
  note              text,
  source            text not null default 'manual',
  reminder_1h_sent  boolean not null default false,
  reminder_dod_sent boolean not null default false,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table public.crm_scheduled_calls enable row level security;

create policy crm_sched_read   on public.crm_scheduled_calls for select using (true);
create policy crm_sched_insert on public.crm_scheduled_calls for insert with check (true);
create policy crm_sched_update on public.crm_scheduled_calls for update using (true) with check (true);
create policy crm_sched_delete on public.crm_scheduled_calls for delete using (true);

grant select, insert, update, delete on public.crm_scheduled_calls to anon, authenticated;

create index if not exists crm_sched_by_time  on public.crm_scheduled_calls (scheduled_at);
create index if not exists crm_sched_by_lead  on public.crm_scheduled_calls (lead_id);

-- reuse the existing search-path-pinned trigger fn touch_updated_at()
create trigger crm_sched_touch before update on public.crm_scheduled_calls
  for each row execute function public.touch_updated_at();

-- Realtime so the dashboard card updates live (optional but recommended):
-- alter publication supabase_realtime add table public.crm_scheduled_calls;

-- ── crm_owner_emails ─────────────────────────────────────────────────
create table if not exists public.crm_owner_emails (
  owner      text primary key,
  email      text not null,
  timezone   text not null default 'America/Denver', -- both current owners are Mountain time
  updated_at timestamptz default now()
);

alter table public.crm_owner_emails enable row level security;

create policy crm_owner_read   on public.crm_owner_emails for select using (true);
create policy crm_owner_insert on public.crm_owner_emails for insert with check (true);
create policy crm_owner_update on public.crm_owner_emails for update using (true) with check (true);

grant select, insert, update, delete on public.crm_owner_emails to anon, authenticated;

create trigger crm_owner_touch before update on public.crm_owner_emails
  for each row execute function public.touch_updated_at();

-- Seed owners — REPLACE the placeholder emails before Phase B:
insert into public.crm_owner_emails (owner, email) values
  ('Robert Watson','robert@REPLACE.me'),
  ('Angel Long','angel@REPLACE.me'),
  ('Logan','logan@REPLACE.me')
on conflict (owner) do nothing;

commit;

-- Verify:
-- select * from public.crm_owner_emails;
-- select id,company,call_type,scheduled_at,status from public.crm_scheduled_calls order by scheduled_at desc limit 5;
```

> Note: if `touch_updated_at()` does not yet exist in this project, create it
> (search-path pinned) per the CLAUDE.md template before the triggers.

---

## Appendix B — `sql/2026-07-14-crm-booking.sql`

```sql
begin;

create table if not exists public.crm_booking_offers (
  token          uuid primary key default gen_random_uuid(),
  lead_id        text not null,
  company        text,
  owner          text,
  prospect_email text,
  offered_slots  jsonb not null,          -- array of ISO 8601 timestamptz strings
  status         text not null default 'open',   -- open | booked | expired
  chosen_slot    timestamptz,
  created_at     timestamptz default now(),
  expires_at     timestamptz not null default (now() + interval '14 days')
);

alter table public.crm_booking_offers enable row level security;
-- NO anon/authenticated grants: this table is reached only via the
-- service-role edge function and the SECURITY DEFINER RPCs below.
-- (RLS on + zero policies = locked to definer/service paths.)

-- resolve: public page fetches offer details by token
create or replace function public.resolve_booking_offer(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare rec public.crm_booking_offers;
begin
  select * into rec from public.crm_booking_offers where token = p_token;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if rec.expires_at < now() and rec.status = 'open' then
    update public.crm_booking_offers set status='expired' where token = p_token;
    return jsonb_build_object('ok',false,'reason','expired');
  end if;
  if rec.status <> 'open' then
    return jsonb_build_object('ok',false,'reason',rec.status);
  end if;
  return jsonb_build_object('ok',true,'company',rec.company,'owner',rec.owner,'slots',rec.offered_slots);
end $$;

-- submit: prospect picks a slot; creates the scheduled call
create or replace function public.submit_booking_choice(p_token uuid, p_slot timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare rec public.crm_booking_offers; v_call_id text;
begin
  select * into rec from public.crm_booking_offers where token = p_token for update;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if rec.expires_at < now() and rec.status = 'open' then
    update public.crm_booking_offers set status='expired' where token = p_token;
    return jsonb_build_object('ok',false,'reason','expired');
  end if;
  if rec.status <> 'open' then
    return jsonb_build_object('ok',false,'reason',rec.status);
  end if;
  if not exists (
    select 1 from jsonb_array_elements_text(rec.offered_slots) s
    where s::timestamptz = p_slot
  ) then
    return jsonb_build_object('ok',false,'reason','bad_slot');
  end if;

  v_call_id := 'call_' || (extract(epoch from clock_timestamp())*1000)::bigint;
  insert into public.crm_scheduled_calls
    (id, lead_id, company, owner, call_type, scheduled_at, status, source, note)
  values
    (v_call_id, rec.lead_id, rec.company, rec.owner, 'Initial Call', p_slot,
     'scheduled', 'prospect', 'Booked by prospect via availability link');

  update public.crm_booking_offers
     set status='booked', chosen_slot=p_slot where token = p_token;

  return jsonb_build_object('ok',true,'call_id',v_call_id,'scheduled_at',p_slot,
                            'company',rec.company,'owner',rec.owner,
                            'prospect_email',rec.prospect_email);
end $$;

-- list open offers for the CRM "awaiting response" badge (safe columns only)
create or replace function public.list_open_offers()
returns table(token uuid, lead_id text, company text, owner text,
              offered_slots jsonb, status text, created_at timestamptz)
language sql security definer set search_path = public, pg_temp as $$
  select token, lead_id, company, owner, offered_slots, status, created_at
  from public.crm_booking_offers
  where status = 'open' and expires_at > now()
  order by created_at desc;
$$;

grant execute on function public.resolve_booking_offer(uuid)            to anon, authenticated;
grant execute on function public.submit_booking_choice(uuid, timestamptz) to anon, authenticated;
grant execute on function public.list_open_offers()                     to anon, authenticated;

commit;

-- Verify:
-- select public.resolve_booking_offer('00000000-0000-0000-0000-000000000000'::uuid);
```

---

## Appendix C — Edge Function `crm-emails` (`supabase/functions/crm-emails/index.ts`)

```ts
// Supabase Edge Function: crm-emails
// Actions: reminder_1h | reminder_dod | send_availability | send_confirmation
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL   = Deno.env.get("SUPABASE_URL")!;
const SB_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND   = Deno.env.get("RESEND_API_KEY")!;
const FROM     = Deno.env.get("FROM_EMAIL") ?? "onboarding@resend.dev";
const BASE     = Deno.env.get("APP_BASE_URL") ?? "";
const CRON_SEC = Deno.env.get("CRON_SECRET") ?? "";

const sb = createClient(SB_URL, SB_KEY);
const CORS = { "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret" };

async function sendEmail(to: string, subject: string, html: string, replyTo?: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html, reply_to: replyTo }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${await r.text()}`);
  return r.json();
}
async function ownerEmail(owner: string | null): Promise<string | null> {
  if (!owner) return null;
  const { data } = await sb.from("crm_owner_emails").select("email").eq("owner", owner).maybeSingle();
  return data?.email ?? null;
}
const callLink = (leadId: string) => `${BASE}/CRM.html?lead=${encodeURIComponent(leadId)}&call=1`;
const TZ = "America/Denver"; // both current CRM owners (Robert Watson, Angel Long) are Mountain time
const fmt = (iso: string) => new Date(iso).toLocaleString("en-US",
  { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });

// Returns the [start, end) instants (as Date objects, true UTC) for "today" in TZ,
// computed from TZ's actual current UTC offset (handles MST/MDT correctly) rather
// than the edge function runtime's local time (which is UTC, not TZ).
function tzDayBoundsUTC(tz: string, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(now).map(p => [p.type, p.value])
  );
  const asIfUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMs = asIfUTC - now.getTime(); // tz's current offset from UTC
  const localMidnightAsUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, 0, 0, 0);
  const start = new Date(localMidnightAsUTC - offsetMs);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, end };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    // ---- cron-only actions require the shared secret ----
    if (action === "reminder_1h" || action === "reminder_dod") {
      if (req.headers.get("x-cron-secret") !== CRON_SEC) return json({ error: "unauthorized" }, 401);
    }

    if (action === "reminder_1h") {
      const now = Date.now(), hi = new Date(now + 60 * 60 * 1000).toISOString();
      const { data: calls } = await sb.from("crm_scheduled_calls").select("*")
        .eq("status", "scheduled").eq("reminder_1h_sent", false)
        .gte("scheduled_at", new Date(now).toISOString()).lte("scheduled_at", hi);
      let sent = 0;
      for (const c of calls ?? []) {
        const to = await ownerEmail(c.owner); if (!to) continue;
        const { data: lead } = await sb.from("crm_leads").select("phone").eq("id", c.lead_id).maybeSingle();
        await sendEmail(to, `CRM Call Reminder — ${c.company ?? c.lead_id}`,
          `<h2>Call in ~1 hour</h2><p><b>${c.company ?? ""}</b><br>Type: ${c.call_type}<br>
           Time: ${fmt(c.scheduled_at)}<br>Phone: ${lead?.phone ?? "—"}</p>
           <p><a href="${callLink(c.lead_id)}">Open in CRM →</a></p>`);
        await sb.from("crm_scheduled_calls").update({ reminder_1h_sent: true }).eq("id", c.id);
        sent++;
      }
      return json({ ok: true, sent });
    }

    if (action === "reminder_dod") {
      const { start, end } = tzDayBoundsUTC(TZ);
      const { data: calls } = await sb.from("crm_scheduled_calls").select("*")
        .eq("status","scheduled").eq("reminder_dod_sent", false)
        .gte("scheduled_at", start.toISOString()).lt("scheduled_at", end.toISOString());
      // group by owner
      const byOwner: Record<string, any[]> = {};
      for (const c of calls ?? []) (byOwner[c.owner ?? ""] ??= []).push(c);
      let digests = 0;
      for (const [owner, list] of Object.entries(byOwner)) {
        const to = await ownerEmail(owner); if (!to) continue;
        const rows = list.sort((a,b)=>a.scheduled_at<b.scheduled_at?-1:1)
          .map(c=>`<li>${fmt(c.scheduled_at)} — <b>${c.company??""}</b> (${c.call_type})
                   — <a href="${callLink(c.lead_id)}">open</a></li>`).join("");
        await sendEmail(to, `CRM Call Reminder — ${list.length} call(s) today`,
          `<h2>Today's scheduled calls</h2><ul>${rows}</ul>`);
        for (const c of list) await sb.from("crm_scheduled_calls").update({ reminder_dod_sent: true }).eq("id", c.id);
        digests++;
      }
      return json({ ok: true, digests });
    }

    if (action === "send_availability") {
      const { lead_id, prospect_email, slots } = body;
      if (!lead_id || !prospect_email || !Array.isArray(slots) || !slots.length || slots.length > 6)
        return json({ error: "bad_request" }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(prospect_email)) return json({ error: "bad_email" }, 400);
      const { data: lead } = await sb.from("crm_leads").select("id,company,owner").eq("id", lead_id).maybeSingle();
      if (!lead) return json({ error: "lead_not_found" }, 404);
      const { data: offer, error } = await sb.from("crm_booking_offers").insert({
        lead_id, company: lead.company, owner: lead.owner, prospect_email, offered_slots: slots,
      }).select("token").single();
      if (error) throw error;
      const link = `${BASE}/call-booking.html?token=${offer.token}`;
      const reply = await ownerEmail(lead.owner) ?? undefined;
      await sendEmail(prospect_email, `Let's find a time to talk — ${lead.company ?? "Roady's"}`,
        `<p>Hi,</p><p>Please pick a time that works for a quick call:</p>
         <p><a href="${link}">Choose a time →</a></p>`, reply);
      return json({ ok: true, token: offer.token });
    }

    if (action === "send_confirmation") {
      const { token } = body;
      const { data: offer } = await sb.from("crm_booking_offers").select("*").eq("token", token).maybeSingle();
      if (!offer || offer.status !== "booked" || !offer.chosen_slot) return json({ error: "not_booked" }, 400);
      const reply = await ownerEmail(offer.owner) ?? undefined;
      await sendEmail(offer.prospect_email, `Your call is scheduled — ${fmt(offer.chosen_slot)}`,
        `<p>You're all set for <b>${fmt(offer.chosen_slot)}</b>. We look forward to speaking with you.</p>`, reply);
      const to = await ownerEmail(offer.owner);
      if (to) await sendEmail(to, `CRM Call Reminder — new booking (${offer.company ?? ""})`,
        `<p>${offer.prospect_email} booked <b>${fmt(offer.chosen_slot)}</b> — ${offer.company ?? ""}.</p>
         <p><a href="${callLink(offer.lead_id)}">Open in CRM →</a></p>`);
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
```

---

## Appendix D — `sql/2026-07-14-crm-cron.sql`

```sql
-- Enable once (dashboard toggle or here):
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace <PROJECT_REF> and <CRON_SECRET> before running.
-- 1-hour reminders: every 15 minutes
select cron.schedule('crm-reminder-1h', '*/15 * * * *', $$
  select net.http_post(
    url    := 'https://<PROJECT_REF>.functions.supabase.co/crm-emails',
    headers:= jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body   := jsonb_build_object('action','reminder_1h')
  );
$$);

-- Start-of-day digest: 13:00 UTC (= 07:00 MDT / 06:00 MST — both owners are Mountain time)
select cron.schedule('crm-reminder-dod', '0 13 * * *', $$
  select net.http_post(
    url    := 'https://<PROJECT_REF>.functions.supabase.co/crm-emails',
    headers:= jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body   := jsonb_build_object('action','reminder_dod')
  );
$$);

-- Manage:
-- select * from cron.job;
-- select cron.unschedule('crm-reminder-1h');
```
