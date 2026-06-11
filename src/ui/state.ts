// state.ts — the app's shared, mutable UI state plus the pure derivation of the displayed
// transactions (compose). No DOM, no storage: render code reads `state`/`compose()` and the
// storage adapter owns persistence. Extracted from app.js in Step 3b so the render/table/
// editor modules can share one state object without a global.
import type { Category, Override, Period, RuleSet, Transaction } from "../core/types";
import type { OverrideMap } from "../store/index";
import * as rules from "../core/rules";
import * as insights from "../core/insights";

export interface Filter {
  text: string;
  category: string;
  showIgnored: boolean;
}

export interface AppState {
  raw: Transaction[];        // imported CSV transactions
  manual: Transaction[];     // user-created transactions
  overrides: OverrideMap;    // id -> per-transaction adjustment
  rules: RuleSet | null;
  categories: Category[];
  catMap: Record<string, Category>; // key -> category def
  period: Period;            // 'year' | 'month' | 'week'
  anchor: string | null;     // ISO date within the active period
  effective: Transaction[];  // composed list after rules + overrides
  filter: Filter;
}

export const state: AppState = {
  raw: [],
  manual: [],
  overrides: {},
  rules: null,
  categories: [],
  catMap: {},
  period: "month",
  anchor: null,
  effective: [],
  filter: { text: "", category: "all", showIgnored: false },
};

// Override fields that may edit an imported (bank) transaction. Stored per-id in
// state.overrides, layered over the pristine raw row in compose() so edits are
// non-destructive, re-import-safe, and reversible.
export const EDIT_FIELDS: (keyof Override)[] = ["effectiveDate", "merchant", "description", "amount"];

export function hasFieldEdits(o?: Override): boolean {
  return !!o && EDIT_FIELDS.some((k) => o[k] != null);
}

// Derive state.effective: raw + manual transactions with per-id overrides applied, run
// through the rules engine. Field edits apply BEFORE rules so categorisation/recurring see
// them; the manual category, ignore flag, and delete are applied around the rules pass.
export function compose(): void {
  const ov = state.overrides;
  const combined: Transaction[] = state.raw.concat(state.manual).map((t) => {
    const o = ov[t.id];
    if (!o) return { ...t };
    const n = { ...t };
    // field edits (applied BEFORE rules so categorisation/recurring see the edits)
    if (o.effectiveDate != null) n.effectiveDate = o.effectiveDate;
    if (o.merchant != null) n.merchant = o.merchant;
    if (o.description != null) n.description = o.description;
    if (o.amount != null) { n.amount = o.amount; n.direction = o.amount < 0 ? "debit" : "credit"; }
    // manual category choice
    if (o.category != null) { n.category = o.category; n.categorySource = "manual"; }
    return n;
  });
  let ruled = rules.apply(combined, state.rules);
  ruled = ruled.map((t) => {
    const o = ov[t.id];
    if (o && o.ignored != null) return { ...t, ignored: o.ignored };
    return t;
  });
  state.effective = ruled.filter((t) => !(ov[t.id] && ov[t.id].deleted));
}

// Most recent effective date across the composed transactions (the initial anchor).
export function latestDate(): string | null {
  const all = state.effective;
  if (!all.length) return null;
  return all.map((t) => insights.effDate(t)).sort().reverse()[0];
}
