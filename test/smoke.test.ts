// Step 1 smoke test: proves the Vitest scaffold runs and the legacy modules load and
// attach to the global `Koin`. The full suite is migrated from test/run.js in Step 2.
import { expect, test } from "vitest";
import "../js/defaults.js";
import "../js/parser.js";

const Koin = (globalThis as unknown as { Koin: any }).Koin;

test("legacy modules attach to the global Koin namespace", () => {
  expect(typeof Koin.parser.parse).toBe("function");
});

test("parser still normalizes a basic standard-format row", () => {
  const { transactions } = Koin.parser.parse(
    "Date,Description,Credit,Debit,Balance\n01/03/2026,Test Merchant - x,,10.00,100.00\n",
  );
  expect(transactions.length).toBe(1);
  expect(transactions[0].amount).toBe(-10); // debit => negative
  expect(transactions[0].postedDate).toBe("2026-03-01"); // DD/MM/YYYY, not US
});
