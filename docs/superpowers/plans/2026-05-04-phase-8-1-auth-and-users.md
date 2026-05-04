# GS Command Center Phase 8.1 — Supabase Auth + Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PIN-based login in `gs-command-center.html` with Supabase Auth (magic link email). New `public.users` table holds app-level role + `gs_name` and joins to `auth.users` by id. RLS so each user can only see their own row (managers see all). All existing per-GS localStorage namespaces (`gs_cmd_<gsName>_*`) keep working as long as `gs_name` matches a REGIONS key.

**Architecture:** Three deliverables — (1) one new SQL migration to run in Supabase Studio, (2) GitHub Pages deploy config, (3) `gs-command-center.html` edits to swap the auth boundary. Reuses the existing `ROADYS_SB_URL` / `ROADYS_SB_ANON` constants and the existing `ensureSupabaseLib()` helper. New helpers: `bootSupabaseAuth`, `showLoginScreen`, `sendMagicLink`, `onAuthReady`, `mapAuthUserToCurrentUser`. Removed: `GS_PINS`, `initLogin`, `pinPress`, `updateDots`, the PIN-pad HTML.

**Tech Stack:** Pure HTML/JS/CSS, no build, no test framework. Verification = `node -e "new Function(<extracted-script>)"` syntax check + post-ship runbook (see end of plan; includes the actual Supabase Studio steps + first-login smoke test).

**Spec:** [docs/superpowers/specs/2026-05-04-phase-8-1-auth-and-users.md](../specs/2026-05-04-phase-8-1-auth-and-users.md).

**Open-question decisions (per spec sign-off):** All five defaults accepted as-is.
1. Hosting: GitHub Pages on `JasonVega1974/roadys-command-center`.
2. Supabase project: `yyhnnalsqzyghjqtfisy.supabase.co` (already wired in).
3. Bootstrap manager email: `jasonvega1974@gmail.com`.
4. Seed only Manager + 1 test GS at ship; onboard others later via Supabase Studio.
5. Magic-link Send button: 60-second client-side debounce.

**Phase boundary:** Phase 8.2 (Stop Records to Supabase) and beyond are out of scope. **No data tables move in 8.1.** Activity logs, stopdata, scenarios, manager config — all stay in localStorage exactly as they are today.

---

## File Structure

| Insertion point | What we add | Locator |
|---|---|---|
| New: `docs/superpowers/migrations/2026-05-04-phase-8-1.sql` | Schema + RLS + seed examples | New file |
| New section in `<style>` block | CSS for new login form (email input + Send button + status line) | Before `</style>` |
| Replace `<div id="login-screen">…</div>` | Email input + Send button + status text instead of PIN pad | Existing `#login-screen` element |
| Inside `<script>`, replace `const GS_PINS = …` block | New auth helpers + `mapAuthUserToCurrentUser` + `bootSupabaseAuth` | Existing GS_PINS constant |
| Replace `function initLogin()`, `pinPress()`, `updateDots()` | Remove (gone) — replaced by new helpers above | After `let pinEntry = '';` |
| Mutate `function loginAs(user)` | Renamed to `finalizeLogin(user)`, called from `onAuthReady` | Existing `function loginAs` |
| Mutate `function getActiveGS()` | Use `currentUser.gs_name` instead of `currentUser.name` for non-managers | Existing `function getActiveGS` |
| Mutate `function logout()` | Calls `supabase.auth.signOut()` then resets state | Existing `function logout` |
| Replace last line of `<script>` | `bootSupabaseAuth()` instead of `initLogin()` | Existing `initLogin();` call |

---

## Task 1: Create the Supabase migration SQL file

**Files:**
- Create: `docs/superpowers/migrations/2026-05-04-phase-8-1.sql`

- [ ] **Step 1: Create the directory if needed**

```bash
ls "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/docs/superpowers/migrations/" 2>/dev/null || mkdir -p "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/docs/superpowers/migrations/"
```

- [ ] **Step 2: Write the SQL file**

Use the Write tool. File: `docs/superpowers/migrations/2026-05-04-phase-8-1.sql`. Contents:

```sql
-- ─────────────────────────────────────────────────────────────────────
-- Phase 8.1 — Supabase Auth + Users (Foundation)
-- Run once via Supabase Studio → SQL Editor → New query.
-- After running, follow the seed instructions at the bottom of this file.
-- ─────────────────────────────────────────────────────────────────────

-- 1. Application users table. Joins to auth.users by id.
create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text,
  role        text not null check (role in ('gs', 'manager')),
  gs_name     text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.users.gs_name is
  'For role=gs: must exactly match a REGIONS key in gs-command-center.html. For role=manager: leave NULL.';

-- 2. updated_at maintenance trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_touch_updated_at on public.users;
create trigger users_touch_updated_at
  before update on public.users
  for each row execute function public.touch_updated_at();

-- 3. Index for email lookup
create index if not exists users_email_idx on public.users (email);

-- 4. RLS: users see their own row; managers see all.
alter table public.users enable row level security;

drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users
  for select using (auth.uid() = id);

drop policy if exists users_manager_select_all on public.users;
create policy users_manager_select_all on public.users
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'manager'
    )
  );

-- No INSERT / UPDATE / DELETE policies — users are managed exclusively
-- via Supabase Studio (service role bypasses RLS) for v1.

-- ─────────────────────────────────────────────────────────────────────
-- Seed instructions (run AFTER the schema above):
--
-- A. In Supabase Studio → Authentication → Users → "Add user":
--    - Email: jasonvega1974@gmail.com
--    - Auto-confirm user: yes
--    Copy the resulting user's UUID — you'll need it below.
--
-- B. Run this in SQL Editor (replace the UUID):
--
--    insert into public.users (id, email, full_name, role, gs_name) values
--      ('<paste-uuid-here>',
--       'jasonvega1974@gmail.com',
--       'Jason Vega',
--       'manager',
--       null);
--
-- C. (Optional) Seed one test GS the same way. The full_name + email
--    can be anything; the gs_name MUST match a REGIONS key exactly
--    (e.g., 'Logan Resinkin', 'Burt Newman', 'Maria Coleman',
--    'Shannon Bumbalough', 'Stefanie Ritter', 'Steph Leslie').
--
--    insert into public.users (id, email, full_name, role, gs_name) values
--      ('<paste-uuid-here>',
--       'logan@example.com',
--       'Logan Resinkin',
--       'gs',
--       'Logan Resinkin');
-- ─────────────────────────────────────────────────────────────────────
```

- [ ] **Step 3: Verify file written**

```bash
test -f "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/docs/superpowers/migrations/2026-05-04-phase-8-1.sql" && echo "ok"
```

Expected: `ok`. DO NOT COMMIT (Phase 8.1 uses a single batched commit at Task 8).

---

## Task 2: CSS additions for the new login form

**Files:**
- Modify: `gs-command-center.html` (CSS block, immediately before `</style>`)

- [ ] **Step 1: Locate insertion point**

```bash
grep -n "^</style>" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: a single match.

- [ ] **Step 2: Insert Phase 8.1 login CSS immediately before `</style>`**

Use the Edit tool. `old_string` is the literal `</style>` line. `new_string` is the new CSS block followed by `</style>`:

```css
/* Phase 8.1 — Supabase Auth login form */
.auth-form{display:flex;flex-direction:column;gap:10px;margin-top:18px}
.auth-input{background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-family:var(--ff);font-size:.9em;width:100%}
.auth-input:focus{outline:none;border-color:var(--cyan)}
.auth-send{background:var(--accent);color:var(--bg);border:none;border-radius:8px;padding:10px 16px;font-weight:700;font-size:.88em;cursor:pointer;font-family:var(--ff);transition:all .15s}
.auth-send:hover:not(:disabled){background:var(--cyan)}
.auth-send:disabled{opacity:.5;cursor:not-allowed}
.auth-status{font-size:.78em;color:var(--muted);min-height:20px;line-height:1.4}
.auth-status.success{color:var(--green)}
.auth-status.err{color:var(--red)}
.auth-help{font-size:.7em;color:var(--muted);margin-top:6px;line-height:1.4}
</style>
```

- [ ] **Step 3: Verify CSS classes inserted**

```bash
grep -c "^\\.auth-input{" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^\\.auth-send{" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^\\.auth-status{" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Each prints `1`.

- [ ] **Step 4: Syntax check**

```bash
node -e "const fs=require('fs');const html=fs.readFileSync('c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g);m.forEach((blk,i)=>{const js=blk.replace(/^<script>|<\/script>$/g,'');new Function(js);});console.log('syntax ok, '+m.length+' script blocks');"
```

Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 3: Replace the login screen HTML

**Files:**
- Modify: `gs-command-center.html` (`#login-screen` element)

- [ ] **Step 1: Locate the login screen HTML**

```bash
grep -n 'id="login-screen"' "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 2 matches — the `<div id="login-screen">` and the matching `</div>`. Read 12-15 lines starting at the first match to see the full element.

- [ ] **Step 2: Replace the PIN pad with the email form**

Use the Edit tool:

- `old_string`:
```
<!-- ═══ LOGIN SCREEN ═══ -->
<div id="login-screen">
  <div class="login-box">
    <div class="login-logo">ROADY'S</div>
    <div style="font-size:.82em;font-weight:700;margin-bottom:2px">Growth Strategist Command Center</div>
    <div class="login-sub">Enter your PIN to continue</div>
    <div class="pin-dots" id="pin-dots"></div>
    <div class="pin-pad" id="pin-pad"></div>
    <div class="login-error" id="login-error"></div>
  </div>
</div>
```

- `new_string`:
```
<!-- ═══ LOGIN SCREEN ═══ -->
<div id="login-screen">
  <div class="login-box">
    <div class="login-logo">ROADY'S</div>
    <div style="font-size:.82em;font-weight:700;margin-bottom:2px">Growth Strategist Command Center</div>
    <div class="login-sub">Sign in with your email</div>
    <form class="auth-form" id="auth-form" onsubmit="event.preventDefault();sendMagicLink()">
      <input type="email" class="auth-input" id="auth-email" placeholder="you@example.com" autocomplete="email" required>
      <button type="submit" class="auth-send" id="auth-send-btn">Send magic link</button>
      <div class="auth-status" id="auth-status"></div>
    </form>
    <div class="auth-help">We'll email you a link to sign in. Check your inbox after clicking — link is single-use and expires after 60 minutes.</div>
  </div>
</div>
```

- [ ] **Step 3: Verify**

```bash
grep -c 'id="auth-email"' "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c 'id="auth-send-btn"' "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c 'pin-pad' "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1 (the last one matches the CSS rule `.pin-pad{…}` which we leave in place — the JS that uses it is gone in Task 5, but the unused CSS rule is harmless).

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 4: Replace `GS_PINS` constant with auth helpers

**Files:**
- Modify: `gs-command-center.html` (`const GS_PINS = …` block + the helpers immediately after `pinEntry`)

- [ ] **Step 1: Locate `GS_PINS`**

```bash
grep -n "^const GS_PINS" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: a single match. Read 12-15 lines from that match to see the full constant block (`const GS_PINS = { '1001': …, … '9999': … };`).

- [ ] **Step 2: Replace `GS_PINS` with the auth helpers**

The `GS_PINS` block currently looks like:

```js
const GS_PINS = {
  '1001':{name:'Logan Resinkin',role:'Growth Strategist'},
  '1002':{name:'Burt Newman',role:'Growth Strategist'},
  '1003':{name:'Maria Coleman',role:'Growth Strategist'},
  '1004':{name:'Shannon Bumbalough',role:'Growth Strategist'},
  '1005':{name:'Stefanie Ritter',role:'Growth Strategist'},
  '1006':{name:'Steph Leslie',role:'Growth Strategist'},
  '9999':{name:'Manager',role:'Manager — All Territories',isManager:true}
};
```

Use the Edit tool:

- `old_string`: the entire `const GS_PINS = { … };` block above (verbatim — include the newline after the closing `};`).
- `new_string`:

```js
// ─── Phase 8.1: Supabase Auth ─────────────────────────────────────────
// Replaces the old PIN-based GS_PINS table. Users are now managed in
// public.users (Supabase) and matched to currentUser by auth UID.
let _authSendCooldownTimer = null;
let _supabaseClient = null;

function getSupabaseAuthClient(){
  // Singleton wrapper around the existing getRoadysSB() helper.
  if(_supabaseClient) return _supabaseClient;
  _supabaseClient = getRoadysSB();
  return _supabaseClient;
}

function showLoginScreen(){
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  const status = document.getElementById('auth-status');
  if(status){ status.textContent = ''; status.className = 'auth-status'; }
  const btn = document.getElementById('auth-send-btn');
  if(btn){ btn.disabled = false; btn.textContent = 'Send magic link'; }
  if(_authSendCooldownTimer){ clearTimeout(_authSendCooldownTimer); _authSendCooldownTimer = null; }
}

async function sendMagicLink(){
  const emailEl = document.getElementById('auth-email');
  const status = document.getElementById('auth-status');
  const btn = document.getElementById('auth-send-btn');
  const email = (emailEl?.value || '').trim().toLowerCase();
  if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    status.textContent = 'Enter a valid email address.';
    status.className = 'auth-status err';
    return;
  }
  const sb = getSupabaseAuthClient();
  if(!sb){ status.textContent = 'Auth service unavailable. Reload the page.'; status.className = 'auth-status err'; return; }
  btn.disabled = true; btn.textContent = 'Sending...';
  status.textContent = '';
  status.className = 'auth-status';
  try {
    // emailRedirectTo defaults to the current page if omitted, which is
    // what we want — the link bounces back to gs-command-center.html.
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href.split('#')[0] }
    });
    if(error) throw error;
    status.textContent = 'Magic link sent — check your email.';
    status.className = 'auth-status success';
    btn.textContent = 'Sent (resend in 60s)';
    // 60-second client-side debounce to discourage spam-clicks. Supabase
    // also rate-limits at 1/min server-side.
    _authSendCooldownTimer = setTimeout(() => {
      btn.disabled = false; btn.textContent = 'Send magic link';
    }, 60000);
  } catch(e){
    status.textContent = 'Could not send magic link: ' + (e.message || e);
    status.className = 'auth-status err';
    btn.disabled = false;
    btn.textContent = 'Send magic link';
  }
}

async function fetchUserRow(authUid){
  const sb = getSupabaseAuthClient();
  if(!sb) return null;
  const { data, error } = await sb.from('users').select('*').eq('id', authUid).maybeSingle();
  if(error){ console.warn('fetchUserRow error:', error.message); return null; }
  return data || null;
}

function mapAuthUserToCurrentUser(userRow){
  // Translate the public.users row into the currentUser shape the rest
  // of the app already expects (.name, .role, .isManager).
  const isManager = userRow.role === 'manager';
  return {
    id:        userRow.id,
    email:     userRow.email,
    full_name: userRow.full_name || userRow.email,
    name:      userRow.full_name || userRow.email,                          // back-compat: was set from PIN map
    role:      isManager ? 'Manager — All Territories' : 'Growth Strategist', // display string
    isManager,
    gs_name:   userRow.gs_name || null
  };
}

async function onAuthReady(session){
  // session may be null (signed out) or an object (signed in).
  if(!session){ showLoginScreen(); return; }
  const userRow = await fetchUserRow(session.user.id);
  if(!userRow){
    // Auth succeeded but no public.users row — not authorized.
    const status = document.getElementById('auth-status');
    if(status){ status.textContent = 'This email is not authorized. Contact your manager.'; status.className = 'auth-status err'; }
    try { await getSupabaseAuthClient()?.auth.signOut(); } catch(e){}
    showLoginScreen();
    return;
  }
  if(userRow.active === false){
    const status = document.getElementById('auth-status');
    if(status){ status.textContent = 'This account is inactive. Contact your manager.'; status.className = 'auth-status err'; }
    try { await getSupabaseAuthClient()?.auth.signOut(); } catch(e){}
    showLoginScreen();
    return;
  }
  // Sanity-check gs_name against REGIONS so a typo at seed time is loud.
  if(userRow.gs_name && !REGIONS[userRow.gs_name]){
    console.warn('Phase 8.1: users.gs_name "' + userRow.gs_name + '" does not match a REGIONS key — localStorage data for this user will not resolve.');
  }
  finalizeLogin(mapAuthUserToCurrentUser(userRow));
}

async function bootSupabaseAuth(){
  // Eager-load supabase-js, hook auth state, kick the first session check.
  // Replaces the synchronous initLogin() entry point.
  try { await ensureSupabaseLib(); } catch(e){
    document.getElementById('auth-status').textContent = 'Could not load auth library. Check your network.';
    document.getElementById('auth-status').className = 'auth-status err';
    return;
  }
  const sb = getSupabaseAuthClient();
  if(!sb){
    document.getElementById('auth-status').textContent = 'Auth service unavailable.';
    document.getElementById('auth-status').className = 'auth-status err';
    return;
  }
  // Listen for sign-in / sign-out events. Magic-link redirects fire SIGNED_IN.
  sb.auth.onAuthStateChange((event, session) => {
    if(event === 'SIGNED_IN' || event === 'INITIAL_SESSION') onAuthReady(session);
    else if(event === 'SIGNED_OUT') showLoginScreen();
  });
  // Initial check — covers the "already-signed-in / cold reload" case.
  const { data } = await sb.auth.getSession();
  onAuthReady(data?.session || null);
}
```

⚠️ Read the file around `const GS_PINS = …` first to confirm the exact lines (incl. trailing comma/semicolon style) before running the Edit. The replacement removes ~10 lines and adds ~120.

- [ ] **Step 3: Verify**

```bash
grep -c "^function bootSupabaseAuth" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function sendMagicLink" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function onAuthReady" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function fetchUserRow" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function mapAuthUserToCurrentUser" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^const GS_PINS" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, 1, 1, 1, 1, **0** (GS_PINS is gone).

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 5: Remove `initLogin`, `pinPress`, `updateDots`; rename `loginAs` → `finalizeLogin`

**Files:**
- Modify: `gs-command-center.html` (the four PIN-flow functions, plus `let pinEntry`)

- [ ] **Step 1: Locate the PIN flow block**

```bash
grep -n "^let pinEntry" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -n "^function initLogin" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -n "^function pinPress" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -n "^function updateDots" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -n "^function loginAs" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Each prints exactly 1 line number. Read 30-40 lines starting at `let pinEntry` to see all four PIN-related functions plus `loginAs`.

- [ ] **Step 2: Remove the PIN block; rename `loginAs` → `finalizeLogin`**

The PIN block currently runs from `let pinEntry = '';` through the closing `}` of `loginAs(user)`. Use the Edit tool with the literal text from the file.

The `loginAs(user)` function looks like:

```js
function loginAs(user){
  currentUser=user;
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('tb-name').textContent=user.name;
  document.getElementById('tb-role').textContent=user.role;
  const wrap = document.getElementById('gs-selector-wrap');
  if(user.isManager){
    initGSSelector();
    let saved = ALL_GS;
    try { saved = localStorage.getItem('gs_cmd_manager_selection') || ALL_GS; } catch(e){}
    if(saved !== ALL_GS && !REGIONS[saved]) saved = ALL_GS; // guard against a renamed/removed GS
    managerSelection = saved;
    document.getElementById('gs-selector').value = saved;
    wrap.classList.add('show');
  } else {
    managerSelection = null;
    wrap.classList.remove('show');
  }
  calcCurrent = null;
  recomputeMyStops();
  loadData();
  renderAll();
}
```

Replace the WHOLE PIN block (from `let pinEntry = '';` through the closing `}` of `loginAs`) with **just** the renamed `finalizeLogin`:

- `old_string`: the literal `let pinEntry = '';` line through the closing `}` of `loginAs`. Include `function initLogin(){…}`, `function pinPress(k){…}`, `function updateDots(){…}`, and `function loginAs(user){…}` — **all four functions plus the `pinEntry` variable, deleted.**
- `new_string`:

```js
function finalizeLogin(user){
  currentUser=user;
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('tb-name').textContent=user.name;
  document.getElementById('tb-role').textContent=user.role;
  const wrap = document.getElementById('gs-selector-wrap');
  if(user.isManager){
    initGSSelector();
    let saved = ALL_GS;
    try { saved = localStorage.getItem('gs_cmd_manager_selection') || ALL_GS; } catch(e){}
    if(saved !== ALL_GS && !REGIONS[saved]) saved = ALL_GS; // guard against a renamed/removed GS
    managerSelection = saved;
    document.getElementById('gs-selector').value = saved;
    wrap.classList.add('show');
  } else {
    managerSelection = null;
    wrap.classList.remove('show');
  }
  calcCurrent = null;
  recomputeMyStops();
  loadData();
  renderAll();
}
```

⚠️ Body of the function is unchanged — only the name. The four PIN-flow functions (`initLogin`, `pinPress`, `updateDots`, `loginAs`) and the `let pinEntry` line are completely removed.

- [ ] **Step 3: Verify**

```bash
grep -c "^function finalizeLogin" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function initLogin" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function pinPress" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function updateDots" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^function loginAs" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^let pinEntry" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1, **0, 0, 0, 0, 0** (all PIN-flow code is gone; only `finalizeLogin` remains).

- [ ] **Step 4: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 6: Mutate `getActiveGS` and `logout`

**Files:**
- Modify: `gs-command-center.html` (`getActiveGS` body + `logout` body)

- [ ] **Step 1: Locate**

```bash
grep -n "^function getActiveGS" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -n "^function logout" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Each prints exactly 1 line.

- [ ] **Step 2: Mutate `getActiveGS` to use `gs_name`**

Currently:
```js
function getActiveGS(){
  // GS name string (a REGIONS key) when scoped to one GS;
  // null in Manager All-GS mode (or when no one is logged in).
  if(!currentUser) return null;
  if(!currentUser.isManager) return currentUser.name;
  return managerSelection && managerSelection !== ALL_GS ? managerSelection : null;
}
```

Use the Edit tool:

- `old_string`:
```
function getActiveGS(){
  // GS name string (a REGIONS key) when scoped to one GS;
  // null in Manager All-GS mode (or when no one is logged in).
  if(!currentUser) return null;
  if(!currentUser.isManager) return currentUser.name;
  return managerSelection && managerSelection !== ALL_GS ? managerSelection : null;
}
```

- `new_string`:
```
function getActiveGS(){
  // GS name string (a REGIONS key) when scoped to one GS;
  // null in Manager All-GS mode (or when no one is logged in).
  // Phase 8.1: non-managers resolve via users.gs_name (was currentUser.name
  // under the old PIN scheme — values were identical in practice but
  // gs_name is the proper field).
  if(!currentUser) return null;
  if(!currentUser.isManager) return currentUser.gs_name || null;
  return managerSelection && managerSelection !== ALL_GS ? managerSelection : null;
}
```

- [ ] **Step 3: Replace `logout` with the Supabase-aware version**

Currently:
```js
function logout(){
  currentUser=null;pinEntry='';managerSelection=null;
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('app').style.display='none';
  document.getElementById('gs-selector-wrap').classList.remove('show');
  updateDots();
}
```

Use the Edit tool:

- `old_string`:
```
function logout(){
  currentUser=null;pinEntry='';managerSelection=null;
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('app').style.display='none';
  document.getElementById('gs-selector-wrap').classList.remove('show');
  updateDots();
}
```

- `new_string`:
```
async function logout(){
  // Phase 8.1: end the Supabase session, then reset client state.
  // The auth state listener will fire SIGNED_OUT and call showLoginScreen.
  try { await getSupabaseAuthClient()?.auth.signOut(); } catch(e){ console.warn('logout signOut error:', e); }
  currentUser=null;
  managerSelection=null;
  document.getElementById('app').style.display='none';
  document.getElementById('gs-selector-wrap').classList.remove('show');
  showLoginScreen();
}
```

⚠️ References to `pinEntry` and `updateDots()` are gone (those functions/variables were removed in Task 5).

- [ ] **Step 4: Verify**

```bash
grep -c "currentUser.gs_name" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^async function logout" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "pinEntry" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "updateDots" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: at least 1, 1, **0, 0** (all PIN remnants gone).

- [ ] **Step 5: Syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 7: Replace `initLogin();` boot call with `bootSupabaseAuth();`

**Files:**
- Modify: `gs-command-center.html` (last line of the script block)

- [ ] **Step 1: Locate the boot call**

```bash
grep -n "^initLogin();" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: 1 match, near the end of the script block (just before `</script>`).

- [ ] **Step 2: Swap it**

Use the Edit tool:

- `old_string`:
```
// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
initLogin();
```

- `new_string`:
```
// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
bootSupabaseAuth();
```

- [ ] **Step 3: Verify**

```bash
grep -c "^initLogin()" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
grep -c "^bootSupabaseAuth()" "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html"
```

Expected: **0, 1**.

- [ ] **Step 4: Final syntax check.** Expected: `syntax ok, 1 script blocks`. DO NOT COMMIT.

---

## Task 8: Final syntax + diff stat + commit + push

**Files:**
- (No code changes; verification + commit + push only.)

- [ ] **Step 1: Final overall syntax check**

```bash
node -e "const fs=require('fs');const html=fs.readFileSync('c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center/gs-command-center.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g);m.forEach((blk,i)=>{const js=blk.replace(/^<script>|<\/script>$/g,'');new Function(js);});console.log('syntax ok, '+m.length+' script blocks');"
```

Expected: `syntax ok, 1 script blocks`.

- [ ] **Step 2: Diff stat**

```bash
git -C "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" status
git -C "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" diff --stat
```

Expected: `gs-command-center.html` modified (~+120 / -50). New files: `docs/superpowers/specs/2026-05-04-phase-8-1-auth-and-users.md`, `docs/superpowers/plans/2026-05-04-phase-8-1-auth-and-users.md`, `docs/superpowers/migrations/2026-05-04-phase-8-1.sql`.

- [ ] **Step 3: Commit**

```bash
cd "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" && git add gs-command-center.html "docs/superpowers/specs/2026-05-04-phase-8-1-auth-and-users.md" "docs/superpowers/plans/2026-05-04-phase-8-1-auth-and-users.md" "docs/superpowers/migrations/2026-05-04-phase-8-1.sql" && git commit -m "$(cat <<'EOF'
GS Command Center Phase 8.1: Supabase Auth + Users

Replace PIN-based login with Supabase Auth (magic link email). New
public.users table joins to auth.users by id and carries app-level
role + gs_name. RLS lets each user see their own row; managers see
all. All per-GS localStorage namespaces (gs_cmd_<gsName>_*) keep
working as long as users.gs_name matches a REGIONS key exactly.

- New SQL migration: docs/superpowers/migrations/2026-05-04-phase-8-1.sql
  Schema, RLS policies, updated_at trigger, seed instructions.
- New CSS for the email-based login form (auth-input, auth-send,
  auth-status, auth-help).
- Login screen HTML rewritten: PIN pad replaced by email input +
  Send button + status line + help text.
- New auth helpers: getSupabaseAuthClient, showLoginScreen,
  sendMagicLink (60s client-side debounce), fetchUserRow,
  mapAuthUserToCurrentUser, onAuthReady, bootSupabaseAuth.
- Removed: GS_PINS, pinEntry, initLogin, pinPress, updateDots.
- loginAs renamed to finalizeLogin (body unchanged) — called from
  onAuthReady once the public.users row is loaded.
- getActiveGS now reads currentUser.gs_name (was currentUser.name);
  values are identical for the existing seed names but gs_name is
  the proper field.
- logout is now async — calls supabase.auth.signOut() then resets
  state. Auth state listener fires SIGNED_OUT and shows login screen.
- onAuthReady validates: row exists in public.users AND active=true.
  Otherwise toasts an error, signs out, returns to login screen.
- Sanity-check: console.warn if users.gs_name does not match a
  REGIONS key (catches typos at seed time).

No data tables move in 8.1. Activity logs, stopdata, scenarios,
manager config — all stay in localStorage. Sub-phases 8.2-8.4
migrate those one at a time.

Spec: docs/superpowers/specs/2026-05-04-phase-8-1-auth-and-users.md
Plan: docs/superpowers/plans/2026-05-04-phase-8-1-auth-and-users.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push**

```bash
git -C "c:/Users/JasonVega/Desktop/GitHub Clone/roadys-command-center" push origin gs-command-center-workstation
```

---

## Post-ship Runbook (User actions after the code is committed)

The code commit is necessary but not sufficient — Phase 8.1 also needs three Supabase Studio actions and one GitHub Pages config. **Do these in order; the code won't work until all four are done.**

### A. Run the SQL migration

1. Open https://supabase.com/dashboard/project/yyhnnalsqzyghjqtfisy → SQL Editor → New query.
2. Paste the contents of `docs/superpowers/migrations/2026-05-04-phase-8-1.sql`.
3. Run. Expected output: `Success. No rows returned.`
4. Verify: `Database → Tables` should now show a `users` table under the `public` schema.

### B. Create the bootstrap manager auth user

1. Supabase Studio → Authentication → Users → "Add user" → "Create new user."
2. Email: `jasonvega1974@gmail.com`. Auto-confirm: yes (so you can log in without verifying via email first time).
3. After creation, copy the new user's UUID from the row in the Users list.

### C. Insert the matching `public.users` row

In SQL Editor, run (replace the UUID):

```sql
insert into public.users (id, email, full_name, role, gs_name) values
  ('<paste-uuid-from-step-B>',
   'jasonvega1974@gmail.com',
   'Jason Vega',
   'manager',
   null);
```

Expected: `INSERT 0 1`.

### D. Configure GitHub Pages

1. https://github.com/JasonVega1974/roadys-command-center/settings/pages
2. Source: "Deploy from a branch"
3. Branch: `main`, folder: `/ (root)`
4. Save. GitHub builds the site and shows the URL within ~30 seconds: `https://jasonvega1974.github.io/roadys-command-center/`

### E. Configure Supabase Auth URLs

1. Supabase Studio → Authentication → URL Configuration.
2. **Site URL:** `https://jasonvega1974.github.io/roadys-command-center/gs-command-center.html`
3. **Redirect URLs (allowlist):** add the same URL. (Optional: also `http://localhost:8080` for local dev with a static server.)
4. Save.

### F. Smoke test

1. Open `https://jasonvega1974.github.io/roadys-command-center/gs-command-center.html` in a fresh browser → login screen, no PIN pad.
2. Type `jasonvega1974@gmail.com` → click "Send magic link" → status: "Magic link sent — check your email."
3. Open the email → click the link → browser returns to the app → lands on Dashboard, topbar shows "Jason Vega" / "Manager — All Territories", GS selector visible with "All GS (rollup)."
4. Pick a specific GS in the selector → dashboard re-renders.
5. Click Logout → login screen returns.
6. Click the same magic link a second time → fails (single-use). Need to send a fresh one.
7. (After seeding a GS user via the same Steps B+C with `role='gs'` and `gs_name='Logan Resinkin'`) — log in as that GS → no GS selector → dashboard shows that GS's stops only.

If anything fails, the most likely culprits are:
- Step E URL mismatch (the magic-link redirect lands somewhere not in the allowlist).
- Step C UUID mismatch (Step B created an `auth.users` row but Step C inserted a different UUID into `public.users`).
- Step A failure (the migration didn't run cleanly — re-check the SQL Editor output).

---

## Out-of-scope reminders

- **Sub-phases 8.2-8.5** — migrating data tables (stopdata, CRM, scenarios, manager config, cross-app data) to Supabase. Each is its own spec/plan/ship.
- **Self-signup** — no signup UI. Manager provisions all users via Supabase Studio for v1.
- **Google SSO / OTP / password auth** — out of scope. Magic link only.
- **Edit-user UI inside the app** — manager edits via Supabase Studio for v1.
- **Auto-migrating existing localStorage data into Supabase** — stays in localStorage in 8.1; sub-phases handle migration per table.
- **Per-user preferences in DB** — theme, sort state, map mode, manager-selection all stay localStorage (per-browser, not per-user).
