// store.js — the ONLY module that talks to persistent storage.
//
// Loaded as a classic script (not an ES module) so Koin works when you simply
// double-click index.html (file://). Everything attaches to the global `Koin`.
//
// Two backends behind ONE interface (this is the seam designed for a future DB):
//   • "file"  — when Koin is served by server.js, all data lives in ONE JSON file at
//               ~/.koin/koin-data.json via GET/PUT /api/data. Shared across browsers.
//   • "local" — fallback when opened directly (file://) or via a plain static server:
//               browser localStorage (per-browser).
// `await store.init()` picks the backend at startup. Method names/return shapes are the
// same for both, so the rest of Koin never knows or cares which is active.
(function () {
  window.Koin = window.Koin || {};

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
  const SCHEMA_VERSION = 1;
  const SAVE_DEBOUNCE_MS = 250;

  class KoinStore {
    constructor() {
      this.mode = "local";   // until init() upgrades us to "file"
      this.cache = {};       // in-memory copy of the file blob (file mode only)
      this._saveTimer = null;
      this._savePromise = null;
    }

    // Detect the local helper. If GET /api/data works, use the shared file backend.
    async init() {
      try {
        const res = await fetch("/api/data", { method: "GET", cache: "no-store" });
        if (res.ok) {
          this.cache = (await res.json()) || {};
          this.mode = "file";
          // best-effort flush of any pending save when the tab goes away
          window.addEventListener("pagehide", () => this._flushBeacon());
          console.info("Koin store: file backend (~/.koin/koin-data.json, shared across browsers)");
          return;
        }
      } catch (_) { /* helper not running — fall through to localStorage */ }
      this.mode = "local";
      console.info("Koin store: localStorage backend (per-browser). Run `node server.js` for cross-browser persistence.");
    }

    // --- low-level read/write (mode-aware) -----------------------------------
    async _read(key, fallback) {
      if (this.mode === "file") {
        return Object.prototype.hasOwnProperty.call(this.cache, key) ? this.cache[key] : fallback;
      }
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (err) {
        console.error("Koin store: failed to read", key, err);
        return fallback;
      }
    }
    async _write(key, value) {
      if (this.mode === "file") {
        this.cache[key] = value;
        this._scheduleSave();
        return;
      }
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        console.error("Koin store: failed to write", key, err);
        throw err;
      }
    }

    // --- file-mode persistence -----------------------------------------------
    _scheduleSave() {
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this._flush(), SAVE_DEBOUNCE_MS);
    }
    async _flush() {
      clearTimeout(this._saveTimer);
      if (this.mode !== "file") return;
      const body = JSON.stringify(this.cache);
      this._savePromise = fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      }).catch((err) => console.error("Koin store: save failed", err));
      return this._savePromise;
    }
    _flushBeacon() {
      // synchronous-safe save during unload
      if (this.mode !== "file") return;
      try {
        navigator.sendBeacon("/api/data", new Blob([JSON.stringify(this.cache)], { type: "application/json" }));
      } catch (_) { /* ignore */ }
    }

    // --- typed accessors -----------------------------------------------------
    async getTransactions() { return this._read(KEYS.transactions, []); }
    async setTransactions(list) { return this._write(KEYS.transactions, list); }

    async getManual() { return this._read(KEYS.manual, []); }
    async setManual(list) { return this._write(KEYS.manual, list); }

    async getOverrides() { return this._read(KEYS.overrides, {}); }
    async setOverrides(map) { return this._write(KEYS.overrides, map); }

    async getRules() { return this._read(KEYS.rules, null); }
    async setRules(rules) { return this._write(KEYS.rules, rules); }

    async getCategories() { return this._read(KEYS.categories, null); }
    async setCategories(cats) { return this._write(KEYS.categories, cats); }

    async getMeta() { return this._read(KEYS.meta, { schemaVersion: SCHEMA_VERSION, imports: [] }); }
    async setMeta(meta) { return this._write(KEYS.meta, meta); }

    // --- bulk export / import (backup) --------------------------------------
    async exportAll() {
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
    async importAll(dump) {
      if (!dump || typeof dump !== "object") throw new Error("Invalid backup file");
      if (dump.transactions) await this.setTransactions(dump.transactions);
      if (dump.manual)       await this.setManual(dump.manual);
      if (dump.overrides)    await this.setOverrides(dump.overrides);
      if (dump.rules)        await this.setRules(dump.rules);
      if (dump.categories)   await this.setCategories(dump.categories);
      if (dump.meta)         await this.setMeta(dump.meta);
      if (this.mode === "file") await this._flush(); // persist before the caller reloads
    }
    async clearAll() {
      if (this.mode === "file") {
        this.cache = {};
        await this._flush();
        return;
      }
      Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    }
  }

  Koin.store = new KoinStore();
  Koin.SCHEMA_VERSION = SCHEMA_VERSION;
})();
