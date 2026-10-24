// tooltip.ts — instant, styleable tooltips, replacing the native `title` attribute.
//
// Browsers delay a native `title` tooltip by roughly a second and give no control over how it
// looks, which makes reading a chart segment or a posted date feel sluggish. Any element with
// a `data-tip="…"` attribute gets this one instead: it appears immediately and is styled with
// the rest of the app.
//
// Three things shape the implementation:
//   • It must work on **SVG** (the donut segments) as well as HTML, which rules out the usual
//     CSS `::after { content: attr(data-tip) }` trick — pseudo-elements don't apply to SVG.
//   • The table re-renders constantly, so listeners are delegated from `document` once rather
//     than bound per element; new rows work with no re-wiring and nothing leaks.
//   • A touchscreen has no hover, and a native `title` never shows there at all. So this module
//     listens to **pointer events**, which say whether a mouse or a finger caused them:
//       mouse   hover shows, leaving hides (as before)
//       finger  tap an informational element (a 📝 note, a chart segment) to show its text;
//               it stays until you tap it again, tap elsewhere, or scroll
//       finger  on a button, a tap is the action itself, so the label shows on a long press
//               instead, and that press does not trigger the button
import { $ } from "./dom";

const TIP_CLASS = "koin-tip";
const GAP = 8;             // space between the element (or the mouse pointer) and the tooltip
const TOUCH_GAP = 18;      // a fingertip hides more than a cursor, so sit further above it
const EDGE = 4;            // keep this far from the viewport edge
const LONG_PRESS_MS = 500; // how long a finger rests on a button before its label shows
const TAP_SLOP = 10;       // px a finger may drift and still count as a tap rather than a scroll

interface Point { x: number; y: number }

// A finger currently on the screen, from pointerdown until it lifts or the gesture is cancelled.
interface Press {
  id: number;                                // pointerId, so a second finger can't end it
  el: Element | null;                        // the [data-tip] element under the finger, if any
  start: Point;
  timer: ReturnType<typeof setTimeout> | undefined; // pending long press (buttons only)
  long: boolean;                             // the long press fired
}

let tipEl: HTMLElement | null = null;
let current: Element | null = null;
// Opened by touch. There is no "pointer left" on a touchscreen, so a pinned tooltip stays until
// something dismisses it.
let pinned = false;
// Whether the last thing the user did was touch the screen. Tapping a button also focuses it,
// and that focus must not be mistaken for keyboard navigation (which does show tooltips).
let lastInputWasTouch = false;
let press: Press | null = null;
// After a long press, some browsers still send a `click` when the finger lifts and some don't.
// Remember the button so that one click, if it comes, is swallowed.
let swallowClickOn: Element | null = null;

function ensureTip(): HTMLElement {
  if (tipEl?.isConnected) return tipEl;
  tipEl = document.createElement("div");
  tipEl.className = TIP_CLASS;
  tipEl.setAttribute("role", "tooltip");
  document.body.appendChild(tipEl);
  return tipEl;
}

// Anchor to the pointer when there is one, otherwise to the element.
//
// Anchoring to the element sounds tidier but is wrong for the donut: each segment is a full
// SVG circle with a dash pattern, so its bounding box is the *whole* chart, and the tooltip
// would sit far from the arc you're actually pointing at. Keyboard focus and a long press have
// no useful pointer position, so those fall back to the element's box.
function show(target: Element, at?: Point, gap = GAP): void {
  const text = target.getAttribute("data-tip");
  if (!text) return;
  const tip = ensureTip();
  tip.textContent = text;
  tip.classList.add("show");
  const t = tip.getBoundingClientRect();

  let centreX: number, above: number, below: number;
  if (at && (at.x > 0 || at.y > 0)) {
    centreX = at.x;
    above = at.y - t.height - gap;
    below = at.y + gap * 2;
  } else {
    const box = target.getBoundingClientRect(); // works for SVG elements too
    centreX = box.left + box.width / 2;
    above = box.top - t.height - gap;
    below = box.bottom + gap;
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
  pinned = false;
  tipEl?.classList.remove("show");
}

const tipTarget = (e: Event): Element | null =>
  (e.target as Element | null)?.closest?.("[data-tip]") ?? null;

// Something a tap already *does* something to. Its tooltip is a label, not content.
const isControl = (el: Element): boolean => el.matches("button, select, input, textarea, a[href]");

const isTouch = (e: Event): boolean => (e as PointerEvent).pointerType === "touch";

// ---- mouse (and pen): hover --------------------------------------------------------------

function onPointerOver(e: Event): void {
  if (isTouch(e)) return; // a finger also fires pointerover as it lands; that isn't a hover
  const el = tipTarget(e);
  if (!el || el === current) return;
  pinned = false;
  const m = e as PointerEvent;
  show(el, { x: m.clientX, y: m.clientY });
}

// Only hide once the pointer has genuinely left the element — moving onto a child still counts
// as being inside it.
function onPointerOut(e: Event): void {
  if (isTouch(e) || !current || pinned) return;
  const to = (e as PointerEvent).relatedTarget as Node | null;
  if (to && current.contains(to)) return;
  hide();
}

// ---- keyboard: focus ---------------------------------------------------------------------

function onFocusIn(e: Event): void {
  if (lastInputWasTouch) return;
  const el = tipTarget(e);
  if (!el || el === current) return;
  pinned = false;
  show(el);
}

function onFocusOut(e: Event): void {
  if (!current || pinned) return;
  const to = (e as FocusEvent).relatedTarget as Node | null;
  if (to && current.contains(to)) return;
  hide();
}

// ---- finger: tap, and long press on buttons ----------------------------------------------

function endPress(): void {
  if (press?.timer !== undefined) clearTimeout(press.timer);
  press = null;
}

function onPointerDown(e: Event): void {
  swallowClickOn = null; // a new gesture: any click still owed to the last long press is void
  lastInputWasTouch = isTouch(e);
  if (!lastInputWasTouch) return;
  const p = e as PointerEvent;
  const el = tipTarget(e);
  if (current && el !== current) hide(); // touching anywhere else dismisses an open tooltip
  endPress();
  const started: Press = { id: p.pointerId, el, start: { x: p.clientX, y: p.clientY }, timer: undefined, long: false };
  if (el?.matches("button")) {
    started.timer = setTimeout(() => {
      if (press !== started || !el.isConnected) return; // lifted, cancelled, or re-rendered away
      started.long = true;
      pinned = true;
      show(el, undefined, GAP);
    }, LONG_PRESS_MS);
  }
  press = started;
}

function onPointerMove(e: Event): void {
  const p = e as PointerEvent;
  if (!press || p.pointerId !== press.id || press.long) return;
  if (Math.hypot(p.clientX - press.start.x, p.clientY - press.start.y) > TAP_SLOP) endPress();
}

function onPointerUp(e: Event): void {
  const p = e as PointerEvent;
  if (!isTouch(e) || !press || p.pointerId !== press.id) return;
  const { el, long } = press;
  endPress();
  if (long) { swallowClickOn = el; return; } // the label is showing; lifting must not press the button
  if (!el || isControl(el)) return;          // a tap on a control is the action itself
  if (el === current && pinned) { hide(); return; } // second tap on the same element closes it
  pinned = true;
  show(el, { x: p.clientX, y: p.clientY }, TOUCH_GAP);
}

// Android reports its own long press as a `contextmenu` event, and may cancel the pointer as it
// does so, which would stop the timer in onPointerDown before it fires. So treat that event as
// the long press too. A mouse right-click is left alone and keeps its normal menu.
function onContextMenu(e: Event): void {
  if (!lastInputWasTouch) return;
  const el = tipTarget(e);
  if (!el?.matches("button")) return;
  e.preventDefault(); // no system menu over an icon button; the label is the useful thing here
  if (press) press.long = true;
  pinned = true;
  show(el, undefined, GAP);
}

// A tooltip pinned to a moved/removed element would be stranded, so a click closes it. Two
// exceptions, both of which only arise on a touchscreen:
function onClick(e: Event): void {
  const target = e.target as Node | null;
  if (swallowClickOn) {
    const owed = swallowClickOn;
    swallowClickOn = null;
    if (target && owed.contains(target)) { e.preventDefault(); e.stopPropagation(); return; }
  }
  // The click a browser sends after a tap on a note or a chart segment would otherwise close
  // the tooltip that same tap just opened.
  if (pinned && current && !isControl(current) && target && current.contains(target)) return;
  hide();
}

export function initTooltips(): void {
  document.addEventListener("pointerover", onPointerOver);
  document.addEventListener("pointerout", onPointerOut);
  document.addEventListener("focusin", onFocusIn);   // keyboard users get them too
  document.addEventListener("focusout", onFocusOut);
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  // The browser sends pointercancel when it takes a touch over to scroll or zoom the page.
  document.addEventListener("pointercancel", endPress);
  document.addEventListener("contextmenu", onContextMenu);
  // Capture phase, so a click owed to a long press is stopped before the button's own handler.
  document.addEventListener("click", onClick, true);
  // Scrolling moves the element out from under its tooltip, so drop it; Escape closes it too.
  window.addEventListener("scroll", hide, true);
  document.addEventListener("keydown", (e) => {
    lastInputWasTouch = false;
    if ((e as KeyboardEvent).key === "Escape") hide();
  });
}

// Exported for tests: the live tooltip element, if one has been created.
export function currentTipText(): string | null {
  const el = $("." + TIP_CLASS);
  return el?.classList.contains("show") ? el.textContent : null;
}
