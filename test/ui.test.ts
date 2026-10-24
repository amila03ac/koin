// @vitest-environment jsdom
//
// Unit tests for the extracted UI utilities (src/ui/dom.ts, src/ui/toast.ts). These are the
// first pieces split out of app.js in Step 3b; locking their behavior guards the further
// split.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { $, fmtDate, h, money, todayIso } from "../src/ui/dom";
import { toast } from "../src/ui/toast";
import { openModal } from "../src/ui/modal";
import { initTooltips, currentTipText } from "../src/ui/tooltip";

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { document.body.innerHTML = ""; });
afterEach(() => { document.body.innerHTML = ""; });

describe("h()", () => {
  test("sets class, attributes, and text children", () => {
    const el = h("div", { class: "card", "data-x": "1" }, "hello");
    expect(el.tagName).toBe("DIV");
    expect(el.className).toBe("card");
    expect(el.getAttribute("data-x")).toBe("1");
    expect(el.textContent).toBe("hello");
  });
  test("null children are skipped; nodes append in order", () => {
    const wrap = h("div", {}, [h("span", {}, "a"), null, h("span", {}, "b")]);
    expect(wrap.querySelectorAll("span").length).toBe(2);
    expect(wrap.textContent).toBe("ab");
  });
  test("text children are escaped (no html injection)", () => {
    const el = h("div", {}, "<b>x</b>");
    expect(el.querySelector("b")).toBeNull();
    expect(el.textContent).toBe("<b>x</b>");
  });
  test("on* attrs attach event listeners", () => {
    let clicks = 0;
    const btn = h("button", { onclick: () => { clicks++; } }, "go");
    btn.dispatchEvent(new Event("click"));
    expect(clicks).toBe(1);
  });
});

describe("$()", () => {
  test("queries the document", () => {
    document.body.appendChild(h("div", { id: "thing" }, "hi"));
    expect($("#thing")?.textContent).toBe("hi");
    expect($("#missing")).toBeNull();
  });
});

describe("money()", () => {
  test("formats positive and negative AUD with 2 decimals", () => {
    expect(money(1234.5)).toBe("$1,234.50");
    expect(money(-9.9)).toBe("-$9.90");
    expect(money(0)).toBe("$0.00");
  });
});

describe("fmtDate()", () => {
  test("formats an ISO date in UTC (no timezone drift)", () => {
    expect(fmtDate("2026-03-01")).toBe("01 Mar 2026");
  });
});

describe("todayIso()", () => {
  test("returns a YYYY-MM-DD string", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("openModal()", () => {
  test("renders title + body with Save/Cancel; Save runs onSave then closes", async () => {
    let saved = 0;
    openModal("My Title", h("p", {}, "hello body"), () => { saved++; });
    expect(document.querySelector(".modal-head h2")?.textContent).toBe("My Title");
    expect(document.querySelector(".modal-body")?.textContent).toContain("hello body");

    (document.querySelector(".modal-foot .btn.primary") as HTMLButtonElement).dispatchEvent(new Event("click"));
    await tick();
    expect(saved).toBe(1);
    expect(document.querySelector(".modal-overlay")).toBeNull(); // closed
  });

  test("onSave returning false keeps the modal open", async () => {
    openModal("Keep open", h("p", {}, "x"), () => false);
    (document.querySelector(".modal-foot .btn.primary") as HTMLButtonElement).dispatchEvent(new Event("click"));
    await tick();
    expect(document.querySelector(".modal-overlay")).toBeTruthy();
  });

  test("extra buttons render left of Cancel and receive a close callback", async () => {
    let closedFromExtra = false;
    openModal("Extras", h("p", {}, "x"), () => {}, [
      { label: "Do thing", className: "btn", handler: (close) => { closedFromExtra = true; close(); } },
    ]);
    const labels = [...document.querySelectorAll(".modal-foot button")].map((b) => b.textContent);
    expect(labels).toEqual(["Do thing", "Cancel", "Save"]);
    (document.querySelector(".modal-foot .btn:not(.ghost):not(.primary)") as HTMLButtonElement).dispatchEvent(new Event("click"));
    await tick();
    expect(closedFromExtra).toBe(true);
    expect(document.querySelector(".modal-overlay")).toBeNull();
  });
});

describe("toast()", () => {
  test("creates #toast with the message and shows it", () => {
    toast("Saved");
    const el = document.getElementById("toast")!;
    expect(el).toBeTruthy();
    expect(el.textContent).toContain("Saved");
    expect(el.classList.contains("show")).toBe(true);
  });
  test("renders an action button that fires its handler", () => {
    let ran = 0;
    toast("Undo me", { label: "Undo", fn: () => { ran++; } });
    const btn = document.querySelector("#toast .toast-action") as HTMLButtonElement;
    expect(btn.textContent).toBe("Undo");
    btn.dispatchEvent(new Event("click"));
    expect(ran).toBe(1);
  });
  test("action toasts get a close button that dismisses without firing the action", () => {
    let ran = 0;
    toast("Undo me", { label: "Undo", fn: () => { ran++; } });
    const close = document.querySelector("#toast .toast-close") as HTMLButtonElement;
    expect(close).toBeTruthy();
    close.dispatchEvent(new Event("click"));
    expect(document.getElementById("toast")!.classList.contains("show")).toBe(false);
    expect(ran).toBe(0); // dismiss must NOT run the Undo action
  });
  test("plain toasts have no close button", () => {
    toast("Saved");
    expect(document.querySelector("#toast .toast-close")).toBeNull();
  });
});

describe("tooltip()", () => {
  // Delegation is bound once; these tests share it, as the real app does.
  initTooltips();

  // Pointer events carry a pointerType, which is how the module tells a mouse from a finger.
  const hover = (el: Element, related: Element | null = null) =>
    el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse", relatedTarget: related }));
  const leave = (el: Element, related: Element | null = null) =>
    el.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: related }));

  // A finger on a touchscreen. Real browsers follow a tap with a `click`, so `tap` sends one too.
  const finger = (type: string, el: Element, init: PointerEventInit = {}) =>
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: "touch", clientX: 40, clientY: 40, ...init }));
  const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  const tap = (el: Element) => { finger("pointerdown", el); finger("pointerup", el); click(el); };

  // The delegated listeners and their state outlive each test, as they outlive each render in
  // the app. Escape closes any open tooltip and marks the keyboard as the last input used.
  afterEach(() => {
    vi.useRealTimers();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  test("shows the data-tip text on hover and hides on leave", () => {
    const btn = h("button", { "data-tip": "Delete" }, "🗑");
    document.body.appendChild(btn);
    hover(btn);
    expect(currentTipText()).toBe("Delete");
    leave(btn);
    expect(currentTipText()).toBeNull();
  });

  test("ignores elements without a data-tip", () => {
    const plain = h("span", {}, "nothing here");
    document.body.appendChild(plain);
    hover(plain);
    expect(currentTipText()).toBeNull();
  });

  test("works for SVG elements (the donut segments)", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const seg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    seg.setAttribute("data-tip", "Groceries: $120 (11%)");
    svg.appendChild(seg); document.body.appendChild(svg);
    hover(seg);
    expect(currentTipText()).toBe("Groceries: $120 (11%)");
    leave(seg);
  });

  test("stays open when the pointer moves onto a child", () => {
    const wrap = h("span", { "data-tip": "Posted 15 Aug 2026" }, [h("b", {}, "•")]);
    document.body.appendChild(wrap);
    const child = wrap.firstElementChild!;
    hover(wrap);
    expect(currentTipText()).toBe("Posted 15 Aug 2026");
    leave(wrap, child); // moving to a child is still "inside"
    expect(currentTipText()).toBe("Posted 15 Aug 2026");
    leave(wrap, document.body);
    expect(currentTipText()).toBeNull();
  });

  test("shows on keyboard focus", () => {
    const btn = h("button", { "data-tip": "Edit" }, "✏️");
    document.body.appendChild(btn);
    btn.focus();
    expect(currentTipText()).toBe("Edit");
    btn.blur();
    expect(currentTipText()).toBeNull();
  });

  // ---- touch: there is no hover, so a tap has to do the job ----

  test("touch: tapping a note marker shows the note, and the click that follows keeps it open", () => {
    const note = h("span", { class: "badge note", "data-tip": "Split: gift moved to its own row" }, "📝");
    document.body.appendChild(note);
    tap(note);
    expect(currentTipText()).toBe("Split: gift moved to its own row");
  });

  test("touch: tapping the same element again closes it", () => {
    const note = h("span", { "data-tip": "A note" }, "📝");
    document.body.appendChild(note);
    tap(note);
    expect(currentTipText()).toBe("A note");
    tap(note);
    expect(currentTipText()).toBeNull();
  });

  test("touch: tapping somewhere else closes it", () => {
    const note = h("span", { "data-tip": "A note" }, "📝");
    const elsewhere = h("p", {}, "some other part of the page");
    document.body.append(note, elsewhere);
    tap(note);
    expect(currentTipText()).toBe("A note");
    tap(elsewhere);
    expect(currentTipText()).toBeNull();
  });

  test("touch: tapping a second marker moves the tooltip to it", () => {
    const a = h("span", { "data-tip": "First" }, "📝");
    const b = h("span", { "data-tip": "Second" }, "📝");
    document.body.append(a, b);
    tap(a);
    tap(b);
    expect(currentTipText()).toBe("Second");
  });

  test("touch: works on SVG (a donut segment)", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const seg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    seg.setAttribute("data-tip", "Groceries: $120 (11%)");
    svg.appendChild(seg); document.body.appendChild(svg);
    tap(seg);
    expect(currentTipText()).toBe("Groceries: $120 (11%)");
  });

  test("touch: a finger that turns into a scroll is not a tap", () => {
    const note = h("span", { "data-tip": "A note" }, "📝");
    document.body.appendChild(note);
    finger("pointerdown", note);
    finger("pointercancel", note); // the browser took the gesture over to scroll the page
    expect(currentTipText()).toBeNull();

    finger("pointerdown", note);
    finger("pointermove", note, { clientX: 40, clientY: 90 }); // drifted too far to be a tap
    finger("pointerup", note, { clientX: 40, clientY: 90 });
    expect(currentTipText()).toBeNull();
  });

  test("touch: tapping a button presses it and shows no tooltip", () => {
    let pressed = 0;
    const btn = h("button", { "data-tip": "Delete", onclick: () => { pressed++; } }, "🗑");
    document.body.appendChild(btn);
    finger("pointerdown", btn); finger("pointerup", btn);
    btn.focus(); // a tap focuses the button; that is not keyboard navigation
    click(btn);
    expect(pressed).toBe(1);
    expect(currentTipText()).toBeNull();
  });

  test("touch: a long press on a button shows its label and does not press it", () => {
    vi.useFakeTimers();
    let pressed = 0;
    const btn = h("button", { "data-tip": "Delete", onclick: () => { pressed++; } }, "🗑");
    document.body.appendChild(btn);
    finger("pointerdown", btn);
    vi.advanceTimersByTime(400);
    expect(currentTipText()).toBeNull(); // not long enough yet
    vi.advanceTimersByTime(200);
    expect(currentTipText()).toBe("Delete");
    finger("pointerup", btn);
    click(btn); // some browsers send a click when the finger lifts; it must not delete anything
    expect(pressed).toBe(0);
    expect(currentTipText()).toBe("Delete"); // stays up to be read

    tap(btn); // a normal tap afterwards works as usual
    expect(pressed).toBe(1);
    expect(currentTipText()).toBeNull();
  });

  test("touch: a long press that never gets its click does not swallow a later one", () => {
    vi.useFakeTimers();
    let pressed = 0;
    const btn = h("button", { "data-tip": "Edit", onclick: () => { pressed++; } }, "✏️");
    document.body.appendChild(btn);
    finger("pointerdown", btn);
    vi.advanceTimersByTime(600);
    finger("pointerup", btn); // this browser sends no click after a long press
    tap(btn);
    expect(pressed).toBe(1);
  });

  test("touch: lifting the finger early cancels the long press", () => {
    vi.useFakeTimers();
    const btn = h("button", { "data-tip": "Edit" }, "✏️");
    document.body.appendChild(btn);
    finger("pointerdown", btn);
    vi.advanceTimersByTime(200);
    finger("pointerup", btn);
    vi.advanceTimersByTime(1000);
    expect(currentTipText()).toBeNull();
  });

  test("touch: Android's own long press (a contextmenu event) shows the label, with no menu", () => {
    let pressed = 0;
    const btn = h("button", { "data-tip": "Delete", onclick: () => { pressed++; } }, "🗑");
    document.body.appendChild(btn);
    finger("pointerdown", btn);
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    btn.dispatchEvent(menu);
    finger("pointercancel", btn); // Android cancels the pointer once it has recognised the long press
    expect(menu.defaultPrevented).toBe(true);
    expect(currentTipText()).toBe("Delete");
    expect(pressed).toBe(0);
  });

  test("a mouse right-click keeps its normal menu", () => {
    const btn = h("button", { "data-tip": "Delete" }, "🗑");
    document.body.appendChild(btn);
    btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", button: 2 }));
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    btn.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(false);
  });

  test("touch: scrolling the page closes an open tooltip", () => {
    const note = h("span", { "data-tip": "A note" }, "📝");
    document.body.appendChild(note);
    tap(note);
    expect(currentTipText()).toBe("A note");
    window.dispatchEvent(new Event("scroll"));
    expect(currentTipText()).toBeNull();
  });

  test("a mouse still hovers normally after the screen has been touched", () => {
    const note = h("span", { "data-tip": "A note" }, "📝");
    const btn = h("button", { "data-tip": "Edit" }, "✏️");
    document.body.append(note, btn);
    tap(note);
    hover(btn);
    expect(currentTipText()).toBe("Edit");
    leave(btn);
    expect(currentTipText()).toBeNull();
  });
});
