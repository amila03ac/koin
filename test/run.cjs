// Headless tests for Koin's pure logic (parser, rules, insights).
// The js/ files are browser classic-scripts that attach to a global `Koin`.
// In a browser, `window` IS the global object, so we mirror that here.
//
// Run:  node test/run.js
const fs = require("fs");
const path = require("path");

global.window = global; // so `window.Koin = ...` creates a real global `Koin`
const root = path.join(__dirname, "..");
for (const f of ["js/defaults.js", "js/parser.js", "js/rules.js", "js/categories.js", "js/insights.js"]) {
  eval(fs.readFileSync(path.join(root, f), "utf8"));
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
}

const csv = fs.readFileSync(path.join(root, "data/Transactions.sample.csv"), "utf8");

console.log("parser");
const { transactions, skipped } = Koin.parser.parse(csv);
check("parses every data row", transactions.length === 26, `${transactions.length}`);
check("skips nothing malformed", skipped === 0, `${skipped}`);
check("ids are unique (dedup-safe)", new Set(transactions.map(t => t.id)).size === transactions.length);
check("debit rows are negative", transactions.filter(t => t.direction === "debit").every(t => t.amount < 0));
check("credit/refund row is positive", transactions.some(t => t.amount > 0)); // the KMART refund
const eff = transactions.find(t => /Date 30 Mar 2026/.test(t.description));
check("extracts embedded effective date", eff && eff.effectiveDate === "2026-03-30", eff && eff.effectiveDate);
const dd = Koin.parser.parsePostedDate("31/03/2026");
check("DD/MM/YYYY parsed (not US MM/DD)", dd === "2026-03-31", dd);

console.log("parser — second bank format (detailed)");
const csvB = fs.readFileSync(path.join(root, "data/Transactions.sample-detailed.csv"), "utf8");
const resB = Koin.parser.parse(csvB);
check("detects the 'detailed' (Bank B) format", resB.format === "detailed", resB.format);
check("standard CSV is detected as 'standard'", Koin.parser.parse(csv).format === "standard");
check("parses every Bank B row", resB.transactions.length === 6, `${resB.transactions.length}`);
check("skips nothing malformed (Bank B)", resB.skipped === 0, `${resB.skipped}`);
check("DD Mon YYYY date parsed", Koin.parser.parseMonthNameDate("03 Jun 2026") === "2026-06-03",
  Koin.parser.parseMonthNameDate("03 Jun 2026"));
check("Bank B effective date uses the transaction date",
  resB.transactions.every(t => /^\d{4}-\d{2}-\d{2}$/.test(t.effectiveDate)));
check("Bank B debit (positive in CSV) becomes negative spend",
  resB.transactions.filter(t => t.direction === "debit").every(t => t.amount < 0));
const payroll = resB.transactions.find(t => /Payroll/i.test(t.description));
check("Bank B credit row is positive income", payroll && payroll.amount === 2500, payroll && payroll.amount);
check("Bank B merchant comes from the clean Details column",
  resB.transactions.some(t => t.merchant === "Globex Supermarket"));
check("Bank B ids are unique (dedup-safe)",
  new Set(resB.transactions.map(t => t.id)).size === resB.transactions.length);
check("re-importing Bank B yields identical ids (stable dedup)",
  Koin.parser.parse(csvB).transactions.map(t => t.id).join() === resB.transactions.map(t => t.id).join());

console.log("rules");
const ruled = Koin.rules.apply(transactions, Koin.DEFAULT_RULES);
check("ignores internal transfers", ruled.filter(t => t.ignored).length === 2);
const nonIgnored = ruled.filter(t => !t.ignored);
check("auto-categorizes the majority (of non-ignored)",
  nonIgnored.filter(t => t.category !== "uncategorized").length / nonIgnored.length > 0.8);
check("detects recurring merchants", ruled.some(t => t.recurring && /COLES/i.test(t.merchant)));
// manual category must survive a re-apply
const manual = transactions.map(t => ({ ...t, category: "dining", categorySource: "manual" }));
check("manual category is preserved", Koin.rules.apply(manual, Koin.DEFAULT_RULES).every(t => t.category === "dining"));
// a learned "merchant -> category" rule categorizes every row of that merchant...
const learned = { ignorePatterns: [], categoryRules: [{ match: "AGL ENERGY", category: "utilities", isRegex: false, learned: true }] };
const lr = Koin.rules.apply(transactions, learned).filter(t => t.merchant === "AGL ENERGY");
check("learned merchant rule categorizes all its rows", lr.length >= 2 && lr.every(t => t.category === "utilities"));
// ...and removing that learned rule reverts its merchant to uncategorized (delete semantics)
const lrGone = Koin.rules.apply(transactions, { ignorePatterns: [], categoryRules: [] }).filter(t => t.merchant === "AGL ENERGY");
check("removing a learned rule un-categorizes its merchant", lrGone.length >= 2 && lrGone.every(t => t.category === "uncategorized"));
// ...even when cleaning altered the text (merchant "UBER EATS" vs description "UBER   *EATS")
const uber = Koin.rules.apply(transactions, { ignorePatterns: [], categoryRules: [{ match: "UBER EATS", category: "dining", isRegex: false, learned: true }] })
  .filter(t => /uber/i.test(t.merchant));
check("merchant-haystack lets a learned rule match cleaned merchant text", uber.length >= 1 && uber.every(t => t.category === "dining"));

console.log("categories");
const C = Koin.categories;
check("slugify lowercases + hyphenates", C.slugify("Pets & Vet!") === "pets-vet", C.slugify("Pets & Vet!"));
check("slugify collapses runs + trims hyphens", C.slugify("  Health   / Pharmacy  ") === "health-pharmacy", C.slugify("  Health   / Pharmacy  "));
check("slugify of symbols-only is empty", C.slugify("***") === "");
check("uniqueKey derives a key from the label", C.uniqueKey("Travel", ["groceries", "dining"]) === "travel");
check("uniqueKey suffixes on collision", C.uniqueKey("Groceries", ["groceries"]) === "groceries-2");
check("uniqueKey keeps suffixing past collisions", C.uniqueKey("Groceries", ["groceries", "groceries-2"]) === "groceries-3");
check("uniqueKey falls back for empty labels", C.uniqueKey("***", []) === "category");
check("isHexColor accepts #rrggbb and #rgb", C.isHexColor("#7a8450") && C.isHexColor("#FFF"));
check("isHexColor rejects junk", !C.isHexColor("red") && !C.isHexColor("#12") && !C.isHexColor(""));
// every seed category has a valid hex colour (so <input type=color> can show it)
check("seed categories all have valid hex colours", Koin.DEFAULT_CATEGORIES.every((c) => C.isHexColor(c.color)));
// seed keys are already unique (the manager relies on key uniqueness as an invariant)
check("seed category keys are unique",
  new Set(Koin.DEFAULT_CATEGORIES.map((c) => c.key)).size === Koin.DEFAULT_CATEGORIES.length);

console.log("insights");
const mar = Koin.insights.filterByPeriod(ruled, "month", "2026-03-15");
check("month filter selects March", mar.length > 0 && mar.every(t => Koin.insights.effDate(t).slice(0, 7) === "2026-03"));
check("summary excludes ignored from spend",
  Math.abs(Koin.insights.summary(mar).spent - mar.filter(t => !t.ignored && t.amount < 0).reduce((s, t) => s - t.amount, 0)) < 0.001);
const yr = Koin.insights.filterByPeriod(ruled, "year", "2026-06-01");
check("year filter selects 2026", yr.length === ruled.length);
check("trend buckets cover 12 months for a year", Koin.insights.trendBuckets(ruled, "year", "2026-01-01").length === 12);
check("week label spans 7 days", /–/.test(Koin.insights.periodLabel("2026-03-15", "week")));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
