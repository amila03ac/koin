// render-bus.ts — a one-hop indirection so extracted UI modules can trigger a full
// re-render without importing app.js (which would create a circular dependency). app.js
// registers its renderAll via setRenderer at startup; feature modules call rerender().
let renderer: () => void = () => {};

export function setRenderer(fn: () => void): void {
  renderer = fn;
}

export function rerender(): void {
  renderer();
}
