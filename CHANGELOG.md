# Changelog

All notable changes to Koin are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While Koin is a local proof-of-concept, versions stay in the `0.x` range and a minor
bump (`0.N.0`) marks a user-visible feature increment.

This changelog is the *past* (what shipped); [ROADMAP.md](ROADMAP.md) is the *future*
(what's planned). Keep them in sync: when a roadmap item ships, move it here.

## [Unreleased]

_Nothing yet._

## [0.7.0] — 2026-08-16

The release that took Koin from a local script to a published app: it's now **hosted,
installable, and open source**, with a lot of work on making sure your data can't quietly go
missing.

### Added
- **Koin is deployed to the web.** A GitHub Actions workflow builds the app and publishes it to
  GitHub Pages on every push to `main` (typecheck and tests must pass first). Being a hosted
  copy changes nothing about privacy: there's still no server or account, and your data stays
  in your own browser.
- **Toasts with an action (e.g. the "Undo" after learning a category) now have a close (×)
  button**, so you can dismiss the message immediately — keeping the change — instead of
  waiting for it to fade or being nudged toward Undo.
- **Link a backup file on your disk (auto-saves).** In Chrome/Edge (and other Chromium
  browsers) you can now point Koin at a file on your hard drive via the ⋯ menu → **Link backup
  file**. Koin then rewrites your full data to that file automatically after every change, so
  the file on disk is always current. If your browser clears its storage, crashes, or you
  switch browser or computer, your data is safe in that file — just reopen Koin and **Restore**
  it. The file is identical to a manual export, so the two are interchangeable. Browsers
  without the File System Access API (Firefox, Safari) don't show the option and keep using
  manual **Export backup**. (Browsers usually re-ask permission to write the file once per
  session — click **Reconnect backup file** in the ⋯ menu to resume.)
- **Safer backup restore, and a heads-up about your storage.** Restoring a backup now (1)
  **downloads a safety copy** of your current data and **asks you to confirm** before it
  replaces anything — one mis-click can no longer wipe your data with no undo; (2) is
  **atomic and honest** — the whole dataset is written in one all-or-nothing step and Koin
  only reports "restored" once it has genuinely saved (a mid-restore failure, e.g. full
  storage, now rolls back and tells you, instead of reloading onto half-saved data). The ⋯
  menu shows whether your browser storage is **protected** (persistent) or **best-effort**
  (can be evicted — Koin asks the browser to make it persistent on startup). If you have data
  and haven't exported in a while, Koin gently nudges you to back up.
- **Koin is now an installable, offline app (PWA).** Phase 1 Step 5: on a built/deployed copy
  you can **install Koin** to your home screen or desktop — it gets its own icon and opens in
  its own window, no browser chrome — and it **works fully offline** after the first visit (a
  service worker caches the app; your data is already local). Adds a web manifest, a Workbox
  service worker (`vite-plugin-pwa`), and a ◎-coin icon set. Offline/install applies to the
  production build, not `npm run dev`. _(Try it with `npm run build && npm run preview`.)_
- **Backup restore now validates the file's structure** before importing, so a corrupt or
  hand-edited backup (e.g. `transactions` that isn't a list) is rejected with a clear message
  instead of silently poisoning your data. Matters now that backups can travel between people.
- **Continuous integration** (GitHub Actions): typecheck + tests + build run on every push/PR.

### Changed
- **Restore now replaces your whole dataset instead of merging into it.** A backup that omits
  a section (e.g. no manual transactions) resets that section rather than leaving stale rows
  mixed in with the restored ones — so "restore" reliably means "make my data match this file."
- **Backups can no longer be restored from a newer version of Koin.** A backup whose schema
  version is ahead of the running app is rejected with a clear message (Koin doesn't run
  migration code), instead of being silently mis-read.
- **Storage moved to IndexedDB.** Phase 1 Step 4: Koin now persists to the browser's
  IndexedDB instead of localStorage, lifting the old ~5–10 MB cap to hundreds of MB / GBs —
  room for years of statements — and writing off the main thread. localStorage stays as an
  automatic fallback (very old browsers, some private-browsing modes). **Your existing data
  is copied over automatically the first time you open this version** — no re-import needed.
  Implemented as a ~40-line native KV wrapper (`src/store/idb.ts`), **no new dependencies**;
  the `store` seam means no UI/core code changed. The retired `node server.cjs` shared-file
  backend (`~/.koin/koin-data.json`) is removed — if you were still on it, **Import** your CSV
  again or **Restore** a backup.
- **The whole UI is now TypeScript.** Phase 1 Step 3b: `app.js` (≈870 lines) was split into
  focused, typed `src/ui/*` modules — `app` (composition root), `state`, `render-sections`,
  `render-bus`, `table`, `rules-editor`, plus `dom`/`modal`/`toast`/`backup`/`charts`. No
  global namespace; feature modules re-render via a small `render-bus` indirection. Behavior
  unchanged.
- Compiled rule regexes are now cached (compile-once), since `rules.apply()` runs on every
  edit against every transaction.

### Fixed
- **"Load the sample data" now works in a built/deployed copy.** The sample CSVs live in
  `data/`, which Vite doesn't copy into the build, so the button silently failed anywhere
  outside `npm run dev`. They're now emitted into the build (and precached, so the sample
  loads offline too).
- **A failed save no longer disappears silently.** If the browser's storage is full
  (`QuotaExceededError`), Koin now shows a toast prompting you to export a backup, instead of
  logging to the console while the UI pretends the write succeeded.
- **Ignoring a manual transaction now waits for the save.** `toggleIgnore` awaits its store
  write like every other edit, so a failed save is caught before the UI shows it as done.
- **A corrupt CSV date can't create a phantom month.** An out-of-range date like `45/13/2026`
  is now rejected on import (the row is skipped) instead of producing a bogus `2026-13` bucket
  in the dashboard and period picker.
- **Dropping to fallback storage is no longer silent.** If the browser can't open IndexedDB and
  Koin falls back to lower-capacity localStorage, it now warns you (with an Export shortcut)
  instead of quietly operating under a much smaller storage limit.

### Security
- **The deployed app now ships a Content-Security-Policy.** The browser is told to run only
  Koin's own scripts (no inline scripts, no `eval`) and to allow network connections only back
  to Koin's own origin — so even if hostile content reached the page, it couldn't load an
  attacker's code or send your financial data anywhere. Applied to production builds only, so
  local development is unaffected.
- Removed the `html`/`innerHTML` escape hatch from the `h()` DOM helper (it had no callers) so
  a future change can't accidentally introduce XSS; all text goes through escaped text nodes.
- **Guard against a rule regex freezing the page (ReDoS).** A pathological pattern like `(a+)+`
  could hang the tab on every recategorize — and, once backups are shared, arrive inside someone
  else's file. Koin now rejects such patterns when you save them in the Rules editor (with a
  clear message) and neutralizes them at run time, so a rule can never lock up the app.
- **Backup restore now validates transaction fields, not just structure.** A hand-edited or
  shared backup with e.g. a non-numeric `amount` or bad `direction` is rejected with a clear
  message instead of writing `NaN` into your data and corrupting every total.

### Changed (earlier Phase 1 migration steps)
- **Removed the global `Koin` namespace; the app is now a real ES-module graph.** Phase 1
  Step 3a: `store`, `categories`, and `charts` are typed modules (`src/store/`, `src/core/`,
  `src/ui/`); `app.js` is now a plain ES module that imports the core/store/charts directly
  instead of reaching for a global, and the back-compat bridge is gone. A jsdom integration
  test seeds data and asserts the dashboard renders. Behavior is unchanged. (Typing + the
  `app.js` → `ui/*` split is Step 3b.)
- **Ported the pure core to TypeScript.** Phase 1 Step 2: `parser`, `rules`, `insights`, and
  the seed `defaults` are now typed ES modules under `src/core/` (with a shared `types.ts`
  for the transaction model), and the test suite is fully migrated to **Vitest**
  (`test/core.test.ts`). Behavior is unchanged — the modules still register on the global
  `Koin` namespace for the not-yet-ported UI, which Step 3 removes. The old Node test runner
  (`test/run.cjs`) is retired in favour of `npm test`.
- **Adopted a build step (Vite + TypeScript + Vitest).** Phase 1 Step 1 of the
  [architecture plan](docs/ARCHITECTURE.md): the app is now served/bundled by Vite and run
  with `npm run dev` / `npm run build` (Node 18+), TypeScript is being adopted module by
  module, and tests run under Vitest (with a jsdom boot smoke test) alongside the original
  Node runner during the migration. **No app logic changed** — the existing scripts are
  loaded via a single module entry (`src/main.ts`). The old `node server.js` file-backend
  mode is superseded by the Vite dev server; data is per-browser (localStorage) until the
  IndexedDB/cloud steps land — re-import your CSV or restore a backup if upgrading.

### Added
- **Add & edit categories in the UI.** The Rules modal now has a friendly **Categories**
  manager: rename any category, pick its colour with a swatch, set an emoji icon, and
  **＋ Add category** for new ones — all applied everywhere immediately (donut, legend,
  filter, and every row's dropdown). A category's internal **key is immutable** (it's the
  id your transactions, rules, and overrides reference), so renaming never loses anything;
  the fixed key is shown, greyed, on each row. A brand-new category's key is derived from
  its name and re-derived on rename only while it's still unused, then frozen. New pure
  helper module `js/categories.js` (key slugification + colour validation) with tests; the
  raw-JSON categories editor is replaced by this list (Advanced now holds rules only).
- **Import a second bank's CSV format.** The importer now auto-detects the CSV layout
  and supports two banks: the original `Date, Description, Credit, Debit, Balance` and a
  more detailed export (`Transaction Date, Details, …, Debit, Credit, Balance, Original
  Description`) with `DD Mon YYYY` dates and a positive-Debit convention. Only the
  relevant columns are read — the second bank's own category/account/tags columns are
  ignored so Koin categorizes both banks consistently. Layouts are defined as small
  "format profiles" in `js/parser.js`, so adding a third bank later is one profile, not a
  new parser.
- **Edit any transaction's fields in the UI.** The edit (✏️) action now works on bank
  (imported) transactions too — change date, merchant, amount, direction, category, or
  description. Bank-row edits are stored as **non-destructive overrides** layered on the
  pristine import, so they survive reloads and re-imports (no duplicates) and can be
  reverted with **Reset to imported values**. Edited bank rows show an "edited" badge.
- **Learned-rules manager in the Rules editor.** A friendly list of learned
  (merchant → category) rules at the top of the Rules modal: see each one, change its
  category from a dropdown, or delete it (with Undo) — all taking effect immediately.
  Learned rules are now shown only in this list; the raw JSON editor holds just the
  hand-written rules + ignore patterns and is tucked into a collapsible "Advanced" section.
- **`KOIN_DATA_DIR` env override** in `server.js` — point the data file somewhere other than
  `~/.koin` (used to keep automated/test runs away from real data). The project's
  `.claude/settings.json` + `.claude/hooks/` use it to route Claude-launched servers to a
  sandbox, and add a PreToolUse hook + Write/Edit deny rules that block tooling from
  touching `~/.koin`.

### Changed
- **Sanitized for public release.** Replaced the sample statement with synthetic demo data
  (fake merchants and people) and generalized the seed categorization rules to well-known
  brands + common keywords only — no personal merchants. Scrubbed personal references from
  docs and tests. Added a `.gitignore` that excludes real statements (any `data/*.csv`
  except the sample) and app backups. _(Your own saved data is unaffected — it lives in
  your browser / `~/.koin`, not in the repo.)_

### Fixed
- **Stale tabs can no longer silently clobber your data.** The file backend now guards
  against accidental overwrites: `server.js` rejects (HTTP 409) any save that would shrink
  a non-empty dataset to under half its size, unless explicitly forced; the client only
  sends the tab-close `pagehide` beacon when it has *unsaved edits* (so merely viewing and
  closing a tab can't overwrite); and a rejected save surfaces a "newer data on disk —
  reload" toast. Intentional bulk ops (restore backup, reset) force-write past the guard.

## [0.6.0] — 2026-05-31

### Added
- **Cross-browser persistence via a local helper.** New `server.js` (zero-dependency Node)
  serves the app and a file-backed data API (`GET/PUT /api/data`) storing everything in a
  single JSON file at `~/.koin/koin-data.json`. Run with `node server.js`; every browser on
  the machine then shares the same data. No database, nothing stored in the project folder.
- `store.js` gained a second backend behind the same interface and an async `init()` that
  auto-detects the helper (file backend) and otherwise falls back to localStorage. Saves are
  debounced, with a `sendBeacon` flush on tab close.

### Fixed
- **Year-view spending-trend bars all rendered at the same height.** Bars used percentage
  heights inside a flex column, so label text made tall bars overflow and flex-shrink back
  down, flattening the chart. Heights are now computed in pixels and bars no longer shrink,
  so month-to-month differences are shown honestly. (Month/Week views were already fine.)

## [0.5.0] — 2026-05-31

### Added
- **Undo** for category changes: the confirmation toast now offers an Undo that removes
  the learned rule (or restores its prior category) and reverts the affected transactions.
- **Save & apply to history** in the Rules editor: re-runs rules across all transactions,
  clearing one-off per-transaction category edits so the rules win everywhere.
- One-time **palette migration** (`Koin.PALETTE_VERSION` + `migratePalette()`): refreshes
  stored category colors for known keys on load without touching user data or customizations.

### Changed
- Refreshed the colour palette to a duller, **earthy** scheme (warm sand background; olive,
  clay, ochre, muted-slate categories). Colours are driven by CSS variables; the trend-bar
  colour reads from `--primary` so it stays in sync.

### Docs
- Documented where data lives (browser `localStorage`) and the `file://` vs `localhost`
  origin caveat in the README.

## [0.4.0] — 2026-05-31

### Added
- **Learned categorization rules**: categorizing a previously uncategorized transaction
  appends a `merchant → category` rule (`learned: true`) instead of patching single rows,
  so the merchant is categorized across all history **and** on future imports.

### Changed
- Category-rule matching now tests the description **and** the cleaned merchant name. Because
  merchant is a cleaned subset of the description, existing matches are unchanged; this makes
  learned merchant-rules reliable even when cleaning altered text (e.g. `UBER   *EATS` →
  `UBER EATS`).

## [0.3.0] — 2026-05-31

### Added
- Categorizing an uncategorized transaction also fills every other still-uncategorized
  transaction from the **same merchant across all history** (one action, whole backlog).
  Editing an already-categorized transaction still changes only that row.

## [0.2.0] — 2026-05-31

### Added
- Support for additional default ignore patterns for internal/own-account transfers, so
  they don't count as spending.

## [0.1.0] — 2026-05-31

Initial working dashboard (local proof-of-concept).

### Added
- CSV import for bank statements (`Date, Description, Credit, Debit, Balance`), with
  AU `DD/MM/YYYY` parsing, signed amounts, embedded effective-date extraction, and merchant
  cleaning.
- **History that accumulates**: re-importing overlapping months de-duplicates by a stable
  transaction id.
- **Yearly / monthly / weekly** views with step + jump navigation.
- **Auto-categorization** via editable merchant→category rules; manual re-categorization.
- **Add / edit / remove** custom (manual) transactions.
- **Configurable ignore patterns** (regex/substring) for internal transfers — not hardcoded.
- **Insights**: category donut, spending trend, top merchants, biggest expenses.
- **Recurring / subscription detection.**
- **Backup**: export/restore all data as JSON; reset.
- **Architecture**: static, no-build, dependency-free; single swappable storage adapter
  (`store.js`, localStorage) as the seam for a future database; pure logic modules
  (`parser`, `rules`, `insights`) with a headless Node test suite.

<!-- Only tagged versions are linked. 0.1.0–0.6.0 predate tagging in this repo. -->
[Unreleased]: https://github.com/amila03ac/koin/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/amila03ac/koin/releases/tag/v0.7.0
