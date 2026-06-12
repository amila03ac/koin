// Vite entry point. The whole app is now a real ES-module graph: ui/app imports the typed
// core (parser/rules/insights/defaults/categories), the storage adapter (store), and the
// charts directly — no more global `Koin` namespace. (Step 3b types + splits ui/app.js.)
import "../css/style.css";
import "./ui/app";
