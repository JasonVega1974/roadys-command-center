# GS Travel Profiles — Phase 2 (Encrypted Vault) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the master user store loyalty account numbers and Known Traveler / PreCheck numbers against a person's travel profile, encrypted in the browser so the world-readable Supabase table only ever holds ciphertext.

**Architecture:** Envelope encryption. A random AES-GCM data key (DEK) encrypts each profile's secrets into `gs_travel_profiles.sec`. The DEK is wrapped separately under one AES-KW key-encryption key per holder, derived from that holder's passphrase, plus one under a generated recovery code. The wraps live in a single-row `gs_travel_vault` table. Rotating a passphrase re-wraps one row; adding a holder appends a wrap; losing one passphrase does not lose the data.

**Tech Stack:** Vanilla HTML/CSS/JS in one self-contained page (no build step, no framework, no test runner), WebCrypto (PBKDF2-SHA256 → AES-KW → AES-GCM), Supabase JS SDK v2 via CDN with a public anon key, Postgres + RLS.

**Spec:** `docs/superpowers/specs/2026-09-08-gs-travel-profile-design.md` — Phase 2 is §5. Read §5.1–§5.6 before starting. **Four parts of §5 are amended — three by measurement, one by design; see "Spec amendments" below and prefer this plan where they differ.**

## Global Constraints

- **The ciphertext is public.** The anon key is embedded in HTML served from GitHub Pages and RLS here is `using (true)`. Encryption converts the exposure from plaintext to an offline brute-force target. Passphrase strength is the only defence: enforce a **12-character minimum** and say why in the UI.
- **Plaintext secrets never leave memory.** Never write a decrypted value to `localStorage`, never into the `gsp2:profile:*` mirror, never into a trip, never into `#printRoot`.
- **New-table checklist (CLAUDE.md):** the migration MUST, in the same block, `ENABLE ROW LEVEL SECURITY` + explicit `CREATE POLICY` rows + `GRANT` to `anon, authenticated`.
- **No DELETE anywhere in this feature.** `gs_travel_profiles`' anon DELETE was revoked on 2026-09-09 (`sql/2026-09-09-drop-gs-travel-profiles-delete-policy.sql`) — verified live: a delete returns `permission denied for table gs_travel_profiles`. `gs_travel_vault` ships the same way from day one. Removing a holder is an **UPDATE** to the wraps array, never a DELETE.
- **SECURITY DEFINER functions MUST pin** `set search_path = public, pg_temp`.
- **SQL files:** `sql/YYYY-MM-DD-<slug>.sql`, wrapped in `begin; … commit;`, with a commented verification query at the bottom.
- **No local `.js` files.** Everything stays inside `gs-travel-planner.html`; only third-party CDN scripts are external.
- **Crypto code lives in its own sentinel pair** `// ── VAULT_CRYPTO ──` / `// ── /VAULT_CRYPTO ──`, is DOM-free, and touches no page state — so it can be lifted into a standalone harness for testing.
- **Supabase is live and shared, and rows cannot be deleted from the browser.** Prefer testing against `localStorage` mirrors. Any cloud row you must create has to be cleaned up by a human in the SQL Editor, so avoid creating one unless a task explicitly requires it.

## Spec amendments (measured against the real code, 2026-09-09)

These supersede §5 where they differ. The first three were measured against the
shipped code, not assumed; the fourth is a design simplification.

1. **PBKDF2 iterations: 310,000 → 600,000.** §5.2 fixed 310k on the assumption it cost ~0.5s per unlock. Measured in this app: **310k = 44 ms, 600k = 86 ms**. The cost assumption was wrong by an order of magnitude, and iteration count is the *only* defence knob against offline brute force of public ciphertext. 600k is current OWASP guidance for PBKDF2-SHA256 and is still imperceptible for a once-per-session unlock.
2. **Drop the `verifier` field.** §5.2 proposed a stored known-plaintext to validate the passphrase before decrypting. Unnecessary: AES-KW unwrap is authenticated, and a wrong passphrase fails cleanly — measured, `OperationError`. Unlock validates by attempting to unwrap; no extra field, no extra state to keep consistent.
3. **`sec` survives a locked save — verified, and now a required regression test.** Phase 1's `tpSaveFromForm` builds its payload from `gs_name` + `TP_FIELDS` only, so `sec` is absent when someone edits a profile without unlocking. Tested live against the real table: a row written with `sec`, then upserted without it, **kept its `sec` intact** (PostgREST only sets the columns present in the payload). Phase 2's safety depends on this, so Task 4 locks it with a test rather than leaving it as a happy accident.

4. **API shape differs from §5.5, deliberately.** The spec sketched
   `vaultSetup / vaultUnlock / vaultAddHolder / vaultRotate / vaultEncrypt / vaultDecrypt`.
   This plan uses `vaultCreate` and passes `wraps` in and out explicitly rather than
   letting the crypto reach for stored state — that is what keeps the block genuinely
   DOM-free and page-state-free, which §5.5 itself asks for. There is no separate
   `vaultRotate`: re-wrapping under an existing label *is* rotation, so
   `vaultAddHolder('passphrase', newSecret, wraps)` does it, and one code path is easier
   to prove correct than two. `vaultRemoveHolder` is added, with a guard that refuses to
   remove the last wrap.

## Environment facts (verified, not assumed)

- `window.isSecureContext === true` and `crypto.subtle` is available when served over `https://` (GitHub Pages) or `http://localhost`. **Opening the page as a `file://` URL gives no `crypto.subtle`** — the vault must degrade to a clear "unavailable here" message rather than throwing.
- A full envelope round trip works in this app today: random DEK → AES-KW wrap → unwrap → AES-GCM decrypt returned the original plaintext; wrapped key is 40 bytes.
- `gs_travel_profiles` currently contains one leftover row, `__phase2_probe__`, from the measurement above. It cannot be deleted from the browser. **Remove it in the SQL Editor before starting**: `delete from public.gs_travel_profiles where gs_name = '__phase2_probe__';`

## Verification setup (used by every browser step)

There is **no JS test framework in this repo** — no `package.json`, no vitest/jest/playwright. Verification is serving the page and running assertions in the DevTools console, exactly as Phase 1 did.

```bash
cd "<repo root>"
python -m http.server 8899
# open http://localhost:8899/gs-travel-planner.html
```

Stop it with `taskkill //F //IM python.exe` (Windows) or `pkill -f http.server`.

Because the crypto block is DOM-free, Task 2 is additionally testable by copying the block into a scratch harness file and driving it directly — the technique used to isolate `geocode()` during the 2026-09-08 pin investigation.

---

### Task 1: Migration — `gs_travel_vault`

**Files:**
- Create: `sql/2026-09-09-gs-travel-vault.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.gs_travel_vault` with columns `id text pk default 'v1'`, `wraps jsonb not null default '[]'::jsonb`, `kdf jsonb not null`, `created_at timestamptz`, `updated_at timestamptz`. Later tasks read and write these exact names.

- [ ] **Step 1: Write the migration**

```sql
-- gs_travel_vault — envelope-encryption key material for GS travel profiles.
-- Phase 2 of docs/superpowers/specs/2026-09-08-gs-travel-profile-design.md
--
-- Holds ONLY wrapped key material, never a key and never plaintext. Each entry
-- in `wraps` is {label, salt, wrapped}: an AES-KW wrapping of the shared data
-- key (DEK) under a PBKDF2 key derived from one holder's passphrase, or from
-- the printed recovery code. Losing one passphrase therefore does not lose the
-- data, and rotating one re-wraps a single row instead of re-encrypting every
-- profile.
--
-- No DELETE policy and no DELETE/TRUNCATE grant, matching the posture set by
-- sql/2026-09-09-drop-gs-travel-profiles-delete-policy.sql: this project's anon
-- key is public, so browser-initiated destruction stays impossible. Removing a
-- holder is an UPDATE that rewrites `wraps`.

begin;

create table if not exists public.gs_travel_vault (
  id         text primary key default 'v1',
  wraps      jsonb not null default '[]'::jsonb,
  kdf        jsonb not null default '{"name":"PBKDF2","hash":"SHA-256","iterations":600000}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.gs_travel_vault enable row level security;

create policy gs_travel_vault_read
  on public.gs_travel_vault for select using (true);
create policy gs_travel_vault_insert
  on public.gs_travel_vault for insert with check (true);
create policy gs_travel_vault_update
  on public.gs_travel_vault for update using (true) with check (true);
-- Deliberately NO delete policy.

grant select, insert, update on public.gs_travel_vault to anon, authenticated;
-- Supabase's project default privileges grant ALL on new tables in public, so
-- the destructive verbs must be revoked explicitly rather than merely not granted.
revoke delete, truncate on public.gs_travel_vault from anon, authenticated;

create or replace function public.touch_gs_travel_vault_updated_at() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists gs_travel_vault_touch on public.gs_travel_vault;
create trigger gs_travel_vault_touch
  before update on public.gs_travel_vault
  for each row execute function public.touch_gs_travel_vault_updated_at();

commit;

-- ── Verification (run these after the migration) ──────────────────────
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='gs_travel_vault';
--   -- expect rowsecurity = true
--
-- select policyname, cmd from pg_policies
--   where tablename='gs_travel_vault' order by cmd;
--   -- expect exactly 3 rows: INSERT, SELECT, UPDATE  (no DELETE)
--
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name='gs_travel_vault' and grantee in ('anon','authenticated')
--   order by grantee, privilege_type;
--   -- expect INSERT/SELECT/UPDATE for both roles, and NEITHER delete NOR truncate
--
-- select p.proname, p.prosecdef, p.proconfig from pg_proc p
--   join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='touch_gs_travel_vault_updated_at';
--   -- expect prosecdef = true and proconfig containing search_path=public, pg_temp
```

- [ ] **Step 2: Run the migration** in the Supabase SQL Editor. Expected: `COMMIT`, no error.

- [ ] **Step 3: Also remove the leftover probe row** left by the Phase 2 grounding measurements:

```sql
delete from public.gs_travel_profiles where gs_name = '__phase2_probe__';
```

- [ ] **Step 4: Run the four verification queries.** Expected in order: `rowsecurity = true`; **3** policy rows (no DELETE); grants showing INSERT/SELECT/UPDATE and **no delete, no truncate**; one function row with `prosecdef = true` and a pinned `search_path`.

If `delete` or `truncate` appears in the grants result, the `revoke` did not apply — fix before continuing, or the browser can destroy the key material.

- [ ] **Step 5: Commit**

```bash
git add sql/2026-09-09-gs-travel-vault.sql
git commit -m "feat(travel-planner): add gs_travel_vault table for envelope-encrypted secrets"
```

---

### Task 2: `VAULT_CRYPTO` — the crypto core

**Files:**
- Modify: `gs-travel-planner.html` (new sentinel block, placed after `// ── /TRAVEL_PROFILES ──`)

**Interfaces:**
- Consumes: nothing from earlier tasks. DOM-free by contract.
- Produces:
  - `vaultAvailable() -> boolean`
  - `vaultIsUnlocked() -> boolean`
  - `vaultLock() -> void`
  - `vaultNewRecoveryCode() -> string` (e.g. `A7K2M-9PQRS-…`)
  - `async vaultCreate(passphrase) -> {wraps, recoveryCode}`
  - `async vaultUnlock(secret, wraps) -> string|null` (label of the wrap that opened it, or null)
  - `async vaultAddHolder(label, secret, wraps) -> wraps` (requires unlocked)
  - `vaultRemoveHolder(label, wraps) -> wraps`
  - `async vaultEncrypt(obj) -> {v,iv,ct}` (requires unlocked)
  - `async vaultDecrypt(env) -> object|null`
  - `VAULT_MIN_PASSPHRASE = 12`

- [ ] **Step 1: Add the block**

```js
// ── VAULT_CRYPTO ──────────────────────────────────────────────────
// Envelope encryption for travel-profile secrets. DOM-free and page-state-free
// on purpose: this block can be copied into a scratch harness and driven
// directly, which is the only unit-testing this repo has.
//
// A random AES-GCM data key (DEK) encrypts every profile's secrets. The DEK is
// wrapped once per holder under an AES-KW key derived from that holder's
// passphrase, plus once under a printed recovery code. Rotating a passphrase
// re-wraps one entry; it never re-encrypts a profile.
//
// 600k PBKDF2 iterations, not the 310k first specced: measured 310k=44ms and
// 600k=86ms in this app, so the original cost assumption was an order of
// magnitude out, and iteration count is the only defence against offline
// brute force of ciphertext that is public by construction.
const VAULT_KDF_ITER   = 600000;
const VAULT_KDF_HASH   = 'SHA-256';
const VAULT_MIN_PASSPHRASE = 12;

let _vaultDEK = null;   // CryptoKey, memory only — never persisted, gone on reload

const vB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const vBuf = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

function vaultAvailable(){ return !!(window.crypto && window.crypto.subtle && window.isSecureContext) }
function vaultIsUnlocked(){ return !!_vaultDEK }
function vaultLock(){ _vaultDEK = null }

// Crockford-ish alphabet: no I, O, 0 or 1, so a printed code cannot be misread.
function vaultNewRecoveryCode(){
  const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b=crypto.getRandomValues(new Uint8Array(20));
  return [...b].map(x=>A[x%32]).join('').replace(/(.{5})(?=.)/g,'$1-');
}

async function _vaultKEK(secret, saltB64){
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt:vBuf(saltB64), iterations:VAULT_KDF_ITER, hash:VAULT_KDF_HASH},
    km, {name:'AES-KW', length:256}, false, ['wrapKey','unwrapKey']);
}

// The DEK is created and unwrapped as extractable because rotation and
// add-holder must re-wrap it. That is not a weakening: any script that could
// read it already holds it in memory.
async function _vaultWrap(dek, secret){
  const salt = vB64(crypto.getRandomValues(new Uint8Array(16)));
  const kek  = await _vaultKEK(secret, salt);
  return { salt, wrapped: vB64(await crypto.subtle.wrapKey('raw', dek, kek, 'AES-KW')) };
}

async function vaultCreate(passphrase){
  if(String(passphrase||'').length < VAULT_MIN_PASSPHRASE) throw new Error('passphrase too short');
  const dek = await crypto.subtle.generateKey({name:'AES-GCM', length:256}, true, ['encrypt','decrypt']);
  const recoveryCode = vaultNewRecoveryCode();
  const wraps = [
    Object.assign({label:'passphrase'},    await _vaultWrap(dek, passphrase)),
    Object.assign({label:'recovery-code'}, await _vaultWrap(dek, recoveryCode))
  ];
  _vaultDEK = dek;
  return { wraps, recoveryCode };
}

// Tries every wrap. AES-KW is authenticated, so a wrong secret throws rather
// than yielding a bogus key — which is why no separate verifier is stored.
async function vaultUnlock(secret, wraps){
  for(const w of (wraps||[])){
    try{
      const kek = await _vaultKEK(secret, w.salt);
      _vaultDEK = await crypto.subtle.unwrapKey('raw', vBuf(w.wrapped), kek, 'AES-KW',
        {name:'AES-GCM', length:256}, true, ['encrypt','decrypt']);
      return w.label;
    }catch(e){ /* wrong secret for this wrap — try the next */ }
  }
  _vaultDEK = null;
  return null;
}

async function vaultAddHolder(label, secret, wraps){
  if(!_vaultDEK) throw new Error('vault is locked');
  if(String(secret||'').length < VAULT_MIN_PASSPHRASE) throw new Error('passphrase too short');
  const next = (wraps||[]).filter(w => w.label !== label);
  next.push(Object.assign({label}, await _vaultWrap(_vaultDEK, secret)));
  return next;
}

function vaultRemoveHolder(label, wraps){
  const next = (wraps||[]).filter(w => w.label !== label);
  if(!next.length) throw new Error('refusing to remove the last wrap — the data would be unrecoverable');
  return next;
}

async function vaultEncrypt(obj){
  if(!_vaultDEK) throw new Error('vault is locked');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, _vaultDEK,
    new TextEncoder().encode(JSON.stringify(obj)));
  return { v:1, iv:vB64(iv), ct:vB64(ct) };
}

async function vaultDecrypt(env){
  if(!_vaultDEK || !env || !env.ct) return null;
  try{
    const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:vBuf(env.iv)}, _vaultDEK, vBuf(env.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }catch(e){ console.warn('vaultDecrypt: '+e.message); return null; }
}
// ── /VAULT_CRYPTO ─────────────────────────────────────────────────
```

- [ ] **Step 2: Verify the round trip and the failure modes** in the console:

```js
const r={};
r.available = vaultAvailable();
const c = await vaultCreate('correct-horse-battery');
r.wrapsCreated = c.wraps.length;                        // 2: passphrase + recovery-code
r.recoveryFormat = /^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/.test(c.recoveryCode);
const env = await vaultEncrypt({ktn:'123456789', loyalty:[{program:'Delta',number:'DL-42'}]});
r.ciphertextIsNotPlaintext = !/123456789/.test(JSON.stringify(env));
vaultLock();
r.lockedBlocksDecrypt = (await vaultDecrypt(env))===null;
r.wrongPassphrase = (await vaultUnlock('not-the-passphrase', c.wraps))===null;
r.rightPassphrase = (await vaultUnlock('correct-horse-battery', c.wraps))==='passphrase';
r.roundTrip = (await vaultDecrypt(env)).ktn === '123456789';
vaultLock();
r.recoveryCodeOpensIt = (await vaultUnlock(c.recoveryCode, c.wraps))==='recovery-code';
r.recoveredPlaintext = (await vaultDecrypt(env)).loyalty[0].number === 'DL-42';
JSON.stringify(r,null,1)
```

Expected: every value `true`, `wrapsCreated: 2`, and `rightPassphrase`/`recoveryCodeOpensIt` returning their labels.

- [ ] **Step 3: Verify rotation and holder management** — this is the property that makes the design worth its complexity:

```js
const r={};
const c = await vaultCreate('first-passphrase-xx');
const env = await vaultEncrypt({ktn:'AAA111'});
// add a second holder, then confirm BOTH open the same DEK
let wraps = await vaultAddHolder('second-admin','second-passphrase-yy', c.wraps);
r.wrapsAfterAdd = wraps.length;                                  // 3
vaultLock(); r.firstStillWorks  = (await vaultUnlock('first-passphrase-xx', wraps))==='passphrase';
vaultLock(); r.secondWorks      = (await vaultUnlock('second-passphrase-yy', wraps))==='second-admin';
r.sameDEK = (await vaultDecrypt(env)).ktn==='AAA111';            // decrypts data written before the holder existed
// rotate the primary passphrase: re-wrap only, profiles untouched
wraps = await vaultAddHolder('passphrase','rotated-passphrase-zz', wraps);
vaultLock(); r.oldPassphraseDead = (await vaultUnlock('first-passphrase-xx', wraps))===null;
vaultLock(); r.newPassphraseWorks= (await vaultUnlock('rotated-passphrase-zz', wraps))==='passphrase';
r.cipherTextUnchanged = (await vaultDecrypt(env)).ktn==='AAA111';
// removal, and the guard against removing the last one
wraps = vaultRemoveHolder('second-admin', wraps);
r.wrapsAfterRemove = wraps.length;                               // 2
let guarded=false;
try{ vaultRemoveHolder('passphrase', vaultRemoveHolder('recovery-code', wraps)); }catch(e){ guarded=true; }
r.refusesToRemoveLastWrap = guarded;
r.shortPassphraseRejected = await (async()=>{ try{ await vaultCreate('short'); return false; }catch(e){ return true; } })();
JSON.stringify(r,null,1)
```

Expected: `wrapsAfterAdd: 3`, `wrapsAfterRemove: 2`, and every boolean `true`.

- [ ] **Step 4: Confirm the block is DOM-free.** Copy the whole `VAULT_CRYPTO` block into `<scratchpad>/vault-harness.html` inside a bare `<script>` with no other page code, serve it, and re-run Step 2's assertions there. They must all pass with no page present. Report the harness output.

- [ ] **Step 5: Commit**

```bash
git add gs-travel-planner.html
git commit -m "feat(travel-planner): add VAULT_CRYPTO envelope-encryption core"
```

---

### Task 3: Vault setup and unlock UI

**Files:**
- Modify: `gs-travel-planner.html` — `#viewProfiles` container, `TRAVEL_PROFILES_TAB` block

**Interfaces:**
- Consumes: `vaultAvailable`, `vaultCreate`, `vaultUnlock`, `vaultIsUnlocked`, `vaultLock`, `VAULT_MIN_PASSPHRASE` (Task 2); `tpEnsureLib`, `tpClient` (Phase 1).
- Produces: `async tpVaultLoad() -> {wraps,kdf}|null`, `async tpVaultSaveWraps(wraps) -> boolean`, `tpVaultRenderBar()`, `async tpVaultDoSetup()`, `async tpVaultDoUnlock()`, module state `tpVaultRow`.

> **Superseded 2026-09-09 (Task 5).** `tpVaultSaveWraps()` no longer exists.
> It wrote the row unconditionally (an upsert), which was safe only while
> setup was the sole writer. Task 5's rotate / add-holder / remove-holder
> paths are a second writer, so it was replaced by
> `async tpVaultMutateWraps(mutate)` — read the row, compute the new wraps
> from that snapshot, then
> `.update({wraps}).eq('id','v1').eq('updated_at', seen).select()`. An empty
> returned array means another holder changed access first and the write is
> abandoned, never retried. `tpVaultReplaceJustCreated()` was retrofitted
> onto it too, so `tpVaultInsertNew()` is the only remaining write without a
> version predicate — its primary key is its precondition.

- [ ] **Step 1: Add the vault bar markup** at the top of `#viewProfiles`, above the person selector:

```html
<div id="tpVaultBar" class="card" style="margin-bottom:10px">
  <span id="tpVaultState" class="small">Checking vault…</span>
  <button class="hbtn" id="tpVaultBtn" type="button" style="display:none"></button>
  <button class="hbtn" id="tpVaultLockBtn" type="button" style="display:none">🔒 Lock</button>
</div>
```

- [ ] **Step 2: Add the load/save helpers** inside the `TRAVEL_PROFILES_TAB` block:

```js
let tpVaultRow = null;   // {id,wraps,kdf} or null when no vault exists yet
async function tpVaultLoad(){
  try{
    await tpEnsureLib();
    const sb=tpClient(); if(!sb) return null;
    const {data,error}=await sb.from('gs_travel_vault').select('*').eq('id','v1').maybeSingle();
    if(error){ console.warn('tpVaultLoad: '+error.message); return null; }
    tpVaultRow = data || null;
    return tpVaultRow;
  }catch(e){ console.warn('tpVaultLoad: '+e.message); return null; }
}
// SUPERSEDED 2026-09-09 by Task 5 — removed in favour of the conditional
// tpVaultMutateWraps(). This unconditional upsert would silently drop a
// concurrent holder's wrap, and there is no escrow. Kept here only to show
// what the plan originally called for.
async function tpVaultSaveWraps(wraps){
  try{
    await tpEnsureLib();
    const sb=tpClient(); if(!sb) return false;
    const {error}=await sb.from('gs_travel_vault')
      .upsert({id:'v1', wraps}, {onConflict:'id'});
    if(error){ console.warn('tpVaultSaveWraps: '+error.message); return false; }
    tpVaultRow = Object.assign({}, tpVaultRow||{id:'v1'}, {wraps});
    return true;
  }catch(e){ console.warn('tpVaultSaveWraps: '+e.message); return false; }
}
```

- [ ] **Step 3: Add the bar renderer and the two actions**

```js
function tpVaultRenderBar(){
  const s=$('tpVaultState'), b=$('tpVaultBtn'), l=$('tpVaultLockBtn');
  if(!vaultAvailable()){
    s.innerHTML='🔒 Encrypted fields need a secure page — open this over https, not as a local file.';
    b.style.display='none'; l.style.display='none'; return;
  }
  if(!tpVaultRow){
    s.innerHTML='No vault yet. Account numbers stay hidden until one is set up.';
    b.textContent='Set up vault'; b.style.display=''; l.style.display='none';
  } else if(!vaultIsUnlocked()){
    s.innerHTML='🔒 Vault locked — account numbers are hidden.';
    b.textContent='Unlock'; b.style.display=''; l.style.display='none';
  } else {
    s.innerHTML='🔓 Vault unlocked for this tab. It re-locks when you reload.';
    b.style.display='none'; l.style.display='';
  }
}
async function tpVaultDoSetup(){
  const p1=prompt(`Choose a vault passphrase (at least ${VAULT_MIN_PASSPHRASE} characters).\n\nIt is never sent anywhere and cannot be recovered — store it in the company password manager.`);
  if(p1===null) return;
  if(String(p1).length < VAULT_MIN_PASSPHRASE){ toast(`Passphrase must be at least ${VAULT_MIN_PASSPHRASE} characters`); return; }
  const p2=prompt('Type the same passphrase again to confirm.');
  if(p2===null) return;
  if(p1!==p2){ toast('Those did not match — nothing was set up'); return; }
  const {wraps, recoveryCode} = await vaultCreate(p1);
  const ok = await tpVaultSaveWraps(wraps);
  if(!ok){ vaultLock(); toast('⚠ Could not save the vault — nothing was changed'); return; }
  const ack = prompt(
    'RECOVERY CODE — shown once, right now:\n\n' + recoveryCode +
    '\n\nStore this in the company password manager alongside the passphrase, with at least two people able to reach it. Without one of them these numbers cannot be recovered.\n\n' +
    'Type STORED to confirm you have saved it.');
  if(ack!=='STORED') toast('⚠ Vault created, but you did not confirm storing the recovery code — save it now, it will not be shown again',9000);
  else toast('🔓 Vault ready');
  tpVaultRenderBar(); await tpRenderTab();
}
async function tpVaultDoUnlock(){
  const s=prompt('Enter the vault passphrase, or the recovery code.');
  if(s===null) return;
  const label = await vaultUnlock(s, (tpVaultRow||{}).wraps);
  if(!label){ toast('That passphrase or code did not open the vault'); return; }
  toast(label==='recovery-code' ? '🔓 Unlocked with the recovery code — consider rotating the passphrase' : '🔓 Vault unlocked');
  tpVaultRenderBar(); await tpRenderTab();
}
```

- [ ] **Step 4: Wire the buttons and load the vault** where Phase 1's other bindings run:

```js
$('tpVaultBtn').onclick    = ()=> tpVaultRow ? tpVaultDoUnlock() : tpVaultDoSetup();
$('tpVaultLockBtn').onclick= ()=>{ vaultLock(); tpVaultRenderBar(); tpRenderTab(); toast('🔒 Vault locked'); };
```

and call `await tpVaultLoad(); tpVaultRenderBar();` at the start of `tpRenderTab()`, **after** its synchronous local render so a slow or failed vault fetch cannot delay the person list (Phase 1 measured `tpFetchAll` taking ~9.6s to fail; the same discipline applies here).

- [ ] **Step 5: Verify in the browser**

```js
const r={};
r.barExists = !!document.getElementById('tpVaultBar');
r.availableReported = vaultAvailable();
tpVaultRow=null; vaultLock(); tpVaultRenderBar();
r.noVaultState = /No vault yet/.test($('tpVaultState').textContent) && $('tpVaultBtn').textContent==='Set up vault';
tpVaultRow={id:'v1',wraps:[]}; tpVaultRenderBar();
r.lockedState = /locked/.test($('tpVaultState').textContent) && $('tpVaultBtn').textContent==='Unlock';
await vaultCreate('a-test-passphrase-123');
tpVaultRenderBar();
r.unlockedState = /unlocked/.test($('tpVaultState').textContent) && $('tpVaultLockBtn').style.display==='';
vaultLock(); tpVaultRenderBar();
r.lockButtonHidesWhenLocked = $('tpVaultLockBtn').style.display==='none';
JSON.stringify(r,null,1)
```

Expected: all `true`.

- [ ] **Step 6: Verify the person list is not delayed by a slow vault fetch.** Stub `window.fetch` to reject, open the Travel Profiles tab, and confirm `#tpPerson` is populated in well under a second and the bar shows a sensible state rather than "Checking vault…" forever. Restore `window.fetch`.

- [ ] **Step 7: Commit**

```bash
git add gs-travel-planner.html
git commit -m "feat(travel-planner): vault setup and unlock UI with recovery code"
```

---

### Task 4: Sensitive fields on the profile form

**Files:**
- Modify: `gs-travel-planner.html` — `#viewProfiles` form, `tpLoadInto`, `tpSaveFromForm`, `tpWireDirtyTracking`

**Interfaces:**
- Consumes: `vaultIsUnlocked`, `vaultEncrypt`, `vaultDecrypt` (Task 2); `tpVaultRow`, `tpVaultRenderBar` (Task 3); `tpDirty`, `tpLoadInto`, `tpSaveFromForm`, `tpSave`, `TP_FIELDS` (Phase 1).
- Produces: `tpSecFromForm() -> object`, `async tpSecIntoForm(profile)`, `TP_SEC_IDS` (array of the sensitive input ids).

- [ ] **Step 1: Add the sensitive block markup** below the existing notes field inside `#viewProfiles`:

```html
<div id="tpSecBox" style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px">
  <label class="f">Account numbers <span class="small">(encrypted — only readable with the vault unlocked)</span></label>
  <div id="tpSecLocked" class="small">🔒 Unlock the vault to view or edit account numbers.</div>
  <div id="tpSecFields" style="display:none">
    <div class="grid2">
      <div><label class="f">Known Traveler / PreCheck number</label><input id="tp_sec_ktn" autocomplete="off"></div>
      <div><label class="f">Global Entry number</label><input id="tp_sec_ge" autocomplete="off"></div>
    </div>
    <label class="f">Loyalty accounts — one per line, as <code>Program: number</code></label>
    <textarea id="tp_sec_loyalty" rows="3" autocomplete="off" placeholder="Delta SkyMiles: 1234567890"></textarea>
  </div>
</div>
```

- [ ] **Step 2: Add the marshalling helpers** inside `TRAVEL_PROFILES_TAB`:

```js
const TP_SEC_IDS = ['tp_sec_ktn','tp_sec_ge','tp_sec_loyalty'];
function tpSecFromForm(){
  const loyalty = $('tp_sec_loyalty').value.split('\n').map(l=>l.trim()).filter(Boolean).map(line=>{
    const i=line.indexOf(':');
    return i<0 ? {program:'', number:line} : {program:line.slice(0,i).trim(), number:line.slice(i+1).trim()};
  });
  return { ktn:$('tp_sec_ktn').value.trim(), globalEntry:$('tp_sec_ge').value.trim(), loyalty };
}
function tpSecClearForm(){ TP_SEC_IDS.forEach(id=>{ $(id).value=''; }); }
async function tpSecIntoForm(profile){
  const locked=$('tpSecLocked'), fields=$('tpSecFields');
  tpSecClearForm();
  if(!vaultIsUnlocked()){ locked.style.display=''; fields.style.display='none'; return; }
  locked.style.display='none'; fields.style.display='';
  const s = (profile && profile.sec) ? await vaultDecrypt(profile.sec) : null;
  if(!s) return;
  $('tp_sec_ktn').value = s.ktn||'';
  $('tp_sec_ge').value  = s.globalEntry||'';
  $('tp_sec_loyalty').value = (s.loyalty||[]).map(x=>`${x.program?x.program+': ':''}${x.number}`).join('\n');
}
```

- [ ] **Step 3: Call it from `tpLoadInto`.** At the end of `tpLoadInto(name)`, after the existing `TP_FIELDS` loop and stamp line, add:

```js
  tpSecIntoForm(p);   // async on purpose: never block the plain fields on a decrypt
```

- [ ] **Step 4: Write `sec` on save, and never clobber it when locked.** In `tpSaveFromForm()`, after `row.home_airport=(row.home_airport||'').toUpperCase();` and before `const ok=await tpSave(row);`, add:

```js
  // Only touch `sec` when the vault is open. With it locked, `sec` is simply
  // absent from the payload and PostgREST leaves the stored ciphertext alone
  // (verified against the live table) — so editing someone's hotel preference
  // without the passphrase can never destroy their account numbers.
  if(vaultIsUnlocked()){
    const s = tpSecFromForm();
    const empty = !s.ktn && !s.globalEntry && !s.loyalty.length;
    row.sec = empty ? null : await vaultEncrypt(s);
  }
```

- [ ] **Step 5: Include the sensitive inputs in dirty tracking.** In `tpWireDirtyTracking()`, extend the loop so `TP_SEC_IDS` also set `tpDirty=true` on `input`. Without this, the async cloud refresh would clobber half-typed account numbers exactly as it once clobbered the plain fields.

- [ ] **Step 6: Verify the locked/unlocked behaviour** (mirrors only, no cloud row):

```js
const r={};
const c=await vaultCreate('a-test-passphrase-123');
const enc=await vaultEncrypt({ktn:'KTN-999',globalEntry:'',loyalty:[{program:'Delta',number:'DL-7'}]});
// unlocked: fields visible and populated
await tpSecIntoForm({gs_name:'X', sec:enc});
r.fieldsVisible = $('tpSecFields').style.display==='' && $('tpSecLocked').style.display==='none';
r.ktnShown = $('tp_sec_ktn').value==='KTN-999';
r.loyaltyShown = $('tp_sec_loyalty').value==='Delta: DL-7';
r.roundTripsBack = JSON.stringify(tpSecFromForm().loyalty)===JSON.stringify([{program:'Delta',number:'DL-7'}]);
// locked: fields hidden, values cleared from the DOM
vaultLock();
await tpSecIntoForm({gs_name:'X', sec:enc});
r.hiddenWhenLocked = $('tpSecFields').style.display==='none' && $('tpSecLocked').style.display==='';
r.domCleared = $('tp_sec_ktn').value==='' && $('tp_sec_loyalty').value==='';
JSON.stringify(r,null,1)
```

Expected: all `true`. `domCleared` is the important one — a locked vault must not leave plaintext sitting in an input.

- [ ] **Step 7: Verify the no-clobber regression against the live table.** This is the single most consequential assertion in Phase 2, and it needs one real row. Create it, assert, and then **ask a human to remove it in the SQL Editor** — the browser cannot delete.

```js
const sb=tpClient(); const N='__vault_probe__';
const c=await vaultCreate('a-test-passphrase-123');
const enc=await vaultEncrypt({ktn:'KTN-KEEPME'});
await sb.from('gs_travel_profiles').upsert({gs_name:N, sec:enc},{onConflict:'gs_name'});
vaultLock();                                   // now simulate a locked-vault save
const row={gs_name:N}; TP_FIELDS.forEach(f=>{ row[f] = f.startsWith('has_')?false:'edited'; });
await tpSave(row);
const back=await sb.from('gs_travel_profiles').select('sec,hotel_brand').eq('gs_name',N).single();
await vaultUnlock('a-test-passphrase-123', c.wraps);
JSON.stringify({
  plainFieldWasUpdated: back.data.hotel_brand==='edited',
  secSurvivedLockedSave: !!back.data.sec,
  secStillDecrypts: (await vaultDecrypt(back.data.sec)||{}).ktn==='KTN-KEEPME'
},null,1)
```

Expected: all three `true`. Report the result, then tell the human to run:
`delete from public.gs_travel_profiles where gs_name = '__vault_probe__';`

- [ ] **Step 8: Confirm no plaintext reaches storage or the packet.** With the vault unlocked and a profile loaded, run:

```js
let leak=false;
for(let i=0;i<localStorage.length;i++){ if(/KTN-|SkyMiles|KEEPME/i.test(localStorage.getItem(localStorage.key(i))||'')) leak=true; }
const dest=state.sameEnd?state.origin:state.dest;
if(state.route){ buildPrint(state.route.ordered.map(u=>state.stops.find(s=>s.uid===u)).filter(Boolean), dest); }
JSON.stringify({ noPlaintextInLocalStorage:!leak,
  noPlaintextInPacket: !/KTN-|SkyMiles|KEEPME/i.test(document.getElementById('printRoot').innerHTML) })
```

Expected: both `true`.

- [ ] **Step 9: Commit**

```bash
git add gs-travel-planner.html
git commit -m "feat(travel-planner): encrypted account-number fields on the profile form"
```

---

### Task 5: Rotation, holders, and documentation

**Files:**
- Modify: `gs-travel-planner.html` — `TRAVEL_PROFILES_TAB` block, `#tpVaultBar`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-08-gs-travel-profile-design.md`

**Interfaces:**
- Consumes: `vaultAddHolder`, `vaultRemoveHolder`, `vaultIsUnlocked`, `VAULT_MIN_PASSPHRASE` (Task 2); `tpVaultRow`, `tpVaultSaveWraps`, `tpVaultRenderBar` (Task 3).
- Produces: `async tpVaultRotate()`, `async tpVaultAddHolder()`, `async tpVaultRemoveHolder()`.

> **Superseded 2026-09-09 (Task 5).** `tpVaultSaveWraps()` no longer exists —
> see the note under Task 3's Produces line. All three actions below consume
> `tpVaultMutateWraps(mutate)` instead, which reads the row, computes the new
> wraps from *that* snapshot and writes with
> `.eq('updated_at', seen).select()`. An empty returned array means another
> holder changed access first; the write is abandoned and reported, never
> retried. The unconditional upsert shown here would silently drop that
> holder's wrap, and there is no escrow.

- [ ] **Step 1: Add a manage button** to `#tpVaultBar`, shown only when unlocked:

```html
<button class="hbtn" id="tpVaultManageBtn" type="button" style="display:none">Manage access</button>
```

Show it alongside `#tpVaultLockBtn` in the unlocked branch of `tpVaultRenderBar()`, and hide it in the other two branches.

- [ ] **Step 2: Add the three actions**

```js
// SUPERSEDED 2026-09-09 by Task 5 — every `tpVaultSaveWraps(wraps)` below was
// replaced by a `tpVaultMutateWraps(...)` call with a version predicate, and
// the toasts were rewritten to stop claiming "nothing changed" without first
// confirming it. Kept here only to show what the plan originally called for.
async function tpVaultRotate(){
  if(!vaultIsUnlocked()){ toast('Unlock the vault first'); return; }
  const p1=prompt(`New passphrase (at least ${VAULT_MIN_PASSPHRASE} characters).`);
  if(p1===null) return;
  if(String(p1).length < VAULT_MIN_PASSPHRASE){ toast(`Passphrase must be at least ${VAULT_MIN_PASSPHRASE} characters`); return; }
  if(prompt('Type it again to confirm.')!==p1){ toast('Those did not match — nothing was changed'); return; }
  const wraps = await vaultAddHolder('passphrase', p1, (tpVaultRow||{}).wraps);
  // SUPERSEDED — now tpVaultMutateWraps(seen => vaultAddHolder('passphrase', p1, seen))
  toast(await tpVaultSaveWraps(wraps)
    ? '🔑 Passphrase rotated — profiles were not re-encrypted, only the key wrap changed'
    : '⚠ Could not save — the old passphrase is still in force');
}
async function tpVaultAddHolder(){
  if(!vaultIsUnlocked()){ toast('Unlock the vault first'); return; }
  const label=(prompt('Name for the second holder (e.g. "ops-manager"):')||'').trim();
  if(!label) return;
  if(label==='recovery-code'){ toast('That name is reserved'); return; }
  const p=prompt(`Passphrase for ${label} (at least ${VAULT_MIN_PASSPHRASE} characters).`);
  if(p===null) return;
  if(String(p).length < VAULT_MIN_PASSPHRASE){ toast(`Passphrase must be at least ${VAULT_MIN_PASSPHRASE} characters`); return; }
  const wraps = await vaultAddHolder(label, p, (tpVaultRow||{}).wraps);
  // SUPERSEDED — now tpVaultMutateWraps(seen => vaultAddHolder(label, p, seen))
  toast(await tpVaultSaveWraps(wraps) ? `🔑 ${label} can now unlock the vault` : '⚠ Could not save — nothing changed');
}
async function tpVaultRemoveHolder(){
  if(!vaultIsUnlocked()){ toast('Unlock the vault first'); return; }
  const labels=((tpVaultRow||{}).wraps||[]).map(w=>w.label);
  const label=(prompt('Remove which holder?\n\nCurrent: '+labels.join(', '))||'').trim();
  if(!label) return;
  let wraps;
  try{ wraps = vaultRemoveHolder(label, (tpVaultRow||{}).wraps); }
  catch(e){ toast('⚠ '+e.message, 7000); return; }
  // SUPERSEDED — now tpVaultMutateWraps(seen => vaultRemoveHolder(label, seen))
  toast(await tpVaultSaveWraps(wraps) ? `🔑 ${label} can no longer unlock the vault` : '⚠ Could not save — nothing changed');
}
```

- [ ] **Step 3: Wire the manage button** to a small chooser:

```js
$('tpVaultManageBtn').onclick = ()=>{
  const c=(prompt('Manage vault access:\n\n1 — rotate the passphrase\n2 — add another holder\n3 — remove a holder\n\nType 1, 2 or 3.')||'').trim();
  if(c==='1') tpVaultRotate(); else if(c==='2') tpVaultAddHolder(); else if(c==='3') tpVaultRemoveHolder();
};
```

- [ ] **Step 4: Verify rotation does not disturb stored ciphertext** (mirrors only, no cloud row):

```js
const r={};
const c=await vaultCreate('original-passphrase-1');
const enc=await vaultEncrypt({ktn:'ROT-TEST'});
const before=JSON.stringify(enc);
tpVaultRow={id:'v1',wraps:c.wraps};
let wraps=await vaultAddHolder('passphrase','rotated-passphrase-2', tpVaultRow.wraps);
tpVaultRow.wraps=wraps;
vaultLock();
r.oldDead = (await vaultUnlock('original-passphrase-1', wraps))===null;
r.newWorks= (await vaultUnlock('rotated-passphrase-2', wraps))==='passphrase';
r.ciphertextUntouched = JSON.stringify(enc)===before;
r.stillDecrypts = (await vaultDecrypt(enc)).ktn==='ROT-TEST';
vaultLock();
r.recoveryStillWorks = (await vaultUnlock(c.recoveryCode, wraps))==='recovery-code';
JSON.stringify(r,null,1)
```

Expected: all `true`. `ciphertextUntouched` plus `stillDecrypts` together are the proof that rotation re-wraps rather than re-encrypts.

- [ ] **Step 5: Update `CLAUDE.md`.** Add `gs_travel_vault` to "Tables today" with a one-line note that it holds wrapped key material only, has no DELETE policy or grant, and that removing a holder is an UPDATE. Extend the `gs-travel-planner.html` bullet to say account numbers are client-side encrypted and that the passphrase and recovery code belong in the company password manager with at least two people holding access. Keep the file's existing terse voice.

- [ ] **Step 6: Update the spec** to record the three amendments this plan made — 600k iterations with the measured timings, the dropped `verifier`, and the verified `sec`-preservation behaviour — so §5 stops disagreeing with the shipped code. Mark them as revised 2026-09-09.

- [ ] **Step 7: Commit**

```bash
git add gs-travel-planner.html CLAUDE.md docs/superpowers/specs/2026-09-08-gs-travel-profile-design.md
git commit -m "feat(travel-planner): vault rotation, holder management and docs"
```

---

## Final verification (after all tasks)

- [ ] `vaultAvailable()` returns false and the bar explains itself when the page is opened as `file://` — no thrown error.
- [ ] With the vault locked, the Travel Profiles tab is fully usable for non-sensitive fields, and saving does not disturb any stored `sec`.
- [ ] No `__vault_probe__` or `__phase2_probe__` rows remain:
  `select gs_name from public.gs_travel_profiles order by gs_name;`
- [ ] `select id, jsonb_array_length(wraps) from public.gs_travel_vault;` shows the expected holder count, and no plaintext appears anywhere in the row.
- [ ] CLAUDE.md map regression guard still passes (add / reorder / remove change the map signature; a notes edit does not).
- [ ] Push, then confirm the deployed file changed — GitHub Pages takes ~40s plus a `max-age=600` CDN cache.

## Notes for the implementer

- **The passphrase and recovery code must go in the company password manager, with at least two people able to reach it.** Spec §5.4 makes this normative, not advisory: the envelope design removes every recovery failure mode except "all wraps lost", and this operational step is the only thing preventing that one.
- Never persist a decrypted value. If you find yourself writing one into `tpWriteMirror`, a trip, or the print packet, stop — that defeats the whole feature.
- The vault is global, not per-person: one DEK protects every profile's secrets.
