// store/index.ts — the ONLY module that talks to persistent storage.
//
// Two backends behind ONE interface (the seam designed for a future DB):
//   • "file"  — when Koin is served by the legacy helper, data lives in ONE JSON file at
//               ~/.koin/koin-data.json via GET/PUT /api/data. (Superseded by Vite; the file
//               backend is unreachable under the dev server and is retired in Step 4.)
//   • "local" — browser localStorage (per-browser). The default under Vite.
// `await store.init()` picks the backend at startup. Method names/return shapes are the same
// for both, so the rest of Koin never knows or cares which is active.
import type { Category, Override, RuleSet, Transaction } from "../core/types";

export type OverrideMap = Record<string, Override>;

export interface Meta {
  schemaVersion: number;
  imports: unknown[];
  paletteVersion?: number;
  [key: string]: unknown;
}

// Sent to onSaveRejected when the file backend's shrink-guard refuses a save (HTTP 409).
export interface SaveRejection {
  current: number;
  incoming: number;
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
const SAVE_DEBOUNCE_MS = 250;

class KoinStore {
  mode: "local" | "file" = "local"; // until init() upgrades us to "file"
  cache: Record<string, unknown> = {}; // in-memory copy of the file blob (file mode only)
  onSaveRejected: ((info: SaveRejection) => void) | null = null; // app surfaces shrink-guard rejection
  onWriteError: ((err: unknown) => void) | null = null; // app surfaces a failed write (e.g. quota)
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _dirty = false; // true once this tab has unsaved edits (file mode)

  // Detect the local helper. If GET /api/data works, use the shared file backend.
  async init(): Promise<void> {
    try {
      const res = await fetch("/api/data", { method: "GET", cache: "no-store" });
      if (res.ok) {
        this.cache = (await res.json()) || {};
        this.mode = "file";
        window.addEventListener("pagehide", () => this._flushBeacon());
        console.info("Koin store: file backend (~/.koin/koin-data.json, shared across browsers)");
        return;
      }
    } catch { /* helper not running — fall through to localStorage */ }
    this.mode = "local";
    console.info("Koin store: localStorage backend (per-browser).");
  }

  // --- low-level read/write (mode-aware) -----------------------------------
  async _read<T>(key: string, fallback: T): Promise<T> {
    if (this.mode === "file") {
      return Object.prototype.hasOwnProperty.call(this.cache, key) ? (this.cache[key] as T) : fallback;
    }
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch (err) {
      console.error("Koin store: failed to read", key, err);
      return fallback;
    }
  }

  async _write(key: string, value: unknown): Promise<void> {
    if (this.mode === "file") {
      this.cache[key] = value;
      this._dirty = true;
      this._scheduleSave();
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      // Surface failures (e.g. QuotaExceededError) instead of failing silently. The
      // in-memory state is already updated; we notify so the app can warn the user to back
      // up, rather than throwing into a bare `await store.setXxx()` (an unhandled rejection).
      console.error("Koin store: failed to write", key, err);
      if (this.onWriteError) this.onWriteError(err);
    }
  }

  // --- file-mode persistence -----------------------------------------------
  private _scheduleSave(): void {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._flush(), SAVE_DEBOUNCE_MS);
  }

  // force=true bypasses the server's shrink-guard (for intentional bulk ops: restore/reset).
  async _flush(force?: boolean): Promise<void> {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    if (this.mode !== "file") return;
    const body = JSON.stringify(this.cache);
    try {
      const res = await fetch("/api/data" + (force ? "?force=1" : ""), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (res.status === 409) {
        // Shrink-guard refused the save — newer/larger data is on disk. Keep _dirty so a
        // later forced save can still go through, and let the app warn the user.
        const info = await res.json().catch(() => ({}));
        console.warn("Koin store: save rejected by shrink-guard", info);
        if (typeof this.onSaveRejected === "function") this.onSaveRejected(info);
        return;
      }
      if (!res.ok) { console.error("Koin store: save failed", res.status); return; }
      this._dirty = false;
    } catch (err) {
      console.error("Koin store: save failed", err);
    }
  }

  private _flushBeacon(): void {
    // synchronous-safe save during unload — ONLY if this tab actually has unsaved edits, so
    // merely viewing data and closing the tab can never overwrite the file. Unforced, so the
    // server's shrink-guard still applies.
    if (this.mode !== "file" || !this._dirty) return;
    try {
      navigator.sendBeacon("/api/data", new Blob([JSON.stringify(this.cache)], { type: "application/json" }));
    } catch { /* ignore */ }
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
    if (this.mode === "file") await this._flush(true); // force: restore is intentional
  }

  async clearAll(): Promise<void> {
    if (this.mode === "file") {
      this.cache = {};
      await this._flush(true); // force: reset is intentional
      return;
    }
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  }
}

export const store = new KoinStore();
