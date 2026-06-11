// charts.ts — tiny, dependency-free inline-SVG charts. Kept small so Koin needs no chart
// library and works offline.
const NS = "http://www.w3.org/2000/svg";

export interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

export interface BarDatum {
  label: string;
  total: number;
}

function el(name: string, attrs?: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, String(v));
  return node;
}

function money(n: number): string {
  return "$" + n.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Donut. data = [{ label, value, color }].
export function donut(
  container: HTMLElement,
  data: DonutDatum[],
  opts: { size?: number; thickness?: number } = {},
): void {
  const size = opts.size || 200, thickness = opts.thickness || 34;
  container.innerHTML = "";
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2, cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  const svg = el("svg", { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: "koin-donut" });

  if (total === 0) {
    svg.appendChild(el("circle", { cx, cy, r, fill: "none", stroke: "#e6e0d4", "stroke-width": thickness }));
  } else {
    let offset = 0;
    for (const d of data) {
      if (d.value <= 0) continue;
      const frac = d.value / total;
      const seg = el("circle", {
        cx, cy, r, fill: "none", stroke: d.color, "stroke-width": thickness,
        "stroke-dasharray": `${frac * C} ${C}`,
        "stroke-dashoffset": -offset * C,
        transform: `rotate(-90 ${cx} ${cy})`,
      });
      const t = el("title"); t.textContent = `${d.label}: ${money(d.value)} (${Math.round(frac * 100)}%)`;
      seg.appendChild(t);
      svg.appendChild(seg);
      offset += frac;
    }
  }
  const center = el("text", { x: cx, y: cy - 4, "text-anchor": "middle", class: "koin-donut-total" });
  center.textContent = money(total);
  const sub = el("text", { x: cx, y: cy + 16, "text-anchor": "middle", class: "koin-donut-sub" });
  sub.textContent = "spent";
  svg.appendChild(center); svg.appendChild(sub);
  container.appendChild(svg);
}

// Vertical bars. data = [{ label, total }]. `opts.height` is the pixel height of the TALLEST
// bar; every other bar is scaled to it from zero. Heights are set in pixels (not %) and bars
// never flex-shrink, so proportions are always honest — a flex column with % heights would
// let label text squeeze the tall bars and flatten the chart.
export function bars(
  container: HTMLElement,
  data: BarDatum[],
  opts: { height?: number; color?: string } = {},
): void {
  const maxBar = opts.height || 160, color = opts.color || "#6f7a4e";
  container.innerHTML = "";
  const max = Math.max(1, ...data.map((d) => d.total));
  const wrap = document.createElement("div");
  wrap.className = "koin-bars";
  for (const d of data) {
    const col = document.createElement("div");
    col.className = "koin-bar-col";
    const val = document.createElement("span");
    val.className = "koin-bar-val";
    val.textContent = d.total > 0 ? money(d.total) : "";
    const bar = document.createElement("div");
    bar.className = "koin-bar";
    bar.style.height = Math.round((d.total / max) * maxBar) + "px";
    bar.style.background = color;
    bar.title = `${d.label}: ${money(d.total)}`;
    const lab = document.createElement("span");
    lab.className = "koin-bar-label";
    lab.textContent = d.label;
    col.appendChild(val); col.appendChild(bar); col.appendChild(lab);
    wrap.appendChild(col);
  }
  container.appendChild(wrap);
}
