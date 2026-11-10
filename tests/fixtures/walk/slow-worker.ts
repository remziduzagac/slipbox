// The walk's thread with folders that answer slowly (T12, #9), as a share or a disk asleep would: tests of what waits.
// A hold sent before the first request (`Hold.worker`) is this thread's for a walk's listings of its `held` folders;
// the rest of the seam's reads of what's under them (SD-D10: `entries`, a stat, a read) only once a test asks
// (`holdReads`), so a walk's own reads (a `.gitignore`'s) go as they did. Besides the walk's requests, a test's own: a stat or a read made here through the
// seam (`seam`), and the hold let go once another thread waits on it (`letGo`).
import { heldReads, letGoOnceWaiting, seamRead, slowFolders, takeHold } from "./slow.ts";
import { setReadWait } from "../../../src/core/foundation/platform/disk.ts";
import { setFolderReader } from "../../../src/core/workspace/walk/walk.ts";
import { serveWalks } from "../../../src/core/workspace/walk/walk-jobs.ts";

declare const self: Worker;

setFolderReader(slowFolders);
serveWalks(self);
const serve = self.onmessage;
self.onmessage = (e: MessageEvent) => {
  if (e.data?.hold instanceof Int32Array) takeHold(e.data.hold);
  else if (e.data?.holdReads) setReadWait(heldReads);
  else if (e.data?.seam) self.postMessage({ seam: seamRead(e.data.seam) });
  else if (e.data?.letGo) {
    letGoOnceWaiting();
    self.postMessage({ letGo: true });
  } else serve?.call(self, e);
};
