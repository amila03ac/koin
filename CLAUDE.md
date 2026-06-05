# Koin — Personal Finance Dashboard

Koin turns raw bank-statement CSVs into a personal finance dashboard you open in a
browser. You import a statement, Koin normalizes and de-duplicates the transactions,
auto-categorizes them, and shows yearly / monthly / weekly spending with insights.

This is a personal project for a developer who is **new to software development**.
Favour clarity over cleverness. Explain non-obvious decisions in comments. Keep the
stack approachable (plain HTML + vanilla JS, no build step, no install).

## Status

MVP. Single-account, single-user, runs entirely in the browser.

## What it does

- **Import** a bank CSV (`Date, Description, Credit, Debit, Balance`) via a file picker.
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

Static, no-build, dependency-free app. The key design rule is:

> **All persistence goes through the storage adapter in `js/store.js`.**
> Nothing else touches storage. The adapter has two interchangeable backends behind one
> async interface, and the rest of the app never knows which is active. To move to
> IndexedDB or a full REST+DB backend later, you reimplement that one module — the UI is
> unchanged.

Two ways to run, two backends (auto-detected in `store.init()`):
- **Double-click `index.html`** (`file://`) — backend = **localStorage** (per-browser).
  Zero install, but data doesn't cross browsers.
- **`node server.js`** then open `http://localhost:4178` — backend = **shared JSON file**
  at `~/.koin/koin-data.json` via `GET/PUT /api/data`. Persists across **all browsers** on
  the machine. Still no database, nothing stored in the project folder. `server.js` is a
  ~60-line zero-dependency helper (localhost-only; not a production server).

> **`~/.koin/koin-data.json` is the user's LIVE data — never let tooling overwrite it.**
> `server.js` honors `KOIN_DATA_DIR` to relocate the data file; `.claude/settings.json` sets
> it to a sandbox for Claude-launched servers and a PreToolUse hook blocks shell writes to
> `~/.koin`. When testing the server yourself, set `KOIN_DATA_DIR=/tmp/...`. A **shrink-guard**
> in `server.js` (409 on a non-empty dataset dropping below half, unless `?force=1`) plus a
> dirty-only tab-close beacon stop a stale tab from clobbering newer data; restore/reset
> force-write past it. Still, **Export backup** is the only fully durable copy.

```
Koin/
  index.html            Dashboard shell; loads the js/ files as classic scripts
  server.js             Optional local helper: serves the app + a file-backed data API
  css/style.css         All styling
  js/
    defaults.js         Seed categories + rules, embedded as JS (first-run only)
    store.js            Storage adapter: file backend (server.js) OR localStorage fallback
    parser.js           CSV -> normalized transactions (date extraction, signing, ids)
    rules.js            Ignore patterns, auto-categorization, recurring detection
    insights.js         Pure aggregation: period filtering, category/merchant rollups
    charts.js           Dependency-free inline-SVG donut + bar charts
    app.js              Wires everything together; rendering + interactions
  config/
    categories.default.json   Human-readable mirror of the seed categories
    rules.default.json        Human-readable mirror of the seed ignore + category rules
  data/
    Transactions.sample.csv   The original statement, kept as sample/test data
```

**Why classic scripts, not ES modules?** Chrome blocks ES-module and `fetch()`
loads from `file://`, which would break the "just double-click `index.html`" promise.
So each `js/` file is a classic script that attaches to a single global `Koin`
namespace (load order in `index.html` matters: `defaults` → `store` → `parser` →
`rules` → `insights` → `charts` → `app`), and the seed config is embedded in
`js/defaults.js` instead of fetched. The `config/*.json` files are a readable mirror;
if you change them, mirror the change in `defaults.js` too (or just edit in-app, which
is authoritative once saved).

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

- Dates are **DD/MM/YYYY** (Australian). Do not parse as US MM/DD.
- Debits are **negative** numbers in the `Debit` column; `Credit` holds positive income.
- ~75% of descriptions embed the real event date as `Date DD Mon YYYY` (the CSV `Date`
  is the *posting* date, which can be 1–3 days later). Koin prefers the embedded date as
  `effectiveDate` so a purchase lands in the period it actually happened.
- The **merchant** is the substring before the first ` - `. Trailing store numbers and
  `\` artifacts are cleaned for grouping.
- `Internal Transfer ...` rows are transfers to a savings account and are ignored **by
  pattern**, not by hardcoding — see `js/defaults.js`.
- Some recurring person-to-person payments (e.g. an Osko/PayID transfer to a relative) may
  be internal moves between your own/family accounts rather than real spending. These are
  **not** ignored by default (Koin can't know); add a pattern in the Rules editor to exclude
  them.
- `data/Transactions.sample.csv` is **synthetic** demo/test data (fake merchants + people),
  safe to commit. Real statements must never be committed (see `.gitignore`).

## Conventions

- Vanilla JS (classic scripts on a global `Koin` namespace), no framework, no bundler,
  no dependencies, no build step. Keep it that way for the MVP unless there's a strong
  reason — the payoff is that `index.html` runs by double-clicking, offline.
- `store.js` is the only module allowed to read/write persistent storage.
- Pure functions in `parser.js`, `rules.js`, `insights.js` (no DOM, no storage) so they
  stay easy to test and reuse if this becomes a web/mobile app. They are tested headless
  in Node via a `window = global` shim — see README.
- Money is handled in cents-safe ways where it matters; never trust float equality.
- `js/defaults.js` holds the first-run seed for categories + rules. The live, user-edited
  copy lives in storage and is authoritative once saved. Bump `Koin.PALETTE_VERSION` when
  changing the default category colors; `migratePalette()` in `app.js` then refreshes
  stored colors for known keys on next load (preserving custom categories/labels/icons).
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
