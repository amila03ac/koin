// Vite entry point.
//
// Phase 1 migration (see docs/ARCHITECTURE.md). The pure core (parser, rules, insights,
// defaults) is now typed ES modules under src/core; they register on the global `Koin`
// namespace for the not-yet-ported UI. The UI/storage files (store, categories, charts,
// app) are still classic-script IIFEs loaded here for their side effects — Step 3 converts
// them and deletes this list. Load order matters (globals first, app last).
import "../css/style.css";
import "./core/defaults";
import "../js/store.js";
import "./core/parser";
import "./core/rules";
import "../js/categories.js";
import "./core/insights";
import "../js/charts.js";
import "../js/app.js";
