# Roadmap

Where Koin is headed. This is the *future*; [CHANGELOG.md](CHANGELOG.md) is the *past*.
When something here ships, move it to the changelog and delete it here.

This is a living document and intentionally not a commitment — priorities shift as the
product is used. Items are grouped by **horizon** (Now / Next / Later), not hard dates.

## Guiding principles

- **Personal-finance clarity first.** Every feature should make "where did my money go?"
  easier to answer. Insight > bookkeeping.
- **Keep it simple to run.** Easy to launch and works offline. (Through 0.x this meant
  no build step / double-click `index.html`; we've since decided to adopt Vite + a PWA — see
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — which keeps offline use while making the
  codebase maintainable.)
- **Your data stays yours.** Local-first. Anything that leaves the device is opt-in.
- **One storage seam.** All persistence stays behind `store.js` so the backend can change
  without rewriting the app.
- **Small, reversible steps.** Ship thin vertical slices; prefer undoable actions.

## Project stages

Koin's engineering bar scales with its stage. We're at **Stage 1** (since v0.7.0 — the app is
open source and hosted on GitHub Pages).

- **Stage 0 — Local POC (complete).** Single user, single browser, localStorage. Optimized
  for iteration speed and correctness of the money math. Light-touch process.
- **Stage 1 — Shareable / hosted (current).** Runs somewhere others can open it; data may sync
  or be backed up server-side. Raises the bar: input validation, error states, data-loss safety,
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

## Architecture evolution

The agreed technical direction (Vite + TypeScript, IndexedDB, PWA, then Supabase cloud
sync) lives in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — destination **B**
(local-first + optional cloud sync). Phase 1 of that plan is the **Stage 0 → Stage 1**
transition. Highlights folded in below.

## Later

- **Phase 1 — real codebase (local-first).** Vite + TypeScript, split `app.js` into modules,
  IndexedDB backend (localStorage data auto-copied over; old `~/.koin` users re-import),
  installable PWA, GitHub Pages deploy, CI + MIT license + contributor docs. Retired
  `server.cjs`/`~/.koin` file backend in Step 4. See docs/ARCHITECTURE.md.
- **Phase 2 — cloud sync.** Supabase (Postgres + Auth + row-level security) behind the same
  storage seam; IndexedDB becomes the offline cache. Cross-device sync, optional accounts.
- **Search & reports.** Full-text search, custom date ranges, exportable reports (PDF/CSV).

## Out of scope (for now)

- Bank API / Open Banking live feeds (privacy + complexity; revisit at Stage 2).
- Investment/asset tracking, multi-currency, tax tooling.
