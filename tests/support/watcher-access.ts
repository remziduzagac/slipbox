// Existing watcher fixtures inspect the real private owners; these projections create no state or lifecycle hooks.
import type { VaultWatcher } from "../../src/core/workspace/graph/watch.ts";
import type { WatchState } from "../../src/core/workspace/graph/watch/state.ts";
import type { WatchDirectories } from "../../src/core/workspace/graph/watch/directories.ts";

export function watcherState(watcher: VaultWatcher): WatchState {
  return (watcher as unknown as { state: WatchState }).state;
}

export function watcherDirectories(watcher: VaultWatcher): WatchDirectories {
  return (watcher as unknown as { directories: WatchDirectories }).directories;
}

/** Whether a watcher's look is out (its answer not come), or its sweep under way on the disk threads. */
export function watcherBusy(watcher: VaultWatcher): boolean {
  const w = watcher as unknown as { out: boolean; sweeping: boolean; flushWanted: boolean };
  return w.out || w.sweeping || w.flushWanted;
}
