import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Phase 1 scaffold (see docs/ARCHITECTURE.md). The app is served/bundled by Vite from the
// repo root (index.html → src/main.ts → typed modules under src/).
//
// Step 5 adds the PWA layer via vite-plugin-pwa: it generates the web app manifest and a
// Workbox service worker at BUILD time (not in `npm run dev`), so the built app is
// installable and works fully offline. We don't hardcode `start_url`/`scope` — the plugin
// derives them from Vite's `base`, so when Step 6 deploys under a sub-path (GitHub Pages)
// the manifest paths follow automatically.
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
  plugins: [
    VitePWA({
      registerType: "autoUpdate", // new SW activates on next load; no manual update prompt
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Koin — Personal Finance Dashboard",
        short_name: "Koin",
        description: "A local-first personal finance dashboard. Your data stays in your browser.",
        theme_color: "#6f7a4e",
        background_color: "#f3efe6",
        display: "standalone",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the whole app shell so it boots offline after the first visit.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
      },
    }),
  ],
  // Vitest reads this file too. `test` isn't part of Vite's own UserConfig type (it's added
  // by vitest/config's module augmentation, which we don't load here to keep the plugin types
  // aligned with Vite's), so suppress the unknown-property error on this one key.
  // @ts-expect-error -- vitest `test` config; valid at runtime, not in vite's UserConfig type
  test: {
    // Pure-core tests run in Node; jsdom tests opt in per-file via `// @vitest-environment jsdom`.
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
