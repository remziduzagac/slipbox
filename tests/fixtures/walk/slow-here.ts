// Run with SLIPBOX_SLOW_DISK set (disk.test.ts): the slow disk this process's main thread stands in for, and one of its
// workers', printed as JSON. The screen's thread takes none; every other thread, what it was given (disk.ts, SD-T1).
import { isMainThread } from "node:worker_threads";
import { slowDiskHere } from "../../../src/core/foundation/platform/disk.ts";

declare const self: Worker;

if (isMainThread) {
  const worker = new Worker(import.meta.url);
  worker.onmessage = (e: MessageEvent) => {
    console.log(JSON.stringify({ main: slowDiskHere(), worker: e.data }));
    worker.terminate();
  };
} else self.postMessage(slowDiskHere());
