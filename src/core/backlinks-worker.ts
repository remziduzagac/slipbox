// The thread another vault's backlinks are worked out on, for the peek (#10, `backlinks-jobs.ts`): a request in, its
// answer out.

import { type BacklinksRequest, backlinksThere } from "./backlinks-jobs.ts";

declare const self: Worker;

self.onmessage = async (e: MessageEvent<BacklinksRequest & { id: number }>) => {
  const { id, root, rel, own } = e.data;
  try {
    self.postMessage({ id, ...(await backlinksThere({ root, rel, ...(typeof own === "string" ? { own } : {}) })) });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
