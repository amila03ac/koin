# Koin

A personal finance dashboard that turns your bank-statement CSVs into spending
insights — runs entirely in your browser, no install, no account, no data leaves
your machine. Yearly / monthly / weekly views, auto-categorization, recurring
detection, and editable transactions.

> **Requirements:** none for the double-click mode. The recommended "local helper" mode
> just needs **Node.js** (already on most machines; `node --version` to check).

## Quick start

**Option A — local helper (recommended: data persists across all your browsers)**

```bash
cd Koin
node server.js
# then open the printed URL: http://localhost:4178
```

This runs a tiny built-in helper (no install, no dependencies). Your data is stored in
**one JSON file at `~/.koin/koin-data.json`**, so every browser on your machine — Chrome,
Safari, Firefox — sees the same data. Nothing is written into this folder, and there's no
database. Click **Import CSV** and pick your statement (e.g. `data/Transactions.sample.csv`).

**Option B — double-click (simplest, but per-browser)**

1. Open `index.html` in your browser (double-click it in Finder).
2. Click **Import CSV** and pick your statement.
3. Data is saved in *that browser's* storage (localStorage) for next time.

### Where your data lives & persistence

| How you open Koin | Backend | Persists across reloads? | Shared across browsers? |
|---|---|---|---|
| `node server.js` → localhost | `~/.koin/koin-data.json` file | ✅ | ✅ (same machine) |
| double-click `index.html` | browser localStorage | ✅ | ❌ (per-browser) |

Two gotchas with the double-click mode: `file://` and `http://localhost` are *different
origins* with separate storage, and localStorage is per-browser. The helper avoids both.
Either way, **⋯ → Export backup** / **Restore backup** moves data between machines.
(All of this lives behind one storage adapter in `js/store.js` — the seam for a real
database later.)

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

Plain HTML + vanilla JS, zero dependencies, no build step. All persistence goes through
one swappable storage adapter (`js/store.js`, localStorage today) so a real database can
be slotted in later without touching the UI. See [CLAUDE.md](CLAUDE.md) for architecture.

## Tests

The parsing/rules/insights logic is pure and can be checked headlessly with Node:

```bash
node test/run.js
```

## License

[MIT](LICENSE) © 2026 Amila
