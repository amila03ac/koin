// dom.ts — tiny DOM helpers shared across the UI layer. No app state, no storage.
// (Extracted from app.js in Step 3b; the stateful render/table/modal code follows.)

type Child = string | Node | null | undefined;
type AttrValue = string | number | boolean | ((e: Event) => void) | null | undefined;
type Attrs = Record<string, AttrValue>;

// Build an element. Special attrs: `class` -> className, `html` -> innerHTML, `on*` ->
// addEventListener. Other non-null attrs become setAttribute. `children` is a string, a
// Node, or a (possibly nested) array of those; null/undefined children are skipped.
export function h(tag: string, attrs?: Attrs, children?: Child | Child[]): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") e.className = v as string;
    else if (k === "html") e.innerHTML = v as string;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v as EventListener);
    else if (v != null) e.setAttribute(k, String(v));
  }
  for (const c of ([] as Child[]).concat(children ?? [])) {
    if (c == null) continue;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

export const $ = (sel: string): HTMLElement | null => document.querySelector(sel);

export const money = (n: number): string =>
  (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (iso: string): string =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export const todayIso = (): string => new Date().toISOString().slice(0, 10);
