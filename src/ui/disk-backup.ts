// disk-backup.ts — optional local-disk backup via the File System Access API (Chromium only).
//
// You link a file on your HDD once; Koin then rewrites your whole dataset to it after every
// change (debounced). That file is the durable, browser-independent copy: if the browser
// clears its storage, crashes, or you move to another browser/machine, the file survives —
// reopen Koin and Restore it. Browsers without the API (Firefox/Safari) fall back to the
// manual Export backup + reminder.
//
// The data written is store.exportAll() — byte-identical to a manual backup, so a linked file
// and a downloaded backup are interchangeable for Restore. The file *handle* persists through
// the store (IndexedDB). Auto-save is driven by store.onAfterWrite, wired in initDiskBackup().
import type { Backup } from "../store/index";
import { store } from "../store/index";
import { $ } from "./dom";
import { toast } from "./toast";

// queryPermission / requestPermission are Chromium extensions absent from the standard
// lib.dom FileSystemFileHandle type; showSaveFilePicker likewise isn't always typed on Window.
type PermHandle = FileSystemFileHandle & {
  queryPermission?(d: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission?(d: { mode: "readwrite" }): Promise<PermissionState>;
};
type PickerWindow = Window & {
  showSaveFilePicker?(opts: unknown): Promise<FileSystemFileHandle>;
};

export function diskBackupSupported(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

// none = no file linked · reconnect = linked but needs a click to re-grant write access this
// session · active = linked and writable now (auto-save on).
type LinkState = "none" | "reconnect" | "active";
let linkState: LinkState = "none";
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export function diskBackupActive(): boolean { return linkState === "active"; }

// Reflect the current state into the ⋯ menu: a status line + a context-aware button.
function refreshUi(): void {
  const status = $("#disk-backup-status");
  const btn = $("#btn-backup-file");
  if (status) {
    if (linkState === "active") { status.textContent = "● Backup file — auto-saving"; status.className = "menu-status ok"; }
    else if (linkState === "reconnect") { status.textContent = "▲ Backup file — reconnect to resume"; status.className = "menu-status warn"; }
    else { status.textContent = ""; status.className = "menu-status"; }
  }
  if (btn) {
    btn.textContent = linkState === "none" ? "Link backup file…"
      : linkState === "reconnect" ? "Reconnect backup file"
      : "Unlink backup file";
  }
}

async function permission(handle: PermHandle, request: boolean): Promise<PermissionState> {
  const opts = { mode: "readwrite" as const };
  if (request) return (await handle.requestPermission?.(opts)) ?? "granted";
  return (await handle.queryPermission?.(opts)) ?? "granted"; // no permission API ⇒ nothing to gate
}

// Overwrite the linked file with `dump`. createWritable() writes to a temp copy and only swaps
// it in on close(), so a crash mid-write can't leave the file half-written. Exported for tests.
export async function writeToHandle(handle: FileSystemFileHandle, dump: Backup): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(dump, null, 2));
  await writable.close();
}

async function writeNow(): Promise<void> {
  const handle = (await store.getBackupHandle()) as PermHandle | null;
  if (!handle) { linkState = "none"; refreshUi(); return; }
  if ((await permission(handle, false)) !== "granted") { linkState = "reconnect"; refreshUi(); return; }
  try {
    await writeToHandle(handle, await store.exportAll());
    linkState = "active";
  } catch (err) {
    console.error("Koin disk backup: write failed", err);
    linkState = "reconnect";
    toast("Couldn't update your backup file. Click the ⋯ menu to reconnect it.");
  }
  refreshUi();
}

// Debounced auto-save: a burst of writes (e.g. a CSV import) collapses into one disk write.
export function scheduleDiskBackup(): void {
  if (linkState !== "active") return; // only auto-save while we hold permission
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void writeNow(); }, 1000);
}

async function linkBackupFile(): Promise<void> {
  if (!diskBackupSupported()) {
    toast("This browser can't link a disk file. Use Export backup instead (Chrome/Edge support linking).");
    return;
  }
  let handle: PermHandle;
  try {
    handle = (await (window as PickerWindow).showSaveFilePicker!({
      suggestedName: "koin-backup.json",
      types: [{ description: "Koin backup", accept: { "application/json": [".json"] } }],
    })) as PermHandle;
  } catch (err) {
    if ((err as DOMException)?.name === "AbortError") return; // user cancelled the picker
    toast("Couldn't link the backup file.");
    return;
  }
  await store.setBackupHandle(handle);
  linkState = "active";
  await writeNow();
  if (linkState === "active") toast("Backup file linked. Koin will keep it up to date automatically.");
}

async function reconnectBackupFile(): Promise<void> {
  const handle = (await store.getBackupHandle()) as PermHandle | null;
  if (!handle) { await linkBackupFile(); return; }
  if ((await permission(handle, true)) === "granted") { // request() needs the click gesture
    linkState = "active";
    await writeNow();
    if (linkState === "active") toast("Backup file reconnected.");
  } else {
    toast("Backup file access denied. Re-link it to resume disk backups.");
  }
}

async function unlinkBackupFile(): Promise<void> {
  if (!confirm("Stop auto-saving to the linked file? Your data and the file itself are kept.")) return;
  await store.clearBackupHandle();
  linkState = "none";
  refreshUi();
  toast("Backup file unlinked.");
}

// Wire the menu button + auto-save, and reflect the linked file's current state on startup.
export async function initDiskBackup(): Promise<void> {
  const btn = $("#btn-backup-file");
  if (!diskBackupSupported()) { if (btn) btn.style.display = "none"; refreshUi(); return; }

  store.onAfterWrite = scheduleDiskBackup;
  if (btn) {
    btn.addEventListener("click", () => {
      if (linkState === "active") void unlinkBackupFile();
      else if (linkState === "reconnect") void reconnectBackupFile();
      else void linkBackupFile();
    });
  }
  // Persisted write permission usually lapses between sessions, so a linked file starts in the
  // "reconnect" state until the user clicks once. Never auto-request (needs a user gesture).
  const handle = (await store.getBackupHandle()) as PermHandle | null;
  linkState = handle ? ((await permission(handle, false)) === "granted" ? "active" : "reconnect") : "none";
  if (linkState === "active") void writeNow(); // permission survived; sync immediately
  refreshUi();
  // Best-effort final flush when the tab goes away, in case a debounced save is pending.
  window.addEventListener("pagehide", () => { if (linkState === "active") void writeNow(); });
}
