// rules.ts — ignore patterns, auto-categorization, recurring detection. Pure functions.
import type { CategoryRule, IgnorePattern, RuleSet, Transaction } from "./types";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Reject user-supplied regex that could cause catastrophic backtracking (ReDoS). `apply()` runs
// every rule against every transaction on every compose(), and JS has no regex timeout, so a
// pattern like `(a+)+` would freeze the tab — and once Koin is open-source, a crafted rule can
// arrive inside a shared backup and run on the importer's machine. This is a cheap heuristic,
// not a proof: it caps length and flags the classic exponential shape — an unbounded quantifier
// nested inside a group that is itself unbounded-quantified, e.g. `(a+)+`, `(.*)*`, `(\d{2,})+`.
// (Plain substring patterns are escaped first, so they're always safe and skip this check.)
const UNBOUNDED = String.raw`(?:[*+]|\{\d+,\})`;
const NESTED_QUANTIFIER = new RegExp(String.raw`\([^()]*${UNBOUNDED}[^()]*\)${UNBOUNDED}`);
export function isSafeRegexSource(src: string): boolean {
  if (src.length > 200) return false;
  if (NESTED_QUANTIFIER.test(src)) return false;
  return true;
}

// Compile each distinct pattern once and reuse it. apply() runs on every compose() (i.e.
// every UI mutation), against every transaction, so without this the same RegExp would be
// reconstructed thousands of times per rerender. Keyed by source + isRegex; invalid patterns
// cache as null so we also warn only once. (Compilation is deterministic, so caching is safe.)
const reCache = new Map<string, RegExp | null>();

function toRegex(rule: { match: string; isRegex?: boolean }): RegExp | null {
  const key = (rule.isRegex ? "r:" : "s:") + rule.match;
  const cached = reCache.get(key);
  if (cached !== undefined) return cached;
  let re: RegExp | null;
  if (rule.isRegex && !isSafeRegexSource(rule.match)) {
    // Neutralize (treat as non-matching) rather than compile+run a pattern that could hang.
    console.warn("Koin rules: skipping potentially unsafe regex pattern", rule.match);
    re = null;
  } else {
    try {
      re = new RegExp(rule.isRegex ? rule.match : escapeRegex(rule.match), "i");
    } catch (err) {
      console.warn("Koin rules: invalid pattern", rule, err);
      re = null;
    }
  }
  reCache.set(key, re);
  return re;
}

function matchesIgnore(description: string, ignorePatterns: IgnorePattern[]): boolean {
  return (ignorePatterns || []).some((p) => {
    const re = toRegex(p);
    return re ? re.test(description) : false;
  });
}

function autoCategory(description: string, categoryRules: CategoryRule[]): string {
  for (const rule of categoryRules || []) {
    const re = toRegex(rule);
    if (re && re.test(description)) return rule.category;
  }
  return "uncategorized";
}

// Recurring = same merchant in 2+ distinct months, 2+ times.
function detectRecurringMerchants(transactions: Transaction[]): Set<string> {
  const byMerchant = new Map<string, { months: Set<string>; count: number }>();
  for (const t of transactions) {
    if (t.ignored || t.amount >= 0) continue;
    const key = t.merchant.toLowerCase();
    if (!byMerchant.has(key)) byMerchant.set(key, { months: new Set(), count: 0 });
    const e = byMerchant.get(key)!;
    e.months.add((t.effectiveDate || t.postedDate).slice(0, 7));
    e.count++;
  }
  const recurring = new Set<string>();
  for (const [key, e] of byMerchant) {
    if (e.months.size >= 2 && e.count >= 2) recurring.add(key);
  }
  return recurring;
}

// Apply ignore + category + recurring. Returns NEW objects. A manual category
// (categorySource === 'manual') is preserved; caller applies overrides after.
function apply(transactions: Transaction[], rules?: Partial<RuleSet> | null): Transaction[] {
  const ignorePatterns = (rules && rules.ignorePatterns) || [];
  const categoryRules = (rules && rules.categoryRules) || [];

  let out: Transaction[] = transactions.map((t) => ({
    ...t,
    ignored: matchesIgnore(t.description, ignorePatterns),
    // Match against description AND merchant. Merchant is a cleaned subset of the
    // description, so this never changes existing matches — it just lets a learned
    // "merchant -> category" rule reliably catch the same merchant on future imports
    // even when cleaning altered the text (e.g. "UBER   *EATS" -> "UBER EATS").
    category: t.categorySource === "manual"
      ? t.category
      : autoCategory(t.description + "\n" + t.merchant, categoryRules),
  }));

  const recurring = detectRecurringMerchants(out);
  out = out.map((t) => ({ ...t, recurring: recurring.has(t.merchant.toLowerCase()) }));
  return out;
}

export { apply, matchesIgnore, autoCategory, detectRecurringMerchants };
