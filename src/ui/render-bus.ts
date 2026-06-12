// render-bus.ts — a one-hop indirection so feature modules (table, rules-editor) can trigger
// a full re-render without importing app.ts. Without it, app → table → app would be a cycle:
// app's renderAll() calls renderTable(), and the table's actions need to call back into
// renderAll(). So app registers renderAll here once at startup via setRenderer(), and the
// feature modules call rerender().
//
// Who calls what:
//   • app.ts (startup):            setRenderer(renderAll)
//   • table.ts / rules-editor.ts:  rerender()  // after mutating state + persisting
//
// Tests that drive table/editor actions must import "../src/ui/app" first (which runs the
// setRenderer registration) — the jsdom boot test does this. Until a renderer is registered,
// rerender() is a safe no-op.
let renderer: () => void = () => {};

export function setRenderer(fn: () => void): void {
  renderer = fn;
}

export function rerender(): void {
  renderer();
}
