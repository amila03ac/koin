// @vitest-environment jsdom
//
// Covers the browser-independent parts of the optional disk-backup feature. The File System
// Access picker (showSaveFilePicker) and its permission prompts require a real Chromium user
// gesture and can't be driven headlessly, so those are verified in-browser; here we test the
// support-detection and the actual file-write mechanics against a fake handle.
import { expect, test } from "vitest";
import { writeToHandle, diskBackupSupported } from "../src/ui/disk-backup";
import type { Backup } from "../src/store/index";

test("diskBackupSupported() is false without the File System Access API", () => {
  expect(diskBackupSupported()).toBe(false); // jsdom has no showSaveFilePicker
});

test("writeToHandle serializes the whole dump and closes the stream (atomic swap on close)", async () => {
  const chunks: string[] = [];
  let closed = false;
  const handle = {
    createWritable: async () => ({
      write: async (c: string) => { chunks.push(c); },
      close: async () => { closed = true; },
    }),
  };
  const dump: Backup = { transactions: [{ id: "t1" } as never], manual: [] };
  await writeToHandle(handle as unknown as FileSystemFileHandle, dump);

  expect(closed).toBe(true);                       // stream must be closed for the write to commit
  expect(JSON.parse(chunks.join(""))).toEqual(dump); // exactly the backup, re-parseable for Restore
});
