// The explorer's listing threads (T12; `ListThreads` in walk-thread.ts asks them): a folder listed off the main thread
// (`listFolder`), with what the asking thread knows taken first. Apart from the walk's worker, and light — no index, no
// parser — so one starts at once, and a fast folder's first listing comes before its row would say `listing…`.

import type { Config } from "../../application/config/config.ts";
import { listFolder } from "./listing.ts";
import { enterContext, type WalkContext } from "../../foundation/workers/worker-context.ts";

declare const self: Worker;

type ListRequest = { id: number; dir: string; walk: Config["walk"]; hidden: boolean; context: WalkContext };

self.onmessage = (e: MessageEvent<ListRequest>) => {
  const { id, dir, walk, hidden, context } = e.data;
  try {
    enterContext(context);
    self.postMessage({ id, listing: listFolder(dir, walk, hidden) });
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message ?? String(err) });
  }
};
