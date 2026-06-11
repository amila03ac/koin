// backup.ts — export / restore / reset of all Koin data. Extracted from app.js in Step 3b.
// These go through the storage adapter only; restore/reset reload the page afterwards.
import { store } from "../store/index";
import { h, todayIso } from "./dom";
import { toast } from "./toast";

export async function exportBackup(): Promise<void> {
  const dump = await store.exportAll();
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `koin-backup-${todayIso()}.json` });
  document.body.appendChild(a); a.click(); a.remove();
  toast("Backup downloaded.");
}

export function importBackup(text: string): void {
  try {
    const dump = JSON.parse(text);
    store.importAll(dump).then(() => { toast("Backup restored. Reloading…"); setTimeout(() => location.reload(), 600); });
  } catch {
    toast("Invalid backup file.");
  }
}

export async function resetAll(): Promise<void> {
  if (!confirm("Erase ALL Koin data (transactions, edits, rules) from this browser? Export a backup first if unsure.")) return;
  await store.clearAll();
  location.reload();
}
