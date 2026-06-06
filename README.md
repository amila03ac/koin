# Koin

A personal finance dashboard that turns your bank-statement CSVs into spending
insights — runs entirely in your browser, no install, no account, no data leaves
your machine. Yearly / monthly / weekly views, auto-categorization, recurring
detection, and editable transactions.

> **Requirements:** **Node.js 18+** (`node --version` to check). Koin now uses a small build
> step (Vite); see the [architecture plan](docs/ARCHITECTURE.md) for where it's headed.

## Quick start

```bash
cd Koin
npm install
npm run dev
# then open the printed URL: http://localhost:4178
```

Click **Import CSV** and pick your statement (e.g. `data/Transactions.sample.csv`). To make a
production build, run `npm run build` (outputs `dist/`) and preview it with `npm run preview`.

### Where your data lives & persistence

Your data is saved in **that browser's** storage (localStorage) and persists across reloads.
It's per-browser for now; cross-device sync is the next milestone (see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). **⋯ → Export backup** / **Restore backup**
moves data between browsers or machines. All persistence lives behind one storage adapter in
`js/store.js` — the seam for IndexedDB and a cloud backend later.

> **Upgrading from the old `node server.js` mode?** That file-backed helper is superseded by
> the Vite dev server; data previously kept in `~/.koin/koin-data.json` won't appear
> automatically — just **Import** your CSV again (or **Restore** a backup).

## Using it

- **Import a CSV** — expected columns: `Date, Description, Credit, Debit, Balance`.
  Re-import overlapping months freely; Koin de-duplicates by a stable transaction id,
  so your history just grows. Add a new statement at the start/end of each month.
- **Switch views** — Year / Month / Week, with ‹ › to step and a dropdown to jump.
- **Categories** — most transactions are auto-categorized. Change any one with its
  dropdown; your choice sticks and survives re-imports.
- **Add / edit / remove** — **＋ Transaction** adds a manual entry (cash, corrections,
  expected bills). Manual ones are fully editable; bank rows can be re-categorized,
  ignored, or deleted.
- **Ignore internal transfers** — transfers between your own accounts shouldn't count as
  spending. `Internal Transfer` rows are ignored automatically. To ignore others (e.g.
  recurring family transfers), open **Rules** and add a pattern — no code needed.
- **Insights** — category donut, spending trend, top merchants, biggest expenses, and
  recurring/subscription detection.
- **Backup** — **⋯ → Export backup** saves a JSON of everything; **Restore backup**
  loads it back (e.g. on a new machine or browser). **Reset all data** wipes local data.

> `data/Transactions.sample.csv` is **synthetic demo data** (fake merchants and people) so
> you can try Koin safely. Replace it with your own statement export when you're ready.

## How it's built

Vanilla JS bundled with **Vite**, with **TypeScript** being adopted module-by-module (the
pure `parser`/`rules`/`insights` logic ports first). All persistence goes through one
swappable storage adapter (`js/store.js`, localStorage today) so IndexedDB and a cloud
backend can be slotted in later without touching the UI. See [CLAUDE.md](CLAUDE.md) for the
current architecture and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the evolution plan.

## Tests

```bash
npm test          # Vitest (unit + a jsdom boot smoke test)
npm run typecheck # tsc --noEmit
npm run test:legacy   # the original Node test runner (kept until tests finish migrating)
```

## License

[MIT](LICENSE) © 2026 Amila
