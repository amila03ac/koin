// @vitest-environment jsdom
//
// Boot smoke test: loads the real index.html body, imports the app the same way
// src/main.ts does, fires DOMContentLoaded, and asserts the app boots without throwing
// and renders its initial (empty) state. Guards the Step 2–3 refactors from silently
// breaking startup. (Runs in jsdom; the file backend isn't present, so store.js falls
// back to localStorage — exactly the real file:// / static-host behavior.)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
// Load the app exactly like src/main.ts (order matters; each attaches to global Koin).
// Typed core modules + the not-yet-ported legacy UI files (side-effect imports).
import "../src/core/defaults";
import "../js/store.js";
import "../src/core/parser";
import "../src/core/rules";
import "../js/categories.js";
import "../src/core/insights";
import "../js/charts.js";
import "../js/app.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

beforeEach(() => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  const body = html.replace(/[\s\S]*<body[^>]*>/i, "").replace(/<\/body>[\s\S]*/i, "");
  document.body.innerHTML = body;
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("app boots and renders its initial state without errors", async () => {
  const errors: unknown[] = [];
  window.addEventListener("error", (e) => errors.push(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => errors.push((e as PromiseRejectionEvent).reason));

  const Koin = (globalThis as unknown as { Koin: any }).Koin;
  // All modules wired onto the global namespace.
  for (const k of ["store", "parser", "rules", "insights", "charts"]) {
    expect(Koin[k], `Koin.${k} missing`).toBeTruthy();
  }

  // Fire the init trigger and let async init() settle.
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await new Promise((r) => setTimeout(r, 50));

  expect(errors, `boot errors: ${errors.join("; ")}`).toHaveLength(0);
  // With no data, the empty state is shown and the dashboard hidden.
  const empty = document.getElementById("empty")!;
  const app = document.getElementById("app")!;
  expect(empty.style.display).not.toBe("none");
  expect(app.style.display).toBe("none");
});
