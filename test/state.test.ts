// Unit tests for the shared UI state derivation (src/ui/state.ts). compose() is pure and
// DOM-free, so it runs in Node. Seeds the module-level `state`, calls compose(), and checks
// overrides + rules are layered correctly. Extracted from app.js in Step 3b.
import { afterEach, expect, test } from "vitest";
import { compose, hasFieldEdits, latestDate, state } from "../src/ui/state";
import { DEFAULT_RULES } from "../src/core/defaults";
import type { Transaction } from "../src/core/types";

function txn(over: Partial<Transaction>): Transaction {
  return {
    id: "t1", postedDate: "2026-03-01", effectiveDate: "2026-03-01",
    description: "COLES 123", merchant: "COLES", amount: -50, direction: "debit",
    balance: null, category: "uncategorized", categorySource: "auto",
    ignored: false, recurring: false, source: "csv", ...over,
  };
}

function reset() {
  state.raw = []; state.manual = []; state.overrides = {}; state.rules = DEFAULT_RULES;
  state.effective = [];
}
afterEach(reset);

test("compose auto-categorizes via rules", () => {
  reset();
  state.raw = [txn({ id: "a", description: "COLES SUPERMARKET", merchant: "COLES" })];
  compose();
  expect(state.effective[0].category).toBe("groceries");
});

test("compose applies a category override (manual choice wins)", () => {
  reset();
  state.raw = [txn({ id: "a", description: "COLES", merchant: "COLES" })];
  state.overrides = { a: { category: "dining" } };
  compose();
  expect(state.effective[0].category).toBe("dining");
  expect(state.effective[0].categorySource).toBe("manual");
});

test("compose applies an ignore override and hides deleted rows", () => {
  reset();
  state.raw = [txn({ id: "a" }), txn({ id: "b" })];
  state.overrides = { a: { ignored: true }, b: { deleted: true } };
  compose();
  expect(state.effective.map((t) => t.id)).toEqual(["a"]); // b removed
  expect(state.effective[0].ignored).toBe(true);
});

test("compose applies field edits before rules (re-categorizes by the edited text)", () => {
  reset();
  state.raw = [txn({ id: "a", description: "MYSTERY", merchant: "MYSTERY", category: "uncategorized" })];
  state.overrides = { a: { merchant: "Netflix", description: "Netflix monthly" } };
  compose();
  expect(state.effective[0].merchant).toBe("Netflix");
  expect(state.effective[0].category).toBe("subscriptions"); // rule matched the edited text
});

test("compose flips direction when an amount edit crosses zero", () => {
  reset();
  state.raw = [txn({ id: "a", amount: -50, direction: "debit" })];
  state.overrides = { a: { amount: 50 } };
  compose();
  expect(state.effective[0].amount).toBe(50);
  expect(state.effective[0].direction).toBe("credit");
});

test("latestDate returns the most recent effective date", () => {
  reset();
  state.raw = [
    txn({ id: "a", effectiveDate: "2026-01-10" }),
    txn({ id: "b", effectiveDate: "2026-05-02" }),
  ];
  compose();
  expect(latestDate()).toBe("2026-05-02");
});

test("hasFieldEdits detects only field edits (not category/ignore)", () => {
  expect(hasFieldEdits({ category: "dining" })).toBe(false);
  expect(hasFieldEdits({ ignored: true })).toBe(false);
  expect(hasFieldEdits({ merchant: "X" })).toBe(true);
  expect(hasFieldEdits(undefined)).toBe(false);
});
