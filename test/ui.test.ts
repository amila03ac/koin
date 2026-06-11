// @vitest-environment jsdom
//
// Unit tests for the extracted UI utilities (src/ui/dom.ts, src/ui/toast.ts). These are the
// first pieces split out of app.js in Step 3b; locking their behavior guards the further
// split.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { $, fmtDate, h, money } from "../src/ui/dom";
import { toast } from "../src/ui/toast";

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
