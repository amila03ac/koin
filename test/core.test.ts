// Unit tests for Koin's pure core (parser, rules, insights, defaults), migrated from the
// original Node runner (test/run.cjs) to Vitest with typed imports. The categories helper
// is still a legacy classic-script (js/categories.js) until Step 3, so it's loaded for its
// side effect and read off the global `Koin` (the setup file makes `window` the global).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";

import * as parser from "../src/core/parser";
import * as rules from "../src/core/rules";
import * as insights from "../src/core/insights";
import * as categories from "../src/core/categories";
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from "../src/core/defaults";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const csv = read("data/Transactions.sample.csv");

describe("parser — standard (Bank A) format", () => {
  const { transactions, skipped } = parser.parse(csv);

  test("parses every data row", () => expect(transactions.length).toBe(26));
  test("skips nothing malformed", () => expect(skipped).toBe(0));
  test("ids are unique (dedup-safe)", () =>
    expect(new Set(transactions.map((t) => t.id)).size).toBe(transactions.length));
  test("debit rows are negative", () =>
    expect(transactions.filter((t) => t.direction === "debit").every((t) => t.amount < 0)).toBe(true));
  test("credit/refund row is positive", () =>
    expect(transactions.some((t) => t.amount > 0)).toBe(true));
  test("extracts embedded effective date", () => {
    const eff = transactions.find((t) => /Date 30 Mar 2026/.test(t.description));
    expect(eff?.effectiveDate).toBe("2026-03-30");
  });
  test("DD/MM/YYYY parsed (not US MM/DD)", () =>
    expect(parser.parsePostedDate("31/03/2026")).toBe("2026-03-31"));
  test("out-of-range day/month rejected (no phantom '2026-13' bucket)", () => {
    expect(parser.parsePostedDate("45/13/2026")).toBeNull();
    expect(parser.parsePostedDate("00/05/2026")).toBeNull();
    expect(parser.parsePostedDate("10/00/2026")).toBeNull();
    expect(parser.parsePostedDate("31/12/2026")).toBe("2026-12-31"); // boundary still valid
  });
});

describe("parser — detailed (Bank B) format", () => {
  const csvB = read("data/Transactions.sample-detailed.csv");
  const resB = parser.parse(csvB);

  test("detects the 'detailed' format", () => expect(resB.format).toBe("detailed"));
  test("standard CSV is detected as 'standard'", () => expect(parser.parse(csv).format).toBe("standard"));
  test("parses every Bank B row", () => expect(resB.transactions.length).toBe(6));
  test("skips nothing malformed", () => expect(resB.skipped).toBe(0));
  test("DD Mon YYYY date parsed", () =>
    expect(parser.parseMonthNameDate("03 Jun 2026")).toBe("2026-06-03"));
  test("effective date uses the transaction date", () =>
    expect(resB.transactions.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.effectiveDate))).toBe(true));
  test("debit (positive in CSV) becomes negative spend", () =>
    expect(resB.transactions.filter((t) => t.direction === "debit").every((t) => t.amount < 0)).toBe(true));
  test("credit row is positive income", () =>
    expect(resB.transactions.find((t) => /Payroll/i.test(t.description))?.amount).toBe(2500));
  test("merchant comes from the clean Details column", () =>
    expect(resB.transactions.some((t) => t.merchant === "Globex Supermarket")).toBe(true));
  test("ids are unique (dedup-safe)", () =>
    expect(new Set(resB.transactions.map((t) => t.id)).size).toBe(resB.transactions.length));
  test("re-importing yields identical ids (stable dedup)", () =>
    expect(parser.parse(csvB).transactions.map((t) => t.id).join())
      .toBe(resB.transactions.map((t) => t.id).join()));
});

describe("rules", () => {
  const { transactions } = parser.parse(csv);
  const ruled = rules.apply(transactions, DEFAULT_RULES);

  test("ignores internal transfers", () => expect(ruled.filter((t) => t.ignored).length).toBe(2));
  test("auto-categorizes the majority (of non-ignored)", () => {
    const nonIgnored = ruled.filter((t) => !t.ignored);
    const categorized = nonIgnored.filter((t) => t.category !== "uncategorized").length;
    expect(categorized / nonIgnored.length).toBeGreaterThan(0.8);
  });
  test("detects recurring merchants", () =>
    expect(ruled.some((t) => t.recurring && /COLES/i.test(t.merchant))).toBe(true));
  test("manual category is preserved across re-apply", () => {
    const manual = transactions.map((t) => ({ ...t, category: "dining", categorySource: "manual" as const }));
    expect(rules.apply(manual, DEFAULT_RULES).every((t) => t.category === "dining")).toBe(true);
  });
  test("learned merchant rule categorizes all its rows", () => {
    const learned = { ignorePatterns: [], categoryRules: [{ match: "AGL ENERGY", category: "utilities", isRegex: false, learned: true }] };
    const lr = rules.apply(transactions, learned).filter((t) => t.merchant === "AGL ENERGY");
    expect(lr.length).toBeGreaterThanOrEqual(2);
    expect(lr.every((t) => t.category === "utilities")).toBe(true);
  });
  test("removing a learned rule un-categorizes its merchant", () => {
    const lrGone = rules.apply(transactions, { ignorePatterns: [], categoryRules: [] }).filter((t) => t.merchant === "AGL ENERGY");
    expect(lrGone.length).toBeGreaterThanOrEqual(2);
    expect(lrGone.every((t) => t.category === "uncategorized")).toBe(true);
  });
  test("merchant-haystack lets a learned rule match cleaned merchant text", () => {
    const uber = rules.apply(transactions, { ignorePatterns: [], categoryRules: [{ match: "UBER EATS", category: "dining", isRegex: false, learned: true }] })
      .filter((t) => /uber/i.test(t.merchant));
    expect(uber.length).toBeGreaterThanOrEqual(1);
    expect(uber.every((t) => t.category === "dining")).toBe(true);
  });
  test("isSafeRegexSource flags catastrophic-backtracking shapes, allows normal ones", () => {
    expect(rules.isSafeRegexSource("(a+)+")).toBe(false);
    expect(rules.isSafeRegexSource("(.*)*")).toBe(false);
    expect(rules.isSafeRegexSource("(\\d{2,})+")).toBe(false);
    expect(rules.isSafeRegexSource("a".repeat(201))).toBe(false); // length cap
    expect(rules.isSafeRegexSource("woolworths|coles")).toBe(true);
    expect(rules.isSafeRegexSource("^AMZN.*mktp")).toBe(true);
    expect(rules.isSafeRegexSource("netflix")).toBe(true);
  });
  test("an unsafe regex rule is neutralized (no hang, treated as non-matching)", () => {
    const out = rules.apply(transactions, { ignorePatterns: [], categoryRules: [{ match: "(a+)+$", category: "dining", isRegex: true }] });
    // It simply doesn't match anything, rather than freezing the tab.
    expect(out.every((t) => t.category !== "dining" || t.categorySource === "manual")).toBe(true);
  });
});

describe("categories", () => {
  const C = categories;

  test("slugify lowercases + hyphenates", () => expect(C.slugify("Pets & Vet!")).toBe("pets-vet"));
  test("slugify collapses runs + trims hyphens", () => expect(C.slugify("  Health   / Pharmacy  ")).toBe("health-pharmacy"));
  test("slugify of symbols-only is empty", () => expect(C.slugify("***")).toBe(""));
  test("uniqueKey derives a key from the label", () => expect(C.uniqueKey("Travel", ["groceries", "dining"])).toBe("travel"));
  test("uniqueKey suffixes on collision", () => expect(C.uniqueKey("Groceries", ["groceries"])).toBe("groceries-2"));
  test("uniqueKey keeps suffixing past collisions", () => expect(C.uniqueKey("Groceries", ["groceries", "groceries-2"])).toBe("groceries-3"));
  test("uniqueKey falls back for empty labels", () => expect(C.uniqueKey("***", [])).toBe("category"));
  test("isHexColor accepts #rrggbb and #rgb", () => expect(C.isHexColor("#7a8450") && C.isHexColor("#FFF")).toBe(true));
  test("isHexColor rejects junk", () => expect(!C.isHexColor("red") && !C.isHexColor("#12") && !C.isHexColor("")).toBe(true));
  test("seed categories all have valid hex colours", () => expect(DEFAULT_CATEGORIES.every((c) => C.isHexColor(c.color))).toBe(true));
  test("seed category keys are unique", () =>
    expect(new Set(DEFAULT_CATEGORIES.map((c) => c.key)).size).toBe(DEFAULT_CATEGORIES.length));
});

describe("insights", () => {
  const ruled = rules.apply(parser.parse(csv).transactions, DEFAULT_RULES);

  test("month filter selects March", () => {
    const mar = insights.filterByPeriod(ruled, "month", "2026-03-15");
    expect(mar.length).toBeGreaterThan(0);
    expect(mar.every((t) => insights.effDate(t).slice(0, 7) === "2026-03")).toBe(true);
  });
  test("summary excludes ignored from spend", () => {
    const mar = insights.filterByPeriod(ruled, "month", "2026-03-15");
    const expected = mar.filter((t) => !t.ignored && t.amount < 0).reduce((s, t) => s - t.amount, 0);
    expect(Math.abs(insights.summary(mar).spent - expected)).toBeLessThan(0.001);
  });
  test("year filter selects 2026", () =>
    expect(insights.filterByPeriod(ruled, "year", "2026-06-01").length).toBe(ruled.length));
  test("trend buckets cover 12 months for a year", () =>
    expect(insights.trendBuckets(ruled, "year", "2026-01-01").length).toBe(12));
  test("week label spans 7 days", () =>
    expect(/–/.test(insights.periodLabel("2026-03-15", "week"))).toBe(true));
});
