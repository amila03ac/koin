// insights.js — pure aggregation over normalized transactions. Attached to
// Koin.insights. All spending math ignores `ignored` rows (internal transfers)
// and buckets by EFFECTIVE date (when the purchase actually happened). Date math
// is done in UTC to avoid timezone drift.
(function () {
  window.Koin = window.Koin || {};
  const DAY = 86400000;

  function toDate(iso) { return new Date(iso + "T00:00:00Z"); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function effDate(t) { return t.effectiveDate || t.postedDate; }

  function weekStart(d) {
    const wd = (d.getUTCDay() + 6) % 7; // 0 = Monday
    return new Date(d.getTime() - wd * DAY);
  }

  function periodKey(isoDate, period) {
    if (period === "year") return isoDate.slice(0, 4);
    if (period === "month") return isoDate.slice(0, 7);
    return iso(weekStart(toDate(isoDate)));
  }

  function periodLabel(anchorIso, period) {
    const d = toDate(anchorIso);
    if (period === "year") return String(d.getUTCFullYear());
    if (period === "month") {
      return d.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
    }
    const start = weekStart(d);
    const end = new Date(start.getTime() + 6 * DAY);
    const f = (x) => x.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
    return `${f(start)} – ${f(end)}, ${end.getUTCFullYear()}`;
  }

  function shiftAnchor(anchorIso, period, delta) {
    const d = toDate(anchorIso);
    if (period === "year") d.setUTCFullYear(d.getUTCFullYear() + delta);
    else if (period === "month") d.setUTCMonth(d.getUTCMonth() + delta);
    else d.setUTCDate(d.getUTCDate() + delta * 7);
    return iso(d);
  }

  function filterByPeriod(transactions, period, anchorIso) {
    const key = periodKey(anchorIso, period);
    return transactions.filter((t) => periodKey(effDate(t), period) === key);
  }

  function availablePeriods(transactions, period) {
    const keys = new Set(transactions.map((t) => periodKey(effDate(t), period)));
    return [...keys].sort().reverse();
  }

  function spendingOnly(transactions) { return transactions.filter((t) => !t.ignored); }

  function summary(transactions) {
    const tx = spendingOnly(transactions);
    let spent = 0, income = 0, count = 0;
    for (const t of tx) {
      if (t.amount < 0) spent += -t.amount; else income += t.amount;
      count++;
    }
    return { spent, income, net: income - spent, count };
  }

  function byCategory(transactions) {
    const map = new Map();
    for (const t of spendingOnly(transactions)) {
      if (t.amount >= 0) continue;
      map.set(t.category, (map.get(t.category) || 0) + -t.amount);
    }
    return [...map.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }

  function topMerchants(transactions, n) {
    const map = new Map();
    for (const t of spendingOnly(transactions)) {
      if (t.amount >= 0) continue;
      const e = map.get(t.merchant) || { merchant: t.merchant, total: 0, count: 0 };
      e.total += -t.amount; e.count++;
      map.set(t.merchant, e);
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, n || 8);
  }

  function biggestExpenses(transactions, n) {
    return spendingOnly(transactions)
      .filter((t) => t.amount < 0)
      .sort((a, b) => a.amount - b.amount)
      .slice(0, n || 8);
  }

  function trendBuckets(transactions, period, anchorIso) {
    const tx = spendingOnly(transactions).filter((t) => t.amount < 0);
    const d = toDate(anchorIso);
    const buckets = [];

    if (period === "year") {
      const year = d.getUTCFullYear();
      for (let m = 0; m < 12; m++) {
        const key = `${year}-${String(m + 1).padStart(2, "0")}`;
        const label = new Date(Date.UTC(year, m, 1)).toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" });
        const total = tx.filter((t) => effDate(t).slice(0, 7) === key).reduce((s, t) => s - t.amount, 0);
        buckets.push({ label, total });
      }
    } else if (period === "month") {
      const year = d.getUTCFullYear(), mon = d.getUTCMonth();
      const ym = `${year}-${String(mon + 1).padStart(2, "0")}`;
      const days = new Date(Date.UTC(year, mon + 1, 0)).getUTCDate();
      for (let start = 1; start <= days; start += 7) {
        const end = Math.min(start + 6, days);
        const total = tx.filter((t) => {
          const e = effDate(t);
          if (e.slice(0, 7) !== ym) return false;
          const day = parseInt(e.slice(8, 10), 10);
          return day >= start && day <= end;
        }).reduce((s, t) => s - t.amount, 0);
        buckets.push({ label: `${start}–${end}`, total });
      }
    } else {
      const start = weekStart(d);
      for (let i = 0; i < 7; i++) {
        const day = new Date(start.getTime() + i * DAY);
        const key = iso(day);
        const label = day.toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" });
        const total = tx.filter((t) => effDate(t) === key).reduce((s, t) => s - t.amount, 0);
        buckets.push({ label, total });
      }
    }
    return buckets;
  }

  Koin.insights = {
    periodKey, periodLabel, shiftAnchor, filterByPeriod, availablePeriods,
    summary, byCategory, topMerchants, biggestExpenses, trendBuckets, effDate,
  };
})();
