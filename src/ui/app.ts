// app.ts — bootstrap + the render pipeline (renderAll) + toolbar wiring. Imports the typed
// core, store, and ui/* modules. The table and rules/category editor live in their own ui/*
// modules; this is the composition root that wires them together and owns renderAll.
import type { Period } from "../core/types";
import { store } from "../store/index";
import * as parser from "../core/parser";
import * as insights from "../core/insights";
import { DEFAULT_CATEGORIES, DEFAULT_RULES, PALETTE_VERSION } from "../core/defaults";
import { h, $, todayIso } from "./dom";
import { toast } from "./toast";
import { exportBackup, importBackup, resetAll } from "./backup";
import { state, compose, latestDate } from "./state";
import {
  renderSummary, renderCharts, renderInsights, renderPeriodJump, renderCatFilter, periodToAnchor,
} from "./render-sections";
import { renderTable, openTxnModal } from "./table";
import { openRulesModal } from "./rules-editor";
import { setRenderer } from "./render-bus";
import { initStorageDurability } from "./storage-status";
import { initDiskBackup, diskBackupActive } from "./disk-backup";

// ---- bootstrap ----------------------------------------------------------
async function init(): Promise<void> {
  await store.init(); // prefer IndexedDB; fall back to localStorage
  // A failed write (e.g. browser storage full) would otherwise be lost silently.
  store.onWriteError = () => {
    toast(
      "Couldn't save — your browser's storage may be full. Export a backup to be safe.",
      { label: "Export backup", fn: exportBackup },
    );
  };
  state.categories = (await store.getCategories()) || DEFAULT_CATEGORIES;
  state.rules = (await store.getRules()) || DEFAULT_RULES;
  if (!(await store.getCategories())) await store.setCategories(state.categories);
  if (!(await store.getRules())) await store.setRules(state.rules);
  state.catMap = Object.fromEntries(state.categories.map((c) => [c.key, c] as const));

  await migratePalette();

  state.raw = await store.getTransactions();
  state.manual = await store.getManual();
  state.overrides = await store.getOverrides();

  bindChrome();
  compose();
  state.anchor = latestDate() || todayIso();
  renderAll();

  await initStorageDurability(); // ask the browser to keep our data durable; reflect status
  await initDiskBackup();        // resume auto-saving to a linked disk file, if one is set up
  maybeNudgeBackup();            // gentle reminder if it's been a while since the last export
}

// Since browser storage can be wiped and an exported backup is the only fully durable copy,
// nudge the user to export if they have data and haven't backed up in a while (or ever).
async function maybeNudgeBackup(): Promise<void> {
  if (!state.effective.length) return;   // nothing worth backing up yet
  if (diskBackupActive()) return;        // a linked disk file already auto-saves — no nudge needed
  const meta = await store.getMeta();
  const last = typeof meta.lastBackupAt === "string" ? Date.parse(meta.lastBackupAt) : NaN;
  const days = Number.isNaN(last) ? Infinity : (Date.now() - last) / 86_400_000;
  if (days < 14) return;
  toast(
    Number.isFinite(days) ? "It's been a while since your last backup." : "Tip: export a backup to keep your data safe.",
    { label: "Export backup", fn: exportBackup },
  );
}

// Refresh stored category colors when the default palette version changes. Only updates
// colors for known category keys — custom categories, labels, and icons the user changed are
// left untouched. No transactions/rules/overrides are affected.
async function migratePalette(): Promise<void> {
  const meta = await store.getMeta();
  if ((meta.paletteVersion || 1) >= (PALETTE_VERSION || 1)) return;
  const def: Record<string, string> = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.key, c.color] as const));
  let changed = false;
  for (const c of state.categories) {
    if (def[c.key] && c.color !== def[c.key]) { c.color = def[c.key]; changed = true; }
  }
  if (changed) {
    await store.setCategories(state.categories);
    state.catMap = Object.fromEntries(state.categories.map((c) => [c.key, c] as const));
  }
  meta.paletteVersion = PALETTE_VERSION;
  await store.setMeta(meta);
}

// ---- import -------------------------------------------------------------
async function importCsvText(text: string, filename: string): Promise<void> {
  const { transactions, skipped } = parser.parse(text);
  if (!transactions.length) { toast(`No transactions found in ${filename}.`); return; }
  // merge by id (dedup across overlapping months)
  const byId = new Map(state.raw.map((t) => [t.id, t]));
  let added = 0;
  for (const t of transactions) {
    if (!byId.has(t.id)) { byId.set(t.id, t); added++; }
  }
  state.raw = [...byId.values()];
  await store.setTransactions(state.raw);

  const meta = await store.getMeta();
  meta.imports = meta.imports || [];
  meta.imports.push({ filename, count: transactions.length, added, at: new Date().toISOString() });
  await store.setMeta(meta);

  compose();
  state.anchor = latestDate() || state.anchor;
  renderAll();
  toast(`Imported ${filename}: ${added} new, ${transactions.length - added} already present${skipped ? `, ${skipped} skipped` : ""}.`);
}

function pickFile(accept: string, cb: (file: File) => void): void {
  const inp = h("input", { type: "file", accept, style: "display:none" }) as HTMLInputElement;
  inp.addEventListener("change", () => { const f = inp.files?.[0]; if (f) cb(f); });
  document.body.appendChild(inp);
  inp.click();
  setTimeout(() => inp.remove(), 1000);
}

function readFile(file: File, cb: (text: string) => void): void {
  const fr = new FileReader();
  fr.onload = () => cb(fr.result as string);
  fr.readAsText(file);
}

// ---- chrome (toolbar) wiring -------------------------------------------
function bindChrome(): void {
  $("#btn-import")!.addEventListener("click", () =>
    pickFile(".csv,text/csv", (f) => readFile(f, (txt) => importCsvText(txt, f.name))));
  $("#btn-add")!.addEventListener("click", () => openTxnModal());
  $("#btn-rules")!.addEventListener("click", openRulesModal);
  $("#btn-export")!.addEventListener("click", exportBackup);
  $("#btn-import-backup")!.addEventListener("click", () =>
    pickFile(".json,application/json", (f) => readFile(f, importBackup)));
  $("#btn-reset")!.addEventListener("click", resetAll);

  document.querySelectorAll<HTMLElement>(".period-tab").forEach((b) =>
    b.addEventListener("click", () => { state.period = b.dataset.period as Period; renderAll(); }));
  $("#nav-prev")!.addEventListener("click", () => { state.anchor = insights.shiftAnchor(state.anchor!, state.period, -1); renderAll(); });
  $("#nav-next")!.addEventListener("click", () => { state.anchor = insights.shiftAnchor(state.anchor!, state.period, 1); renderAll(); });
  $("#period-jump")!.addEventListener("change", (e) => { state.anchor = periodToAnchor((e.target as HTMLSelectElement).value, state.period); renderAll(); });

  $("#filter-text")!.addEventListener("input", (e) => { state.filter.text = (e.target as HTMLInputElement).value.toLowerCase(); renderTable(); });
  $("#filter-cat")!.addEventListener("change", (e) => { state.filter.category = (e.target as HTMLSelectElement).value; renderTable(); });
  $("#filter-ignored")!.addEventListener("change", (e) => { state.filter.showIgnored = (e.target as HTMLInputElement).checked; renderTable(); });

  $("#sample-load")?.addEventListener("click", loadSample);
}

function loadSample(): void {
  fetch("data/Transactions.sample.csv", { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error("http"); return r.text(); })
    .then((txt) => importCsvText(txt, "Transactions.sample.csv"))
    .catch(() => toast("Couldn't auto-load the sample (browsers block file reads from disk). Click ‘Import CSV’ and pick data/Transactions.sample.csv instead."));
}

// ---- rendering ----------------------------------------------------------
function renderAll(): void {
  // active period tab
  document.querySelectorAll<HTMLElement>(".period-tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.period === state.period));
  $("#period-label")!.textContent = insights.periodLabel(state.anchor!, state.period);
  renderPeriodJump();
  $("#app")!.style.display = state.effective.length ? "" : "none";
  $("#empty")!.style.display = state.effective.length ? "none" : "";
  if (!state.effective.length) return;

  const inPeriod = insights.filterByPeriod(state.effective, state.period, state.anchor!);
  renderSummary(inPeriod);
  renderCharts(inPeriod);
  renderInsights(inPeriod);
  renderCatFilter();
  renderTable();
}

// Let extracted feature modules (table, rules editor) trigger a full re-render.
setRenderer(renderAll);
document.addEventListener("DOMContentLoaded", init);
