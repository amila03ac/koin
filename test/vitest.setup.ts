// In a browser, `window` IS the global object, so the legacy modules' `window.Koin = …`
// (and their bare `Koin` reads) resolve against the global. Mirror that for Node so the
// pure logic modules can be imported and exercised headlessly under Vitest. This matches
// the shim the original test/run.js used.
(globalThis as unknown as { window: typeof globalThis }).window = globalThis;
