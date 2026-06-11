import { defineConfig } from "vitest/config";

// Phase 1 Step 1 scaffold (see docs/ARCHITECTURE.md). The app still lives at the repo
// root (index.html + js/ + css/ + data/), loaded via src/main.ts. Steps 2–3 move the
// logic into typed modules under src/.
export default defineConfig({
  root: ".",
  server: {
    port: 4178,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    // Pure-core tests run in Node; the jsdom boot test opts in per-file via
    // `// @vitest-environment jsdom`.
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
