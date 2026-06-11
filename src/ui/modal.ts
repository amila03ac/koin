// modal.ts — the overlay modal primitive. `onSave` returning false keeps the modal open
// (e.g. validation failed); anything else closes it. Extracted from app.js in Step 3b.
import { h } from "./dom";

export interface ModalButton {
  label: string;
  className?: string;
  handler: (close: () => void) => void;
}

// extraButtons: optional [{ label, className, handler(close) }] rendered left of Cancel.
export function openModal(
  title: string,
  body: Node,
  onSave: () => boolean | void | Promise<boolean | void>,
  extraButtons?: ModalButton[],
): void {
  const overlay = h("div", { class: "modal-overlay" });
  const close = () => overlay.remove();
  const save = async () => { const ok = await onSave(); if (ok !== false) close(); };
  const footer = (extraButtons || []).map((b) =>
    h("button", { class: b.className || "btn ghost", onclick: () => b.handler(close) }, b.label));
  footer.push(h("button", { class: "btn ghost", onclick: close }, "Cancel"));
  footer.push(h("button", { class: "btn primary", onclick: save }, "Save"));
  overlay.appendChild(h("div", { class: "modal" }, [
    h("div", { class: "modal-head" }, [h("h2", {}, title), h("button", { class: "icon-btn", onclick: close }, "✕")]),
    h("div", { class: "modal-body" }, [body]),
    h("div", { class: "modal-foot" }, footer),
  ]));
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
}
