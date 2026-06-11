// @vitest-environment jsdom
//
// Boot + integration smoke tests. Loads the real index.html body and the app module
// (src/ui/app.js, which now imports the typed core + store directly — no global Koin),
// fires DOMContentLoaded, and asserts the app boots without throwing. The second test
// seeds the store and verifies the dashboard actually renders — a regression net for the
// de-globalization (Step 3) and the upcoming ui/* split (Step 3b). Runs in jsdom; with no
// /api/data helper, store falls back to localStorage (the real static-host behavior).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import "../src/ui/app.js"; // registers the DOMContentLoaded init; pulls in the whole graph
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
