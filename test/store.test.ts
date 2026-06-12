// @vitest-environment jsdom
//
// Tests for the storage adapter's data-safety behaviors added per the 2026-06-12 review:
// backup shape validation (importAll) and surfacing write failures (onWriteError). Runs in
// jsdom so localStorage exists; the store defaults to the "local" backend.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { store } from "../src/store/index";
import type { Backup } from "../src/store/index";

beforeEach(() => { localStorage.clear(); store.onWriteError = null; });
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
