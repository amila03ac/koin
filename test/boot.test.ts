// @vitest-environment jsdom
//
// Boot + integration smoke tests. Loads the real index.html body and the app module
// (src/ui/app.js, which now imports the typed core + store directly — no global Koin),
// fires DOMContentLoaded, and asserts the app boots without throwing. The second test
// seeds the store and verifies the dashboard actually renders — a regression net for the
// de-globalization (Step 3) and the ui/* split (Step 3b). Runs in jsdom, which has no
// IndexedDB, so store.init() falls back to localStorage here (the IndexedDB path is covered
// separately in test/idb.test.ts via fake-indexeddb).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import "../src/ui/app"; // registers the DOMContentLoaded init; pulls in the whole graph
import { store } from "../src/store/index";
import * as parser from "../src/core/parser";
import { DEFAULT_RULES } from "../src/core/defaults";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sampleCsv = readFileSync(join(root, "data/Transactions.sample.csv"), "utf8");

function loadBodyFromIndexHtml(): void {
  const html = readFileSync(join(root, "index.html"), "utf8");
  const body = html.replace(/[\s\S]*<body[^>]*>/i, "").replace(/<\/body>[\s\S]*/i, "");
  document.body.innerHTML = body;
}

async function boot(): Promise<unknown[]> {
  const errors: unknown[] = [];
  window.addEventListener("error", (e) => errors.push(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => errors.push((e as PromiseRejectionEvent).reason));
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await new Promise((r) => setTimeout(r, 80));
  return errors;
}

beforeEach(() => {
  localStorage.clear();
  loadBodyFromIndexHtml();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("boots and renders the empty state without errors when there's no data", async () => {
  const errors = await boot();
  expect(errors, `boot errors: ${errors.join("; ")}`).toHaveLength(0);
  expect(document.getElementById("empty")!.style.display).not.toBe("none");
  expect(document.getElementById("app")!.style.display).toBe("none");
});

test("renders the dashboard when transactions are present", async () => {
  const { transactions } = parser.parse(sampleCsv);
  await store.setTransactions(transactions);
  await store.setRules(DEFAULT_RULES);

  const errors = await boot();
  expect(errors, `boot errors: ${errors.join("; ")}`).toHaveLength(0);

  // Dashboard shown, empty state hidden.
  expect(document.getElementById("app")!.style.display).not.toBe("none");
  expect(document.getElementById("empty")!.style.display).toBe("none");
  // The transaction table got rows, and the donut/legend rendered something.
  expect(document.querySelectorAll("#txn-body tr").length).toBeGreaterThan(0);
  expect(document.querySelector("#donut svg")).toBeTruthy();
  // The section renderers (now in ui/render-sections) populated their panels.
  expect(document.querySelectorAll("#summary .card").length).toBeGreaterThan(0);
  expect(document.querySelectorAll("#insights .insight-box").length).toBe(3);
  expect(document.querySelectorAll("#period-jump option").length).toBeGreaterThan(0);
});

test("ignoring a row re-renders via the render bus (row drops out, override persists)", async () => {
  const { transactions } = parser.parse(sampleCsv);
  await store.setTransactions(transactions);
  await store.setRules(DEFAULT_RULES);
  await boot();

  const before = document.querySelectorAll("#txn-body tr").length;
  expect(before).toBeGreaterThan(0);

  // First row's first action button is "Ignore". Clicking it must hide the row (default
  // filter hides ignored) — proving table -> setOverride -> rerender -> renderAll worked.
  const ignoreBtn = document.querySelector("#txn-body tr .row-actions button") as HTMLButtonElement;
  ignoreBtn.dispatchEvent(new Event("click"));
  await new Promise((r) => setTimeout(r, 30));

  expect(document.querySelectorAll("#txn-body tr").length).toBe(before - 1);
  const overrides = await store.getOverrides();
  expect(Object.values(overrides).some((o) => o.ignored === true)).toBe(true);
});

test("opening the Rules modal renders the editor (regression: field() must be in scope)", async () => {
  const { transactions } = parser.parse(sampleCsv);
  await store.setTransactions(transactions);
  await store.setRules(DEFAULT_RULES);
  await boot();

  (document.getElementById("btn-rules") as HTMLButtonElement).dispatchEvent(new Event("click"));
  await new Promise((r) => setTimeout(r, 20));

  const modal = document.querySelector(".modal-overlay");
  expect(modal).toBeTruthy();
  expect(modal!.querySelector(".modal-head h2")?.textContent).toBe("Manage rules & categories");
  expect(modal!.querySelectorAll(".category-row").length).toBeGreaterThan(0);
  // The advanced section's textarea is wrapped by field(); if field() were out of scope the
  // modal would have thrown before opening, so this both renders and guards that regression.
  expect(modal!.querySelector(".json-editor")).toBeTruthy();
});
