import { spyOn } from "bun:test";
import { DiskThreads } from "../../../src/core/workspace/walk/walk-thread.ts";
import type { Harness } from "../../tui-harness.ts";

/** The explorer's listings answered — the folders in those unfolded too — and the tree built again from them. */
export async function listed(h: Harness): Promise<void> {
  for (;;) {
    h.app.explorer.invalidateTree();
    h.app.explorer.treeRows();
    if (!h.app.explorer.listings.reading) return;
    while (h.app.explorer.listings.reading) await Bun.sleep(5);
  }
}

/** The disk threads' next listing of `dir` read there, its answer held here until `release`: what it says is what the
 *  disk said by `read`. The listings after it pass. */
export function answerHeld(dir: string): {
  read: Promise<void>;
  release: () => void;
  asked: (at?: string) => number;
  answered: (at: string) => boolean;
  restore: () => void;
} {
  const list = DiskThreads.prototype.list;
  let release = () => {};
  let read = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const done = new Promise<void>((r) => (read = r));
  const answered = new Set<string>();
  let taken = false;
  const spy = spyOn(DiskThreads.prototype, "list").mockImplementation(function (this: DiskThreads, ...args) {
    const answer = list.apply(this, args);
    answer.then(
      () => answered.add(args[0]),
      () => answered.add(args[0]),
    );
    if (taken || args[0] !== dir) return answer;
    taken = true;
    answer.then(read, read);
    return answer.then(async (l) => {
      await gate;
      return l;
    });
  });
  const asked = (at = dir) => spy.mock.calls.filter((c) => c[0] === at).length;
  return { read: done, release, asked, answered: (at) => answered.has(at), restore: () => spy.mockRestore() };
}
