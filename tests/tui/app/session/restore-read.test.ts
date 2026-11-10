// The session's tabs brought back on the disk threads (SD-T5): the tab shown read first, the keys waiting for it alone,
// the rest read behind them on one thread at most; none of them readable, the vault's own note opens, as when it kept
// none. What waits is told by the hold (`Hold`), never by a clock (#75).

import { describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { saveSession, type SessionTab } from "../../../../src/core/workspace/session/position.ts";
import { rootAt } from "../../../../src/core/workspace/vaults/vault.ts";
import { diskThreads } from "../../../../src/core/workspace/walk/walk-thread.ts";
import { makeHeldKeys } from "../../../support/tui/held-keys.ts";
import { type Harness, harness, makeSandbox, makeVault } from "../../../tui-harness.ts";

makeSandbox();
const { holding, untilHeld } = makeHeldKeys();

/** A tab kept with `paths`, one window each. */
const tab = (...paths: string[]): SessionTab => ({ panes: paths.map((path) => ({ path })), active: 0 }) as SessionTab;

/** A vault with `files` (path → text), keeping `tabs` (the one shown `activeTab`): brought back when it's gone into. */
function keeping(files: Record<string, string>, tabs: SessionTab[], activeTab = 0): string {
  const root = makeVault();
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  appendFileSync(join(root, ".slipbox", "config.toml"), "\n[ui]\nrestore_session = true\n");
  saveSession(rootAt(root), { version: 1, tabs, activeTab, sidebar: false });
  return root;
}

/** slipbox in a vault of its own, its key reads on the disk threads. */
async function offThread(root = makeVault()): Promise<Harness> {
  const h = await harness({ root, open: "index.md", config: (c) => void (c.ui.restore_session = true) });
  h.app.reads.offThread = true;
  return h;
}

/** Once the session is read (SD-T9) and every tab coming back is in, each read behind the one shown, and what opens
 *  after them. */
async function settled(h: Harness): Promise<void> {
  await h.app.session.entering;
  let behind: Promise<void> | null = null;
  while (behind !== h.app.session.behind) {
    behind = h.app.session.behind;
    await behind;
    await h.app.reads.settled();
  }
}

/** The note in each tab, by its path in `root`. */
const tabs = (h: Harness, root: string) => h.app.tabs.map((t) => relative(root, t.views[t.active]!.buf.abs));

describe("the session's tabs read on the disk threads (SD-T5)", () => {
  test("a vault gone into, none of the tabs it kept there now: its own note opens, as when it kept none", async () => {
    const other = keeping({}, [tab("gone.md"), tab("also/gone.md")], 1);
    const h = await offThread();
    h.app.vaults.switchVault(rootAt(other), null, undefined, { asked: true });
    await settled(h);
    expect(tabs(h, other)).toEqual(["index.md"]);
  });

  test("a branch switched to, none of its tabs there now: the vault's own note, never an empty window", async () => {
    const root = makeVault();
    const h = await offThread(root);
    const now = { branch: "feature", commit: "2" };
    saveSession(h.app.loc, {
      version: 1,
      tabs: [tab("index.md")],
      activeTab: 0,
      sidebar: false,
      branches: { feature: { tabs: [tab("gone.md")], activeTab: 0, at: "" } },
    });
    // HEAD as the feed has just seen it move, as it is when it says so.
    h.app.feed.head = now;
    h.app.git.headMoved({ branch: "main", commit: "1" }, now);
    await settled(h);
    expect(tabs(h, root)).toEqual(["index.md"]);
  });

  test("held: a vault gone into with a note asked for: the keys wait for the tab with it alone, the rest read behind them", async () => {
    const other = keeping({ "held/a.md": "aye\n", "b.md": "bee\n" }, [tab("held/a.md"), tab("b.md")], 0);
    const h = await offThread();
    // The disk threads held alone: the vault gone into is walked here.
    const held = holding(() => false);
    h.app.vaults.switchVault(rootAt(other), join(other, "b.md"), undefined, { asked: true });
    await untilHeld(held);
    // The tab with the note asked for shown first, though the other was; the other's read held behind it, the keys free.
    expect(h.app.view!.buf.abs).toBe(join(other, "b.md"));
    expect(h.app.reads.busy).toBe(false);
    expect(h.frame()).not.toContain("reading");
    held.release();
    await settled(h);
    expect(tabs(h, other)).toEqual(["held/a.md", "b.md"]);
    expect(h.app.view!.buf.abs).toBe(join(other, "b.md"));
    expect(held.gaveUp).toBe(0);
  });

  test("held: a tab read behind the one shown holds one disk thread at most: a background look waits, a key's read goes past", async () => {
    const other = keeping({ "held/a.md": "aye\n" }, [tab("index.md"), tab("held/a.md")], 0);
    const h = await offThread();
    const held = holding(() => false);
    h.app.vaults.switchVault(rootAt(other), null, undefined, { asked: true });
    await untilHeld(held);
    const index = join(other, "index.md");
    // The watcher's look waits its turn: a background read holds a thread already.
    const look = diskThreads().look({ stat: { paths: [index] }, background: true });
    const [st] = await diskThreads().stat([index], "key");
    expect(st && "kind" in st ? st.kind : st).toBe("file");
    expect(diskThreads().waiting).toBe(1);
    held.release();
    await look;
    await settled(h);
    expect(tabs(h, other)).toEqual(["index.md", "held/a.md"]);
    expect(h.app.view!.buf.abs).toBe(index);
    expect(held.gaveUp).toBe(0);
  });
});
