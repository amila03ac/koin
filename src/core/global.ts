// Back-compat bridge to the global `Koin` namespace.
//
// During Phase 1 the UI/storage files (js/app.js, js/store.js, js/charts.js,
// js/categories.js) are still classic-script IIFEs that read these core modules off a
// global `Koin` object (e.g. `const { parser, rules } = Koin`). Until Step 3 converts the
// UI to real ES-module imports, each ported core module registers itself here.
//
// Once the UI imports the core directly, delete this bridge and the `registerGlobal`
// calls in the core modules.
export interface KoinGlobal {
  [key: string]: unknown;
}

const g = globalThis as unknown as { Koin?: KoinGlobal };
g.Koin = g.Koin || {};

/** The shared global `Koin` namespace (same object the legacy scripts use). */
export const Koin: KoinGlobal = g.Koin;

/** Attach a value to the global `Koin` namespace for the not-yet-ported UI. */
export function registerGlobal(key: string, value: unknown): void {
  Koin[key] = value;
}
