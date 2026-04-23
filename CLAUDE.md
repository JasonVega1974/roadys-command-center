# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Shape

No build system, no package manager, no tests. Every top-level `*.html` file is a self-contained single-page app loaded directly by the browser. Dependencies (Chart.js, XLSX, d3, TopoJSON, Supabase JS) come from CDN `<script>` tags in each file's `<head>`. Deployment is GitHub Pages — pushing to `main` publishes to `https://jasonvega1974.github.io/roadys-command-center/`.

There is nothing to `npm install`, `build`, or `test`. The dev loop is: edit file → open `index.html` in a browser (or use Puppeteer, see below) → commit → push.

## Entry Points

- `index.html` (~14k lines) — the main Command Center. Internal routing: each `pg-*` `<div>` is a page; `nav(pageId, el)` swaps visibility. Sub-app pages (Implementation Portal, CRM, Rewards, Member Directory, etc.) all live inside this one file.
- `implementation.html` — standalone version of the Implementation Portal. Linked from GitHub Pages as a separate URL. **Its logic is duplicated from `index.html#pg-implementation`. Any change to Implementation Portal behavior must be mirrored in both files.** There is no shared module.
- Other `*.html` (`gs-command-center.html`, `vendors.html`, `value-props.html`, `site-visit.html`, `roadys-training-academy.html`) — standalone portals, each self-contained.
- `implementation.html.bak` — not actively used; ignore unless explicitly asked.
- `STRUCTURE.md` — hand-maintained line-by-line map of `index.html`. Use it to locate sections quickly (e.g., "Implementation Portal JS starts at line 10000"). Update it when you move large sections.

## Data Layer

Every sync-enabled feature has three layers, in this order:

1. **In-memory JS globals** (e.g., `implSites`, `CRM_LEADS`, `PROMOTIONS`).
2. **localStorage** — keys like `truckStopPortal_v4` (Implementation), `roadys_crm_*`, `roadys_promotions_v2`. Read on page load, written synchronously on every change.
3. **Supabase cloud** — anon-keyed client from `getRoadysSB()` (defined around `index.html:2580`). URL + anon key are embedded literals (`ROADYS_SB_URL`, `ROADYS_SB_ANON`). Tables: `impl_sites`, `crm_leads`, `promotions`, `vp_enroll`. Writes are debounced ~1500ms (`implFlushToSupabase`), reads happen in `*LoadFromSupabase` on page enter (see `pgImplWithSync`, `pgCRMWithSync`). Realtime subscriptions via `postgres_changes` — note that DELETE events carry the id in `payload.old`, not `payload.new`.

**Non-obvious rules learned from production bugs (do not regress):**

- Create/edit/delete handlers for cloud-synced entities must `await` the Supabase write before closing modals or calling `implRenderAll()`. Firing and forgetting lets a subsequent realtime refresh resurrect the old row. See `implHandleNewSite`, `implHandleEditSite`, `implDeleteSite`, `implSaveSiteToSupabase`, `implDeleteSiteFromSupabase`.
- Do not add "migration" logic to `*LoadFromSupabase` that mutates state and writes back. Stale caches then re-poison the cloud on every page load. If you need to heal malformed data, make it idempotent and narrowly scoped.
- GitHub Pages caches HTML aggressively. Cache-busting meta tags (`Cache-Control`, `Pragma`, `Expires`) are present at the top of the major HTML files but do not guarantee clients see the latest code immediately.

## Styling & Theme

- Dark is default; `body.day-mode` switches to light by redefining the CSS custom properties under `:root`.
- `html{color-scheme:dark}` / `body.day-mode{color-scheme:light}` drives native form-control rendering (notably `<select>` popups). Explicit `select option` styles exist as a fallback.
- Color tokens are `--bg`, `--surface`, `--surface2`, `--border`, `--border2`, `--text`, `--muted`, `--accent`, plus status colors. Use these rather than hex.

## Implementation Portal — Cross-Cutting Details

Task status values: `To Do | In Progress | Done | N/A`. Normalized by `implNormStatus`. CSS variants on `.impl-task-item`: `impl-task-todo | impl-task-progress | impl-task-done | impl-task-na`. `N/A` is excluded from almost all progress totals (retention, per-project, per-site, pipeline) **except** `implGetTeamMetrics`, where N/A is rolled into the Done count so team workload bars stay proportional.

Template data (`IMPL_PROJECT_TYPES`, `IMPL_TEAM`, `IMPL_TEMPLATES`) is declared around `index.html:10038` and again in `implementation.html`. The templates map `projectType → assignee → [task names]`; changes to template assignments should be applied in both files and do not retroactively repair existing site rows.

## Verification Pattern (Puppeteer)

There is no test runner. When you need to exercise the real page logic (DOM, Supabase client, etc.) without a browser UI, write a one-off script under `C:\Users\JasonVega\AppData\Local\Temp\html-debug\` and run it with the user's Node:

```bash
"C:/Users/JasonVega/AppData/Local/nvm/v22.22.2/node.exe" "C:/Users/JasonVega/AppData/Local/Temp/html-debug/<script>.js"
```

Pattern: `puppeteer.launch({ headless: 'new' })` → `page.goto(pathToFileURL(target))` → `page.waitForFunction(() => typeof getRoadysSB === 'function' && getRoadysSB())` → `page.evaluate(async () => { const sb = getRoadysSB(); ... })`. This is how refresh-revert bugs were diagnosed and how Angel task assignments were repaired in the cloud.

## Git Workflow

- Branch: `main`. Pushes auto-deploy to GitHub Pages.
- Commit messages use an imperative title, a "Why" paragraph, and include `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
- Line endings: Git warns about LF→CRLF on Windows; this is expected and harmless.
- `implementation.html.bak` and `STRUCTURE.md` are untracked intentionally in some states — do not add them unless asked.
