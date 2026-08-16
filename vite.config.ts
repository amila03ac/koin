import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves a project site from a sub-path (https://<user>.github.io/koin/), so the
// built asset URLs must be prefixed. Dev stays at "/" so `npm run dev` keeps a clean localhost
// URL. vite-plugin-pwa derives the manifest's start_url/scope from this, so nothing else needs
// to know about the sub-path.
const BASE = "/koin/";

// Content-Security-Policy for the deployed app: the browser's backstop if hostile content ever
// reached the page (a crafted merchant name, a compromised build dependency). Koin talks to
// nothing external, so this is tight — most importantly it forbids inline/eval'd scripts and
// restricts where data could be sent.
//
// Notes on the two loosenings:
//  • `connect-src 'self'` (not 'none'): the empty state fetches data/Transactions.sample.csv.
//  • `style-src 'unsafe-inline'`: h() sets style="" attributes for chart colours. Style
//    injection is far less dangerous than script injection; scripts stay strict.
// `frame-ancestors` is deliberately omitted — it is ignored in a <meta> CSP and only works as
// an HTTP header, which GitHub Pages cannot set.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// Inject the CSP at BUILD time only. It must not apply to `npm run dev`, whose HMR client
// relies on eval and inline scripts that a strict policy would (correctly) block. Written as a
// few lines here rather than pulling in an HTML plugin — Koin keeps its dependencies minimal.
// The synthetic sample CSVs live in data/ (the tests read them from there too). Vite only
// copies public/ into the build, so without this the empty state's "Load the sample data"
// button 404s on a built/deployed site — while working fine in `npm run dev`, where the whole
// project root is served. Emit them into dist/data/ so the button works everywhere.
const SAMPLE_CSVS = ["Transactions.sample.csv", "Transactions.sample-detailed.csv"];
function sampleDataPlugin(): Plugin {
  return {
    name: "koin-sample-data",
    apply: "build",
    generateBundle() {
      for (const name of SAMPLE_CSVS) {
        this.emitFile({
          type: "asset",
          fileName: `data/${name}`,
          source: readFileSync(new URL(`./data/${name}`, import.meta.url), "utf8"),
        });
      }
    },
  };
}

function cspPlugin(): Plugin {
  return {
    name: "koin-csp",
    apply: "build",
    transformIndexHtml() {
      return [{
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
        injectTo: "head-prepend",
      }];
    },
  };
}

// Phase 1 scaffold (see docs/ARCHITECTURE.md). The app is served/bundled by Vite from the
// repo root (index.html → src/main.ts → typed modules under src/).
//
// Step 5 adds the PWA layer via vite-plugin-pwa: it generates the web app manifest and a
// Workbox service worker at BUILD time (not in `npm run dev`), so the built app is
// installable and works fully offline. We don't hardcode `start_url`/`scope` — the plugin
// derives them from Vite's `base`, so when Step 6 deploys under a sub-path (GitHub Pages)
// the manifest paths follow automatically.
export default defineConfig(({ command, isPreview }) => ({
  root: ".",
  // Sub-path for the built site AND for `npm run preview`, which serves that build and must
  // therefore match its asset URLs. Note `command` is "serve" for preview just as it is for
  // dev, so previewing needs the explicit isPreview check or every asset 404s. Dev alone stays
  // at "/" for a clean localhost URL.
  base: command === "build" || isPreview ? BASE : "/",
  server: {
    port: 4178,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  plugins: [
    cspPlugin(),
    sampleDataPlugin(),
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
        // Precache the whole app shell so it boots offline after the first visit (csv covers
        // the sample data, so "Load the sample data" also works offline).
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,csv}"],
      },
    }),
  ],
  // Vitest reads this file too. `test` isn't part of Vite's own UserConfig type (it comes from
  // vitest/config's module augmentation, which we don't import here so the plugin types stay
  // aligned with Vite's). Returning the config from a function means it isn't subject to excess
  // property checking, so this key needs no suppression.
  test: {
    // Pure-core tests run in Node; jsdom tests opt in per-file via `// @vitest-environment jsdom`.
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
}));
