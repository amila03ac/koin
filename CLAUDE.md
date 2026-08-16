# Koin — Personal Finance Dashboard

Koin turns raw bank-statement CSVs into a personal finance dashboard you open in a
browser. You import a statement, Koin normalizes and de-duplicates the transactions,
auto-categorizes them, and shows yearly / monthly / weekly spending with insights.

This is a personal project for a developer who is **new to software development**.
Favour clarity over cleverness. Explain non-obvious decisions in comments. Keep the
stack approachable (vanilla JS + TypeScript, bundled with Vite; no heavy frameworks).

## Status

MVP. Single-account, single-user, runs entirely in the browser.

## What it does

- **Import** a bank CSV via a file picker. Two layouts are auto-detected: the original
  `Date, Description, Credit, Debit, Balance`, and a more detailed export
  (`Transaction Date, Details, …, Debit, Credit, Balance, Original Description`). Only the
  relevant columns are read; extra columns (the second bank's category/account/tags) are
  ignored so both banks categorize consistently via Koin's own rules.
- **Keep history** — re-importing overlapping months merges by a stable transaction id
  instead of creating duplicates. Add new CSVs each month and they accumulate.
- **Views** — switch between yearly, monthly, and weekly periods.
- **Categorize** — auto-categorization via editable merchant→category rules; any
  transaction can be re-categorized by hand. Categorizing a previously *uncategorized*
  transaction **learns a `merchant → category` rule** (marked `learned: true`), which
  categorizes that merchant everywhere — all history **and** future imports — from one
  editable place (the Rules list). Editing an *already-categorized* transaction instead
  writes a one-off per-transaction override that wins over any rule, changing only that
  row. Rule matching tests the description **and** the cleaned merchant, so learned rules
  catch the same merchant even when text cleaning altered it. A learned-category action
  shows an **Undo** in the toast (removes the rule / restores the prior category). Learned
  rules are managed in a dedicated list at the top of the **Rules** editor (re-target or
  delete, with Undo); the raw JSON editor holds only hand-written rules + ignore patterns.
- **Re-apply rules to history** — editing rules in the Rules editor and pressing *Save*
  immediately re-categorizes all auto-categorized transactions (categorization is
  recomputed on every `compose()`). *Save & apply to history* goes further: it drops
  per-transaction category overrides (keeping ignore/delete ones) so the rules also win
  over rows you'd hand-categorized.
- **Custom transactions** — add / edit / remove transactions that aren't in any CSV
  (cash spending, corrections, expected bills).
- **Edit imported transactions** — any bank row's fields (date, merchant, amount,
  direction, category, description) can be edited. Edits are stored as **per-id overrides**
  layered over the pristine raw import (see `compose()` + `EDIT_FIELDS`), so they survive
  re-imports without duplicating, show an "edited" badge, and can be reverted with *Reset
  to imported values*. Field edits are applied **before** `rules.apply`, so fixing a
  merchant/description also fixes its auto-categorization and recurring detection.
- **Ignore internal transfers** — configurable regex/substring patterns (not hardcoded)
  flag transfers between your own accounts so they don't count as spending.
- **Insights** — category breakdown, top merchants, biggest expenses, period trend.
- **Recurring detection** — flags likely subscriptions / recurring bills.

## Architecture (and why)

Vite-built app (run with `npm run dev` / `npm run build`); TypeScript is being adopted
module-by-module (the pure core first — see `docs/ARCHITECTURE.md`). The key design rule is:

> **All persistence goes through the storage adapter in `src/store/index.ts`.**
> Nothing else touches storage. The rest of the app never knows which backend is active. To
> move to IndexedDB or a cloud backend later, you reimplement that one module — the UI is
> unchanged.

Run with `npm run dev` (→ http://localhost:4178); the backend is **IndexedDB**
(per-browser), auto-selected in `store.init()`, with **localStorage as an automatic fallback**
when IndexedDB is unavailable (old browsers, some private modes, non-browser test envs). On
the first run that upgrades a localStorage user to IndexedDB, `store.init()` copies their
existing data across once (a straight blob copy, not a schema migration), so nothing is lost.
Data persists per browser; cross-device sync is a later phase (`docs/ARCHITECTURE.md`).

**Durability (browser storage can be wiped, so guard against it).** Browser storage is
best-effort — it can be evicted under pressure and Safari clears unused site data after ~7 days
— so on startup Koin calls `navigator.storage.persist()` (status shown in the ⋯ menu) and,
until Phase 2 cloud sync exists, an **exported backup / a linked disk file is the only fully
durable copy**. Two durability aids beyond manual **Export backup**: (1) a linked **disk-backup
file** (`ui/disk-backup.ts`, File System Access API, Chromium only) that auto-rewrites the full
`store.exportAll()` dump after every change — driven by the `store.onAfterWrite` hook (fires
after any successful data write) and debounced; the file is byte-identical to a manual backup;
(2) a **restore** path (`store.importAll`) that is atomic (one all-or-nothing write via
`_writeAllStrict`; IndexedDB gives true transaction atomicity, localStorage snapshots+rolls
back), full-**replace** (not merge), and honest (only reports success once the write commits;
rejects a newer-schema backup). Restore first downloads a safety snapshot and confirms.

Koin is a **PWA** (installable, offline) via `vite-plugin-pwa`. The web manifest + Workbox
service worker are generated at **build** time only — `npm run dev` is unaffected (no SW, so
no stale-cache surprises while developing). To exercise install/offline, run `npm run build &&
npm run preview`. The SW precaches the app shell; `registerType: "autoUpdate"` means a new
build's SW activates on the next load. Icons live in `public/`; `start_url`/`scope` derive from
Vite's `base` (so a sub-path deploy needs no icon changes).

> **Never let tooling write to the local Koin data directory.** A maintainer's machine may hold
> real financial data in a directory outside this repo. The `.claude` safeguards that block it
> (deny-rules in `.claude/settings.json` + the `guard-koin-data.sh` PreToolUse hook) must stay —
> don't "tidy them away". **Export backup** remains the only fully durable copy of user data.

```
Koin/
  index.html            Dashboard shell; loads src/main.ts (Vite entry)
  vite.config.ts        Vite + Vitest config; vite-plugin-pwa (manifest + service worker)
  tsconfig.json         TypeScript config
  public/               Static assets copied as-is: PWA icons (◎ coin) + favicon.svg
  css/style.css         All styling
  src/
    main.ts             Vite entry: imports css + ui/app
    core/               PURE, typed, framework-free (no DOM, no storage)
      types.ts          The normalized Transaction model + shared types
      defaults.ts       Seed categories + rules (first-run only)
      parser.ts         CSV -> normalized transactions; multi-bank "format profiles"
      rules.ts          Ignore patterns, auto-categorization, recurring detection
      insights.ts       Pure aggregation: period filtering, category/merchant rollups
      categories.ts     Pure category helpers: slugification, uniqueness, colour validation
    store/
      index.ts          Storage adapter (the ONLY persistence seam): IndexedDB + localStorage fallback
      idb.ts            Tiny native-IndexedDB KV wrapper (no deps); used only by index.ts
    ui/                 DOM layer
      state.ts          Shared mutable app state + compose() (rules+overrides → effective)
      dom.ts            Tiny DOM helpers: h() element builder, $, money, fmtDate, todayIso, field
      toast.ts          Transient notification (with optional action button)
      modal.ts          Overlay modal primitive (openModal)
      backup.ts         Export / restore (atomic, confirmed, safety-snapshot) / reset all data
      disk-backup.ts    Optional auto-backup to a linked HDD file (File System Access API; Chromium)
      storage-status.ts navigator.storage.persist() + persisted/best-effort indicator
      charts.ts         Dependency-free inline-SVG donut + bar charts
      render-sections.ts  Leaf panel renderers: summary, charts, insights, period jump, filter
      render-bus.ts     setRenderer/rerender indirection (lets modules re-render w/o importing app)
      table.ts          Transaction table + row actions + add/edit modal
      rules-editor.ts   Rules/category editor modal (learned rules, category manager)
      app.ts            Bootstrap + renderAll + toolbar wiring (composition root)
  config/
    categories.default.json   Human-readable mirror of the seed categories
    rules.default.json        Human-readable mirror of the seed ignore + category rules
  data/
    Transactions.sample.csv            Synthetic Bank A (standard) sample/test data
    Transactions.sample-detailed.csv   Synthetic Bank B (detailed) sample/test data
  test/
    core.test.ts        Vitest unit tests for the pure core
    boot.test.ts        jsdom boot + integration tests (renders empty + seeded dashboard)
```

**Module layout (see `docs/ARCHITECTURE.md`).** The app is a Vite-built, fully-typed ES
module graph with **no global namespace**: the **pure core** (`src/core/*.ts`), the **storage
adapter** (`src/store/index.ts`), and the **DOM layer** (`src/ui/*.ts`) are all TypeScript.
`app.ts` is the composition root that owns `renderAll`; feature modules (`table.ts`,
`rules-editor.ts`) trigger re-renders via `render-bus.ts` (`rerender()`) rather than importing
`app` (keeps the dependency one-way, no cycle). The seed config lives in `src/core/defaults.ts`
(the `config/*.json` files are a readable mirror; if you change them, mirror it there too, or
just edit in-app — authoritative once saved).

### Data flow

`CSV file` → `parser.parse()` → normalized transactions → `rules.apply()` (ignore +
category + recurring) → merged into the store (dedup by `id`) → `insights.*` aggregate
for the active period → `app.ts` + `ui/*` render cards, charts, and the table.

Manual edits (category overrides, ignore toggles, deletions, **field edits** to bank
rows, custom transactions) are stored **separately from imported rows** so that
re-importing a CSV never clobbers your work. On merge, overrides are re-applied on top of
freshly parsed data, keyed by the stable `id`.

### Normalized transaction shape

```js
{
  id,             // stable hash of receipt+date+amount+desc; dedup key
  postedDate,     // ISO date from the CSV "Date" column
  effectiveDate,  // embedded "Date DD Mon YYYY" from the description if present, else postedDate
  description,    // raw description text
  merchant,       // cleaned name (text before the first " - ")
  amount,         // signed number: negative = money out (debit), positive = money in (credit)
  direction,      // 'debit' | 'credit'
  balance,        // running balance from the CSV, if present
  category,       // assigned category key
  categorySource, // 'auto' | 'manual'
  ignored,        // true = excluded from spending totals (internal transfer etc.)
  recurring,      // true = looks like a subscription / recurring bill
  source,         // 'csv' | 'manual'
}
```

## CSV quirks this codebase handles (learned from the real data)

- **Two CSV layouts**, auto-detected by sniffing the header row (`Koin.parser` →
  `FORMATS` / `detectFormat`). Each layout is a small "format profile" mapping our fields
  to that bank's columns + a date parser; the first profile whose `detect(headers)` matches
  wins (list more specific layouts first). Adding a bank = add a profile, not a new parser.
  - **Bank A (`standard`)**: `Date, Description, Credit, Debit, Balance`; `DD/MM/YYYY`;
    debits negative; merchant derived from the description.
  - **Bank B (`detailed`)**: `Transaction Date, Details, …, Debit, Credit, Balance,
    Original Description`; `DD Mon YYYY` (e.g. `03 Jun 2026`); debits **positive**; merchant
    taken from the clean `Details` column; `Original Description` is the dedup/effective-date
    source. Its `Account`/`Category`/`Subcategory`/`Tags`/`Notes` columns are intentionally
    **ignored** (Koin's own rules categorize, for cross-bank consistency).
- Dates are **DD/MM/YYYY** (Australian) in Bank A. Do not parse as US MM/DD.
- Debits are **negative** numbers in the `Debit` column; `Credit` holds positive income.
- ~75% of descriptions embed the real event date as `Date DD Mon YYYY` (the CSV `Date`
  is the *posting* date, which can be 1–3 days later). Koin prefers the embedded date as
  `effectiveDate` so a purchase lands in the period it actually happened.
- The **merchant** is the substring before the first ` - `. Trailing store numbers and
  `\` artifacts are cleaned for grouping.
- `Internal Transfer ...` rows are transfers to a savings account and are ignored **by
  pattern**, not by hardcoding — see `src/core/defaults.ts`.
- Some recurring person-to-person payments (e.g. an Osko/PayID transfer to a relative) may
  be internal moves between your own/family accounts rather than real spending. These are
  **not** ignored by default (Koin can't know); add a pattern in the Rules editor to exclude
  them.
- `data/Transactions.sample.csv` (Bank A) and `data/Transactions.sample-detailed.csv`
  (Bank B) are **synthetic** demo/test data (fake merchants + people), safe to commit. Real
  statements must never be committed (see `.gitignore`).

## Conventions

- Vanilla TypeScript bundled with Vite, no UI framework — `src/core`, `src/store`, and
  `src/ui` are all typed. Avoid adding runtime dependencies without a strong reason — keep it
  lean and offline-capable (PWA later).
- `src/store/index.ts` is the only module allowed to read/write persistent storage.
- Pure functions in `src/core/` (parser, rules, insights — no DOM, no storage) so they stay
  easy to test and reuse if this becomes a web/mobile app. Tested with Vitest (`npm test`);
  the jsdom `boot` test guards startup.
- Money is handled in cents-safe ways where it matters; never trust float equality.
- `src/core/defaults.ts` holds the first-run seed for categories + rules. The live,
  user-edited copy lives in storage and is authoritative once saved. Bump `Koin.PALETTE_VERSION` when
  changing the default category colors; `migratePalette()` in `app.ts` then refreshes
  stored colors for known keys on next load (preserving custom categories/labels/icons).
- A category's `key` is its **stable id** — transactions, rules, and overrides all
  reference it. **Never rename a key** (you'd orphan that data). The in-app Categories
  manager (Rules modal) edits only `label`/`color`/`icon`; new categories get a key
  slugified from the name (`src/core/categories.ts`), re-derived on rename *only while the
  category is unused*, then frozen. There's no in-app delete (would orphan referencing
  rows) — remove via the Advanced JSON / a restored backup if truly needed.
- Colors live in CSS variables in `css/style.css` (`:root`) — earthy/muted palette. The
  trend-bar color is read from `--primary` at render time so it stays in sync.

## Project docs & workflow

- **[ROADMAP.md](ROADMAP.md)** — where Koin is headed (Now / Next / Later), guiding
  principles, and the project stages (we're at Stage 0: local POC). The *future*.
- **[CHANGELOG.md](CHANGELOG.md)** — what has shipped, in [Keep a Changelog](https://keepachangelog.com)
  format with SemVer. The *past*. **Update it with every user-visible change.** When a
  roadmap item ships, move it from ROADMAP to CHANGELOG.
- **Adding a feature?** Use the **`koin-feature`** skill (`.claude/skills/koin-feature/`).
  It carries this project's context and a build-it-properly workflow: intake & push back,
  design to fit the architecture, implement, verify (tests + browser), update the changelog,
  and self-review against engineering standards scaled to the current stage.

### Engineering bar scales with stage
Don't over-engineer a POC, but don't cut corners that cause data loss. See ROADMAP's
"Project stages" — at **Stage 0** prioritize correct money math, reversible actions, and
not silently losing user data; defer auth, migrations, perf budgets, and security hardening
until Stage 1+ (shareable/hosted).

### Repository hygiene — check before every commit or file update
Koin is a public-facing repo. **Before staging, committing, or updating any tracked file, scan
the change (`git diff` / `git diff --staged`) and refuse to commit anything that contains:**
- **Personal data / PII** — real names, emails, phone numbers, addresses, account/card numbers,
  government IDs, or any identifiable person. Author identity comes from git config, *not* file
  contents — don't hardcode names/emails in tracked files.
- **Credentials or secrets** — API keys, tokens, passwords, private keys, `.env` contents,
  session cookies, or SSH key material/paths.
- **Real financial / expense data** — actual bank statements, transactions, balances, or
  exported backups. Only the **synthetic** `data/Transactions.sample*.csv` may be committed.
- **Machine-specific / local detail** — absolute home paths (`/Users/…`, `~/.ssh`, `~/.koin`),
  local hostnames, personal repo/account URLs, or one-off setup notes. These belong in local,
  gitignored config (`.claude/launch.json`, `~/.ssh/config`), never in tracked docs.
- **Bulk / generated cruft** — `node_modules/`, `dist/`, `dev-dist/`, build output, large
  binaries, logs, editor/OS files.

The `.gitignore` already blocks real CSVs, exported/pre-restore backups, and machine config —
**never `git add -f` past it.** If you find secret/PII/real-data *already committed*, stop and
tell the user: it needs a history scrub + force-push (don't just delete it in a new commit,
which leaves it in history).

### Dependency supply-chain policy (npm worms)
Koin uses **npm** (there is no yarn/pnpm lockfile). Self-replicating npm worms run their payload
from **dependency install scripts**, so:
- **`.npmrc` sets `ignore-scripts=true`** — no dependency's preinstall/install/postinstall runs.
  Verified safe: only `esbuild` ships one, and it works without it. **Don't remove this.** If a
  new dependency truly needs its script, read the script, then install just that one with
  `npm install <pkg> --foreground-scripts` and note why.
- **Always `npm ci`** (strict lockfile), never `npm install` in CI. Commit `package-lock.json`.
- **Dependabot has a `cooldown`** so freshly published versions aren't adopted immediately —
  compromised releases are usually pulled within days. Don't bypass it by hand-bumping deps.
- **Keep runtime dependencies at zero.** Everything in `package.json` is a devDependency; a
  compromised dev tool can't reach users of the built site (but *can* reach this machine).
- **Limits worth knowing:** `ignore-scripts` does **not** stop malicious code that executes when
  a package is *imported* during `npm run build`/`test`. That's why CI uses least-privilege
  `permissions: contents: read` and why new deps deserve real scrutiny.

### Commits & attribution
- Commit with the repository's configured git identity (set in this repo's local git config,
  so no `--author` override is needed). A `Co-Authored-By: Claude …` trailer on Claude-made
  commits is welcome.
- **Only commit or push when the user explicitly asks.** Prefer one focused commit per
  feature/fix.

### Note for fresh Claude sessions
Everything you need is in this repo: this `CLAUDE.md`, `ROADMAP.md`, `CHANGELOG.md`, and the
auto-loaded **`koin-feature`** skill. There is **no project auto-memory** for this directory
— so durable knowledge must live in these files, not in a past conversation. If you discover
something future sessions will need, write it here.
