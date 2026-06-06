// Shared domain types for Koin's pure core (parser, rules, insights, defaults).
// No DOM, no storage — these describe the normalized data model only.

export type Direction = "debit" | "credit";
export type CategorySource = "auto" | "manual";
export type TxnSource = "csv" | "manual";
export type Period = "year" | "month" | "week";

/** A normalized transaction. Money out is negative; bucket by `effectiveDate`. */
export interface Transaction {
  id: string;
  postedDate: string;        // ISO date from the CSV "Date" column
  effectiveDate: string;     // embedded "Date DD Mon YYYY" if present, else postedDate
  description: string;
  merchant: string;
  amount: number;            // signed: negative = money out (debit), positive = money in
  direction: Direction;
  balance: number | null;
  category: string;
  categorySource: CategorySource;
  ignored: boolean;          // excluded from spending totals (internal transfer etc.)
  recurring: boolean;
  source: TxnSource;
}

export interface ParseResult {
  transactions: Transaction[];
  skipped: number;
  headers: string[];
  format: string | null;     // detected format profile name, e.g. "standard" | "detailed"
}

export interface IgnorePattern {
  match: string;
  isRegex?: boolean;
  note?: string;
}

export interface CategoryRule {
  match: string;
  category: string;
  isRegex?: boolean;
  learned?: boolean;
}

export interface RuleSet {
  ignorePatterns: IgnorePattern[];
  categoryRules: CategoryRule[];
}

export interface Category {
  key: string;
  label: string;
  color: string;
  icon: string;
}

export interface Summary {
  spent: number;
  income: number;
  net: number;
  count: number;
}

export interface CategoryTotal {
  category: string;
  total: number;
}

export interface MerchantTotal {
  merchant: string;
  total: number;
  count: number;
}

export interface TrendBucket {
  label: string;
  total: number;
}
