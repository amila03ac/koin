// toast.ts — the transient notification at the bottom of the screen. Optionally shows an
// action button (e.g. Undo). Extracted from app.js in Step 3b.
import { $, h } from "./dom";

export interface ToastAction {
  label: string;
  fn: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

// toast(message) or toast(message, { label, fn }) to show an action button (e.g. Undo).
export function toast(msg: string, action?: ToastAction): void {
  let el = $("#toast");
  if (!el) { el = h("div", { id: "toast" }); document.body.appendChild(el); }
  const box = el;
  box.innerHTML = "";
  box.appendChild(h("span", {}, msg));
  if (action) {
    box.appendChild(h("button", {
      class: "toast-action",
      onclick: () => { box.classList.remove("show"); clearTimeout(toastTimer); action.fn(); },
    }, action.label));
  }
  box.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("show"), action ? 8000 : 4200);
}
