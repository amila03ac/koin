# Roadmap

Where Koin is headed. This is the *future*; [CHANGELOG.md](CHANGELOG.md) is the *past*.
When something here ships, move it to the changelog and delete it here.

This is a living document and intentionally not a commitment — priorities shift as the
product is used. Items are grouped by **horizon** (Now / Next / Later), not hard dates.

## Guiding principles

- **Personal-finance clarity first.** Every feature should make "where did my money go?"
  easier to answer. Insight > bookkeeping.
- **Keep it simple to run.** No build step, no install, works offline by double-click —
  until there's a concrete reason (sharing, multi-device) to add infrastructure.
- **Your data stays yours.** Local-first. Anything that leaves the device is opt-in.
- **One storage seam.** All persistence stays behind `store.js` so the backend can change
  without rewriting the app.
- **Small, reversible steps.** Ship thin vertical slices; prefer undoable actions.

## Project stages

Koin's engineering bar scales with its stage. We're at **Stage 0**.

- **Stage 0 — Local POC (current).** Single user, single browser, localStorage. Optimize
  for iteration speed and correctness of the money math. Light-touch process.
- **Stage 1 — Shareable / hosted.** Runs somewhere others can open it; data may sync or be
  backed up server-side. Raises the bar: input validation, error states, data-loss safety,
  a real storage backend, basic analytics of failures.
- **Stage 2 — Multi-user / product.** Accounts, auth, privacy, migrations, observability,
  performance budgets, security review. Full engineering rigor.

A feature's "definition of done" (tests, validation, security) is judged against the
current stage — see the `koin-feature` skill for the self-review rubric.

## Now (actively considered)

- **Budgets per category.** Optional monthly limit per category with progress bars and an
  over-budget highlight on the dashboard.

## Next

- **Income & cashflow view.** First-class handling of credits/refunds and a money-in vs
  money-out summary (the data already supports `Credit`). Net position over time.
- **Account-aware imports.** Distinguish statements/accounts (e.g. the `money-out` vs
  `cash-&-purchases` exports) instead of one undifferentiated pool.
- **Smarter recurring.** Detect cadence (weekly/monthly), estimate the next charge date,
  and surface upcoming bills.
- **Flexible CSV mapping.** A column-mapping step so other banks' export formats import
  without code changes.
- **Data-safety nudges.** Import history view, "last backup" reminder, and an auto-export
  prompt — mitigations for the localStorage-can-be-cleared risk.

## Later

- **Storage evolution.** A local file-backed backend (via `server.js`, shared across
  browsers) shipped in 0.6.0. Next steps behind the same `store.js` seam: an IndexedDB
  adapter (more headroom, still local, no helper needed), then a REST + real database
  backend (e.g. SQLite/Postgres) for multi-device/hosted use.
- **Shareable / hosted Koin.** Deployable build, optional accounts/auth, cross-device sync.
- **Mobile / PWA.** Installable app; the pure logic modules are written to port.
- **Search & reports.** Full-text search, custom date ranges, exportable reports (PDF/CSV).

## Out of scope (for now)

- Bank API / Open Banking live feeds (privacy + complexity; revisit at Stage 2).
- Investment/asset tracking, multi-currency, tax tooling.
