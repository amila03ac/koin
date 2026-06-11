// @vitest-environment jsdom
//
// Unit tests for the extracted UI utilities (src/ui/dom.ts, src/ui/toast.ts). These are the
// first pieces split out of app.js in Step 3b; locking their behavior guards the further
// split.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { $, fmtDate, h, money, todayIso } from "../src/ui/dom";
import { toast } from "../src/ui/toast";
import { openModal } from "../src/ui/modal";

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
  test("`html` sets innerHTML; null children are skipped; nodes append in order", () => {
    const el = h("p", { html: "<b>x</b>" });
    expect(el.querySelector("b")).toBeTruthy();
    const wrap = h("div", {}, [h("span", {}, "a"), null, h("span", {}, "b")]);
    expect(wrap.querySelectorAll("span").length).toBe(2);
    expect(wrap.textContent).toBe("ab");
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
});
