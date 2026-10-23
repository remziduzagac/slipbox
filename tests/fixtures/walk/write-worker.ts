// A thread writing one file again and again (T12): a test of two threads of one process writing the same path at once.
import { atomicWrite } from "../../../src/core/fsutil.ts";

declare const self: Worker;

self.onmessage = (e: MessageEvent<{ path: string; text: string; n: number }>) => {
  let failed = 0;
  for (let i = 0; i < e.data.n; i++)
    try {
      atomicWrite(e.data.path, e.data.text);
    } catch {
      failed++;
    }
  self.postMessage({ failed });
};
