// The disk threads (SD-D2; `DiskThreads` in walk-thread.ts asks them), the explorer's listing threads (T12) grown: a
// folder listed, a batch of paths statted, a file's text read, a folder's access, the vault open walked, off the main
// thread (disk-jobs.ts), with what the asking thread knows taken first. Apart from the walk's worker, and light — no
// index, no parser — so one starts at once, and a fast folder's first listing comes before its row would say
// `listing…`.

import { answerDisk, type DiskRequest } from "./disk-jobs.ts";

declare const self: Worker;

self.onmessage = (e: MessageEvent<DiskRequest & { id: number }>) => {
  const { id } = e.data;
  try {
    self.postMessage({ id, ...answerDisk(e.data) });
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message ?? String(err) });
  }
};
