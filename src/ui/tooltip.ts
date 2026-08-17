// tooltip.ts — instant, styleable tooltips, replacing the native `title` attribute.
//
// Browsers delay a native `title` tooltip by roughly a second and give no control over how it
// looks, which makes reading a chart segment or a posted date feel sluggish. Any element with
// a `data-tip="…"` attribute gets this one instead: it appears immediately and is styled with
// the rest of the app.
//
// Two things shape the implementation:
//   • It must work on **SVG** (the donut segments) as well as HTML, which rules out the usual
//     CSS `::after { content: attr(data-tip) }` trick — pseudo-elements don't apply to SVG.
//   • The table re-renders constantly, so listeners are delegated from `document` once rather
//     than bound per element; new rows work with no re-wiring and nothing leaks.
import { $ } from "./dom";

const GAP = 8;      // space between the element and the tooltip
const EDGE = 4;     // keep this far from the viewport edge

let tipEl: HTMLElement | null = null;
let current: Element | null = null;

function ensureTip(): HTMLElement {
  if (tipEl?.isConnected) return tipEl;
  tipEl = document.createElement("div");
  tipEl.className = "koin-tip";
  tipEl.setAttribute("role", "tooltip");
  document.body.appendChild(tipEl);
  return tipEl;
}

// Anchor to the pointer when there is one, otherwise to the element.
//
// Anchoring to the element sounds tidier but is wrong for the donut: each segment is a full
// SVG circle with a dash pattern, so its bounding box is the *whole* chart, and the tooltip
// would sit far from the arc you're actually pointing at. Keyboard focus has no pointer, so
// that case falls back to the element's box.
function show(target: Element, ev?: Event): void {
  const text = target.getAttribute("data-tip");
  if (!text) return;
  const tip = ensureTip();
  tip.textContent = text;
  tip.classList.add("show");
  const t = tip.getBoundingClientRect();

  const m = ev as MouseEvent | undefined;
  const hasPointer = !!m && (m.clientX > 0 || m.clientY > 0);
  let centreX: number, above: number, below: number;
  if (hasPointer) {
    centreX = m!.clientX;
    above = m!.clientY - t.height - GAP;
    below = m!.clientY + GAP * 2;
  } else {
    const box = target.getBoundingClientRect(); // works for SVG elements too
    centreX = box.left + box.width / 2;
    above = box.top - t.height - GAP;
    below = box.bottom + GAP;
  }

  // Prefer above; flip below when there isn't room. Clamp horizontally, taking care that the
  // upper bound can't fall below the lower one on a narrow viewport (which would invert the
  // clamp and push the tooltip off the left edge).
  const top = above < EDGE ? below : above;
  const maxLeft = Math.max(EDGE, window.innerWidth - t.width - EDGE);
  const left = Math.min(Math.max(centreX - t.width / 2, EDGE), maxLeft);
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
  current = target;
}

function hide(): void {
  current = null;
  tipEl?.classList.remove("show");
}

function onEnter(e: Event): void {
  const el = (e.target as Element | null)?.closest?.("[data-tip]");
  if (!el || el === current) return;
  show(el, e);
}

// Only hide once the pointer has genuinely left the element — moving onto a child still counts
// as being inside it.
function onLeave(e: Event): void {
  if (!current) return;
  const to = (e as MouseEvent).relatedTarget as Node | null;
  if (to && current.contains(to)) return;
  hide();
}

export function initTooltips(): void {
  document.addEventListener("mouseover", onEnter);
  document.addEventListener("mouseout", onLeave);
  document.addEventListener("focusin", onEnter);   // keyboard users get them too
  document.addEventListener("focusout", onLeave);
  // A tooltip pinned to a moved/removed element would be stranded, so drop it on scroll,
  // click, or Escape.
  window.addEventListener("scroll", hide, true);
  document.addEventListener("click", hide, true);
  document.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Escape") hide(); });
}

// Exported for tests: the live tooltip element, if one has been created.
export function currentTipText(): string | null {
  const el = $(".koin-tip");
  return el?.classList.contains("show") ? el.textContent : null;
}
