// parser.ts — turn a raw bank CSV into normalized transactions. Pure functions; no DOM,
// no storage. Supports multiple bank layouts via header-sniffing "format profiles".
import type { ParseResult, Transaction } from "./types";

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// CSV tokenizer: handles quoted fields with commas and "" escaped quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", inQuotes = false;
  text = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell); cell = "";
    } else if (c === "\n") {
      row.push(cell); rows.push(row); row = []; cell = "";
    } else {
      cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

// (day, "May"|"05", year) -> "YYYY-MM-DD", or null for an unknown month name.
function monthNameToIso(day: number, monStr: string, year: number): string | null {
  const mon = MONTHS[String(monStr).slice(0, 3).toLowerCase()];
  if (mon === undefined) return null;
  return `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// "31/05/2026" (DD/MM/YYYY) -> "2026-05-31", or null. (Bank A date column.)
function parsePostedDate(s: string): string | null {
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// "03 Jun 2026" (DD Mon YYYY) -> "2026-06-03", or null. (Bank B date column.)
function parseMonthNameDate(s: string): string | null {
  const m = String(s).trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (!m) return null;
  return monthNameToIso(parseInt(m[1], 10), m[2], parseInt(m[3], 10));
}

// Embedded "Date 30 May 2026" in a description -> ISO date, or null.
function extractEffectiveDate(description: string): string | null {
  const m = description.match(/Date\s+(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (!m) return null;
  return monthNameToIso(parseInt(m[1], 10), m[2], parseInt(m[3], 10));
}

// Merchant = text before first " - ", with store numbers / artifacts cleaned.
function extractMerchant(description: string): string {
  let m = description.split(" - ")[0].trim();
  m = m.replace(/\\+/g, " ");
  m = m.replace(/\s+\d{3,}\b/g, "");
  m = m.replace(/\bwithdrawal\b/i, "");
  m = m.replace(/^SQ \*/i, "");
  m = m.replace(/\*/g, " ");
  m = m.replace(/\s{2,}/g, " ").trim();
  return m || description.slice(0, 24).trim();
}

// Signed amount: money out negative, money in positive — regardless of the sign
// convention the bank used in its Debit column.
function signedAmount(creditStr: string, debitStr: string): number {
  const credit = parseFloat(String(creditStr).replace(/[^0-9.\-]/g, ""));
  const debit = parseFloat(String(debitStr).replace(/[^0-9.\-]/g, ""));
  if (!isNaN(debit) && String(debitStr).trim() !== "") return -Math.abs(debit);
  if (!isNaN(credit) && String(creditStr).trim() !== "") return Math.abs(credit);
  return 0;
}

// FNV-1a hash over identifying fields -> stable dedup id.
function hashId(parts: string[]): string {
  const s = parts.join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return "t_" + (h >>> 0).toString(16).padStart(8, "0");
}

interface FormatCols {
  date: string;
  desc: string;
  merchant?: string;
  credit: string;
  debit: string;
  balance: string;
}

interface Format {
  name: string;
  detect: (headers: string[]) => boolean;
  parseDate: (s: string) => string | null;
  cols: FormatCols;
}

// Supported CSV layouts ("format profiles"). To add another bank, add a profile:
// `detect(headers)` recognizes it from the (lower-cased) header row, `cols` maps our
// fields to that bank's column names, `parseDate` reads its date format. Only the mapped
// columns are read — extra columns (the bank's own categories, tags, account, etc.) are
// ignored. Profiles are tried in order; the first whose `detect` returns true wins, so list
// more specific layouts first.
const FORMATS: Format[] = [
  {
    // Bank B: Transaction Date, Details, Account, Category, Subcategory, Tags, Notes,
    //         Debit, Credit, Balance, Original Description
    name: "detailed",
    detect: (h) => h.includes("transaction date") && h.includes("original description"),
    parseDate: parseMonthNameDate,
    cols: {
      date: "transaction date",
      desc: "original description", // raw text (keeps the stable ref id for dedup)
      merchant: "details",          // already a clean name — use it directly
      credit: "credit", debit: "debit", balance: "balance",
    },
  },
  {
    // Bank A (original): Date, Description, Credit, Debit, Balance
    name: "standard",
    detect: (h) => h.includes("date") && h.includes("description"),
    parseDate: parsePostedDate,
    cols: {
      date: "date", desc: "description",
      credit: "credit", debit: "debit", balance: "balance",
    },
  },
];

function detectFormat(headers: string[]): Format {
  return FORMATS.find((f) => f.detect(headers)) || FORMATS[FORMATS.length - 1];
}

// Main entry. Auto-detects the CSV layout, then normalizes.
function parse(text: string): ParseResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { transactions: [], skipped: 0, headers: [], format: null };

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const fmt = detectFormat(headers);
  const at = (name?: string) => (name ? headers.indexOf(name) : -1);
  const iDate = at(fmt.cols.date);
  const iDesc = at(fmt.cols.desc);
  const iMerchant = at(fmt.cols.merchant);
  const iCredit = at(fmt.cols.credit);
  const iDebit = at(fmt.cols.debit);
  const iBalance = at(fmt.cols.balance);

  const transactions: Transaction[] = [];
  let skipped = 0;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const description = (cells[iDesc] || "").trim();
    const postedDate = fmt.parseDate(cells[iDate] || "");
    if (!description || !postedDate) { skipped++; continue; }

    const amount = signedAmount(
      iCredit >= 0 ? cells[iCredit] || "" : "",
      iDebit >= 0 ? cells[iDebit] || "" : "",
    );
    const effectiveDate = extractEffectiveDate(description) || postedDate;
    const receipt = (description.match(/Receipt\s+(\d+)/i) || [])[1] || "";
    const balanceRaw = iBalance >= 0 ? parseFloat((cells[iBalance] || "").replace(/[^0-9.\-]/g, "")) : NaN;
    // Banks that give a clean merchant column use it; otherwise derive from the description.
    const merchant = (iMerchant >= 0 && (cells[iMerchant] || "").trim())
      ? (cells[iMerchant] || "").trim()
      : extractMerchant(description);

    transactions.push({
      id: hashId([postedDate, amount.toFixed(2), receipt, description]),
      postedDate,
      effectiveDate,
      description,
      merchant,
      amount,
      direction: amount < 0 ? "debit" : "credit",
      balance: isNaN(balanceRaw) ? null : balanceRaw,
      category: "uncategorized",
      categorySource: "auto",
      ignored: false,
      recurring: false,
      source: "csv",
    });
  }
  return { transactions, skipped, headers, format: fmt.name };
}

export {
  parse, parseCsv, parsePostedDate, parseMonthNameDate, detectFormat,
  extractEffectiveDate, extractMerchant,
};
