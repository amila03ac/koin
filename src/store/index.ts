// store/index.ts — the ONLY module that talks to persistent storage.
//
// Two backends behind ONE interface (the seam designed for a future DB):
//   • "idb"   — browser IndexedDB (the default). Far larger quota than localStorage, async,
//               and the right home for years of imported statements. See ./idb.ts.
//   • "local" — browser localStorage. Automatic fallback when IndexedDB is unavailable
//               (very old browsers, some private-browsing modes, or a non-browser test env).
// `await store.init()` picks the backend at startup, preferring IndexedDB; on first run it
// also copies any existing localStorage data into IndexedDB once, so upgrading users keep
// their dashboard without re-importing. Method names/return shapes are identical for both
// backends, so the rest of Koin never knows or cares which is active.
//
// (Pre-Step-4 a third "file" backend talked to a local Node helper at ~/.koin/koin-data.json;
// that helper — server.cjs — is retired now that Vite serves the app.)
import type { Category, Override, RuleSet, Transaction } from "../core/types";
import { idbAvailable, idbGet, idbSet, idbSetMany, idbDel, idbClear } from "./idb";

export type OverrideMap = Record<string, Override>;

export interface Meta {
  schemaVersion: number;
  imports: unknown[];
  paletteVersion?: number;
  lastBackupAt?: string; // ISO time of the last export; drives the "back up your data" nudge
  [key: string]: unknown;
}

export interface Backup {
  schemaVersion?: number;
  exportedAt?: string;
  transactions?: Transaction[];
  manual?: Transaction[];
  overrides?: OverrideMap;
  rules?: RuleSet | null;
  categories?: Category[] | null;
  meta?: Meta;
}

const PREFIX = "koin:";
// The linked on-disk backup file handle (File System Access API) lives under its own key,
// deliberately OUTSIDE the KEYS map below: it's not user data, it's never exported into a
// backup file (a handle can't be JSON-serialized), and it only persists on the idb backend
// (localStorage can't structured-clone a handle).
const BACKUP_HANDLE_KEY = PREFIX + "backupFileHandle";
const KEYS = {
  transactions: PREFIX + "transactions",
  manual:       PREFIX + "manual",
  // overrides: id -> { category?, ignored?, deleted?, effectiveDate?, merchant?, description?, amount? }
  overrides:    PREFIX + "overrides",
  rules:        PREFIX + "rules",
  categories:   PREFIX + "categories",
  meta:         PREFIX + "meta",
};
export const SCHEMA_VERSION = 1;

class KoinStore {
  mode: "idb" | "local" = "local"; // until init() prefers IndexedDB
  // True when IndexedDB was present but failed to open (blocked tab / some private modes), so we
  // fell back to the lower-quota localStorage. The app surfaces this so the drop isn't silent.
  fellBackToLocal = false;
  onWriteError: ((err: unknown) => void) | null = null; // app surfaces a failed write (e.g. quota)
  onAfterWrite: (() => void) | null = null; // fires after any successful data write (drives disk backup)

  // Prefer IndexedDB; fall back to localStorage if it's unavailable. On the first run that
  // upgrades a localStorage user to IndexedDB, copy their existing data across once.
  async init(): Promise<void> {
    if (idbAvailable()) {
      try {
        await idbGet(KEYS.meta); // forces the DB open; throws if blocked/unavailable
        this.mode = "idb";
        await this._seedFromLocalStorage();
        console.info("Koin store: IndexedDB backend (koin/kv).");
        return;
      } catch (err) {
        console.warn("Koin store: IndexedDB unavailable, using localStorage", err);
        this.fellBackToLocal = true;
      }
    }
    this.mode = "local";
    console.info("Koin store: localStorage backend (per-browser).");
  }

  // One-time, best-effort upgrade: if IndexedDB has no value for a key but localStorage does,
  // copy it over. A straight blob copy (identical shapes) — not a schema migration — so an
  // existing user keeps their dashboard on upgrade instead of re-importing. Never clobbers
  // data already in IndexedDB.
  private async _seedFromLocalStorage(): Promise<void> {
    if (typeof localStorage === "undefined") return;
    for (const key of Object.values(KEYS)) {
      let raw: string | null = null;
      try { raw = localStorage.getItem(key); } catch { return; } // ls blocked — nothing to seed
      if (raw == null) continue;
      try {
        if ((await idbGet(key)) !== undefined) continue; // don't overwrite IndexedDB data
        await idbSet(key, JSON.parse(raw));
      } catch (err) {
        console.warn("Koin store: seed skipped for", key, err);
      }
    }
  }

  // --- low-level read/write (mode-aware) -----------------------------------
  async _read<T>(key: string, fallback: T): Promise<T> {
    try {
      if (this.mode === "idb") {
        const v = await idbGet<T>(key);
        return v === undefined ? fallback : v;
      }
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch (err) {
      console.error("Koin store: failed to read", key, err);
      return fallback;
    }
  }

  async _write(key: string, value: unknown): Promise<void> {
    try {
      if (this.mode === "idb") await idbSet(key, value);
      else localStorage.setItem(key, JSON.stringify(value));
      if (this.onAfterWrite) this.onAfterWrite(); // data changed → refresh the disk backup
    } catch (err) {
      // Surface failures (e.g. QuotaExceededError, or a rejected IDB transaction) instead of
      // failing silently. The in-memory state is already updated; we notify so the app can
      // warn the user to back up, rather than throwing into a bare `await store.setXxx()`
      // (which would become an unhandled rejection).
      console.error("Koin store: failed to write", key, err);
      if (this.onWriteError) this.onWriteError(err);
    }
  }

  // Atomic, strict multi-key write for restore: all keys land together or none do, and a
  // failure PROPAGATES (unlike _write, which swallows so fire-and-forget accessors never
  // reject). importAll relies on this so it can only report success once the data truly
  // committed. On IndexedDB one transaction gives atomicity for free; on the localStorage
  // fallback we snapshot the prior values and roll back if any write throws.
  private async _writeAllStrict(entries: [string, unknown][]): Promise<void> {
    if (this.mode === "idb") { await idbSetMany(entries); return; }
    const prior = entries.map(([k]) => [k, localStorage.getItem(k)] as const);
    try {
      for (const [k, v] of entries) localStorage.setItem(k, JSON.stringify(v));
    } catch (err) {
      for (const [k, raw] of prior) {
        // Best-effort rollback; never let a failing restore mask the original write error.
        try { if (raw == null) localStorage.removeItem(k); else localStorage.setItem(k, raw); } catch { /* ignore */ }
      }
      throw err;
    }
  }

  // --- typed accessors -----------------------------------------------------
  async getTransactions(): Promise<Transaction[]> { return this._read(KEYS.transactions, [] as Transaction[]); }
  async setTransactions(list: Transaction[]): Promise<void> { return this._write(KEYS.transactions, list); }

  async getManual(): Promise<Transaction[]> { return this._read(KEYS.manual, [] as Transaction[]); }
  async setManual(list: Transaction[]): Promise<void> { return this._write(KEYS.manual, list); }

  async getOverrides(): Promise<OverrideMap> { return this._read(KEYS.overrides, {} as OverrideMap); }
  async setOverrides(map: OverrideMap): Promise<void> { return this._write(KEYS.overrides, map); }

  async getRules(): Promise<RuleSet | null> { return this._read(KEYS.rules, null as RuleSet | null); }
  async setRules(rules: RuleSet): Promise<void> { return this._write(KEYS.rules, rules); }

  async getCategories(): Promise<Category[] | null> { return this._read(KEYS.categories, null as Category[] | null); }
  async setCategories(cats: Category[]): Promise<void> { return this._write(KEYS.categories, cats); }

  async getMeta(): Promise<Meta> { return this._read(KEYS.meta, { schemaVersion: SCHEMA_VERSION, imports: [] } as Meta); }
  async setMeta(meta: Meta): Promise<void> { return this._write(KEYS.meta, meta); }

  // --- bulk export / import (backup) --------------------------------------
  async exportAll(): Promise<Backup> {
    return {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      transactions: await this.getTransactions(),
      manual: await this.getManual(),
      overrides: await this.getOverrides(),
      rules: await this.getRules(),
      categories: await this.getCategories(),
      meta: await this.getMeta(),
    };
  }

  // Restore = REPLACE the whole dataset with this backup, atomically. Not a merge: a key the
  // backup omits is reset to empty rather than left holding stale rows, so you can't end up with
  // a Frankenstein of old + restored data. Writes go through _writeAllStrict so the operation is
  // all-or-nothing AND a failure propagates (the caller only reports success once it commits).
  async importAll(dump: Backup): Promise<void> {
    if (!dump || typeof dump !== "object") throw new Error("Invalid backup file");
    // Shape-check before writing anything, so a corrupt/hand-edited/shared backup can't
    // poison the store and crash compose() with NaN or a bad type. (Backups travel between
    // people once Koin is open-source.)
    const isArray = Array.isArray;
    const isObject = (x: unknown) => typeof x === "object" && x !== null && !isArray(x);
    if (dump.transactions !== undefined && !isArray(dump.transactions)) throw new Error("Invalid backup: 'transactions' must be a list");
    if (dump.manual !== undefined && !isArray(dump.manual)) throw new Error("Invalid backup: 'manual' must be a list");
    if (dump.overrides !== undefined && !isObject(dump.overrides)) throw new Error("Invalid backup: 'overrides' must be an object");
    if (dump.categories != null && !isArray(dump.categories)) throw new Error("Invalid backup: 'categories' must be a list");
    if (dump.rules != null && !isObject(dump.rules)) throw new Error("Invalid backup: 'rules' must be an object");
    if (dump.meta !== undefined && !isObject(dump.meta)) throw new Error("Invalid backup: 'meta' must be an object");
    if (dump.schemaVersion !== undefined && typeof dump.schemaVersion !== "number") throw new Error("Invalid backup: bad 'schemaVersion'");
    // Validate the money-critical fields of every transaction, so a hand-edited/shared backup
    // with e.g. `"amount": "abc"` can't write NaN into the store and poison every total. Cheap
    // at personal scale (a few thousand rows), and restore is all-or-nothing anyway.
    const checkTxns = (list: Transaction[] | undefined, label: string) => {
      for (let i = 0; i < (list?.length ?? 0); i++) {
        const t = list![i] as unknown as Record<string, unknown>;
        if (!isObject(t)) throw new Error(`Invalid backup: ${label}[${i}] is not a transaction`);
        if (typeof t.id !== "string" || !t.id) throw new Error(`Invalid backup: ${label}[${i}] has no valid id`);
        if (typeof t.amount !== "number" || !Number.isFinite(t.amount)) throw new Error(`Invalid backup: ${label}[${i}] has a non-numeric amount`);
        if (t.direction !== undefined && t.direction !== "debit" && t.direction !== "credit") throw new Error(`Invalid backup: ${label}[${i}] has an invalid direction`);
      }
    };
    checkTxns(dump.transactions, "transactions");
    checkTxns(dump.manual, "manual");
    // We don't run migration code (see docs/ARCHITECTURE.md); reject a backup from a newer
    // schema instead of silently mis-reading it.
    if (typeof dump.schemaVersion === "number" && dump.schemaVersion > SCHEMA_VERSION) {
      throw new Error(`Backup is from a newer version of Koin (schema v${dump.schemaVersion}); update Koin to restore it.`);
    }

    const meta: Meta = isObject(dump.meta) ? (dump.meta as Meta) : { schemaVersion: SCHEMA_VERSION, imports: [] };
    await this._writeAllStrict([
      [KEYS.transactions, dump.transactions ?? []],
      [KEYS.manual,       dump.manual ?? []],
      [KEYS.overrides,    dump.overrides ?? {}],
      [KEYS.rules,        dump.rules ?? null],
      [KEYS.categories,   dump.categories ?? null],
      [KEYS.meta,         meta],
    ]);
  }

  // --- linked disk-backup file handle (File System Access API) -------------
  // Stored via IndexedDB's structured clone; unavailable on the localStorage fallback (a
  // handle can't be serialized to a string). Written directly through idb* so it never trips
  // onAfterWrite — persisting the handle isn't a data change.
  async getBackupHandle(): Promise<FileSystemFileHandle | null> {
    if (this.mode !== "idb") return null;
    return (await idbGet<FileSystemFileHandle>(BACKUP_HANDLE_KEY)) ?? null;
  }
  async setBackupHandle(handle: FileSystemFileHandle): Promise<void> {
    if (this.mode === "idb") await idbSet(BACKUP_HANDLE_KEY, handle);
  }
  async clearBackupHandle(): Promise<void> {
    if (this.mode === "idb") await idbDel(BACKUP_HANDLE_KEY);
  }

  async clearAll(): Promise<void> {
    if (this.mode === "idb") { await idbClear(); return; } // also drops the backup-file handle
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  }
}

export const store = new KoinStore();
