# Contributing to Koin

Thanks for taking a look. Koin is a small, local-first personal finance dashboard, and it's
deliberately kept simple: **vanilla TypeScript, no UI framework, and zero runtime
dependencies.** Contributions are welcome as long as they keep it that way.

Because Koin handles people's financial records, two things matter more than anything else:
**the money maths must be right**, and **user data must never be silently lost.**

## Getting set up

You'll need **Node.js 20 or newer** (Node 24 LTS recommended).

```bash
npm ci
npm run dev
# open http://localhost:4178
```

Use `npm ci`, not `npm install` — it installs strictly from the committed lockfile.

```bash
npm test          # Vitest unit + jsdom integration tests
npm run typecheck # tsc --noEmit
npm run build     # production build into dist/
npm run preview   # serve the production build (at /koin/, matching the deployed sub-path)
```

Try it with the synthetic sample statements in `data/` — click **Load the sample data** on the
empty state. **Never commit a real bank statement or backup**; `.gitignore` blocks them.

## How the code is organised

```
src/core/   Pure logic — CSV parsing, rules, insights. No DOM, no storage.
src/store/  The only module that touches persistence (IndexedDB, localStorage fallback).
src/ui/     The DOM layer. app.ts is the composition root.
```

Three rules keep this honest, and a PR that breaks one will be asked to change:

1. **All persistence goes through `src/store/index.ts`.** Nothing else reads or writes storage.
   That single seam is what makes a future cloud backend a one-module job.
2. **`src/core/` stays pure** — no DOM, no storage — so it stays testable and portable.
3. **Money out is negative**, internal transfers are excluded from spending, and transactions
   are bucketed by *effective* date (the date the purchase happened, not when it posted).
   Never compare currency amounts with float equality.

Feature modules trigger re-renders through `src/ui/render-bus.ts` rather than importing
`app.ts`, which keeps the dependency graph one-way. `CLAUDE.md` has the fuller architecture
tour, and `docs/ARCHITECTURE.md` covers where the project is heading.

## Adding support for another bank's CSV

This is the most likely thing you'll want to add, and it shouldn't need a new parser. Each
layout is a **format profile** in `src/core/parser.ts` (`FORMATS`): a mapping from Koin's
fields to that bank's column names, plus a date parser. The first profile whose `detect()`
matches the header row wins, so list more specific layouts first.

To add one: write the profile, add a small **synthetic** sample CSV to `data/` (invented
merchants and people — never real data), and cover it in `test/core.test.ts`. Watch out for
day-first dates (`31/03/2026`, never US month-first) and for banks that report debits as
positive numbers.

## Pull requests

- Keep changes focused — one feature or fix per PR.
- `npm test` and `npm run typecheck` must pass. CI runs both, plus a build, on every PR.
- Add tests for new logic in `src/core/` — it's pure, so it's easy to test.
- **Update `CHANGELOG.md`** under `[Unreleased]` for anything user-visible, following
  [Keep a Changelog](https://keepachangelog.com).
- Explain non-obvious decisions in comments. Clarity is valued over cleverness here.

### Please don't include

- Real financial data, personal information, or credentials of any kind.
- New **runtime** dependencies. Everything in `package.json` is a devDependency, which is what
  keeps the shipped app dependency-free. Dev tooling additions need a good reason.
- Machine-specific paths or local setup notes in tracked files.

## A note on dependencies

`.npmrc` sets `ignore-scripts=true`, so no dependency's install scripts run — a deliberate
guard against npm supply-chain attacks. If a package you add genuinely needs its install
script, read the script first, then install just that one with `--foreground-scripts` and say
why in the PR.

## Reporting bugs and security issues

Open an issue using the templates. For anything security-related, please use GitHub's
**private vulnerability reporting** rather than a public issue.

When reporting a CSV or categorization bug, include a **redacted or invented** sample row that
reproduces it — never a real statement.
