// The explorer's own tree of the vault open listed and marked off the screen's thread (SD-T7): its folders listed by the
// explorer's listings on the disk threads, each entry judged there by the walk's filter; the view's stat asked there,
// one at a time; a zoom's and an unfold's check a key's own read (SD-D4). What waits is told by the hold (`Hold`),
// never by a clock (#75): a folder named `held`, held on the disk threads and on this thread too — its listing
// (`slowFolders`) and every stat and read on its way (`heldReads`) — so a read put back here holds the test's thread
// past the hold's deadline (`gaveUp`, `gaveUpHere`) and the test fails.

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { setReadWait } from "../../../../src/core/foundation/platform/disk.ts";
import { cacheDir, vaultKey } from "../../../../src/core/foundation/platform/paths.ts";
import { configSignature, vaultSignature } from "../../../../src/core/workspace/graph/backlinks-jobs.ts";
import { AutoIndex } from "../../../../src/core/workspace/graph/autoindex.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { INDEX_VERSION } from "../../../../src/core/workspace/graph/index/schema.ts";
import { indexWritten } from "../../../../src/core/workspace/graph/index/written.ts";
import { setMountTable } from "../../../../src/core/workspace/vaults/mounts.ts";
import { tildePath } from "../../../../src/core/workspace/vaults/names.ts";
import { probe, setLinkAnswer } from "../../../../src/core/workspace/vaults/symlinks.ts";
import { homeAt, locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { listFolder } from "../../../../src/core/workspace/walk/listing.ts";
import { DiskThreads, walkThread } from "../../../../src/core/workspace/walk/walk-thread.ts";
import { setFolderReader } from "../../../../src/core/workspace/walk/walk.ts";
import { caughtUp } from "../../../../src/tui/documents/navigation/peek/synchronization.ts";
import type { TreeRow } from "../../../../src/tui/workspace/explorer/explorer.ts";
import { Listings, REREAD_MS } from "../../../../src/tui/workspace/explorer/listings.ts";
import { HELD_MS, type Hold, slowFolders } from "../../../fixtures/walk/slow.ts";
import { makeHeldKeys } from "../../../support/tui/held-keys.ts";
import { type Harness, harness, makeSandbox, stepToEnd } from "../../../tui-harness.ts";

const sandbox = makeSandbox();
const { holding, untilHeld } = makeHeldKeys();

afterEach(() => setFolderReader(null));

/** A vault of `files` (path → text) besides its index, by its real path: its explorer's listings and its keys' reads on
 *  the disk threads, as the TUI reads them; hidden names not listed, so the rows counted are the folders listed.
 *  `config`, its settings besides; `before`, what's made in it before it's walked. */
async function vaultWith(
  files: Record<string, string>,
  opts: { config?: (c: Config) => void; before?: (root: string) => void } = {},
): Promise<Harness> {
  const root = realpathSync(mkdtempSync(join(sandbox, "tree-")));
  for (const [rel, text] of Object.entries({ ".slipbox/config.toml": "", "index.md": "# Index\n", ...files })) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  opts.before?.(root);
  const config = (c: Config) => {
    c.files.hidden = false;
    opts.config?.(c);
  };
  const h = await harness({ root, config });
  h.app.explorer.listings = new Listings(h.app, true);
  h.app.reads.offThread = true;
  h.app.explorer.invalidateTree();
  await listed(h);
  return h;
}

/** The `held` folders held, on the disk threads and here: this thread's listing of one too (`slowFolders`). */
function held(): Hold {
  const hold = holding();
  setFolderReader(slowFolders);
  return hold;
}

/** The explorer's listings answered — the folders in those unfolded too — and the tree built again from them. */
async function listed(h: Harness): Promise<void> {
  for (;;) {
    h.app.explorer.invalidateTree();
    h.app.explorer.treeRows();
    if (!h.app.explorer.listings.reading) return;
    while (h.app.explorer.listings.reading) await Bun.sleep(5);
  }
}

/** Awaited till the frame shows `text`: said and thrown by HELD_MS, no wait left behind. */
async function untilDrawn(h: Harness, text: string): Promise<void> {
  const end = performance.now() + HELD_MS;
  while (!h.frame().includes(text)) {
    if (performance.now() > end) throw new Error(`never drawn: ${text}`);
    await Bun.sleep(5);
  }
}

/** The explorer's rows, each by its name, indented by its depth. */
const names = (h: Harness) => h.app.explorer.treeRows().map((r) => `${"  ".repeat(r.depth)}${r.name}`);

/** A row by its name. */
const row = (h: Harness, name: string): TreeRow | undefined => h.app.explorer.treeRows().find((r) => r.name === name);

/** A key handled, not awaited: it may wait on a read. */
const press = (h: Harness, key: string) => h.app.input.handleKey(key);

/** A key handled, and drawn, while the hold waits: the switcher opened and closed. */
async function aKeyMeanwhile(h: Harness, hold: Hold): Promise<void> {
  await h.keys("ctrl+p");
  expect(h.frame()).toContain("┌─ Open ");
  await h.keys("escape");
  expect(hold.waiting).toBeGreaterThanOrEqual(1);
}

const said = (h: Harness) => h.app.messages.map((m) => m.text);

/** The vault at `root`'s index written as another thread writes it: there on the disk, nothing said on this one. */
function writtenElsewhere(root: string): void {
  const dir = cacheDir({ key: vaultKey(root) });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.json"), JSON.stringify({ version: INDEX_VERSION, entries: {}, branch: null }));
}

/** The disk threads' next listing of `dir` read there, its answer held here until `release`: what it says is what the
 *  disk said by `read`. The listings after it pass. */
function answerHeld(dir: string): {
  read: Promise<void>;
  release: () => void;
  asked: () => number;
  restore: () => void;
} {
  const list = DiskThreads.prototype.list;
  let release = () => {};
  let read = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const done = new Promise<void>((r) => (read = r));
  let taken = false;
  const spy = spyOn(DiskThreads.prototype, "list").mockImplementation(function (this: DiskThreads, ...args) {
    const answer = list.apply(this, args);
    if (taken || args[0] !== dir) return answer;
    taken = true;
    answer.then(read, read);
    return answer.then(async (l) => {
      await gate;
      return l;
    });
  });
  const asked = () => spy.mock.calls.filter((c) => c[0] === dir).length;
  return { read: done, release, asked, restore: () => spy.mockRestore() };
}

describe("the explorer's own tree listed off the screen's thread (SD-T7)", () => {
  test("held: a folder of the vault unfolded — `listing…` after a moment, a key handled meanwhile; then its rows, what the walk leaves out by its path and why", async () => {
    const h = await vaultWith({
      "held/a.md": "# A\n",
      "held/b.json": "{}\n",
      "held/node_modules/pkg/index.js": "x\n",
      "held/drafts/d.md": "# D\n",
    });
    const R = h.root;
    const ex = h.app.explorer;
    const hold = held();
    ex.expanded.add("held");
    ex.invalidateTree();
    h.frame();
    await untilHeld(hold, "the listings' thread");
    // The walk's rows meanwhile, the folder saying it's being listed.
    await untilDrawn(h, "listing…");
    expect(names(h)).toEqual(["held", "  listing…", "  a.md", "  b.json", "index.md"]);
    await aKeyMeanwhile(h, hold);
    hold.release();
    await listed(h);
    expect(names(h)).toEqual(["held", "  drafts", "  node_modules", "  a.md", "  b.json", "index.md"]);
    expect(h.frame()).not.toContain("listing…");
    expect(row(h, "drafts")).toMatchObject({ path: join(R, "held/drafts"), leftOut: "walk.exclude", outside: true });
    expect(row(h, "node_modules")).toMatchObject({ path: join(R, "held/node_modules"), leftOut: "busy folder" });
    // As the screen's thread gives them.
    const there = ex.treeRows();
    ex.listings = new Listings(h.app, false);
    ex.invalidateTree();
    expect(ex.treeRows()).toEqual(there);
    expect(hold.gaveUp).toBe(0);
    expect(hold.gaveUpHere).toEqual([]);
  });

  test("held: a nested vault's own name, and a row the walk leaves out, come with their folder's listing; a key handled meanwhile", async () => {
    const h = await vaultWith({
      "held/inner/.slipbox/config.toml": '[vault]\nname = "kestrel-notes"\n',
      "held/inner/i.md": "# I\n",
      "held/build/out.js": "x\n",
      "held/n.md": "# N\n",
    });
    const R = h.root;
    const ex = h.app.explorer;
    const hold = held();
    ex.expanded.add("held");
    ex.invalidateTree();
    h.frame();
    await untilHeld(hold, "the listings' thread");
    // By its folder's name meanwhile; the busy folder not there yet, its path the vault's own by its name.
    expect(row(h, "inner")).toMatchObject({ kind: "root", path: "held/inner" });
    expect(row(h, "inner")!.root!.name).toBeUndefined();
    expect(h.frame()).not.toContain("kestrel-notes");
    expect(row(h, "build")).toBeUndefined();
    expect(ex.rowPath(join(R, "held/build"))).toBe("held/build");
    await aKeyMeanwhile(h, hold);
    hold.release();
    await listed(h);
    expect(row(h, "inner")!.root!.name).toBe("kestrel-notes");
    expect(h.frame()).toContain("kestrel-notes");
    expect(row(h, "build")).toMatchObject({ path: join(R, "held/build"), leftOut: "busy folder", outside: true });
    expect(ex.rowPath(join(R, "held/build"))).toBe(join(R, "held/build"));
    expect(hold.gaveUp).toBe(0);
    expect(hold.gaveUpHere).toEqual([]);
  });

  test("held past a shortened deadline: a folder of the vault whose listing gives no answer says so under its row, the walk's rows kept", async () => {
    const h = await vaultWith({ "held/a.md": "# A\n" });
    const ex = h.app.explorer;
    holding(undefined, 300);
    setFolderReader(slowFolders);
    ex.expanded.add("held");
    ex.invalidateTree();
    h.frame();
    const noAnswer = "  can't read: no answer in time";
    const end = performance.now() + HELD_MS;
    while (!names(h).includes(noAnswer)) {
      if (performance.now() > end) throw new Error(`never said: ${names(h).join(", ")}`);
      await Bun.sleep(5);
    }
    expect(names(h)).toEqual(["held", noAnswer, "  a.md", "index.md"]);
    expect(h.frame()).toContain("can't read");
  });

  test("a folder asked for on both sides of the vault — a nested vault's, unfolded, and a path in it asked — is kept once for each", async () => {
    const h = await vaultWith({ "inner/.slipbox/config.toml": "", "inner/i.md": "# I\n" });
    const ex = h.app.explorer;
    const inner = join(h.root, "inner");
    ex.expanded.add("inner");
    await listed(h);
    expect(names(h)).toEqual(["inner", "  i.md", "index.md"]);
    // A path in it asked: its folder listed as the vault open's own tree's too, beside the one unfolded.
    expect(ex.rowPath(join(inner, "i.md"))).toBe(join(inner, "i.md"));
    while (ex.listings.reading) await Bun.sleep(5);
    ex.invalidateTree();
    ex.treeRows();
    ex.rowPath(join(inner, "i.md"));
    const listedAs = (own: boolean) => ex.listings.get(inner, own)?.entries.find((e) => e.name === "i.md");
    expect(listedAs(false)).toBeDefined();
    expect(listedAs(false)).not.toHaveProperty("excluded");
    expect(listedAs(true)).toHaveProperty("excluded", null);
  });

  test("held: the view's folder deleted while its stat is out — the view stays until the answer, then gives way, said; never a view moved since", async () => {
    const h = await vaultWith({ "held/sub/s.md": "# S\n", "held/h.md": "# H\n" });
    const R = h.root;
    const ex = h.app.explorer;
    const sub = join(R, "held", "sub");
    await ex.zoomTo(sub);
    await listed(h);
    expect(ex.top).toBe(sub);
    // The view's stats asked of a disk thread, each awaited: this test's, by the view's path.
    const stat = spyOn(DiskThreads.prototype, "stat");
    const of = (view: string) =>
      stat.mock.calls.flatMap((c, i) => (c[0][0] === view ? [stat.mock.results[i]!.value as Promise<unknown>] : []));
    /** The tree built again till the view's stat is asked: one more than `had`. */
    const asked = async (view: string, had: number) => {
      const end = performance.now() + HELD_MS;
      while (of(view).length <= had) {
        if (performance.now() > end) throw new Error(`${view}'s stat never asked`);
        ex.invalidateTree();
        h.frame();
        await Bun.sleep(5);
      }
    };
    /** Its stats answered, and what they say acted on. */
    const answered = async (view: string) => {
      await Promise.allSettled(of(view));
      await Bun.sleep(0);
    };
    try {
      const hold = held();
      await asked(sub, of(sub).length);
      rmSync(sub, { recursive: true });
      // One out at a time: the tree built again asks nothing more, the view as it was.
      const out = of(sub).length;
      ex.invalidateTree();
      expect(h.frame()).toContain("s.md");
      expect(of(sub)).toHaveLength(out);
      expect(ex.top).toBe(sub);
      expect(said(h).join("\n")).not.toContain("isn't there any more");
      hold.release();
      await answered(sub);
      expect(ex.top).toBe(join(R, "held"));
      expect(said(h)).toContain(`${tildePath(sub)} isn't there any more: the view is on ${tildePath(join(R, "held"))}`);
      // The view moved while its stat is out: that answer is another view's, dropped — the next build asks of this one.
      const deep = join(sub, "deep");
      mkdirSync(deep, { recursive: true });
      await ex.zoomTo(deep);
      await listed(h);
      expect(ex.top).toBe(deep);
      // None out when it's held again: the next one asked is held.
      await answered(deep);
      hold.again();
      await asked(deep, of(deep).length);
      rmSync(sub, { recursive: true });
      ex.top = ex.trail = sub;
      const before = said(h).length;
      hold.release();
      await answered(deep);
      expect(ex.top).toBe(sub);
      expect(said(h).slice(before).join("\n")).not.toContain("isn't there any more");
      await asked(sub, of(sub).length);
      await answered(sub);
      expect(ex.top).toBe(join(R, "held"));
      expect(said(h).slice(before).join("\n")).toContain(`${tildePath(sub)} isn't there any more`);
      expect(hold.gaveUpHere).toEqual([]);
    } finally {
      stat.mockRestore();
    }
  });

  test("held: `z` on a folder under `held` — the key waits, a frame drawn; `esc` gives it up and the view stays", async () => {
    const h = await vaultWith({ "held/a.md": "# A\n" });
    const R = h.root;
    const ex = h.app.explorer;
    h.app.region = "sidebar";
    h.app.sidebar.selected = ex.treeRows().findIndex((r) => r.name === "held");
    const hold = held();
    const z = press(h, "z");
    await untilHeld(hold, "the zoom's read");
    expect(h.frame()).toContain("held");
    expect(h.app.reads.busy).toBe(true);
    expect(ex.top).toBe(R);
    await press(h, "escape");
    hold.release();
    await z;
    await h.app.reads.settled();
    expect(ex.top).toBe(R);
    expect(said(h).join("\n")).not.toContain("didn't answer");
    // Let go, the same key zooms in.
    await press(h, "z");
    await h.app.reads.settled();
    expect(ex.top).toBe(join(R, "held"));
    expect(hold.gaveUpHere).toEqual([]);
  });

  test("held: `l` on a folder whose listing hasn't come — the key waits on its own read; let go, it unfolds", async () => {
    const h = await vaultWith({ "held/sub/s.md": "# S\n" });
    const ex = h.app.explorer;
    const hold = held();
    ex.expanded.add("held");
    ex.invalidateTree();
    h.frame();
    await untilHeld(hold, "the listings' thread");
    h.app.region = "sidebar";
    h.app.sidebar.selected = ex.treeRows().findIndex((r) => r.name === "sub");
    // The walk's row, nothing read of it yet.
    expect(row(h, "sub")!.listed).toBeUndefined();
    const l = press(h, "l");
    // Held as the listing is: both threads in `held`.
    const end = performance.now() + HELD_MS;
    while (hold.waiting < 2) {
      if (performance.now() > end) throw new Error("the unfold's read never reached `held`");
      await Bun.sleep(5);
    }
    expect(h.app.reads.busy).toBe(true);
    expect(ex.expanded.has("held/sub")).toBe(false);
    hold.release();
    await l;
    await h.app.reads.settled();
    expect(ex.expanded.has("held/sub")).toBe(true);
    await listed(h);
    expect(names(h)).toEqual(["held", "  sub", "    s.md", "index.md"]);
    expect(hold.gaveUpHere).toEqual([]);
  });

  test("held: a note revealed in a folder `.gitignore` leaves out, before its listing comes — its folders kept by their rows' paths once it does, unfolded, the note selected; a file a folders-only `walk.exclude` names stays the vault's", async () => {
    const h = await vaultWith(
      { "held/.gitignore": "out/\n", "held/out/deep/x.md": "# X\n", "held/plan.md": "# P\n" },
      { config: (c) => (c.walk.exclude = ["plan.md/"]) },
    );
    const R = h.root;
    const ex = h.app.explorer;
    const x = join(R, "held/out/deep/x.md");
    const hold = held();
    ex.reveal(x);
    await untilHeld(hold, "the listings' thread");
    // Not known yet: the vault's own by their names meanwhile; a file by what the walk knows of it, never a folder.
    expect(ex.expanded.has("held/out")).toBe(true);
    expect(ex.wanted?.path).toBe("held/out/deep/x.md");
    expect(ex.rowPath(join(R, "held/plan.md"))).toBe("held/plan.md");
    await aKeyMeanwhile(h, hold);
    hold.release();
    await listed(h);
    expect([...ex.expanded].filter((p) => p.includes("out")).sort()).toEqual([
      join(R, "held/out"),
      join(R, "held/out/deep"),
    ]);
    expect(names(h)).toEqual(["held", "  out", "    deep", "      x.md", "  plan.md", "index.md"]);
    expect(row(h, "out")).toMatchObject({ path: join(R, "held/out"), leftOut: ".gitignore" });
    expect(ex.rows()[h.app.sidebar.selected]?.path).toBe(x);
    expect(row(h, "plan.md")!.path).toBe("held/plan.md");
    expect(hold.gaveUp).toBe(0);
    expect(hold.gaveUpHere).toEqual([]);
  });

  test("held: another disk mounted at a folder of the vault — its folder's listing judges it by its name and the `.gitignore`s holding it, never looking at it", async () => {
    const h = await vaultWith({
      "docs/held/.gitignore": "build/\n",
      "docs/held/a.md": "# A\n",
      "docs/held/node_modules/x.md": "# X\n",
      "docs/held/build/out.js": "x\n",
    });
    const dir = join(h.root, "docs/held");
    const shares = [join(dir, "node_modules"), join(dir, "build")];
    // Held here at, or in, either disk: what a share gone away does. A busy name's is where the walk would look for a
    // note, a `.gitignore`d one's not even that.
    const hold = holding((p) => shares.some((s) => p === s || p.startsWith(`${s}/`)));
    setMountTable(() => shares.map((at) => ({ device: "server:/share", at, type: "nfs", options: "rw" })));
    try {
      // Listed here, as its thread lists it: the mount table a test gives is this thread's.
      const l = listFolder(dir, h.app.config.walk, false, h.app.graph.filter);
      expect(l.error).toBeNull();
      const entry = (name: string) => l.entries.find((e) => e.name === name);
      const mount = { dir: true, file: false, denied: false, mount: true } as const;
      expect(entry("node_modules")).toEqual({ name: "node_modules", ...mount, excluded: null });
      expect(entry("build")).toEqual({ name: "build", ...mount, excluded: "busy folder" });
      expect(hold.gaveUpHere).toEqual([]);
    } finally {
      setMountTable(null);
    }
  });

  test("held past a shortened deadline: a folder of the vault with no answer — a link the walk followed in it, unfolded, gives no rows of its own", async () => {
    const ext = realpathSync(mkdtempSync(join(sandbox, "ext-")));
    writeFileSync(join(ext, "e.md"), "# E\n");
    expect(await probe(ext)).toBe(true);
    const h = await vaultWith(
      { "held/a.md": "# A\n" },
      {
        before: (root) => {
          symlinkSync(ext, join(root, "held/lnk"));
          setLinkAnswer(join(root, "held/lnk"), "follow");
        },
      },
    );
    const lnk = join(h.root, "held/lnk");
    const ex = h.app.explorer;
    expect(h.app.graph.notes.has("held/lnk/e.md")).toBe(true);
    // Come since the walk, in what the link leads to: never a row of the vault's.
    writeFileSync(join(ext, "new.md"), "# New\n");
    const hold = holding(undefined, 300);
    setFolderReader(slowFolders);
    ex.expanded.add("held");
    ex.invalidateTree();
    h.frame();
    const noAnswer = "  can't read: no answer in time";
    const end = performance.now() + HELD_MS;
    while (!names(h).includes(noAnswer)) {
      if (performance.now() > end) throw new Error(`never said: ${names(h).join(", ")}`);
      await Bun.sleep(5);
    }
    hold.release();
    ex.expanded.add("held/lnk");
    await listed(h);
    // Its listing read for its rows' marks, the walk's rows kept.
    expect(ex.listings.peek(lnk, true)?.entries.map((e) => e.name)).toContain("new.md");
    expect(names(h)).toEqual(["held", noAnswer, "  lnk", "    e.md", "  a.md", "index.md"]);
    expect(hold.gaveUpHere).toEqual([]);
  });

  test("zoomed out above home, the vault open: its row's branch read here — its folder's listing reads none, home no vault by a marker (VV-D2)", async () => {
    // Its folder listed here, at once (a test's App): a disk thread doesn't see the home a test sets.
    const top = realpathSync(mkdtempSync(join(sandbox, "above-")));
    const home = join(top, "me");
    mkdirSync(join(home, ".git", "refs", "heads"), { recursive: true });
    writeFileSync(join(home, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(home, "n.md"), "# N\n");
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc: homeAt(home) });
      const ex = h.app.explorer;
      await ex.zoomTo(top);
      const me = ex.treeRows().find((r) => r.path === home);
      expect(me).toMatchObject({ kind: "root", root: { here: true } });
      expect(me!.listed).toBeDefined();
      expect(me!.listed!.vault).toBeUndefined();
      expect(ex.marks.of(me!).describe).toBe("main");
    } finally {
      process.env.HOME = before;
    }
  });

  test("held: `shift+h` in a hidden folder — the view goes out once its folder's read answers, said then; given up (`esc`), or no answer, nothing more", async () => {
    const h = await vaultWith({ "held/.hid/sub/s.md": "# S\n", "held/a.md": "# A\n" });
    const R = h.root;
    const ex = h.app.explorer;
    const hid = join(R, "held/.hid");
    h.app.settings.setUi("hidden_files", true);
    await ex.zoomTo(hid);
    await listed(h);
    expect(ex.top).toBe(hid);
    h.app.region = "sidebar";
    const hold = held();
    const off = press(h, "shift+h");
    await untilHeld(hold, "the zoom's read");
    await press(h, "escape");
    hold.release();
    await off;
    await h.app.reads.settled();
    expect(ex.top).toBe(hid);
    expect(said(h).join("\n")).not.toContain("hidden files not shown");
    // No answer in time: that said, nothing after it.
    h.app.settings.setUi("hidden_files", true);
    const late = holding(undefined, 300);
    await press(h, "shift+h");
    await h.app.reads.settled();
    expect(ex.top).toBe(hid);
    expect(said(h).at(-1)).toBe(`${tildePath(join(R, "held"))} didn't answer: not zoomed into`);
    late.release();
    // Answered that it can't be read: that said, nothing after it (root reads anything: nothing to refuse).
    if (process.getuid?.() !== 0) {
      chmodSync(join(R, "held"), 0o000);
      try {
        h.app.settings.setUi("hidden_files", true);
        await press(h, "shift+h");
        await h.app.reads.settled();
      } finally {
        chmodSync(join(R, "held"), 0o755);
      }
      expect(ex.top).toBe(hid);
      expect(said(h).at(-1)).toStartWith(`can't read ${tildePath(join(R, "held"))}: `);
    }
    // Answered: the view out, then said, in the key's own turn.
    h.app.settings.setUi("hidden_files", true);
    await press(h, "shift+h");
    await h.app.reads.settled();
    expect(ex.top).toBe(join(R, "held"));
    expect(said(h).at(-1)).toBe("explorer: hidden files not shown");
    expect(late.gaveUpHere).toEqual([]);
  });

  test("held: a folder of the vault listed — the notes its walk gave named to its thread, never looked at for their size; one come since, too big, marked", async () => {
    const h = await vaultWith(
      { "held/a.md": "# A\n", "held/b.md": "# B\n" },
      { config: (c) => (c.walk.max_file_size = 1000) },
    );
    const ex = h.app.explorer;
    const dir = join(h.root, "held");
    writeFileSync(join(dir, "big.md"), `# Big\n\n${"x".repeat(2000)}\n`);
    const list = spyOn(DiskThreads.prototype, "list");
    try {
      const hold = held();
      ex.expanded.add("held");
      ex.invalidateTree();
      h.frame();
      await untilHeld(hold, "the listings' thread");
      const own = list.mock.calls.find((c) => c[0] === dir && c[4])?.[4];
      expect([...(own?.walked ?? [])].sort()).toEqual(["a.md", "b.md"]);
      hold.release();
      await listed(h);
      expect(row(h, "big.md")?.listed?.big).toBe(true);
      expect(row(h, "a.md")?.listed?.big).toBeUndefined();
      // As its thread lists it: a note its walk gave read once less (never statted for its size), one it didn't as often.
      const reads = (walked?: Set<string>) => {
        const seen: string[] = [];
        setReadWait((p) => void seen.push(p));
        try {
          listFolder(dir, h.app.config.walk, false, h.app.graph.filter, walked);
        } finally {
          setReadWait(null);
        }
        return (name: string) => seen.filter((p) => p === join(dir, name)).length;
      };
      const all = reads();
      const given = reads(new Set(own?.walked));
      expect(given("a.md")).toBe(all("a.md") - 1);
      expect(given("big.md")).toBe(all("big.md"));
      expect(hold.gaveUpHere).toEqual([]);
    } finally {
      list.mockRestore();
    }
  });

  test("a vault nested in the vault open, its index written by a peek's thread: its row says so once that's caught up with, however lately its folder was listed", async () => {
    const h = await vaultWith({
      "nest/.slipbox/config.toml": "",
      "nest/n.md": "# N\n\nBack to [the index](../index.md).\n",
    });
    const ex = h.app.explorer;
    const nest = join(h.root, "nest");
    const mark = () => ex.marks.of(row(h, "nest")!).index;
    // The clock stopped, and the folder listed again under it: no listing grows old meanwhile, read again by its age.
    const clock = spyOn(Date, "now").mockReturnValue(Date.now());
    try {
      ex.listings.again(h.root);
      await listed(h);
      expect(row(h, "nest")).toMatchObject({ kind: "root", listed: { vault: { indexed: false } } });
      expect(mark()).toBeUndefined();
      // Its index written on its thread, nothing said here, and the answer saying so caught up with.
      writtenElsewhere(nest);
      const answer = {
        indexed: true as const,
        wrote: false,
        others: [vaultKey(nest)],
        signature: vaultSignature(h.app.graph),
        config: configSignature(h.app.config),
        rows: null,
      };
      await caughtUp(h.app, h.app.graph, answer);
      await listed(h);
      expect(mark()).toBe("indexed");
    } finally {
      clock.mockRestore();
    }
  });

  test("a vault's index written while its folder is read again: the answer, read before, dropped, the folder read again", async () => {
    const h = await vaultWith({ "nest/.slipbox/config.toml": "", "nest/n.md": "# N\n" });
    const ex = h.app.explorer;
    const nest = join(h.root, "nest");
    const clock = spyOn(Date, "now").mockReturnValue(Date.now());
    const late = answerHeld(h.root);
    try {
      expect(row(h, "nest")).toMatchObject({ listed: { vault: { indexed: false } } });
      ex.listings.again(h.root);
      ex.invalidateTree();
      ex.treeRows();
      // Read on its thread before the index is there; its answer comes after.
      await late.read;
      openGraph(locateVault({ root: nest }), h.app.config, true);
      late.release();
      await listed(h);
      expect(ex.marks.of(row(h, "nest")!).index).toBe("indexed");
    } finally {
      late.restore();
      clock.mockRestore();
    }
  });

  test("a vault's index written while its folder's first listing is read: that answer dropped, the folder read again", async () => {
    const h = await vaultWith({ "nest/.slipbox/config.toml": "", "nest/n.md": "# N\n" });
    const ex = h.app.explorer;
    const nest = join(h.root, "nest");
    const clock = spyOn(Date, "now").mockReturnValue(Date.now());
    const late = answerHeld(h.root);
    try {
      ex.listings.forget(h.root);
      ex.invalidateTree();
      ex.treeRows();
      await late.read;
      expect(ex.listings.peek(h.root, true)).toBeNull();
      openGraph(locateVault({ root: nest }), h.app.config, true);
      late.release();
      await listed(h);
      expect(ex.marks.of(row(h, "nest")!).index).toBe("indexed");
    } finally {
      late.restore();
      clock.mockRestore();
    }
  });

  test("an index written that no row is marked by reads nothing again: the vault open's own, while a first listing is read (a note saved); a vault's whose row says it's indexed already", async () => {
    const h = await vaultWith({ "nest/.slipbox/config.toml": "", "nest/n.md": "# N\n" });
    const ex = h.app.explorer;
    const nest = join(h.root, "nest");
    const clock = spyOn(Date, "now").mockReturnValue(Date.now());
    const late = answerHeld(h.root);
    try {
      ex.listings.forget(h.root);
      ex.invalidateTree();
      ex.treeRows();
      await late.read;
      indexWritten([h.app.loc.key]);
      late.release();
      await listed(h);
      expect(late.asked()).toBe(1);
      openGraph(locateVault({ root: nest }), h.app.config, true);
      await listed(h);
      expect(ex.marks.of(row(h, "nest")!).index).toBe("indexed");
      const asked = late.asked();
      indexWritten([vaultKey(nest)]);
      await listed(h);
      expect(late.asked()).toBe(asked);
    } finally {
      late.restore();
      clock.mockRestore();
    }
  });

  test("vaults nested in the vault open indexed by the background index on its thread: their rows say so once each is done, however lately their folders were listed — one recorded in the machine's list, one not", async () => {
    const registry = await import("../../../../src/core/workspace/vaults/registry.ts");
    // Each in a folder of its own: one's write said reads only its own folder again.
    const h = await vaultWith({
      "a/nest/.slipbox/config.toml": "",
      "a/nest/n.md": "# N\n",
      "b/loose/.slipbox/config.toml": "",
      "b/loose/l.md": "# L\n",
    });
    const ex = h.app.explorer;
    const [nest, loose] = [join(h.root, "a/nest"), join(h.root, "b/loose")];
    const marks = () => [ex.marks.of(row(h, "nest")!).index, ex.marks.of(row(h, "loose")!).index];
    const clock = spyOn(Date, "now").mockReturnValue(Date.now());
    // `loose` never recorded: its index said written where the background index learns of it.
    registry.writeRoots(registry.readRoots().filter((v) => v.path !== loose));
    const record = registry.recordRoot;
    const unrecorded = spyOn(registry, "recordRoot").mockImplementation((v, ...rest) =>
      v.path === loose ? { ...v, key: vaultKey(loose), seen: "" } : record(v, ...rest),
    );
    try {
      ex.expanded.add("a");
      ex.expanded.add("b");
      await listed(h);
      expect(marks()).toEqual([undefined, undefined]);
      // Home's index taken as built this pass (its place kept), the two vaults its walk found left, indexed where the
      // walk is: on its thread.
      const file = join(h.root, "..", `${h.root.split("/").at(-1)}-progress.json`);
      const progress = { version: 2, root: h.root, home: true, queue: [nest, loose], current: null, found: 2 };
      const pass = {
        indexed: 0,
        homeNotes: 0,
        capped: null,
        passStarted: new Date().toISOString(),
        passFinished: null,
      };
      writeFileSync(file, JSON.stringify({ ...progress, ...pass }));
      const job = new AutoIndex(h.root, file, () => Date.now(), {
        walker: walkThread(),
        config: () => structuredClone(h.app.config),
      });
      await stepToEnd(job, 15);
      expect(job.status).toMatchObject({ indexed: 2, queue: [], current: null });
      expect(registry.readRoots().some((v) => v.path === loose)).toBe(false);
      await listed(h);
      expect(marks()).toEqual(["indexed", "indexed"]);
    } finally {
      unrecorded.mockRestore();
      clock.mockRestore();
    }
  });
});

describe("a file operation's folders listed again before the keys after it act (SD-T7)", () => {
  // The clock stopped once the folders are listed: none grows old meanwhile, read again by its age.
  let clock: { mockRestore: () => void } | null = null;
  afterEach(() => clock?.mockRestore());

  /** The explorer shown, the folders listed (`listed`), the clock stopped. */
  async function shown(h: Harness): Promise<void> {
    h.app.panels.showSidebar(true);
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    await listed(h);
    clock = spyOn(Date, "now").mockReturnValue(Date.now());
  }

  /** A folder of notes and a file, the explorer shown and unfolded on it, `handbook/people.md` selected. */
  async function onPeople(): Promise<Harness> {
    const h = await vaultWith({
      "handbook/ops.md": "# Ops\n",
      "handbook/people.md": "# People\n",
      "handbook/safety.adoc": "= Safety\n",
      "handbook/writing.md": "# Writing\n",
    });
    h.app.explorer.select("handbook/people.md");
    await shown(h);
    h.app.explorer.select("handbook/people.md");
    return h;
  }
  const selected = (h: Harness) => h.app.explorer.rows()[h.app.sidebar.selected]?.path;

  test("deleted: a key after it waits for its folder read again — never on the deleted note's row, still listed from before", async () => {
    const h = await onPeople();
    const late = answerHeld(join(h.root, "handbook"));
    try {
      await h.keys("d", "y");
      await late.read;
      expect(names(h)).toContain("  people.md"); // listed from before: the folder's answer held
      const y = press(h, "y");
      expect(h.app.files.clip).toBeNull();
      late.release();
      await y;
      expect(names(h)).not.toContain("  people.md");
      expect(h.app.files.clip?.rel).toBe("handbook/safety.adoc");
    } finally {
      late.restore();
    }
  });

  test("restored, the watcher's word of the delete late: a key after it acts on the note restored, never on its neighbour", async () => {
    const h = await onPeople();
    await h.keys("d", "y");
    await h.app.reads.settled();
    expect(selected(h)).toBe("handbook/safety.adoc");
    const late = answerHeld(join(h.root, "handbook"));
    try {
      await press(h, "u");
      await late.read;
      // The watcher's batch of the delete, come after the restore: the walk lets the note go, and the listing kept from
      // after the delete doesn't have it — the selection on its neighbour meanwhile.
      h.app.watch.applyChanges({
        changes: [{ rel: "handbook/people.md", kind: "deleted", isNote: true }],
        rescan: false,
      });
      expect(selected(h)).toBe("handbook/safety.adoc");
      const y = press(h, "y");
      expect(h.app.files.clip).toBeNull();
      late.release();
      await y;
      expect(selected(h)).toBe("handbook/people.md");
      expect(h.app.files.clip?.rel).toBe("handbook/people.md");
    } finally {
      late.restore();
    }
  });

  test("deleted, the walk's filter moved while its folder is read again (a `.gitignore` changed): the key after it waits for the read asked under the filter now, never on the deleted note's row", async () => {
    const h = await onPeople();
    const late = answerHeld(join(h.root, "handbook"));
    try {
      await h.keys("d", "y");
      await late.read;
      // Its answer, read under the filter before, is read again under the one now: no listing taken by it.
      h.app.graph.filter.invalidate("");
      const y = press(h, "y");
      late.release();
      await y;
      expect(names(h)).not.toContain("  people.md");
      expect(h.app.files.clip?.rel).toBe("handbook/safety.adoc");
    } finally {
      late.restore();
    }
  });

  test("deleted, a vault in its folder indexed while it's read again: the key after it waits for the read asked since, never on the deleted note's row", async () => {
    const h = await vaultWith({
      "nest/.slipbox/config.toml": "",
      "nest/n.md": "# N\n",
      "ops.md": "# Ops\n",
      "people.md": "# People\n",
      "safety.adoc": "= Safety\n",
    });
    await shown(h);
    h.app.explorer.select("people.md");
    const late = answerHeld(h.root);
    try {
      await h.keys("d", "y");
      await late.read;
      // The folder's listing shows the vault not indexed: its answer, read before, dropped (`indexed`).
      writtenElsewhere(join(h.root, "nest"));
      indexWritten([vaultKey(join(h.root, "nest"))]);
      const y = press(h, "y");
      late.release();
      await y;
      expect(names(h)).not.toContain("people.md");
      expect(h.app.files.clip?.rel).toBe("safety.adoc");
    } finally {
      late.restore();
    }
  });

  for (const [what, make] of [
    ["a folder", (h: Harness) => h.app.files.createFolder("2026/q4", "archive")],
    ["a note", (h: Harness) => h.app.files.createNote("2026/q4", "archive")],
  ] as const)
    test(`${what} made two deep in a folder the walk leaves out: the folder its first folder was made in listed again before the keys after it, that folder's row there`, async () => {
      const h = await vaultWith(
        { "archive/old.md": "# Old\n" },
        { config: (c) => void (c.walk.exclude = ["archive"]) },
      );
      const archive = join(h.root, "archive");
      h.app.explorer.expanded.add(archive);
      await shown(h);
      expect(names(h)).toContain("  old.md");
      const late = answerHeld(archive);
      try {
        make(h);
        expect(h.app.reads.busy).toBe(true);
        await late.read;
        expect(names(h)).not.toContain("  2026");
        late.release();
        await h.app.reads.settled();
        expect(names(h)).toContain("  2026");
      } finally {
        late.restore();
      }
    });
});

describe("a row meant to be selected once its folder is listed (T12)", () => {
  test("held: a click on the row selected meanwhile — the same index — drops it: once the folder's listing comes, the selection stays where you clicked, never on the row revealed", async () => {
    const h = await vaultWith({ "notes/.gitignore": "out/\n", "notes/out/x.md": "# X\n", "notes/a.md": "# A\n" });
    const ex = h.app.explorer;
    h.app.panels.showSidebar(true);
    h.app.leftView = "explorer";
    h.app.region = "sidebar";
    ex.select("notes/a.md");
    await listed(h);
    ex.select("notes/a.md");
    // The clock stopped: no listing grows old meanwhile, read again by its age.
    const clock = spyOn(Date, "now").mockReturnValue(Date.now());
    const out = join(h.root, "notes/out");
    const late = answerHeld(out);
    try {
      // A note in a folder `.gitignore` leaves out, revealed before that folder's listing comes: meant to be selected.
      ex.reveal(join(out, "x.md"));
      await late.read;
      const at = h.app.sidebar.selected;
      expect(ex.rows()[at]?.path).toBe("notes/a.md");
      expect(ex.wanted).toMatchObject({ at });
      h.frame();
      const g = h.app.geometry!.sidebar!;
      for (const type of ["down", "up"]) h.app.mouse.handle({ type, x: g.x + 2, y: g.y + at, button: 0 });
      late.release();
      await listed(h);
      expect(names(h)).toContain("    x.md");
      expect(ex.rows()[h.app.sidebar.selected]?.path).toBe("notes/a.md");
    } finally {
      late.restore();
      clock.mockRestore();
    }
  });
});

describe("a folder the watcher saw change, listed again once its second has passed (SD-T7)", () => {
  test("a note deleted elsewhere within a second of its folder's listing, then nothing else: its row goes once the second has passed — never read again before", async () => {
    const h = await vaultWith({ "notes/a.md": "# A\n", "notes/b.md": "# B\n" });
    const ex = h.app.explorer;
    h.app.panels.showSidebar(true);
    h.app.leftView = "explorer";
    ex.expanded.add("notes");
    await listed(h);
    // The clock stopped; the build asked for later fired by hand, its wait kept.
    const start = Date.now();
    const clock = spyOn(Date, "now").mockReturnValue(start);
    const later: { ms: number; fire: () => void }[] = [];
    ex.listings.after = (ms, fire) => void later.push({ ms, fire });
    try {
      // Listed just now: within the second.
      ex.listings.again(join(h.root, "notes"));
      await listed(h);
      rmSync(join(h.root, "notes/b.md"));
      h.app.watch.applyChanges({ changes: [{ rel: "notes/b.md", kind: "deleted", isNote: true }], rescan: false });
      // Built again for the change, the listing within its second: not read again yet, the row as it had it.
      expect(names(h)).toContain("  b.md");
      expect(ex.listings.reading).toBe(false);
      expect(later.map((l) => l.ms)).toEqual([REREAD_MS + 1]);
      // The second passed: the tree built again by that alone, as a frame is drawn — the listing read, the row gone.
      clock.mockReturnValue(start + REREAD_MS + 1);
      later[0]!.fire();
      h.frame();
      expect(ex.listings.reading).toBe(true);
      while (ex.listings.reading) await Bun.sleep(5);
      expect(names(h)).not.toContain("  b.md");
      expect(names(h)).toContain("  a.md");
    } finally {
      clock.mockRestore();
    }
  });
});
