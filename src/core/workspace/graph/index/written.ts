// A vault's index written (VV-D9): said once, wherever it's written or recorded, for whoever shows whether a vault is
// indexed (the explorer's rows) to look again. Written on this thread (`persistIndex`), or on another and recorded here
// (`noteIndexed`: a peek's thread, the background index's); one written on a thread and never recorded here is said
// here by whoever hears of it (`AutoIndex`). A thread's own listeners are its own: none hears another thread's.

import { AsyncResource } from "node:async_hooks";

const listeners = new Set<(keys: readonly string[]) => void>();

/** Hear when vaults' indexes are written, by their keys (`vaultKey`); the function returned stops it. */
export function onIndexWritten(fn: (keys: readonly string[]) => void): () => void {
  // An index may be written inside a job's asynchronous context; observers belong to their subscriber instead.
  const listener = AsyncResource.bind(fn);
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The indexes of the vaults `keys` were written. */
export function indexWritten(keys: readonly string[]): void {
  if (!keys.length) return;
  for (const fn of [...listeners]) {
    try {
      fn(keys);
    } catch {}
  }
}
