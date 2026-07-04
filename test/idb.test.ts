// @vitest-environment jsdom
//
// Exercises the IndexedDB backend (Step 4) end to end. jsdom has no IndexedDB, so we load
// `fake-indexeddb/auto` to provide an in-memory implementation; this makes store.init() pick
// the "idb" backend exactly as a real browser would. Covers: the raw KV wrapper, init()
// selecting IndexedDB, the one-time localStorage→IndexedDB seed for upgrading users, a
// write/read round-trip through the store, and clearAll.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, test } from "vitest";
import { idbAvailable, idbGet, idbSet, idbSetMany, idbDel, idbClear } from "../src/store/idb";
import { store } from "../src/store/index";
import type { Transaction } from "../src/core/types";

describe("idb KV wrapper", () => {
  test("reports availability under fake-indexeddb", () => {
    expect(idbAvailable()).toBe(true);
  });

  test("round-trips, overwrites, deletes, and clears values", async () => {
    expect(await idbGet("k")).toBeUndefined();
    await idbSet("k", { a: 1 });
    expect(await idbGet("k")).toEqual({ a: 1 });
    await idbSet("k", { a: 2 }); // overwrite same key
    expect(await idbGet("k")).toEqual({ a: 2 });
    await idbDel("k");
    expect(await idbGet("k")).toBeUndefined();
    await idbSet("x", 1);
    await idbClear();
    expect(await idbGet("x")).toBeUndefined();
  });

  test("idbSetMany writes several keys in one transaction", async () => {
    await idbSetMany([["a", 1], ["b", { n: 2 }], ["c", [3]]]);
    expect(await idbGet("a")).toBe(1);
    expect(await idbGet("b")).toEqual({ n: 2 });
    expect(await idbGet("c")).toEqual([3]);
    await idbClear();
  });
});

describe("store on the IndexedDB backend", () => {
  beforeAll(async () => {
    // Simulate an upgrading user: existing data sits in localStorage before the first init().
    localStorage.setItem("koin:transactions", JSON.stringify([{ id: "t1" }]));
    await store.init();
  });

  test("init() selects the IndexedDB backend", () => {
    expect(store.mode).toBe("idb");
  });

  test("seeds existing localStorage data into IndexedDB once", async () => {
    expect(await store.getTransactions()).toEqual([{ id: "t1" }]);
    // …and it's genuinely in IndexedDB, not read through from localStorage.
    expect(await idbGet("koin:transactions")).toEqual([{ id: "t1" }]);
  });

  test("writes and reads back through IndexedDB", async () => {
    await store.setManual([{ id: "m1" }] as unknown as Transaction[]);
    expect(await store.getManual()).toEqual([{ id: "m1" }]);
  });

  test("clearAll empties the IndexedDB store", async () => {
    await store.clearAll();
    expect(await store.getTransactions()).toEqual([]);
    expect(await store.getManual()).toEqual([]);
  });
});
