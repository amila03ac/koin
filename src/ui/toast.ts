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
  const dismiss = () => { box.classList.remove("show"); clearTimeout(toastTimer); };
  box.innerHTML = "";
  box.appendChild(h("span", {}, msg));
  if (action) {
    box.appendChild(h("button", {
      class: "toast-action",
      onclick: () => { dismiss(); action.fn(); },
    }, action.label));
    // Action toasts linger (8s) so you can reach the button; give an explicit way to dismiss
    // them now (e.g. keep the category, hide the Undo) without waiting or triggering the action.
    box.appendChild(h("button", {
      class: "toast-close", "aria-label": "Dismiss", onclick: dismiss,
    }, "×"));
  }
  box.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("show"), action ? 8000 : 4200);
}
