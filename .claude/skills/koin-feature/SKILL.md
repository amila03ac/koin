---
name: koin-feature
description: Use when adding, changing, or removing a feature in the Koin personal-finance dashboard (this project) — any request to "build / add / implement / change / remove" functionality in Koin, or to fix a bug in it. Loads the project's architecture, conventions, and a disciplined build workflow (intake & push back, design-to-fit, implement, verify, update the changelog, stage-aware self-review). Do NOT use for one-off questions answered by reading a file, or for non-Koin projects.
---

# Building features in Koin

You are extending **Koin**, a local-first personal-finance dashboard. Your job is not just
to implement the request — it's to make sure the request *makes sense*, *fits the
architecture*, and leaves the project documented and reviewed. Move deliberately.

## 0. Load context first (always)

Read these before designing anything. They are the source of truth — this skill does not
duplicate them, it points at them:

- `CLAUDE.md` — architecture, data model, CSV quirks, conventions. **Read fully.**
- `ROADMAP.md` — direction + the **project stages**. Koin is at **Stage 1** (open source,
  hosted on GitHub Pages) as of v0.7.0 — confirm there rather than trusting this line, and
  review against that bar (see §6).
- `CHANGELOG.md` — what already shipped (recent entries show the working style).
- `src/store/index.ts`, `src/core/{parser,rules,insights,categories,defaults}.ts`,
  `src/ui/*.ts` (app, state, table, rules-editor, render-sections, render-bus, dom, modal,
  toast, charts, backup, disk-backup, storage-status) — skim the ones your change touches.
  `test/*.test.ts` — how logic is tested (Vitest).
- `CONTRIBUTING.md` — the public-facing version of these rules; keep it in sync if you change
  the contributor workflow.

## Non-negotiable invariants (violating these is a bug)

1. **All persistence goes through `src/store/index.ts`.** Nothing else touches `localStorage`.
   New persistent data ⇒ add async methods there, keeping the swap-to-DB seam intact.
2. **ES modules, built with Vite — no global namespace.** Import what you need; don't reach
   for a global `Koin` (that bridge was removed in Step 3a). TypeScript for new code. New
   module ⇒ `import` it where it's used; there is no script order to maintain.
   **Runtime dependencies stay at zero** — everything in `package.json` is a devDependency,
   and that's what keeps the shipped app dependency-free. Adding even a dev tool needs a real
   reason (see CLAUDE.md → dependency supply-chain policy).
3. **Pure core stays pure.** `src/core/*` (parser, rules, insights, categories, defaults) and
   the domain types have no DOM/storage — keep them that way so they stay testable/portable.
4. **Money math is sacred.** Money out is negative; ignore internal transfers; bucket by
   effective date; never trust float equality. Get this right above all else.
5. **Don't silently lose user data.** Imported rows, manual edits (overrides), and learned
   rules must survive re-imports and reloads. Prefer reversible actions (offer Undo).
6. **Config is data, not code branches.** Categorize/ignore behavior is driven by editable
   rules in storage (seeded from `src/core/defaults.ts`), never hardcoded `if merchant === …`.

## 1. Intake & push back (do not skip)

Before writing code, pressure-test the request:

- Restate it in one sentence and confirm the user's underlying goal.
- **Challenge it** if it: duplicates an existing feature, conflicts with the invariants,
  adds infrastructure the current stage doesn't warrant, harms the money math, or doesn't
  serve "where did my money go?". Propose a simpler or better-fitting alternative.
- Brainstorm 1–2 design options when the approach isn't obvious; note trade-offs.
- Resolve genuine forks with the user; don't guess on decisions that change scope.
- Check `ROADMAP.md`: is this already planned (reuse the framing) or net-new?

It is correct and expected to say "I don't think we should build this as asked, because …"
and offer the adjustment. A good outcome is sometimes a reshaped or declined feature.

## 2. Design to fit

- Find the seam: which module owns this? Reuse existing helpers (`h()`, `compose()`,
  `insights.*`, the override/learned-rule mechanisms) before inventing new ones.
- Keep changes small and vertical. Match existing code style and comment density.
- Think about persistence shape and migration (see `PALETTE_VERSION`/`migratePalette` for
  the pattern) so existing installs don't break.

## 3. Implement

- Make the focused change. New files are just imported — there is no script order.
- Add seed data to `src/core/defaults.ts` (and mirror `config/*.json`) for new categories/rules.

### The deployed app runs under a strict Content-Security-Policy

`npm run dev` has **no CSP**, so these mistakes work locally and break only in production —
assume nothing, check the policy in `vite.config.ts`:

- **No inline scripts and no `eval`.** Never add an `onclick="…"` attribute or an inline
  `<script>` to `index.html`; bind events in TypeScript instead (`addEventListener`).
- **No external requests** — no CDN, font, image, or API host. `connect-src` is `'self'`.
  Anything Koin loads must be shipped with it.
- **Files the app fetches at runtime must be emitted into the build.** Vite only copies
  `public/`; `data/` is emitted by a small plugin in `vite.config.ts`. If you add a runtime
  asset, make sure it actually lands in `dist/` — a missing one 404s silently in production
  while working perfectly in dev.
- Inline `style="…"` attributes are allowed (`style-src` permits them), so charts are fine.

## 4. Verify (required before claiming done)

- `npm test` (Vitest) and `npm run typecheck` must pass. Add/adjust tests for new pure logic
  (typed, under `test/`), and keep the jsdom `boot` test green.
- Drive the real UI in the browser via `npm run dev` (http://localhost:4178) and confirm the
  feature works end-to-end, including persistence across reload and at least one edge case.
  Don't rely on screenshots alone — assert DOM/state via eval.
- **Also check the production build** (`npm run build && npm run preview`, served at
  **`/koin/`**, not `/`) whenever your change touches URLs, `fetch`, runtime assets, the
  service worker, or adds markup. Dev hides CSP violations, sub-path bugs, and files missing
  from `dist/`. Listen for real violations rather than eyeballing it:
  `addEventListener('securitypolicyviolation', e => console.log(e.violatedDirective))`.
- **NEVER let testing touch real user data.** The dev server stores data per-browser, so it
  can't reach the local Koin data directory — but a maintainer's machine may hold real
  financial data there, so never point tooling at it. A PreToolUse hook blocks writes to it;
  don't rely on the hook, be deliberate. (See CLAUDE.md → durability.)

## 5. Document — the CHANGELOG is mandatory, not optional

- **Every user-visible change MUST add a `CHANGELOG.md` entry under `[Unreleased]`** before
  you call the work done — Keep-a-Changelog categories (Added/Changed/Fixed/…), proper
  section order (Added → Changed → Deprecated → Removed → Fixed → Security). This is the
  project's source of truth for "what shipped"; skipping it is a defect. Bump the minor for
  a user-visible feature increment.
- If a `ROADMAP.md` item shipped, remove it there. If you learned something architectural,
  update `CLAUDE.md`.
- If your work completes (or advances) a step in **`docs/ARCHITECTURE.md`**, tick its
  checkbox / update its status in the same commit — that file tracks the migration's
  progress and goes stale fast if sessions don't update it.
- Commits use the repo's configured git identity; a `Co-Authored-By: Claude …` trailer is
  welcome (see CLAUDE.md → "Commits & attribution"). Only commit/push when the user asks.

## 6. Self-review — scaled to the project stage

Read the current stage from `ROADMAP.md` ("Project stages") and review against *that* bar.
**Don't gold-plate a POC; don't ship data-loss in a hosted app.**

Always (every stage):
- Correctness, especially money math and date bucketing. Invariants upheld.
- No data loss; reversible where reasonable; storage seam intact.
- Tests pass and cover the new logic. Dead code / leftovers removed.
- Changelog updated; behavior matches the docs.

**Stage 1 — shareable / hosted (current).** The app is public, so also require: input
validation and honest error states for anything that accepts untrusted input (imported CSVs,
restored backups, user-authored regex rules); data-loss safety; no CSP violations or
production-only breakage; and a security think for anything touching the network or executing
user-supplied patterns. Real users' financial data is now in play — a silent failure is worse
than a loud one.

Stage 0 (local POC) — *historical, for context only:* it kept things light by deferring auth,
perf budgets, exhaustive validation, and security hardening. Don't apply that bar now.

Stage 2 (multi-user / product) — still deferred: accounts, auth, migrations, observability,
performance budgets, formal security review. A real backend would go behind the same
`src/store/index.ts` seam.

Report the self-review honestly to the user: what you verified, any risks or shortcuts you
took, and what you deliberately deferred to a later stage (and why).

## 7. Hand off the commit command (always finish with this)

Whether or not the user asks you to commit, **end the task by giving them a ready-to-paste
git commit command** with a crafted message, so they can commit in one step:

- **Repository hygiene first.** Scan the diff against CLAUDE.md → "Repository hygiene — check
  before every commit": no PII, credentials/secrets, real finance data, or machine-specific
  paths. Never `git add -f` past `.gitignore`.
- Stage + commit in a single block. Concise imperative subject (≤ ~70 chars) and a short
  body explaining the *why*; mention the CHANGELOG bump if relevant.
- **Attribution.** The repo's git config sets the author identity, so no `--author` override
  is needed. A `Co-Authored-By: Claude …` trailer on Claude-made commits is welcome.
- Format it as a copy-pasteable fenced `bash` block, e.g.:

  ```bash
  git add -A && git commit -m "Add second-bank CSV import format" \
    -m "Auto-detect CSV layout via header-sniffing profiles; map only the relevant
  columns. Updates parser, tests, samples, CHANGELOG (Unreleased)."
  ```

- If the change spans unrelated concerns, suggest splitting into focused commits instead.
- If the user *did* ask you to commit, run it yourself, then show `git log -1 --stat` so they
  can confirm.
- **Pushing to `main` publishes.** CI runs and, if green, the app deploys to GitHub Pages —
  so a push is a release to real users, not just a backup. Only push when explicitly asked,
  and never push work you haven't verified.

## Definition of done

Implemented ✓ · invariants upheld ✓ · `npm test` + `npm run typecheck` green ✓ · verified
in-browser ✓ (and against the production build if it touches URLs/assets/markup) ✓ ·
CHANGELOG updated (ROADMAP/CLAUDE if needed) ✓ · stage-scaled self-review reported ✓ ·
commit command handed to the user ✓.
