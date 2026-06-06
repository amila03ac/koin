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
- `ROADMAP.md` — direction + the **project stages** (we're at Stage 0: local POC).
- `CHANGELOG.md` — what already shipped (recent entries show the working style).
- `js/store.js`, `js/parser.js`, `js/rules.js`, `js/insights.js`, `js/app.js` — skim the
  ones your change touches. `test/run.js` — how logic is tested.

## Non-negotiable invariants (violating these is a bug)

1. **All persistence goes through `js/store.js`.** Nothing else touches `localStorage`. New
   persistent data ⇒ add async methods there, keeping the swap-to-DB seam intact.
2. **Classic scripts on the global `Koin` namespace.** No ES modules, no bundler, no
   dependencies, no build step. New file ⇒ add a `<script>` to `index.html` in dependency
   order (defaults → store → parser → rules → insights → charts → app).
3. **Pure logic stays pure.** `parser.js`, `rules.js`, `insights.js` have no DOM/storage —
   keep them that way so they stay testable and portable.
4. **Money math is sacred.** Money out is negative; ignore internal transfers; bucket by
   effective date; never trust float equality. Get this right above all else.
5. **Don't silently lose user data.** Imported rows, manual edits (overrides), and learned
   rules must survive re-imports and reloads. Prefer reversible actions (offer Undo).
6. **Config is data, not code branches.** Categorize/ignore behavior is driven by editable
   rules in storage (seeded from `js/defaults.js`), never hardcoded `if merchant === …`.

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

- Make the focused change. Update `index.html` script order if you add a file.
- Add seed data to `js/defaults.js` (and mirror `config/*.json`) for new categories/rules.

## 4. Verify (required before claiming done)

- `npm test` (Vitest) and `npm run typecheck` must pass. Add/adjust tests for new pure logic
  (typed, under `test/`), and keep the jsdom `boot` test green.
- Drive the real UI in the browser via `npm run dev` (http://localhost:4178) and confirm the
  feature works end-to-end, including persistence across reload and at least one edge case.
  Don't rely on screenshots alone — assert DOM/state via eval.
- **NEVER let testing touch the user's real data.** The Vite dev server uses **localStorage**
  (per-browser), so it doesn't touch `~/.koin`. But `~/.koin/koin-data.json` may still hold
  the user's live data from the old `server.cjs` mode — never point tooling at it. If you run
  `server.cjs`, set `KOIN_DATA_DIR=/tmp/koin-...` so writes land in a throwaway sandbox
  (`.claude/settings.json` sets this for Claude-launched servers; a PreToolUse hook also
  blocks shell writes to `~/.koin` — don't rely on it, be deliberate).

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
- Commits in this repo are authored as **Amila** with **no AI co-author trailer** (see
  CLAUDE.md → "Commits & attribution"). Only commit/push when the user asks.

## 6. Self-review — scaled to the project stage

Read the current stage from `ROADMAP.md` ("Project stages") and review against *that* bar.
**Don't gold-plate a POC; don't ship data-loss in a hosted app.**

Always (every stage):
- Correctness, especially money math and date bucketing. Invariants upheld.
- No data loss; reversible where reasonable; storage seam intact.
- Tests pass and cover the new logic. Dead code / leftovers removed.
- Changelog updated; behavior matches the docs.

Stage 0 (local POC) — keep it light: skip auth, perf budgets, exhaustive validation, and
security hardening unless they affect correctness or data safety.

Stage 1+ (shareable/hosted) — additionally: input validation & error states, data-loss
safety (backups/migrations), real backend behind `store.js`, failure observability, and a
security pass on anything that crosses the network or accepts untrusted input.

Report the self-review honestly to the user: what you verified, any risks or shortcuts you
took, and what you deliberately deferred to a later stage (and why).

## 7. Hand off the commit command (always finish with this)

Whether or not the user asks you to commit, **end the task by giving them a ready-to-paste
git commit command** with a crafted message, so they can commit in one step:

- Stage + commit in a single block. Concise imperative subject (≤ ~70 chars) and a short
  body explaining the *why*; mention the CHANGELOG bump if relevant.
- **No `Co-Authored-By` / AI trailer.** The repo's git config already authors as Amila, so
  no `--author` override is needed — but never add an attribution trailer.
- Format it as a copy-pasteable fenced `bash` block, e.g.:

  ```bash
  git add -A && git commit -m "Add second-bank CSV import format" \
    -m "Auto-detect CSV layout via header-sniffing profiles; map only the relevant
  columns. Updates parser, tests, samples, CHANGELOG (Unreleased)."
  ```

- If the change spans unrelated concerns, suggest splitting into focused commits instead.
- If the user *did* ask you to commit, run it yourself (still no trailer), then show
  `git log -1 --stat` so they can confirm.

## Definition of done

Implemented ✓ · invariants upheld ✓ · `node test/run.js` green ✓ · verified in-browser ✓ ·
CHANGELOG updated (ROADMAP/CLAUDE if needed) ✓ · stage-scaled self-review reported ✓ ·
commit command handed to the user ✓.
