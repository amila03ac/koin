// idb.ts — a tiny promise wrapper over the browser's native IndexedDB, used as ONE
// key → value object store. Koin's store only ever reads/writes whole JSON blobs by key
// (six of them: transactions, manual, overrides, rules, categories, meta) — there are no
// queries, indexes, or relations — so the native API as a plain KV map is all we need.
// That's why this is ~40 hand-rolled lines instead of a dependency like Dexie, whose
// querying/schema-versioning power would be wasted here.
//
// Only store/index.ts imports this; the rest of Koin never touches IndexedDB directly.

const DB_NAME = "koin";
const STORE = "kv";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function idbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB open blocked by another tab"));
  });
  return dbPromise;
}

// Run one request inside a transaction; resolve when the transaction commits (durability),
// not merely when the request fires. A rejected transaction surfaces to store._write, which
// notifies onWriteError so a failed save is never silent.
function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export function idbGet<T>(key: string): Promise<T | undefined> {
  return run("readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
}

export function idbSet(key: string, value: unknown): Promise<void> {
  return run("readwrite", (s) => s.put(value, key)).then(() => undefined);
}

// Put several key→value pairs in ONE transaction, so they either all commit or all abort.
// Used by store.importAll for an atomic restore: a mid-restore failure (e.g. quota) must not
// leave a half-replaced dataset. IndexedDB transactions give this for free — if any put fails
// the transaction aborts and nothing is applied.
export function idbSetMany(entries: [string, unknown][]): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const s = tx.objectStore(STORE);
        for (const [key, value] of entries) s.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export function idbDel(key: string): Promise<void> {
  return run("readwrite", (s) => s.delete(key)).then(() => undefined);
}

export function idbClear(): Promise<void> {
  return run("readwrite", (s) => s.clear()).then(() => undefined);
}
