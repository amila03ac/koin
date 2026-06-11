# Koin — Architecture & evolution plan

This is the agreed technical direction for taking Koin from a local proof-of-concept to a
**local-first app with optional cloud sync**, as an open-source project. It complements:

- `CLAUDE.md` — how the code works *today*.
- `ROADMAP.md` — product horizons (Now / Next / Later) and project stages.
- `CHANGELOG.md` — what has shipped.

## Tracking progress (keep this file current)

**This file is the source of truth for "what's done" in the architecture migration.** Any
session that completes (or partially completes) a step below MUST update it in the same
commit as the code:

- Tick the step's checkbox (`- [ ]` → `- [x]`) and, if useful, append `— <date>, <commit/PR>`.
- For a partial step, leave it unchecked and add a short `(in progress: …)` note.
- When a whole **phase** ships, fold its now-current architecture into `CLAUDE.md` and mark
  the phase `✅ done` in its heading.
- Update `CHANGELOG.md` for anything user-visible, as always.

## Decision (2026-06)

- **Destination: B — local-first + optional cloud sync.** Koin runs on-device and works
  offline; signing in syncs across your own devices. Not a multi-tenant SaaS holding other
  people's data (that would be "Stage 2 / Destination C" — explicitly out of scope for now).
- **Tooling: adopt a build step (Vite) + TypeScript now.** This trades the old
  "double-click `index.html`, no build" promise for a maintainable codebase, npm libraries,
  and type-checked money math. A PWA restores (and improves) offline use.
- **Data migration is NOT a goal.** Existing local data can simply be re-imported from CSV.
  This lets us switch storage backends freely without writing migration code.
- **The `store` seam stays sacred.** All persistence remains behind one adapter interface, so
  swapping localStorage → IndexedDB → Supabase never touches UI code.

## Why now

Total app is ~1.9k LOC, but `js/app.js` alone is ~860 LOC of hand-rolled DOM — the main
drag on adding features. The pure logic (`parser`/`rules`/`insights`) is already
framework-free and headless-tested, so it ports cleanly. The fix is structural (modularize +
type), not a backend.

## Target structure (Phase 1)

```
koin/
  index.html              Vite entry (thin shell)
  vite.config.ts
  tsconfig.json
  src/
    core/                 PURE, framework-free, unit-tested (no DOM, no storage)
      types.ts            the normalized Transaction model + shared types
      parser.ts  rules.ts  insights.ts  defaults.ts
    store/                the ONLY persistence seam
      index.ts            adapter interface + backend selection
      indexeddb.ts        Dexie-backed (the Phase 1 default)
      supabase.ts         (Phase 2) cloud sync target
    ui/                   former app.js, split by feature
      import.ts  table.ts  rulesEditor.ts  categories.ts  charts.ts  modals.ts  toast.ts
    main.ts               wiring
  test/                   Vitest
  .github/workflows/ci.yml
```

## Phase 1 — "real codebase," still local-first  (status: in progress)

Each step is a small, single-session task. **Keep the test suite green after every step**,
and land each as its own commit/PR so it's reviewable and revertible. Tick steps off as they
land (see "Tracking progress" above).

- [x] **1. Scaffold Vite + TS + Vitest.** Build & serve `index.html`; no logic changes yet.
      — done: `package.json`, `vite.config.ts`, `tsconfig.json`, `src/main.ts` (loads the
      legacy scripts in order), Vitest (`smoke` + jsdom `boot` tests) with the Node runner
      kept as `test:legacy`. `server.js` → `server.cjs` (superseded by Vite; retire in Step 4).
- [x] **2. Port `core/` to TypeScript first** (parser → rules → insights → defaults),
      defining `types.ts`. Migrate the existing tests to Vitest. Safest, highest-value port.
      — done: `src/core/{types,defaults,parser,rules,insights,global}.ts`; tests migrated to
      `test/core.test.ts` (Vitest, 41 cases); `test/run.cjs` removed. Core modules still
      register on the global `Koin` via `src/core/global.ts` for the legacy UI (removed in
      Step 3). Legacy `js/categories.js` is still global, tested via that bridge.
- [x] **3a. De-globalize the UI/storage.** Convert `store`/`categories`/`charts` to typed
      modules (`src/store/index.ts`, `src/core/categories.ts`, `src/ui/charts.ts`); make
      `app.js` a real ES module importing the core/store/charts directly; **remove the global
      `Koin` bridge** (`src/core/global.ts` deleted, no more `registerGlobal`). A jsdom
      integration test now seeds data and asserts the dashboard renders. No behavior change.
- [ ] **3b. Type + split `app.js`.** Rename `src/ui/app.js` → `.ts`, add types, and break the
      ~860-line file into `ui/*` modules. Best done with the live preview/Chrome tooling so
      each extraction gets a real click-through. (`app.js` is a plain ES module, untyped —
      `checkJs` off.)
  - [x] _Slice 1_ — extracted the low-coupling helpers: `src/ui/dom.ts` (`h`/`$`/`money`/
        `fmtDate`/`todayIso`) and `src/ui/toast.ts`, both typed + unit-tested (`test/ui.test.ts`).
  - [x] _Slice 2_ — extracted the remaining UI primitives: `src/ui/modal.ts` (`openModal`)
        and `src/ui/backup.ts` (export / restore / reset), typed; modal unit-tested.
  - [x] _Slice 3a_ — extracted shared `state` + `compose`/`latestDate`/`hasFieldEdits` into
        typed `src/ui/state.ts` (`AppState`/`Filter` types; `Override` added to core types).
        `compose` is now unit-tested (`test/state.test.ts`).
  - [x] _Slice 3b_ — extracted the leaf render-section renderers (summary, charts, insights,
        period-jump, cat-filter) + `periodToAnchor` into typed `src/ui/render-sections.ts`.
        One-way dependency (`renderAll` → sections); covered by the boot integration test.
  - [x] _Slice 3c_ — extracted the table + its row interactions (categorize/learn/undo/
        ignore/delete) and the add/edit transaction modal into `src/ui/table.js`, plus a
        `src/ui/render-bus.ts` indirection (app registers `renderAll`; the table calls
        `rerender()`) so the dependency stays one-way (`app → table`, no cycle). A boot
        interaction test exercises table → bus → render. (`app.js` ~377 lines.)
  - [ ] _Remaining_ — the rules/category editor (`openRulesModal` + learned-rule list +
        category manager). Then type `app.js`/`table.js` (→ `.ts`). Do under live
        verification.
- [ ] **4. Make IndexedDB (Dexie) the storage backend.** No migration — users re-import CSVs.
      Keep "Export backup" working as the durable escape hatch.
- [ ] **5. PWA** via `vite-plugin-pwa` — installable, offline.
- [ ] **6. Deploy** to GitHub Pages via Actions (build → publish `dist/`).
- [ ] **7. OSS hygiene:** CI runs Vitest on every PR; add `LICENSE` (MIT), `CONTRIBUTING.md`,
      issue/PR templates. → This is the **Stage 0 → Stage 1** transition.

**Retire `server.js`.** Its only job was cross-browser local persistence via `~/.koin`
(with shrink-guard, dirty-beacon, and the PreToolUse hook protecting it). Vite's dev server
replaces it for development, and Supabase replaces it for cross-device sync — so once Phase 1
lands, `server.js`, `~/.koin`, and the associated safeguards can be removed.

## Phase 2 — cloud sync (when wanted)

- **Supabase**: managed Postgres + Auth + **row-level security**. Every row is keyed to
  `user_id`; RLS enforces isolation in the database.
- Schema mirrors the model: `transactions`, `overrides`, `rules`, `meta`, each `(user_id, …)`.
- Add **`store/supabase.ts`** behind the existing interface. **IndexedDB stays as the offline
  cache; Supabase is the sync target.** UI code does not change.
- **Stage-1+ rigor is mandatory here:** TLS only, RLS verified, never log row contents,
  auth/session handling, and a security pass on everything crossing the network.

## Phase 3 — optional polish

- Re-evaluate a tiny reactive UI framework (Svelte or Preact + signals) *only if* vanilla
  DOM in `ui/*` becomes the bottleneck — after, never during, the Phase 1 split.
- Observability, automated backups, schema migrations.

## Guardrails carried forward

- **One storage seam.** Never let UI/core read or write persistence directly.
- **Pure core stays pure.** `core/*` has no DOM and no storage — keep it portable/testable.
- **Money math is sacred.** Types help, but the rules in `CLAUDE.md` and `koin-feature`
  still apply: money out is negative, ignore internal transfers, bucket by effective date.
- **Don't co-mingle refactors.** Scaffold, then core port, then UI split — separate steps.
