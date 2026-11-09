// The walk's thread with folders that answer slowly (T12, #9), as a share or a disk asleep would: tests of what waits.
// A hold sent before the first request (`Hold.worker`) is this thread's for its `held` folders.
import { slowFolders, takeHold } from "./slow.ts";
import { setFolderReader } from "../../../src/core/workspace/walk/walk.ts";
import { serveWalks } from "../../../src/core/workspace/walk/walk-jobs.ts";

declare const self: Worker;

setFolderReader(slowFolders);
serveWalks(self);
const serve = self.onmessage;
self.onmessage = (e: MessageEvent) => {
  if (e.data?.hold instanceof Int32Array) takeHold(e.data.hold);
  else serve?.call(self, e);
};
