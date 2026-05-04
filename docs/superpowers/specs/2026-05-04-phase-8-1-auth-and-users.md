# Phase 8.1 — Supabase Auth + Users (Foundation)

**Status:** Spec
**Date:** 2026-05-04
**File scope:** `gs-command-center.html` (login screen + currentUser plumbing); new Supabase tables + RLS; new repo settings (GitHub Pages host).

---

## Goal

Replace the PIN-only login with **Supabase Auth (magic link email)** so each GS authenticates with their own email address from any browser on any device, while keeping the existing Manager All-GS / per-GS topbar selector behavior unchanged. Lays the foundation for subsequent sub-phases (8.2 Stop Records, 8.3 CRM, 8.4 Scenarios + Manager Config) to migrate localStorage tables to Supabase one at a time.

This sub-phase moves **only the auth boundary** — every data table (activity_logs, stopdata, scenarios, manager config, etc.) stays in `localStorage` exactly as it is today. Per-GS namespacing still uses `gs_cmd_<gsName>_*` keys; we just resolve `<gsName>` from the new `users.gs_name` column instead of from `GS_PINS`.

---

## Non-Goals

- **Migrating any data tables.** Activity logs, stopdata, scenarios, etc. all stay in localStorage. Sub-phases 8.2–8.4 do those one at a time.
- **Migrating cross-app data** (`roadys_fuel`, `roadys_kpi`, `roadys_vp_enroll`). That's sub-phase 8.5 / a separate sub-project — needs `index.html` changes too.
- **Self-signup flow.** v1 is **strictly Manager-provisioned** via Supabase Studio (insert rows into `users` directly). No invite UI yet — that lives in a later sub-phase if we ever want it.
- **Google SSO / other auth providers.** Magic link only for v1 — simplest config, zero per-user setup, works with any email.
- **Edit-user UI inside the app.** Manager edits users via Supabase Studio for v1.
- **OTP / 6-digit-code fallback.** Magic link only. (We'd add OTP if hosting becomes a problem; see Hosting section.)
- **Per-user preferences in the database.** `gs_cmd_theme`, `gs_cmd_manager_selection`, `gs_cmd_sort_*`, `gs_cmd_map_mode` all stay in localStorage. They're per-browser preferences, not per-user — moving them is unnecessary churn.
- **Backwards compatibility with the PIN screen.** Hard cutover. Once 8.1 ships, PIN auth is gone. Anyone who needs access must be in `users`.
- **Auto-migrating per-machine localStorage data into Supabase.** Whatever's in a GS's local browser stays there for now. Subsequent sub-phases handle migration of each table.

---

## Architecture

### File structure

- **Modify:** `gs-command-center.html` — login screen + auth helpers + `loginAs` / `logout` plumbing.
- **New:** `docs/superpowers/migrations/2026-05-04-phase-8-1.sql` — schema + seed SQL for Supabase. Run once via Supabase Studio SQL editor.
- **New:** `.github/workflows/deploy.yml` (or repo Settings → Pages config) — GitHub Pages auto-deploy from `main`.

### Hosting

Magic links require an **HTTPS redirect URL**, so the app needs a stable web URL. **Proposal: GitHub Pages on the existing repo.**

- Source: `main` branch, root path
- URL: `https://jasonvega1974.github.io/roadys-command-center/gs-command-center.html`
- Auto-deploys on every push to `main`
- Free, no extra account, no DNS to manage

The Supabase Auth → URL Configuration → Site URL gets set to that URL; Redirect URLs allowlist gets the same (and `localhost:8080` for local dev).

If GitHub Pages doesn't work for any reason (org policy, custom domain needs), the alternative is Vercel/Netlify (also free) — same flow, different host.

### Database schema

```sql
-- Supabase already has auth.users (managed). We add our application
-- table that joins by id + carries app-level role/gs_name.
create table public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text,
  role        text not null check (role in ('gs', 'manager')),
  gs_name     text,  -- nullable; null for managers, REGIONS key for gs role
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Trigger: keep updated_at fresh on row update
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger users_touch_updated_at
  before update on public.users
  for each row execute function public.touch_updated_at();

-- Index for email lookup during login
create index users_email_idx on public.users (email);
```

#### RLS policies

```sql
alter table public.users enable row level security;

-- Anyone authenticated can SELECT their own row (joined by auth.uid())
create policy users_self_select on public.users
  for select using (auth.uid() = id);

-- Managers can SELECT every row (so the Manager UI can list all GSs later)
create policy users_manager_select_all on public.users
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'manager'
    )
  );

-- No INSERT / UPDATE / DELETE policies on the table — users are managed
-- exclusively via Supabase Studio for v1 (service role key bypasses RLS).
```

The Manager-can-see-all policy is forward-looking — Phase 8.1 doesn't surface a user list in the UI, but later sub-phases will (e.g., scenario rollups want to know which GS owns each row).

#### Seed SQL (one-time bootstrap)

```sql
-- 1. Create the first manager via Supabase Studio Auth → Add User
--    (this populates auth.users with their email + magic-link enabled).
-- 2. Then run this SQL to insert the matching public.users row.
--    Replace the UUIDs with the actual auth.users.id values.

-- Example: Manager
insert into public.users (id, email, full_name, role, gs_name)
values ('<auth-user-id-for-manager>',
        'jasonvega1974@gmail.com',
        'Jason Vega',
        'manager',
        null);

-- Example: GS user. gs_name MUST exactly match a REGIONS key in
-- gs-command-center.html (e.g., 'Logan Resinkin', 'Burt Newman', etc.)
-- so existing localStorage namespaces resolve.
insert into public.users (id, email, full_name, role, gs_name)
values ('<auth-user-id-for-logan>',
        'logan@example.com',
        'Logan Resinkin',
        'gs',
        'Logan Resinkin');
```

Document explicitly: **`gs_name` must exactly match a `REGIONS` key.** A typo orphans every localStorage namespace for that user.

### Auth flow

```
┌─ User opens gs-command-center.html ──────────────────────┐
│                                                          │
│  1. App boot: load supabase-js, check session            │
│                                                          │
│  2a. No session → show login screen                      │
│      [email input]   [Send magic link]                   │
│                      ↓ click                             │
│      Supabase emails magic link to that address          │
│      "Check your email" toast shown                      │
│                      ↓ user clicks link in email         │
│      Browser returns to <site URL>/gs-command-center.html│
│      with #access_token=… in URL hash                    │
│      supabase-js auto-detects, sets session, fires event │
│                                                          │
│  2b. Has session → fetch public.users row by auth.uid()  │
│      • Row exists, active=true → set currentUser, login  │
│      • Row missing or active=false → toast error,        │
│        signOut(), back to login screen                   │
│                                                          │
│  3. Logout: supabase.auth.signOut() → reset state →      │
│     show login screen.                                   │
└──────────────────────────────────────────────────────────┘
```

Session persists in localStorage automatically (Supabase JS default). Refreshing the page re-authenticates silently if the session is still valid.

### `currentUser` shape

Old (PIN-driven):
```js
{ name: 'Logan Resinkin', role: 'Growth Strategist', isManager: undefined }
{ name: 'Manager',        role: 'Manager — All Territories', isManager: true }
```

New (Supabase-driven), kept structurally compatible so downstream code doesn't break:
```js
{
  id:        '<auth uuid>',
  email:     'logan@example.com',
  full_name: 'Logan Resinkin',
  name:      'Logan Resinkin',     // preserved for back-compat (= full_name)
  role:      'Growth Strategist',  // display string, derived from users.role
  isManager: false,                // true iff users.role === 'manager'
  gs_name:   'Logan Resinkin'      // from users.gs_name
}
```

Critical helper: `getActiveGS()` currently returns `currentUser.name` for non-managers. After 8.1 it returns **`currentUser.gs_name`** instead. That's the only data-layer change in Phase 8.1 — every `gs_cmd_<gsName>_*` localStorage key resolves the same as before, as long as `gs_name` matches the REGIONS key.

### Code changes (gs-command-center.html)

**Removed**:
- `const GS_PINS = { … }` constant — gone
- `let pinEntry = '';` — gone
- `function initLogin()`, `pinPress()`, `updateDots()` — gone
- `loginAs(user)` — replaced (see below)
- The PIN-pad HTML inside `#login-screen` — replaced

**New**:
- Async boot: `(async () => { await ensureSupabaseLib(); … })()` instead of synchronous `initLogin()`
- `function showLoginScreen()` — renders email input + Send button
- `async function sendMagicLink(email)` — calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: '<site URL>' } })`. Toast on success/failure.
- `async function onAuthReady()` — fired after session resolves (either fresh or restored). Fetches `users` row, validates, sets `currentUser`, calls existing `loginAs`-style finalization.
- `async function logout()` — replaces existing. Calls `supabase.auth.signOut()`, then resets `currentUser`, clears `managerSelection`, shows login screen.

**Mutated**:
- `function getActiveGS()` — `return managerSelection && managerSelection !== ALL_GS ? managerSelection : null;` for managers, `return currentUser.gs_name;` for GS (was `currentUser.name`).
- `loadData()`, `saveData()`, every `LS_KEY + active + …` reference — no change. They already use `getActiveGS()` for the namespace.

`ensureSupabaseLib()` already exists (used today for the optional `loadVPEnrollFromSupabase`). Phase 8.1 promotes it from "lazy on first VP fetch" to "eager on app boot."

### UI: login screen

Replace the PIN pad with:

```
┌─ ROADY'S ─────────────────────────────────┐
│  Growth Strategist Command Center         │
│  Sign in with your email                  │
│                                            │
│  [you@example.com               ]          │
│                                            │
│             [Send magic link]              │
│                                            │
│  We'll email you a link to sign in.        │
│  Check your inbox after clicking.          │
└────────────────────────────────────────────┘
```

After clicking Send, button disables and label changes to "Sent — check your email." Tap Send again sends another link (Supabase rate-limits to 1/min).

### UI: topbar

No changes — the existing Manager GS selector + Stop search + Theme toggle + Logout button all keep working. The display name (`tb-name` / `tb-role`) just gets `full_name` and a derived role string instead of values from `GS_PINS`.

---

## Cross-cutting concerns

- **Manager-selection persistence** stays in localStorage (`gs_cmd_manager_selection`). It's a per-browser preference, not per-user.
- **Theme persistence** (`gs_cmd_theme`) stays in localStorage. Same reason.
- **Sort state** (`gs_cmd_sort_*`) and **map mode** (`gs_cmd_map_mode`) stay in localStorage.
- **Per-GS data namespaces** (`gs_cmd_<gsName>_logs`, etc.) keep working as long as `gs_name` matches the REGIONS key. **The seed SQL must mirror REGIONS keys exactly** — typo here means all localStorage data for that user is orphaned. The plan doc will include a one-line `console.warn` if `gs_name` doesn't match a known REGIONS key, so a typo at seed time gets caught at first login.
- **Session timeout** uses Supabase defaults (1 hour access token, refresh token rolling 30 days). User stays logged in across browser restarts.
- **Service role key** — never used in the frontend. Only the anon key (already inlined). Auth users only see their own row + (managers) all rows, enforced by RLS.
- **Email deliverability** — Supabase's default email sender works for low volume. If GS users miss magic-link emails (spam folders), we can wire up a custom SMTP provider later. Out of scope for v1.
- **Existing `ROADYS_SB_ANON` constant in `gs-command-center.html`** — already there, already used. No new secret to ship.
- **Bookmark/auth callback handling** — Supabase JS handles `?code=…` and `#access_token=…` URL fragments automatically when the page loads. We just call `supabase.auth.getSession()` and react.

---

## Smoke Test

After Phase 8.1 implementation + GitHub Pages deploy + seed SQL run:

1. **Cold load** — open `https://jasonvega1974.github.io/roadys-command-center/gs-command-center.html` in a fresh browser → login screen appears, email input visible, no PIN pad.
2. **Magic link send** — type a seeded email → click Send → toast "Magic link sent." Check email — Supabase sender shows up within a minute.
3. **Magic link click** — click link in email → browser returns to app → app skips login screen, lands on Dashboard, `tb-name` shows the user's `full_name`.
4. **Manager mode** — log in as the Manager email → topbar GS selector visible → "All GS" rollup renders the master dashboard.
5. **GS mode** — log out, log in as a GS email (e.g., Logan) → no GS selector → dashboard shows that GS's stops only.
6. **Persistence** — close tab, reopen URL → user is still logged in, no magic link prompt.
7. **Logout** — click Logout → returns to login screen → clicking the original magic link a second time fails (it's single-use). Need a fresh send.
8. **Unauthorized email** — type an email that's not in `public.users` → click Send (Supabase always sends regardless) → click link → app fetches `users` row, finds none, toasts "Not authorized," signs out, returns to login screen.
9. **Localized data preserved** — log in as Logan → existing localStorage data under `gs_cmd_Logan Resinkin_*` resolves → CRM tasks, notes, visits, scenarios all still there.
10. **Manager All-GS data** — log in as Manager, browse to any GS via topbar → that GS's localStorage data shows correctly (tested by switching between two seeded users on the same browser).
11. **Cross-device** — log in as same Logan email on a different machine → empty CRM/notes/visits (because data is localStorage on the original machine; this is expected, fixed in 8.2-8.4).
12. **Inactive user** — set `users.active = false` for a row in Supabase Studio → that user clicks magic link → blocked at the `active` check, signed out.

---

## File Footprint Estimate

- **`docs/superpowers/migrations/2026-05-04-phase-8-1.sql`** — ~50 lines (schema + RLS + seed examples + comments).
- **`.github/workflows/deploy.yml`** — ~25 lines (or zero if we configure Pages via repo Settings UI; the plan will choose).
- **`gs-command-center.html`** — net **~+80 lines** (auth helpers + new login screen UI + boot sequence) — **~40 removed** (PIN pad / `GS_PINS` / `pinPress` / `initLogin`) → ~120 lines added. Most existing code (5,962 lines) is untouched.

**Estimated total addition:** ~150 lines across 3 files.

---

## Open Questions

1. **Hosting** — GitHub Pages on `JasonVega1974/roadys-command-center` (auto-deploys `main` to `https://jasonvega1974.github.io/roadys-command-center/`). Acceptable, or do you want Vercel / Netlify / a custom domain instead? **Default: GitHub Pages.**
2. **Supabase project** — confirm we're using the same project as `ROADYS_SB_URL` (`yyhnnalsqzyghjqtfisy.supabase.co`)? That's the one already wired into the anon key in `gs-command-center.html`. **Default: yes, same project.**
3. **Bootstrap manager email** — what email address should the very first manager row use? (Defaults to `jasonvega1974@gmail.com` from your IDE context unless you say otherwise.) **Default: jasonvega1974@gmail.com.**
4. **GS user emails** — for the 6 existing GSs (Logan, Burt, Maria, Shannon, Stefanie, Steph), do you have their emails ready, or do we want a placeholder pattern (e.g., `logan@roadys.local`) until they're invited? Tied to whether you want to actually onboard them at 8.1 ship time, or just unblock yourself first. **Default: seed only the manager + one test GS at 8.1 ship; onboard the rest via Supabase Studio when you're ready.**
5. **Magic link rate limit / failure UX** — Supabase rate-limits magic links to 1/min per email. If a user spam-clicks Send, we should debounce client-side too. **Default: yes, 60-second debounce on the Send button.**

If all five defaults are accepted as-is, no spec change; the plan can proceed.

---

## References

- Spec for Phase 7 (Schedule Visit): [2026-05-04-phase-7-schedule-next-visit.md](2026-05-04-phase-7-schedule-next-visit.md) — adjacent (no overlap).
- Phase 8 architecture context — earlier conversation: 5-sub-phase plan, Supabase end-to-end, online-only, magic-link-only auth. 8.1 is the foundation for 8.2-8.5.
- Supabase Auth — magic link / OTP API: https://supabase.com/docs/guides/auth/auth-email-passwordless
- Supabase Row-Level Security: https://supabase.com/docs/guides/auth/row-level-security
- Plan: TBD — produced after this spec is approved.
