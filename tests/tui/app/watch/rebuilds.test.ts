// The vault open built again on a disk thread (SD-T8; SD-D3, SD-D5, SD-D6, SD-D11): its walk and its index read there,
// the graph as it was meanwhile and every key answered; the answer taken only while the vault and its graph are the
// ones it was asked under, what changed meanwhile taken in again over it; a rename's build holding the keys after it.
// What waits is told by the hold (`Hold`), never by a clock (#75): its folder `held`, held on the disk threads and on
// this thread too — a walk made here lists it through the same reader (`slowFolders`) — so a build put back here holds
// the test past the hold's deadline, and it fails.

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { planFolderMove } from "../../../../src/core/workspace/mutations/rename/planning/files.ts";
import type { SessionTab } from "../../../../src/core/workspace/session/position.ts";
import { homeAt, rootAt } from "../../../../src/core/workspace/vaults/vault.ts";
import { setFolderReader } from "../../../../src/core/workspace/walk/walk.ts";
import { diskThreads, setWalkWorker } from "../../../../src/core/workspace/walk/walk-thread.ts";
import { Listings } from "../../../../src/tui/workspace/explorer/listings.ts";
import { HELD_MS, type Hold, slowFolders } from "../../../fixtures/walk/slow.ts";
import { makeHeldKeys } from "../../../support/tui/held-keys.ts";
import { type Harness, harness, makeSandbox, makeVault, statusRow } from "../../../tui-harness.ts";

const sandbox = makeSandbox();
const { holding, untilHeld } = makeHeldKeys();

/** The test's slipbox and its hold: a test that fails before it quits leaves its slipbox quit all the same, once its
 *  index has caught up, the hold let go first — else the index's slices read its `held` notes on this thread under the
 *  next test's hold, and hold that test HELD_MS. */
const live: { apps: Harness[]; held: Hold | null } = { apps: [], held: null };

afterEach(async () => {
  live.held?.release();
  for (const h of live.apps.splice(0)) await quit(h);
  live.held = null;
  setFolderReader(null);
});

/** `files` (path → text) written in `root`. */
function write(root: string, files: Record<string, string>): string {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

/** slipbox in a vault with `files` besides its own, `open` open in source mode: its builds, its keys' reads and its
 *  explorer's listings on the disk threads, as the TUI's are (a test's App lists the explorer's folders here, and
 *  lists `held` among the vault's own since SD-T7). */
async function vaultWith(files: Record<string, string>, open = "index.md"): Promise<Harness> {
  const root = write(makeVault(), files);
  const h = await harness({ root, open, config: (c) => void (c.render.notes = false) });
  live.apps.push(h);
  h.app.watch.builds.offThread = true;
  h.app.reads.offThread = true;
  h.app.explorer.listings = new Listings(h.app, true);
  // The search index caught up first: its slices read the notes on this thread, and a hold taken meanwhile would hold
  // them too.
  await h.app.search.whenIndexed();
  return h;
}

/** `h` quit once its search index has caught up with the graph it ends on: a quit leaves the index's slices running,
 *  and the next test's hold would hold their reads of this vault's `held` folder. */
async function quit(h: Harness): Promise<void> {
  await h.app.search.whenIndexed();
  h.app.quit();
}

/** The hold on the `held` folders (`holding`; `deadline`, each asker's on the disk threads; `here`, which of this
 *  thread's reads through the seam it holds, every one under `held` by default), a walk made here held on them too. */
function holdWalks(deadline?: number, here?: (path: string) => boolean): Hold {
  const held = holding(here, deadline);
  live.held = held;
  setFolderReader(slowFolders);
  return held;
}

/** A key handled, not awaited: it may wait its turn. */
const press = (h: Harness, key: string) => h.app.input.handleKey(key);
const said = (h: Harness) => h.app.messages.map((m) => m.text);
const tasks = (h: Harness) => [...h.app.background.tasks.values()].map((t) => t.label);
const backlinks = (h: Harness, rel: string) =>
  h.app.graph
    .backlinks(rel)
    .map((b) => b.from)
    .sort();

/** Awaited till `done` holds: said and thrown by HELD_MS. */
async function until(done: () => boolean, what: string): Promise<void> {
  const end = performance.now() + HELD_MS;
  while (!done()) {
    if (performance.now() > end) throw new Error(`${what} never came`);
    await Bun.sleep(5);
  }
}

describe("the vault open built again on a disk thread (SD-T8)", () => {
  test("held: a reindex reads the vault on a disk thread — its links and backlinks as they were, a key answered; a note added there meanwhile is in the graph once it's read", async () => {
    const h = await vaultWith({ "held/a.md": "# A\n\n[[b]]\n", "b.md": "# B\n" });
    h.app.graph.ensureAll();
    expect(backlinks(h, "b.md")).toEqual(["held/a.md"]);
    const builds = h.app.graph.builds;
    const held = holdWalks();
    await h.app.run("vault.reindex");
    await untilHeld(held);
    expect(tasks(h)).toContain("reading the vault…");
    writeFileSync(join(h.root, "held/c.md"), "# C\n\n[[b]]\n");
    // A key handled and drawn meanwhile, the graph as it was.
    const row = h.app.view!.cur.row;
    await h.keys("j");
    expect(h.app.view!.cur.row).toBe(row + 1);
    expect(h.app.graph.builds).toBe(builds);
    expect(h.app.graph.linksOf("held/a.md").map((l) => l.path)).toContain("b.md");
    expect(backlinks(h, "b.md")).toEqual(["held/a.md"]);
    held.release();
    await h.app.watch.builds.idle();
    expect(h.app.graph.builds).toBe(builds + 1);
    expect(h.app.graph.notes.has("held/c.md")).toBe(true);
    expect(backlinks(h, "b.md")).toEqual(["held/a.md", "held/c.md"]);
    expect(said(h).some((t) => /^reindexed \d+ notes in \d+ ms$/.test(t))).toBe(true);
    expect(tasks(h)).not.toContain("reading the vault…");
    expect(held.gaveUp).toBe(0);
    await quit(h);
  });

  test("held: a vault gone into — the one left let go of as now, the new one's notes once its walk answers, the keys waiting for it; its note opened then, once its session is read too", async () => {
    const other = write(makeVault(), { "held/x.md": "# X\n" });
    const h = await vaultWith({});
    const left = h.app.graph;
    const held = holdWalks();
    expect(h.app.vaults.switchVault(rootAt(other), null, undefined, { asked: true })).toBe(true);
    await untilHeld(held);
    expect(h.app.loc.root).toBe(other);
    expect(h.app.buffers.size).toBe(0);
    expect(h.app.graph).not.toBe(left);
    expect(h.app.graph.notes.size).toBe(0);
    // Its note waits for its graph, the keys with it; said, as a key's build is.
    expect(h.app.reads.busy).toBe(true);
    expect(statusRow(h.frame())).toContain("reading the vault…");
    held.release();
    await h.app.watch.builds.idle();
    // Its session read on a disk thread too, no key waiting for it (SD-T9): it may answer after the walk.
    await h.app.session.entering;
    await h.app.reads.settled();
    expect(h.app.graph.notes.has("held/x.md")).toBe(true);
    expect(h.app.tabs.length).toBe(1);
    expect(h.app.view!.buf.abs.startsWith(`${other}/`)).toBe(true);
    expect(statusRow(h.frame())).not.toContain("reading the vault…");
    expect(held.gaveUp).toBe(0);
    await quit(h);
  });

  test("held: going into a third vault while the second's walk is out drops the second's answer", async () => {
    const second = write(makeVault(), { "held/x.md": "# X\n" });
    const third = write(makeVault(), { "z.md": "# Z\n" });
    const h = await vaultWith({});
    const held = holdWalks();
    h.app.vaults.switchVault(rootAt(second), null, undefined, { asked: true });
    await untilHeld(held);
    const dropped = h.app.graph;
    h.app.vaults.switchVault(rootAt(third), null, undefined, { asked: true });
    const taken = h.app.graph;
    held.release();
    await h.app.watch.builds.idle();
    await h.app.session.entering;
    await h.app.reads.settled();
    expect(h.app.graph).toBe(taken);
    expect(taken.notes.has("z.md")).toBe(true);
    expect(taken.notes.has("held/x.md")).toBe(false);
    expect(dropped.builds).toBe(0);
    expect(h.app.view!.buf.abs.startsWith(`${third}/`)).toBe(true);
    await quit(h);
  });
});

describe("the other builds read on a disk thread (SD-T8)", () => {
  test("held: the watcher's rescan reads the vault on a disk thread, the graph as it was meanwhile", async () => {
    const h = await vaultWith({ "held/a.md": "# A\n" });
    const builds = h.app.graph.builds;
    const held = holdWalks();
    h.app.watch.applyChanges({ changes: [], rescan: true });
    await untilHeld(held);
    expect(h.app.graph.builds).toBe(builds);
    expect(tasks(h)).toContain("reading the vault…");
    writeFileSync(join(h.root, "held/b.md"), "# B\n");
    held.release();
    await h.app.watch.builds.idle();
    expect(h.app.graph.builds).toBe(builds + 1);
    expect(h.app.graph.notes.has("held/b.md")).toBe(true);
    expect(held.gaveUp).toBe(0);
    await quit(h);
  });

  test("held: a setting of the walk changed — the graph as it was until the new one is read, then the new one in its place, followed", async () => {
    const h = await vaultWith({ "skip/s.md": "# S\n", "held/a.md": "# A\n" });
    const was = h.app.graph;
    expect(was.notes.has("skip/s.md")).toBe(true);
    const held = holdWalks();
    const cfg = join(h.root, ".slipbox", "config.toml");
    writeFileSync(cfg, readFileSync(cfg, "utf8").replace('exclude = ["drafts/"]', 'exclude = ["drafts/", "skip/"]'));
    h.app.settings.reload();
    await untilHeld(held);
    expect(h.app.graph).toBe(was);
    expect(tasks(h)).toContain("reading the vault…");
    held.release();
    await h.app.watch.builds.idle();
    expect(h.app.graph).not.toBe(was);
    expect(h.app.graph.notes.has("skip/s.md")).toBe(false);
    expect(h.app.graph.notes.has("held/a.md")).toBe(true);
    // Followed: its own builds asked of a disk thread too.
    expect(h.app.graph.rebuilder).not.toBeNull();
    expect(held.gaveUp).toBe(0);
    await quit(h);
  });

  test("held: a folder pasted — copied at once, the keys after it waiting for the graph that follows it", async () => {
    const h = await vaultWith({ "src/s.md": "# S\n", "held/a.md": "# A\n" });
    const held = holdWalks();
    h.app.files.clip = { mode: "copy", rel: "src", dir: true };
    h.app.files.pasteItem();
    expect(existsSync(join(h.root, "src-copy/s.md"))).toBe(true);
    await untilHeld(held);
    expect(h.app.watch.builds.holding).toBe(true);
    const row = h.app.view!.cur.row;
    const j = press(h, "j");
    expect(h.app.view!.cur.row).toBe(row);
    expect(h.app.graph.notes.has("src-copy/s.md")).toBe(false);
    held.release();
    await j;
    expect(h.app.graph.notes.has("src-copy/s.md")).toBe(true);
    expect(h.app.view!.cur.row).toBe(row + 1);
    expect(held.gaveUp).toBe(0);
    await quit(h);
  });

  test("held: the vault walked again for a link followed now — its target answering as slipbox starts — the keys after it waiting for the graph that follows it", async () => {
    const h = await vaultWith({ "held/a.md": "# A\n" });
    const held = holdWalks();
    h.app.following.walkAgain();
    await untilHeld(held);
    // What's through the link, there once it's read: a list of notes opened next would find it (the switcher's).
    writeFileSync(join(h.root, "held/b.md"), "# B\n");
    expect(h.app.watch.builds.holding).toBe(true);
    const row = h.app.view!.cur.row;
    const j = press(h, "j");
    expect(h.app.view!.cur.row).toBe(row);
    held.release();
    await j;
    expect(h.app.graph.notes.has("held/b.md")).toBe(true);
    expect(h.app.view!.cur.row).toBe(row + 1);
    expect(held.gaveUp).toBe(0);
    await quit(h);
  });
});

describe("a build's answer checked (SD-T8, SD-D5)", () => {
  test("held: a reindex asked again while one is out waits for it, then reads the vault once more", async () => {
    const h = await vaultWith({ "held/a.md": "# A\n" });
    const held = holdWalks();
    const walks = spyOn(diskThreads(), "walk");
    try {
      await h.app.run("vault.reindex");
      await untilHeld(held);
      await h.app.run("vault.reindex");
      expect(walks).toHaveBeenCalledTimes(1);
      held.release();
      await h.app.watch.builds.idle();
      expect(walks).toHaveBeenCalledTimes(2);
      expect(said(h).filter((t) => t.startsWith("reindexed ")).length).toBe(2);
    } finally {
      walks.mockRestore();
    }
    await quit(h);
  });

  test("held: a note saved by slipbox while the walk is out survives it, though the walk never saw it", async () => {
    const h = await vaultWith({ "held/a.md": "# A\n" });
    const held = holdWalks();
    await h.app.run("vault.reindex");
    // The top listed before the walk went into `held`: a note saved there now isn't in what it read.
    await untilHeld(held);
    h.app.files.openNew(join(h.root, "saved.md"));
    expect(h.app.writeBuffer(h.app.buffers.get("saved.md")!, "# Saved\n", true)).toBe(true);
    expect(h.app.graph.notes.has("saved.md")).toBe(true);
    held.release();
    await h.app.watch.builds.idle();
    expect(h.app.graph.notes.has("held/a.md")).toBe(true);
    expect(h.app.graph.notes.has("saved.md")).toBe(true);
    await quit(h);
  });

  test("held: the watcher's change while the walk is out survives it, though the walk never saw it", async () => {
    const h = await vaultWith({ "held/a.md": "# A\n" });
    const held = holdWalks();
    await h.app.run("vault.reindex");
    await untilHeld(held);
    writeFileSync(join(h.root, "came.md"), "# Came\n");
    h.app.watch.applyChanges({ changes: [{ rel: "came.md", kind: "changed", isNote: true }], rescan: false });
    expect(h.app.graph.notes.has("came.md")).toBe(true);
    held.release();
    await h.app.watch.builds.idle();
    expect(h.app.graph.notes.has("held/a.md")).toBe(true);
    expect(h.app.graph.notes.has("came.md")).toBe(true);
    await quit(h);
  });

  test("held: a vault left while its walk is out drops it — neither the vault left nor the one gone into built from it", async () => {
    const h = await vaultWith({ "held/a.md": "# A\n" });
    const other = write(makeVault(), { "o.md": "# O\n" });
    const left = h.app.graph;
    const builds = left.builds;
    const held = holdWalks();
    await h.app.run("vault.reindex");
    await untilHeld(held);
    h.app.vaults.switchVault(rootAt(other), null, undefined, { asked: true });
    held.release();
    await h.app.watch.builds.idle();
    expect(left.builds).toBe(builds);
    expect(h.app.graph.notes.has("o.md")).toBe(true);
    expect(h.app.graph.notes.has("held/a.md")).toBe(false);
    expect(said(h).some((t) => t.startsWith("reindexed "))).toBe(false);
    await quit(h);
  });

  test("held: past a shortened deadline, said — the graph as it was — and read again later, a note added meanwhile there then", async () => {
    const h = await vaultWith({ "held/a.md": "# A\n" });
    h.app.watch.builds.againMs = 0;
    const builds = h.app.graph.builds;
    const notes = [...h.app.graph.notes.keys()].sort();
    const held = holdWalks(300);
    await h.app.run("vault.reindex");
    await untilHeld(held);
    writeFileSync(join(h.root, "held/later.md"), "# Later\n");
    await h.app.watch.builds.built;
    expect(said(h)).toContain("reading the vault gave up: a folder didn't answer in time; it's read again in a minute");
    expect(h.app.graph.builds).toBe(builds);
    expect([...h.app.graph.notes.keys()].sort()).toEqual(notes);
    // The disk answering again, the vault's read again — nobody asked.
    held.release();
    setWalkWorker(null);
    await until(() => h.app.graph.builds > builds, "the build asked again");
    await h.app.watch.builds.idle();
    expect(h.app.graph.notes.has("held/later.md")).toBe(true);
    await quit(h);
  });
});

describe("a rename's build (SD-T8, SD-D11)", () => {
  test("held: a rename that builds the vault again is written at once; `reading the vault…`, the keys after it waiting; let go, they act on the graph it made, the link to the note it moved followed", async () => {
    const h = await vaultWith(
      {
        "top.md": "# Top\n[[proj/p]]\n",
        "proj/p.md": "# P\n",
        "proj/inner/.slipbox/config.toml": `[vault]\nid = "${randomBytes(8).toString("hex")}"\n`,
        "proj/inner/i.md": "# I\n",
        "held/h.md": "# H\n",
      },
      "top.md",
    );
    const plan = planFolderMove(h.app.graph, "proj", "work");
    expect(plan.vaults?.length).toBe(1);
    const held = holdWalks();
    h.app.renaming.apply(plan);
    // Written at once, on this thread (SD-D7).
    expect(existsSync(join(h.root, "work/p.md"))).toBe(true);
    expect(existsSync(join(h.root, "proj"))).toBe(false);
    await untilHeld(held);
    expect(h.app.watch.builds.holding).toBe(true);
    const row = h.app.view!.cur.row;
    const j = press(h, "j");
    const enter = press(h, "enter");
    // A frame drawn while the build is out: the keys wait their turn, `esc` doesn't give it up.
    expect(statusRow(h.frame())).toContain("reading the vault…");
    expect(h.app.reads.giveUp()).toBe(false);
    expect(h.app.view!.cur.row).toBe(row);
    expect(h.app.view!.buf.key).toBe("top.md");
    held.release();
    await Promise.all([j, enter]);
    await h.app.reads.settled();
    expect(h.app.graph.notes.has("work/p.md")).toBe(true);
    expect(h.app.view!.buf.key).toBe("work/p.md");
    expect(statusRow(h.frame())).not.toContain("reading the vault…");
    expect(held.gaveUp).toBe(0);
    await quit(h);
  });
});

describe("the folders of home asked for (SD-T8)", () => {
  test("held: a branch's tabs in a folder of home not walked yet: built on a disk thread, the graph as it was meanwhile, followed once it's built", async () => {
    const home = write(realpathSync(mkdtempSync(join(sandbox, "home-"))), {
      "notes/n.md": "# N\n",
      "held/f.md": "# F\n",
    });
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc: homeAt(home), open: "notes/n.md" });
      h.app.watch.builds.offThread = true;
      h.app.reads.offThread = true;
      expect(h.app.graph.home?.walked).toBeNull();
      expect(h.app.graph.notes.has("held/f.md")).toBe(false);
      // The walk held, on the disk threads and here: what a tab's folder is asked by here answers.
      const held = holdWalks(undefined, () => false);
      const builds = h.app.graph.builds;
      const rebuilt = spyOn(h.app.watch, "rebuilt");
      const anchor = { heading: null, headingIndex: 0, offset: 0, line: 0 };
      h.app.vaults.askTabs([{ panes: [{ path: "held/f.md", anchor }], active: 0 } as SessionTab]);
      await untilHeld(held);
      expect(h.app.graph.builds).toBe(builds);
      expect(rebuilt).toHaveBeenCalledTimes(0);
      held.release();
      await h.app.watch.builds.idle();
      expect(h.app.graph.notes.has("held/f.md")).toBe(true);
      expect(rebuilt).toHaveBeenCalledTimes(1);
      expect(held.gaveUp).toBe(0);
      await quit(h);
    } finally {
      process.env.HOME = before;
    }
  });
});

/** The walks asked of the disk threads, each answer finding the graph open built since by something else, as home's
 *  refresh builds it from the background index's walk. */
function builtMeanwhile(h: Harness) {
  const pool = diskThreads();
  const walk = pool.walk.bind(pool);
  return spyOn(pool, "walk").mockImplementation(async (ask) => {
    const answer = await walk(ask);
    h.app.graph.builds++;
    return answer;
  });
}

describe("a vault's first build (SD-T8)", () => {
  test("held: a vault gone into with a note named — its graph never built, the keys wait for it, `esc` too, said; let go, they act on the vault read", async () => {
    const other = write(makeVault(), { "a.md": "# A\n\none\ntwo\n", "held/x.md": "# X\n\n[[a]]\n" });
    const h = await vaultWith({});
    const held = holdWalks();
    h.app.vaults.switchVault(rootAt(other), join(other, "a.md"), undefined, { asked: true });
    await untilHeld(held);
    await until(() => h.app.view?.buf.abs === join(other, "a.md"), "the note named, open");
    expect(h.app.graph.builds).toBe(0);
    expect(h.app.watch.builds.holding).toBe(true);
    expect(statusRow(h.frame())).toContain("reading the vault…");
    const row = h.app.view!.cur.row;
    const esc = press(h, "escape");
    const j = press(h, "j");
    expect(h.app.view!.cur.row).toBe(row);
    held.release();
    await Promise.all([esc, j]);
    expect(h.app.graph.builds).toBe(1);
    expect(backlinks(h, "a.md")).toEqual(["held/x.md"]);
    expect(h.app.view!.cur.row).toBe(row + 1);
    expect(held.gaveUp).toBe(0);
    await quit(h);
  });

  test("held: a vault's first build can't be stopped from the background work — the vault would stay empty", async () => {
    const other = write(makeVault(), { "a.md": "# A\n", "held/x.md": "# X\n" });
    const h = await vaultWith({});
    const held = holdWalks();
    h.app.vaults.switchVault(rootAt(other), join(other, "a.md"), undefined, { asked: true });
    await untilHeld(held);
    const [id, task] = [...h.app.background.tasks.entries()].find(([, t]) => t.label === "reading the vault…")!;
    expect(task.canStop?.()).toBe(false);
    h.app.background.cancel(id);
    expect(tasks(h)).toContain("reading the vault…");
    held.release();
    await h.app.watch.builds.idle();
    await h.app.reads.settled();
    expect(h.app.graph.notes.has("held/x.md")).toBe(true);
    await quit(h);
  });

  test("held: a vault gone into with nothing named — what follows the switch waits for its first build, then its own note", async () => {
    const other = write(makeVault(), { "index.md": "# Index\n", "held/x.md": "# X\n" });
    const h = await vaultWith({});
    const held = holdWalks();
    let ran: string | null | undefined;
    const after = () => void (ran = h.app.view?.buf.abs ?? null);
    expect(h.app.vaults.switchVault(rootAt(other), null, undefined, { asked: true, after })).toBe(true);
    await untilHeld(held);
    await h.app.session.entering;
    expect(ran).toBeUndefined();
    held.release();
    await h.app.watch.builds.idle();
    await h.app.reads.settled();
    expect(ran).toBe(join(other, "index.md"));
    await quit(h);
  });

  test("held: a vault gone into while a disk thread is busy with a read no key waits for — its first build, the keys waiting for it, takes the other at once", async () => {
    const other = write(makeVault(), { "x.md": "# X\n" });
    const h = await vaultWith({ "held/a.md": "# A\n" });
    const held = holdWalks();
    // One thread held by the explorer's listing of the vault left's `held` folder, as slipbox's own folders on a slow
    // disk hold one going into a vault (SD-T9): a walk waits for two free, but the keys wait for this one.
    const listed = diskThreads()
      .list(join(h.root, "held"), h.app.config.walk, false)
      .catch(() => null);
    let listedYet = false;
    void listed.then(() => (listedYet = true));
    await untilHeld(held, "the listing");
    expect(h.app.vaults.switchVault(rootAt(other), null, undefined, { asked: true })).toBe(true);
    expect(h.app.reads.busy).toBe(true);
    await until(() => h.app.graph.builds > 0 && !h.app.reads.busy, "the vault's first build, the keys let go");
    expect(h.app.graph.notes.has("x.md")).toBe(true);
    // Built, the keys let go, while that thread is still held.
    expect(listedYet).toBe(false);
    held.release();
    expect(await listed).not.toBeNull();
    expect(held.gaveUp).toBe(0);
    await quit(h);
  });
});

describe("a build that goes wrong (SD-T8)", () => {
  test("held: a vault's first build given up — all it was asked, what waits on it too, read again as one build: its note opened then, the reindex asked meanwhile said", async () => {
    const other = write(makeVault(), { "held/x.md": "# X\n" });
    const h = await vaultWith({});
    h.app.watch.builds.againMs = 0;
    const starts = spyOn(h.app.watch.builds as unknown as { start: () => void }, "start");
    const held = holdWalks(300);
    h.app.vaults.switchVault(rootAt(other), null, undefined, { asked: true });
    // The reindex asked as the vault's first build is: while it's out, however slow the machine is to reach the hold.
    const first = h.app.watch.builds.built;
    await h.app.run("vault.reindex");
    await first;
    expect(said(h)).toContain("reading the vault gave up: a folder didn't answer in time; it's read again in a minute");
    expect(h.app.tabs.length).toBe(0);
    // The disk answering again before the vault's read again (`againMs`: at the next turn) — nobody asked.
    held.release();
    setWalkWorker(null);
    await until(() => h.app.graph.builds > 0, "the build asked again");
    await h.app.watch.builds.idle();
    await h.app.session.entering;
    await h.app.reads.settled();
    expect(h.app.graph.notes.has("held/x.md")).toBe(true);
    expect(h.app.tabs.length).toBe(1);
    expect(said(h).some((t) => t.startsWith("reindexed "))).toBe(true);
    expect(starts).toHaveBeenCalledTimes(2);
    await quit(h);
  });

  test("held: a vault's first build given up — what follows it, asked before it's read again (its own note, its session read then), follows that read, never the graph not built", async () => {
    const other = write(makeVault(), { "held/x.md": "# X\n" });
    const h = await vaultWith({});
    h.app.watch.builds.againMs = 0;
    const held = holdWalks(300);
    h.app.vaults.switchVault(rootAt(other), null, undefined, { asked: true });
    await h.app.watch.builds.built;
    expect(h.app.graph.builds).toBe(0);
    // Before it's read again (a minute in the TUI; here, at the next turn): not run on the vault's notes not read yet,
    // the keys let go, as the build's given up.
    let found: boolean | undefined;
    const followed = h.app.watch.builds.after(() => void (found = h.app.graph.notes.has("held/x.md")), true);
    expect(found).toBeUndefined();
    expect(h.app.reads.busy).toBe(false);
    await followed;
    held.release();
    setWalkWorker(null);
    await until(() => h.app.graph.builds > 0, "the build asked again");
    await h.app.watch.builds.idle();
    expect(found).toBe(true);
    await quit(h);
  });

  test("held: a key's build whose answer throws as it's taken — said, every ask settled, the keys let go", async () => {
    const h = await vaultWith({ "held/a.md": "# A\n" });
    const g = h.app.graph;
    const build = g.build.bind(g);
    const broke = spyOn(g, "build").mockImplementation((useCache, parse, given) => {
      if (given) throw new Error("a build that broke");
      return build(useCache, parse, given);
    });
    const held = holdWalks();
    h.app.watch.builds.forKey(() => h.app.watch.builds.ask());
    await untilHeld(held);
    const row = h.app.view!.cur.row;
    const j = press(h, "j");
    expect(h.app.view!.cur.row).toBe(row);
    held.release();
    await until(() => !h.app.reads.busy, "the keys let go");
    await j;
    await h.app.watch.builds.built;
    expect(said(h)).toContain("reading the vault failed: a build that broke; :reindex tries again");
    expect(h.app.view!.cur.row).toBe(row + 1);
    expect(tasks(h)).not.toContain("reading the vault…");
    broke.mockRestore();
    await quit(h);
  });

  test("held: a setting of the walk changed while a reindex is out — the graph made anew answers both, and what follows a reindex's build follows it", async () => {
    const h = await vaultWith({ "skip/s.md": "# S\n", "held/a.md": "# A\n" });
    const held = holdWalks();
    const rebuilt = spyOn(h.app.watch, "rebuilt");
    await h.app.run("vault.reindex");
    await untilHeld(held);
    const cfg = join(h.root, ".slipbox", "config.toml");
    writeFileSync(cfg, readFileSync(cfg, "utf8").replace('exclude = ["drafts/"]', 'exclude = ["drafts/", "skip/"]'));
    h.app.settings.reload();
    held.release();
    await h.app.watch.builds.idle();
    expect(h.app.graph.notes.has("skip/s.md")).toBe(false);
    expect(said(h).some((t) => t.startsWith("reindexed "))).toBe(true);
    expect(rebuilt).toHaveBeenCalledTimes(1);
    rebuilt.mockRestore();
    await quit(h);
  });

  test("held: a key's build whose graph is built by something else each time it answers — read once more, then taken: the keys let go, a note added meanwhile there", async () => {
    const h = await vaultWith({ "held/a.md": "# A\n" });
    const held = holdWalks();
    const walks = builtMeanwhile(h);
    try {
      h.app.watch.builds.forKey(() => h.app.watch.builds.ask());
      await untilHeld(held);
      writeFileSync(join(h.root, "held/b.md"), "# B\n");
      held.release();
      await until(() => !h.app.reads.busy, "the keys let go");
      await h.app.watch.builds.idle();
      expect(walks).toHaveBeenCalledTimes(2);
      expect(h.app.graph.notes.has("held/b.md")).toBe(true);
    } finally {
      walks.mockRestore();
      await quit(h);
    }
  });

  test("held: a graph made anew isn't read again for the graph as it was being built meanwhile", async () => {
    const h = await vaultWith({ "skip/s.md": "# S\n", "held/a.md": "# A\n" });
    const held = holdWalks();
    const walks = builtMeanwhile(h);
    try {
      const cfg = join(h.root, ".slipbox", "config.toml");
      writeFileSync(cfg, readFileSync(cfg, "utf8").replace('exclude = ["drafts/"]', 'exclude = ["drafts/", "skip/"]'));
      h.app.settings.reload();
      await untilHeld(held);
      held.release();
      await h.app.watch.builds.idle();
      expect(walks).toHaveBeenCalledTimes(1);
      expect(h.app.graph.notes.has("skip/s.md")).toBe(false);
    } finally {
      walks.mockRestore();
      await quit(h);
    }
  });
});
