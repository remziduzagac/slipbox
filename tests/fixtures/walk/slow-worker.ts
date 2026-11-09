// The walk's thread with folders that answer slowly (T12, #9), as a share or a disk asleep would: tests of what waits.
// A hold sent before the first request (`Hold.worker`) is this thread's for its `held` folders: their listings, and
// the stats and reads through the seam of what's under them (SD-D10). Besides the walk's requests, a test's own: a
// stat or a read made here through the seam (`seam`), and the hold let go once another thread waits on it (`letGo`).
import { heldReads, letGoOnceWaiting, seamRead, slowFolders, takeHold } from "./slow.ts";
import { setReadWait } from "../../../src/core/foundation/platform/disk.ts";
import { setFolderReader } from "../../../src/core/workspace/walk/walk.ts";
import { serveWalks } from "../../../src/core/workspace/walk/walk-jobs.ts";

declare const self: Worker;

setFolderReader(slowFolders);
setReadWait(heldReads);
serveWalks(self);
const serve = self.onmessage;
self.onmessage = (e: MessageEvent) => {
  if (e.data?.hold instanceof Int32Array) takeHold(e.data.hold);
  else if (e.data?.seam) self.postMessage({ seam: seamRead(e.data.seam) });
  else if (e.data?.letGo) {
    letGoOnceWaiting();
    self.postMessage({ letGo: true });
  } else serve?.call(self, e);
};
