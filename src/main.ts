// Vite entry point.
//
// Phase 1 Step 1 (see docs/ARCHITECTURE.md): we have NOT rewritten the app yet — we just
// load the existing classic-script modules for their side effects, in the same order the
// old index.html used. Each legacy file attaches to the global `Koin` namespace (and reads
// it as a bare global), which behaves identically whether it's a <script> tag or an ES
// module import — so this is a pure tooling change with no logic change.
//
// Steps 2–3 will convert these into typed ES modules under src/core and src/ui and delete
// this side-effect import list.
import "../css/style.css";
import "../js/defaults.js";
import "../js/store.js";
import "../js/parser.js";
import "../js/rules.js";
import "../js/categories.js";
import "../js/insights.js";
import "../js/charts.js";
import "../js/app.js";
