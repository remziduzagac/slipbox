// The feed's questions of git's state off the screen's thread (SD-T4): one out at a time, its batches applied once it
// answers. An answer for a vault left meanwhile is dropped and leaves the question out now alone: no second question,
// no second flush. The disk thread's answers are handed out here by the test, in the order it says (one hold can't
// order two answers), never by a clock.
import { describe, expect, test } from "bun:test";
import type { WatchBatch } from "../../../../src/core/workspace/graph/watch.ts";
import { type GitAsker, type GitSeen, VaultFeed } from "../../../../src/core/workspace/vaults/vault-feed.ts";
import { HELD_MS } from "../../../fixtures/walk/slow.ts";

/** Git's state as a thread answers it: no checkout, its lock as said. */
const seen = (locked = false): GitSeen => ({
  checkout: null,
  lock: locked ? "/nowhere/.git/index.lock" : null,
  locked,
  rebasing: false,
  head: null,
  operation: null,
});

/** A batch the watcher brings: a note come. */
const came = (rel: string): WatchBatch => ({ changes: [{ rel, kind: "created", isNote: true }], rescan: false });

/** A feed whose questions wait for the test to answer them, and the batches it applied, as one each time. */
function feedAsking() {
  const git: ((s: GitSeen) => void)[] = [];
  const locked: ((l: boolean) => void)[] = [];
  const asker: GitAsker = {
    git: () => new Promise((r) => git.push(r)),
    locked: () => new Promise((r) => locked.push(r)),
  };
  const applied: string[][] = [];
  const feed = new VaultFeed({
    checkout: () => null,
    graph: () => {
      throw new Error("no graph: nothing moved");
    },
    now: () => 0,
    apply: (b) => applied.push(b.changes.map((c) => c.rel)),
    asker: () => asker,
  });
  return { feed, git, locked, applied };
}

/** Awaited till `cond` holds, or thrown by HELD_MS. */
async function until(cond: () => boolean, what: string): Promise<void> {
  const end = performance.now() + HELD_MS;
  while (!cond()) {
    if (performance.now() > end) throw new Error(`never: ${what}`);
    await Bun.sleep(1);
  }
}

describe("the feed's questions of git's state, one out at a time (SD-T4)", () => {
  test("git's state for a vault left, answered late: the new vault's question stays the one out; its batches go once, with it", async () => {
    const { feed, git, applied } = feedAsking();
    feed.receive(came("a.md"));
    feed.reset();
    feed.receive(came("b.md"));
    expect(git).toHaveLength(2);
    // The vault left's answer: dropped, the new vault's question still out.
    git[0]!(seen());
    await Bun.sleep(0);
    feed.receive(came("c.md"));
    expect(git).toHaveLength(2);
    git[1]!(seen());
    await until(() => applied.length > 0, "the batches applied");
    expect(applied).toEqual([["b.md", "c.md"]]);
  });

  test("git's lock for a vault left, answered late: the new vault's question stays the one out", async () => {
    const { feed, git, locked, applied } = feedAsking();
    feed.receive(came("a.md"));
    git[0]!(seen(true));
    // git holds its lock: its stat asked, a moment on.
    await until(() => locked.length > 0, "the lock asked");
    feed.reset();
    feed.receive(came("b.md"));
    expect(git).toHaveLength(2);
    locked[0]!(false);
    await Bun.sleep(0);
    feed.receive(came("c.md"));
    expect(git).toHaveLength(2);
    git[1]!(seen());
    await until(() => applied.length > 0, "the batches applied");
    expect(applied).toEqual([["b.md", "c.md"]]);
  });
});
