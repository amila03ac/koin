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
- [x] **3b. Type + split `app.js`.** Done — the ~860-line file is broken into focused, typed
      `ui/*` modules (dom, toast, modal, backup, state, render-sections, render-bus, table,
      rules-editor) and `app.ts` is a ~150-line composition shell. Slices below.
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
  - [x] _Slice 3d_ — extracted the rules/category editor (`openRulesModal` + learned-rule
        list + category manager + re-apply-to-history) into `src/ui/rules-editor.js`. Moved
        the shared `field()` helper into `dom.ts` (it was used by both the txn modal and the
        rules modal — a latent bug from slice 3c). Added a boot test that opens the Rules
        modal. `app.js` is now a ~159-line bootstrap/render shell.
  - [x] _Slice 3e_ — typed the three remaining UI modules → `app.ts`, `table.ts`,
        `rules-editor.ts` under strict mode (DOM/element casts; `SaveRejection` added to the
        store). The whole `src/ui/` layer is now TypeScript. **Step 3 complete.**
- [x] **4. Make IndexedDB the storage backend.** — done. IndexedDB is now the default backend
      via a hand-rolled ~40-line native KV wrapper (`src/store/idb.ts`); **no Dexie** — the
      store only get/puts six whole blobs, so a dependency's query/index power would be dead
      weight. localStorage remains an automatic fallback (old browsers / private mode / test
      env). A one-time localStorage→IndexedDB seed in `init()` carries existing users' data
      across (a straight blob copy, not a schema migration — keeps the "no migration code"
      decision intact), so the "re-import" fallback is now only needed by old `~/.koin` users.
      `server.cjs` and the entire file backend are retired (the `.claude` ~/.koin safeguards
      stay, since the user's real-data file may persist on disk). "Export backup" still works.
      IndexedDB path covered by `test/idb.test.ts` (fake-indexeddb).
- [x] **5. PWA** via `vite-plugin-pwa` — installable, offline. — done. `registerType:
      "autoUpdate"`, a generated web manifest (olive `#6f7a4e` theme), a Workbox service
      worker precaching the whole app shell (built only, not in `npm run dev`), and a ◎-coin
      icon set in `public/` (192/512 "any", 512 maskable, apple-touch, favicon.svg). `start_url`
      /`scope` are left to derive from Vite's `base`, so Step 6's sub-path deploy needs no icon
      rework. Verified: build emits `sw.js`/`manifest.webmanifest`/`registerSW.js`; `npm run
      preview` serves them with correct content-types and the SW precaches `index.html`.
- [ ] **6. Deploy** to GitHub Pages via Actions (build → publish `dist/`). Ship the **CSP** with
      this step: GitHub Pages can't set HTTP headers, so it must be a `<meta http-equiv>`
      injected at **build** time only (Vite's dev server needs `eval` for HMR, so a strict
      policy must not live in the source `index.html`). Koin makes no outbound requests, so the
      policy can be very tight (`connect-src 'none'`); `style-src` needs `'unsafe-inline'` for
      the inline `style="…"` attributes `h()` emits, unless those move to classes first.
- [ ] **7. OSS hygiene:** CI runs Vitest on every PR; add `LICENSE` (MIT), `CONTRIBUTING.md`,
      issue/PR templates. → This is the **Stage 0 → Stage 1** transition.
  - [ ] **Cut a `0.7.0` release.** `package.json` is already at 0.7.0 but everything since
        0.6.0 sits under `[Unreleased]` in the changelog and **no git tags exist at all**. Move
        that block under a `## [0.7.0] — <date>` heading, `git tag v0.7.0 && git push --tags`,
        and create the GitHub Release. Only *then* re-add the Keep-a-Changelog link definitions
        at the foot of `CHANGELOG.md` (they were removed because every one 404'd without tags).

**`server.cjs` retired (Step 4).** Its only job was cross-browser local persistence via
`~/.koin` (with shrink-guard, dirty-beacon, and the PreToolUse hook protecting it). Vite's dev
server replaced it for development and IndexedDB replaced it for storage, so the helper and the
entire `file` backend in `store/index.ts` are gone. **The `.claude` ~/.koin safeguards stay**
(deny-rules + `guard-koin-data.sh`): the user's real exported data file can still sit on disk,
and protecting it costs nothing. Cross-device sync remains Supabase's job (Phase 2).

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
