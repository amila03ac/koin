# Koin

[![CI](https://github.com/amila03ac/koin/actions/workflows/ci.yml/badge.svg)](https://github.com/amila03ac/koin/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A personal finance dashboard that turns bank-statement CSVs into spending insights. It runs
entirely in your browser — **no account, no server, and no data leaves your machine.** Yearly /
monthly / weekly views, auto-categorization, recurring-payment detection, and fully editable
transactions.

**▶ Try it: [amila03ac.github.io/koin](https://amila03ac.github.io/koin/)** — click *Load the
sample data* to explore with synthetic transactions. Koin uploads nothing you import; it stays
in your browser, and you can install it as an offline app.

> **Status:** a working single-user app, and an early-stage personal project. It is local-first
> by design: there is no cloud sync, no multi-user support, and no authentication. Data lives in
> the browser you use it in, so **keeping a backup is on you** (Koin makes that easy — see
> [Your data](#your-data)). See [ROADMAP.md](ROADMAP.md) for direction and
> [CHANGELOG.md](CHANGELOG.md) for what has shipped.

## Quick start

**Requirements:** Node.js 20 or newer (Node 24 LTS recommended). Check with `node --version`.

```bash
npm ci
npm run dev
# then open http://localhost:4178
```

Click **Import CSV** and pick a statement — or try the synthetic samples in `data/` first.
For a production build: `npm run build` (outputs `dist/`), preview it with `npm run preview`.

## Using it

- **Import a CSV.** Koin detects two bank layouts from the header row:
  `Date, Description, Credit, Debit, Balance`, and a more detailed export
  (`Transaction Date, Details, …, Debit, Credit, Balance, Original Description`). It reads dates
  day-first — `31/03/2026`, or `03 Jun 2026` in the detailed layout — never US month-first.
  Re-import overlapping months freely: Koin de-duplicates by a stable transaction id, so history
  accumulates instead of doubling up.
- **Switch views.** Year / Month / Week, with ‹ › to step and a dropdown to jump to a period.
- **Categorize.** Koin categorizes most rows for you. Change one with its dropdown:
  - Categorizing a *previously uncategorized* merchant **learns a rule**, applying that category
    across all history *and* future imports. The toast offers **Undo**.
  - Editing an *already-categorized* row makes a one-off change to just that row.
  - Learned rules are listed and editable under **Rules**, alongside a category manager for
    adding your own categories, colours, and icons.
- **Edit anything.** **＋ Transaction** adds a manual entry (cash, corrections, expected bills).
  Imported bank rows can also be edited — date, merchant, amount, direction, category — and are
  marked *edited*, with **Reset to imported values** to undo. Koin stores your edits separately
  from the imported data, so re-importing never overwrites your work.
- **Ignore internal transfers.** Money moved between your own accounts isn't spending. Koin
  ignores `Internal Transfer` rows for you; add your own patterns under **Rules** to
  exclude others (for example, a recurring person-to-person payment) — no code needed.
- **Insights.** Category donut, spending trend, top merchants, biggest expenses, and
  recurring/subscription detection.

> The files in `data/` are **synthetic demo data** (invented merchants and people), safe to
> experiment with. `.gitignore` blocks real statements — never commit one.

## Your data

Koin stores everything in **that browser's** storage (IndexedDB, falling back to localStorage),
where it persists across reloads. It uploads nothing. The catch: that storage can vanish — the
browser may clear it under pressure, privacy settings may wipe it, or you may clear it yourself.
So Koin gives you several safeguards, all under the **⋯** menu:

- **Export backup / Restore backup** — a JSON file of everything, for moving between browsers or
  machines. Restoring **replaces** your current data: it asks you to confirm, downloads a safety
  copy of what's there first, and applies all-or-nothing, so a failed restore can't leave you
  half-updated.
- **Link backup file** *(Chromium browsers)* — pick a file on disk once, and Koin rewrites your
  full data to it after every change. That file is a durable, browser-independent copy;
  it's interchangeable with a manual export.
- **Storage protection** — Koin asks the browser to make its storage persistent and shows the
  result in the menu, along with a reminder if you haven't backed up in a while.
- **Reset all data** — wipes local data (after confirmation).

All persistence goes through a single storage adapter (`src/store/index.ts`) — the seam where a
cloud backend can slot in later without touching the UI.

## Install it / use it offline

Koin is a **PWA**. From a built or deployed copy (`npm run build && npm run preview`) your
browser offers an **Install** option: Koin gets its own icon and window and **works fully
offline** after the first load. This applies to the build, not `npm run dev`.

## How it's built

Fully typed **TypeScript**, bundled with **Vite**, with **no UI framework and zero runtime
dependencies**. The code separates into a pure core (`src/core/` — CSV parsing, rules,
insights; no DOM, no storage), the storage adapter (`src/store/`), and the DOM layer
(`src/ui/`). Offline support comes from `vite-plugin-pwa`, which generates the manifest and
service worker at build time.

See [CLAUDE.md](CLAUDE.md) for the architecture in detail and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the longer-term plan.

## Development

```bash
npm test          # Vitest: unit tests for the pure core, storage, and UI + a jsdom boot test
npm run typecheck # tsc --noEmit
npm run build     # production build into dist/
```

Every dependency is a devDependency, and `.npmrc` sets `ignore-scripts=true` so no dependency's
install scripts run — a deliberate guard against npm supply-chain attacks. Use `npm ci` (not
`npm install`) so installs come strictly from the committed lockfile.

Pushing to `main` runs CI and, if it passes, deploys to GitHub Pages.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — it covers the setup, the three architectural rules, and
how to add another bank's CSV layout (usually a small "format profile", not a new parser).
Please never include real financial data in an issue or PR.

## License

[MIT](LICENSE) © 2026 Amila
