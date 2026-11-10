// Run with SLIPBOX_SLOW_DISK set and a folder holding the slow folder's name (disk.test.ts): what this process's main
// thread sleeps, and one of its workers', for a walk of the folder, the watcher's listing of the slow folder and a stat
// of a file in it — each sleep recorded rather than taken, printed as JSON. The walk's listing takes the stand-in on
// every thread, the screen's too; the rest of the seam on every thread but the screen's (disk.ts, SD-T1).
import { join } from "node:path";
import { isMainThread } from "node:worker_threads";
import { DEFAULT_CONFIG } from "../../../src/core/application/config/config.ts";
import { entries, slowDisk, stat } from "../../../src/core/foundation/platform/disk.ts";
import { WalkFilter } from "../../../src/core/workspace/walk/filtering/filter.ts";
import { walkVault } from "../../../src/core/workspace/walk/traversal/walk.ts";

declare const self: Worker;

/** What each read sleeps here, under the folder given. */
function sleeps(root: string): Record<"walk" | "watcher" | "stat", number[]> {
  const naps: number[] = [];
  (Bun as { sleepSync: (ms: number) => void }).sleepSync = (ms) => void naps.push(ms);
  const taken = (read: () => unknown): number[] => {
    read();
    return naps.splice(0);
  };
  const slow = join(root, slowDisk()?.name ?? "");
  return {
    walk: taken(() => walkVault(root, new WalkFilter(root, DEFAULT_CONFIG.walk))),
    watcher: taken(() => entries(slow)),
    stat: taken(() => stat(join(slow, "a.md"))),
  };
}

if (isMainThread) {
  const root = process.argv[2] ?? "";
  const main = sleeps(root);
  const worker = new Worker(import.meta.url);
  worker.onmessage = (e: MessageEvent) => {
    console.log(JSON.stringify({ main, worker: e.data }));
    worker.terminate();
  };
  worker.postMessage(root);
} else self.onmessage = (e: MessageEvent) => self.postMessage(sleeps(e.data as string));
