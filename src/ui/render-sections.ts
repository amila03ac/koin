// render-sections.ts — the leaf renderers for the dashboard's read-only panels: the
// period jump dropdown, summary cards, donut + trend charts, and the insights lists, plus
// the one-time category filter. They read `state` and write into their target elements;
// they never trigger a re-render, so the dependency flows one way (renderAll -> here).
// Extracted from app.js in Step 3b.
import type { Period, Transaction } from "../core/types";
import * as insights from "../core/insights";
import * as charts from "./charts";
import { $, h, money } from "./dom";
import { state } from "./state";

// Map a period key (from availablePeriods) back to an anchor date inside that period.
export function periodToAnchor(key: string, period: Period): string {
  if (period === "year") return key + "-01-01";
  if (period === "month") return key + "-01";
  return key; // week key is already a Monday ISO date
}

export function renderPeriodJump(): void {
  const sel = $("#period-jump")!;
  const periods = insights.availablePeriods(state.effective, state.period);
  const cur = insights.periodKey(state.anchor!, state.period);
  sel.innerHTML = "";
  for (const key of periods) {
    const anchor = periodToAnchor(key, state.period);
    sel.appendChild(h("option", { value: key, selected: key === cur ? "selected" : null },
      insights.periodLabel(anchor, state.period)));
  }
}

interface Card { label: string; value: string; cls?: string }

export function renderSummary(tx: Transaction[]): void {
  const s = insights.summary(tx);
  const ignored = tx.filter((t) => t.ignored).length;
  const cards: Card[] = [
    { label: "Spent", value: money(s.spent), cls: "neg" },
    { label: "Transactions", value: String(s.count) },
    { label: "Recurring", value: String(tx.filter((t) => t.recurring && !t.ignored).length) },
    { label: "Ignored (transfers)", value: String(ignored), cls: "muted" },
  ];
  if (s.income > 0) cards.splice(1, 0, { label: "Income", value: money(s.income), cls: "pos" }, { label: "Net", value: money(s.net), cls: s.net < 0 ? "neg" : "pos" });
  const wrap = $("#summary")!;
  wrap.innerHTML = "";
  for (const c of cards) {
    wrap.appendChild(h("div", { class: "card" }, [
      h("div", { class: "card-label" }, c.label),
      h("div", { class: "card-value " + (c.cls || "") }, c.value),
    ]));
  }
}

export function renderCharts(tx: Transaction[]): void {
  const cats = insights.byCategory(tx);
  const data = cats.map((c) => ({
    label: state.catMap[c.category]?.label ?? c.category,
    value: c.total,
    color: state.catMap[c.category]?.color ?? "#cbd5e1",
  }));
  charts.donut($("#donut")!, data);

  const legend = $("#donut-legend")!;
  legend.innerHTML = "";
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  for (const d of data) {
    legend.appendChild(h("div", { class: "legend-row" }, [
      h("span", { class: "legend-dot", style: `background:${d.color}` }),
      h("span", { class: "legend-label" }, d.label),
      h("span", { class: "legend-val" }, `${money(d.value)} · ${Math.round((d.value / total) * 100)}%`),
    ]));
  }

  const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#6f7a4e";
  charts.bars($("#trend")!, insights.trendBuckets(tx, state.period, state.anchor!), { color: primary });
}

interface InsightRow { name: string; val: string }

export function renderInsights(tx: Transaction[]): void {
  const list = (title: string, rows: InsightRow[]): HTMLElement => {
    const box = h("div", { class: "insight-box" }, [h("h3", {}, title)]);
    if (!rows.length) box.appendChild(h("div", { class: "muted small" }, "Nothing here."));
    for (const r of rows) {
      box.appendChild(h("div", { class: "insight-row" }, [
        h("span", { class: "insight-name" }, r.name),
        h("span", { class: "insight-val" }, r.val),
      ]));
    }
    return box;
  };
  const wrap = $("#insights")!;
  wrap.innerHTML = "";
  wrap.appendChild(list("Top merchants", insights.topMerchants(tx, 6).map((m) => ({
    name: `${m.merchant} (${m.count})`, val: money(m.total),
  }))));
  wrap.appendChild(list("Biggest expenses", insights.biggestExpenses(tx, 6).map((t) => ({
    name: t.merchant, val: money(-t.amount),
  }))));
  const recur: InsightRow[] = [];
  const seen = new Set<string>();
  for (const t of tx.filter((t) => t.recurring && !t.ignored && t.amount < 0)) {
    if (seen.has(t.merchant)) continue;
    seen.add(t.merchant);
    recur.push({ name: t.merchant, val: money(-t.amount) });
  }
  wrap.appendChild(list("Recurring / subscriptions", recur.slice(0, 6)));
}

// One-time build of the category filter dropdown (idempotent via a data flag).
export function renderCatFilter(): void {
  const sel = $("#filter-cat")!;
  if (sel.dataset.built) return;
  sel.appendChild(h("option", { value: "all" }, "All categories"));
  for (const c of state.categories) sel.appendChild(h("option", { value: c.key }, `${c.icon} ${c.label}`));
  sel.dataset.built = "1";
}
