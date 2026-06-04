// parser.js — turn a raw bank CSV into normalized transaction objects.
// Pure functions, attached to Koin.parser. No DOM, no storage.
(function () {
  window.Koin = window.Koin || {};

  const MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  // CSV tokenizer: handles quoted fields with commas and "" escaped quotes.
  function parseCsv(text) {
    const rows = [];
    let row = [], cell = "", inQuotes = false;
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

  // "31/05/2026" (DD/MM/YYYY) -> "2026-05-31", or null.
  function parsePostedDate(s) {
    const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Embedded "Date 30 May 2026" in a description -> ISO date, or null.
  function extractEffectiveDate(description) {
    const m = description.match(/Date\s+(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const year = parseInt(m[3], 10);
    if (mon === undefined) return null;
    return `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Merchant = text before first " - ", with store numbers / artifacts cleaned.
  function extractMerchant(description) {
    let m = description.split(" - ")[0].trim();
    m = m.replace(/\\+/g, " ");
    m = m.replace(/\s+\d{3,}\b/g, "");
    m = m.replace(/\bwithdrawal\b/i, "");
    m = m.replace(/^SQ \*/i, "");
    m = m.replace(/\*/g, " ");
    m = m.replace(/\s{2,}/g, " ").trim();
    return m || description.slice(0, 24).trim();
  }

  // Signed amount: money out negative, money in positive — regardless of the
  // sign convention the bank used in its Debit column.
  function signedAmount(creditStr, debitStr) {
    const credit = parseFloat(String(creditStr).replace(/[^0-9.\-]/g, ""));
    const debit = parseFloat(String(debitStr).replace(/[^0-9.\-]/g, ""));
    if (!isNaN(debit) && String(debitStr).trim() !== "") return -Math.abs(debit);
    if (!isNaN(credit) && String(creditStr).trim() !== "") return Math.abs(credit);
    return 0;
  }

  // FNV-1a hash over identifying fields -> stable dedup id.
  function hashId(parts) {
    const s = parts.join("|");
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return "t_" + (h >>> 0).toString(16).padStart(8, "0");
  }

  // Main entry. Returns { transactions, skipped, headers }.
  function parse(text) {
    const rows = parseCsv(text);
    if (rows.length === 0) return { transactions: [], skipped: 0, headers: [] };

    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const iDate = headers.indexOf("date");
    const iDesc = headers.indexOf("description");
    const iCredit = headers.indexOf("credit");
    const iDebit = headers.indexOf("debit");
    const iBalance = headers.indexOf("balance");

    const transactions = [];
    let skipped = 0;

    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const description = (cells[iDesc] || "").trim();
      const postedDate = parsePostedDate(cells[iDate] || "");
      if (!description || !postedDate) { skipped++; continue; }

      const amount = signedAmount(cells[iCredit] || "", cells[iDebit] || "");
      const effectiveDate = extractEffectiveDate(description) || postedDate;
      const receipt = (description.match(/Receipt\s+(\d+)/i) || [])[1] || "";
      const balanceRaw = iBalance >= 0 ? parseFloat((cells[iBalance] || "").replace(/[^0-9.\-]/g, "")) : NaN;

      transactions.push({
        id: hashId([postedDate, amount.toFixed(2), receipt, description]),
        postedDate,
        effectiveDate,
        description,
        merchant: extractMerchant(description),
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
    return { transactions, skipped, headers };
  }

  Koin.parser = { parse, parseCsv, parsePostedDate, extractEffectiveDate, extractMerchant };
})();
