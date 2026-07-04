// backup.ts — export / restore / reset of all Koin data. Extracted from app.js in Step 3b.
// These go through the storage adapter only; restore/reset reload the page afterwards.
import type { Backup } from "../store/index";
import { store } from "../store/index";
import { h, todayIso } from "./dom";
import { toast } from "./toast";

// Download a data blob as a timestamped .json file. Shared by manual export and the automatic
// "safety copy" taken before a restore.
function download(dump: Backup, prefix: string): void {
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `${prefix}-${todayIso()}.json` });
  document.body.appendChild(a); a.click(); a.remove();
}

export async function exportBackup(): Promise<void> {
  download(await store.exportAll(), "koin-backup");
  // Remember when the user last backed up, so the startup nudge stays quiet afterwards.
  const meta = await store.getMeta();
  meta.lastBackupAt = new Date().toISOString();
  await store.setMeta(meta);
  toast("Backup downloaded.");
}

export async function importBackup(text: string): Promise<void> {
  let dump: unknown;
  try {
    dump = JSON.parse(text);
  } catch {
    toast("Invalid backup file — not valid JSON.");
    return;
  }

  // Restore REPLACES all current data and has no undo, so guard it: confirm, and first
  // download a safety copy of whatever's here now (only if there's data worth saving).
  const current = await store.exportAll();
  const hasData = !!(current.transactions?.length || current.manual?.length
    || Object.keys(current.overrides || {}).length);
  const confirmMsg = hasData
    ? "Restore will REPLACE all current Koin data with this backup. Your current data will be "
      + "downloaded as a safety copy first. Continue?"
    : "Restore this backup? It becomes your Koin data.";
  if (!confirm(confirmMsg)) { toast("Restore cancelled."); return; }
  if (hasData) download(current, "koin-before-restore");

  // Only report success once the restore actually commits (importAll is atomic + throws on a
  // failed write), so we never reload onto data that didn't save.
  try {
    await store.importAll(dump as Backup);
  } catch (err) {
    toast((err as Error).message || "Invalid backup file.");
    return;
  }
  toast("Backup restored. Reloading…");
  setTimeout(() => location.reload(), 600);
}

export async function resetAll(): Promise<void> {
  if (!confirm("Erase ALL Koin data (transactions, edits, rules) from this browser? Export a backup first if unsure.")) return;
  await store.clearAll();
  location.reload();
}
