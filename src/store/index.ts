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
import { idbAvailable, idbGet, idbSet, idbClear } from "./idb";

export type OverrideMap = Record<string, Override>;

export interface Meta {
  schemaVersion: number;
  imports: unknown[];
  paletteVersion?: number;
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
  onWriteError: ((err: unknown) => void) | null = null; // app surfaces a failed write (e.g. quota)

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
    } catch (err) {
      // Surface failures (e.g. QuotaExceededError, or a rejected IDB transaction) instead of
      // failing silently. The in-memory state is already updated; we notify so the app can
      // warn the user to back up, rather than throwing into a bare `await store.setXxx()`
      // (which would become an unhandled rejection).
      console.error("Koin store: failed to write", key, err);
      if (this.onWriteError) this.onWriteError(err);
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
    if (dump.schemaVersion !== undefined && typeof dump.schemaVersion !== "number") throw new Error("Invalid backup: bad 'schemaVersion'");

    if (dump.transactions) await this.setTransactions(dump.transactions);
    if (dump.manual)       await this.setManual(dump.manual);
    if (dump.overrides)    await this.setOverrides(dump.overrides);
    if (dump.rules)        await this.setRules(dump.rules);
    if (dump.categories)   await this.setCategories(dump.categories);
    if (dump.meta)         await this.setMeta(dump.meta);
  }

  async clearAll(): Promise<void> {
    if (this.mode === "idb") { await idbClear(); return; }
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  }
}

export const store = new KoinStore();
