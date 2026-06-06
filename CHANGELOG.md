# Changelog

All notable changes to Koin are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While Koin is a local proof-of-concept, versions stay in the `0.x` range and a minor
bump (`0.N.0`) marks a user-visible feature increment.

This changelog is the *past* (what shipped); [ROADMAP.md](ROADMAP.md) is the *future*
(what's planned). Keep them in sync: when a roadmap item ships, move it here.

## [Unreleased]

### Changed
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

[Unreleased]: https://github.com/amila03ac/koin/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/amila03ac/koin/releases/tag/v0.6.0
[0.5.0]: https://github.com/amila03ac/koin/releases/tag/v0.5.0
[0.4.0]: https://github.com/amila03ac/koin/releases/tag/v0.4.0
[0.3.0]: https://github.com/amila03ac/koin/releases/tag/v0.3.0
[0.2.0]: https://github.com/amila03ac/koin/releases/tag/v0.2.0
[0.1.0]: https://github.com/amila03ac/koin/releases/tag/v0.1.0
