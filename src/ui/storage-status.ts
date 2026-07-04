// storage-status.ts — ask the browser to keep Koin's data durable, and show the result.
//
// Browser storage (IndexedDB/localStorage) is "best-effort" by default: it can be evicted
// under storage pressure, and Safari clears unused site data after ~7 days. Calling
// navigator.storage.persist() upgrades the origin to "persistent" (survives eviction) when
// granted. We surface the state in the ⋯ menu so the user knows whether their data is protected
// or whether an exported backup is the only durable copy.
import { $ } from "./dom";

export async function initStorageDurability(): Promise<void> {
  const el = $("#storage-status");
  const sm = typeof navigator !== "undefined" ? navigator.storage : undefined;
  // Older browsers (and the jsdom test env) lack the StorageManager API: hide the row rather
  // than claim a status we can't back up.
  if (!sm || typeof sm.persist !== "function") { if (el) el.textContent = ""; return; }

  let persisted = (typeof sm.persisted === "function" && await sm.persisted()) || false;
  if (!persisted) {
    try { persisted = await sm.persist(); } catch { persisted = false; }
  }

  if (!el) return;
  if (persisted) {
    el.textContent = "● Storage protected";
    el.className = "menu-status ok";
  } else {
    el.textContent = "▲ Storage is best-effort — export backups regularly";
    el.className = "menu-status warn";
  }
}
