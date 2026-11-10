// A key's own reads held (SD-T5): the disk threads' reads of a `held` folder held by a test's worker, and this
// thread's too where the test asks, so a read put back here holds its key past the hold's deadline (`gaveUp`) and the
// test fails. What waits is told by the hold (`Hold`), never by a clock (#75).

import { afterEach } from "bun:test";
import { setReadWait } from "../../../src/core/foundation/platform/disk.ts";
import { setWalkWorker } from "../../../src/core/workspace/walk/walk-thread.ts";
import { HELD_MS, Hold, heldReads } from "../../fixtures/walk/slow.ts";

/** The calling test file's holds, each let go of when its test ends. */
export function makeHeldKeys() {
  let hold: Hold | null = null;
  /** The disk threads let go of since the hold was made: started afresh for a read given up. */
  let stopped = 0;

  afterEach(() => {
    hold?.release();
    hold = null;
    setReadWait(null);
    setWalkWorker(null);
  });

  /** A hold on the `held` folders: the disk threads' reads under one, and this thread's (`only`: the paths it holds
   *  here, every one under `held` by default); `deadline`, each asker's on the disk threads. */
  function holding(only?: (path: string) => boolean, deadline?: number): Hold {
    const h = new Hold();
    hold = h;
    const worker = () => {
      const w = h.worker();
      w.postMessage({ holdReads: true });
      const end = w.terminate.bind(w);
      w.terminate = () => {
        stopped++;
        end();
      };
      return w;
    };
    setWalkWorker(worker, deadline ? { step: deadline, whole: deadline } : undefined);
    setReadWait((path) => (!only || only(path) ? heldReads(path) : undefined));
    stopped = 0;
    return h;
  }

  /** The disk threads let go of since `holding`: one a read given up was out on is started afresh. */
  const threadsStopped = (): number => stopped;

  /** Awaited till a reader waits in a `held` folder: said and thrown by HELD_MS, no wait left behind. */
  async function untilHeld(h: Hold, who = "the read"): Promise<void> {
    const end = performance.now() + HELD_MS;
    while (!h.waiting) {
      if (performance.now() > end) throw new Error(`${who} never reached \`held\``);
      await Bun.sleep(5);
    }
  }

  return { holding, untilHeld, threadsStopped };
}
