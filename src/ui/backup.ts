// backup.ts — export / restore / reset of all Koin data. Extracted from app.js in Step 3b.
// These go through the storage adapter only; restore/reset reload the page afterwards.
import type { Backup } from "../store/index";
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
  let dump: unknown;
  try {
    dump = JSON.parse(text);
  } catch {
    toast("Invalid backup file — not valid JSON.");
    return;
  }
  store.importAll(dump as Backup)
    .then(() => { toast("Backup restored. Reloading…"); setTimeout(() => location.reload(), 600); })
    .catch((err) => toast((err as Error).message || "Invalid backup file."));
}

export async function resetAll(): Promise<void> {
  if (!confirm("Erase ALL Koin data (transactions, edits, rules) from this browser? Export a backup first if unsure.")) return;
  await store.clearAll();
  location.reload();
}
