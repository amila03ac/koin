// @vitest-environment jsdom
//
// Tests for the storage adapter's data-safety behaviors added per the 2026-06-12 review:
// backup shape validation (importAll) and surfacing write failures (onWriteError). These
// never call store.init(), so the store stays on its default localStorage backend — which is
// also the real fallback path when IndexedDB is unavailable. (The IndexedDB backend itself is
// covered in test/idb.test.ts.)
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { store } from "../src/store/index";
import type { Backup } from "../src/store/index";

beforeEach(() => { localStorage.clear(); store.onWriteError = null; store.onAfterWrite = null; });
afterEach(() => { vi.restoreAllMocks(); });

test("importAll rejects a backup with the wrong shape", async () => {
  await expect(store.importAll({ transactions: "nope" } as unknown as Backup)).rejects.toThrow(/transactions/);
  await expect(store.importAll({ overrides: [] } as unknown as Backup)).rejects.toThrow(/overrides/);
  await expect(store.importAll({ rules: [] } as unknown as Backup)).rejects.toThrow(/rules/);
  await expect(store.importAll(null as unknown as Backup)).rejects.toThrow(/Invalid backup/);
});

test("importAll accepts a well-formed backup", async () => {
  await expect(store.importAll({ transactions: [], manual: [], overrides: {}, rules: null, categories: [] })).resolves.toBeUndefined();
});

test("importAll rejects a backup from a newer schema version", async () => {
  await expect(store.importAll({ schemaVersion: 999 } as unknown as Backup)).rejects.toThrow(/newer version/);
});

test("importAll REPLACES the whole dataset — omitted keys reset, not merged", async () => {
  await store.setManual([{ id: "old" }] as unknown as never);
  await store.importAll({ transactions: [{ id: "t" }] } as unknown as Backup);
  expect(await store.getTransactions()).toEqual([{ id: "t" }]);
  // 'manual' wasn't in the backup, so it must be reset to empty — not left holding the old row.
  expect(await store.getManual()).toEqual([]);
});

test("importAll is atomic: a mid-restore write failure rolls back to the prior data", async () => {
  await store.setTransactions([{ id: "keep-t" }] as unknown as never);
  await store.setManual([{ id: "keep-m" }] as unknown as never);
  const real = Storage.prototype.setItem;
  // Let the first key write, then fail on 'manual' — the earlier transactions write must undo.
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
    if (k === "koin:manual") throw new DOMException("full", "QuotaExceededError");
    return real.call(this, k, v);
  });

  await expect(store.importAll({ transactions: [{ id: "new-t" }], manual: [{ id: "new-m" }] } as unknown as Backup)).rejects.toThrow();
  vi.restoreAllMocks();
  expect(await store.getTransactions()).toEqual([{ id: "keep-t" }]);
  expect(await store.getManual()).toEqual([{ id: "keep-m" }]);
});

test("onAfterWrite fires after a successful write, not on reads", async () => {
  let count = 0;
  store.onAfterWrite = () => { count++; };
  await store.getTransactions();     // read — must not fire
  expect(count).toBe(0);
  await store.setTransactions([]);   // write — fires once
  expect(count).toBe(1);
});

test("getBackupHandle is null on the localStorage backend (handles need IndexedDB)", async () => {
  expect(await store.getBackupHandle()).toBeNull();
});

test("a failed localStorage write notifies onWriteError instead of throwing", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("full", "QuotaExceededError");
  });
  let caught: unknown = null;
  store.onWriteError = (err) => { caught = err; };

  // Must not reject (bare `await store.setXxx()` call sites have no .catch()).
  await expect(store.setTransactions([])).resolves.toBeUndefined();
  expect(caught).toBeInstanceOf(DOMException);
});
