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

Run with `npm run dev` (→ http://localhost:4178); the backend is **localStorage**
(per-browser), auto-selected in `store.init()`. Data persists per browser; cross-device sync
is a later phase (`docs/ARCHITECTURE.md`). _(The old `node server.cjs` shared-file backend at
`~/.koin/koin-data.json` is superseded by the Vite dev server and slated for removal in Phase
1 Step 4; the notes below describe it while it still exists.)_

> **`~/.koin/koin-data.json` is the user's LIVE data — never let tooling overwrite it.**
> `server.js` honors `KOIN_DATA_DIR` to relocate the data file; `.claude/settings.json` sets
> it to a sandbox for Claude-launched servers and a PreToolUse hook blocks shell writes to
> `~/.koin`. When testing the server yourself, set `KOIN_DATA_DIR=/tmp/...`. A **shrink-guard**
> in `server.js` (409 on a non-empty dataset dropping below half, unless `?force=1`) plus a
> dirty-only tab-close beacon stop a stale tab from clobbering newer data; restore/reset
> force-write past it. Still, **Export backup** is the only fully durable copy.

```
Koin/
  index.html            Dashboard shell; loads src/main.ts (Vite entry)
  vite.config.ts        Vite + Vitest config
  tsconfig.json         TypeScript config
  server.cjs            Legacy local helper (superseded by Vite; retired in Step 4)
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
      index.ts          Storage adapter (the ONLY persistence seam): localStorage backend
    ui/                 DOM layer
      state.ts          Shared mutable app state + compose() (rules+overrides → effective)
      dom.ts            Tiny DOM helpers: h() element builder, $, money, fmtDate, todayIso
      toast.ts          Transient notification (with optional action button)
      modal.ts          Overlay modal primitive (openModal)
      backup.ts         Export / restore / reset all data
      charts.ts         Dependency-free inline-SVG donut + bar charts
      render-sections.ts  Leaf panel renderers: summary, charts, insights, period jump, filter
      app.js            Bootstrap + render pipeline + table + editors (plain ES module;
                        remaining table/editor split into ui/* is Step 3b)
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

**Module state (mid-migration — see `docs/ARCHITECTURE.md`).** The app is a Vite-built ES
module graph with **no global namespace**. The **pure core** (`src/core/*.ts`) and the
**storage adapter** (`src/store/index.ts`) are typed; the **DOM layer** is `src/ui/`
(`charts.ts` typed; `app.js` is a plain ES module that imports the core/store/charts
directly — still untyped, typed + split into `ui/*` in Step 3b). The seed config lives in
`src/core/defaults.ts` (the `config/*.json` files are a readable mirror; if you change them,
mirror it there too, or just edit in-app — authoritative once saved).

### Data flow

`CSV file` → `parser.parse()` → normalized transactions → `rules.apply()` (ignore +
category + recurring) → merged into the store (dedup by `id`) → `insights.*` aggregate
for the active period → `app.js` renders cards, charts, and the table.

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

- Vanilla JS bundled with Vite, no UI framework. TypeScript for new/ported code; the pure
  core (`src/core/*.ts`) and storage are typed; the `src/ui/` layer is next (`app.js` typed +
  split in Step 3b). Avoid adding
  runtime dependencies without a strong reason — keep it lean and offline-capable (PWA later).
- `store.js` is the only module allowed to read/write persistent storage.
- Pure functions in `src/core/` (parser, rules, insights — no DOM, no storage) so they stay
  easy to test and reuse if this becomes a web/mobile app. Tested with Vitest (`npm test`);
  the jsdom `boot` test guards startup.
- Money is handled in cents-safe ways where it matters; never trust float equality.
- `src/core/defaults.ts` holds the first-run seed for categories + rules. The live,
  user-edited copy lives in storage and is authoritative once saved. Bump `Koin.PALETTE_VERSION` when
  changing the default category colors; `migratePalette()` in `app.js` then refreshes
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

### Commits & attribution
- Commits are authored as **Amila** (`amila03ac@gmail.com`) with **no
  AI / co-author trailer** — all work is attributed to the user. Don't add a
  `Co-Authored-By` line. (Enforce repo-wide via `attribution.commit: ""` in
  `.claude/settings.json` if not already set.)
- **Only commit or push when the user explicitly asks.** Prefer one focused commit per
  feature/fix.

### Note for fresh Claude sessions
Everything you need is in this repo: this `CLAUDE.md`, `ROADMAP.md`, `CHANGELOG.md`, and the
auto-loaded **`koin-feature`** skill. There is **no project auto-memory** for this directory
— so durable knowledge must live in these files, not in a past conversation. If you discover
something future sessions will need, write it here.
