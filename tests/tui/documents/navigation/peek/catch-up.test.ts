import { expect, test } from "bun:test";
import * as fs from "node:fs";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  askBacklinks,
  backlinksThere,
  backlinkThread,
  configSignature,
  stopBacklinkJobs,
} from "../../../../../src/core/workspace/graph/backlinks-jobs.ts";
import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";

import { Graph, openGraph } from "../../../../../src/core/workspace/graph/graph.ts";

import { cacheDir, stateDir } from "../../../../../src/core/foundation/platform/paths.ts";
import { Reach } from "../../../../../src/core/workspace/links/reach.ts";
import { readRoots } from "../../../../../src/core/workspace/vaults/registry.ts";

import { forgetProbes, setLinkAnswer } from "../../../../../src/core/workspace/vaults/symlinks.ts";
import {
  initVault,
  locateVault,
  recordLocation,
  setRootMarkers,
} from "../../../../../src/core/workspace/vaults/vault.ts";

import { vaultGraph } from "../../../../../src/tui/documents/navigation/peek.ts";
import { harness, onlyRootsUnder } from "../../../../tui-harness.ts";
import { makePeekFixture } from "../../../../support/tui/peek-fixture.ts";

// File-owned peek setup retains its model sandbox and afterEach mock reset.
const { sandbox, read, parsedHere } = makePeekFixture();

let made = 0;

/** Two vaults: notes, open here, links into app; app's index made as of now, unless `index` is false. */
function twoVaults(files: Record<string, string> = {}, index = true) {
  const n = ++made;
  const base = mkdtempSync(join(sandbox, "peek-"));
  const notes = join(base, "notes");
  const app = join(base, "app");
  const all: Record<string, string> = {
    "notes/index.md": "# Index\n\n[design](../app/design.md)\n",
    "app/design.md": "# Design\n\nShip.\n",
    "app/links.md": "See [design](design.md).\n",
    ...files,
  };
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(dirname(join(base, rel)), { recursive: true });
    writeFileSync(join(base, rel), text);
  }
  initVault(notes, `pnotes${n}`);
  initVault(app, `papp${n}`);
  if (index) openGraph(locateVault({ root: app }), DEFAULT_CONFIG, true);
  return { base, notes, app, n };
}

test("a peek into a vault whose index is out of date shows the note at once, parsing none of that vault here; its backlinks follow from their thread (#10)", async () => {
  // design.md links by a name app has no note of: laid out, it's looked for among names not parsed yet.
  const { base, notes, app, n } = twoVaults({ "app/design.md": "# Design\n\nShip, see [[nowhere]].\n" });
  // Since app's index: a note changed to link design.md, another made that does — neither parsed.
  writeFileSync(join(app, "links.md"), "See [the design](design.md) again.\n");
  writeFileSync(join(app, "more.md"), "# More\n\n[design](design.md)\n");
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    const { roots } = await parsedHere(async () => {
      await h.keys("tab", "enter");
      expect(h.app.view!.buf.abs).toBe(join(app, "design.md"));
      const f = h.frame();
      expect(f).toContain("Ship, see");
      expect(f).toContain(`reading papp${n}'s index…`);
      expect(vaultGraph(h.app, app)!.pendingCount).toBeGreaterThan(0);
      const text = await read(h);
      expect(text).toContain("**Linked from** (2):");
      expect(text).toContain("[links.md:1](<links.md#L1>) — the design");
      expect(text).toContain("[more.md:3](<more.md#L3>) — design");
      expect(h.frame()).toContain("more.md:3");
    });
    expect(roots).not.toContain(app);
    // The graph its links are read in, opened again from the index its thread wrote: every note there, parsed.
    expect(vaultGraph(h.app, app)!.pendingCount).toBe(0);
  });
});

test("a peek into a vault with no index here builds it on its thread, and shows the backlinks when it's done (D259)", async () => {
  const { base, notes, app, n } = twoVaults({}, false);
  const loc = locateVault({ root: app });
  expect(existsSync(join(cacheDir(loc), "index.json"))).toBe(false);
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    expect(h.frame()).toContain(`papp${n} has no index here yet — building it; they're shown when it's done.`);
    const text = await read(h);
    expect(text).toContain("**Linked from** (1):");
    expect(text).toContain("[links.md:1](<links.md#L1>)");
    expect(existsSync(join(cacheDir(loc), "index.json"))).toBe(true);
    expect(readRoots().find((v) => v.key === loc.key)?.indexed).toBeString();
  });
});

test("a peek's backlinks from the other vault's code comments are there: their grammars loaded on the thread (16.10)", async () => {
  const { base, notes } = twoVaults({
    "app/src/main.ts": "// The design: design.md\nexport const x = 1;\n",
  });
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    const text = await read(h);
    expect(text).toContain("[src/main.ts:1](<src/main.ts#L1>)");
  });
});

test("a peek whose backlinks' thread can't run says so, and shows the note all the same (#10)", async () => {
  const { base, notes } = twoVaults();
  stopBacklinkJobs(); // the thread the tests before started
  backlinkThread.factory = () => {
    throw new Error("no threads here");
  };
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    const text = await read(h);
    expect(text).toContain("# Design");
    expect(text).toContain("**Linked from:** not worked out — worker could not run: Error: no threads here.");
  });
});

test("the other vault's index can't be written: its notes are parsed here a slice at a time, a big one on the threads, and its links found (#10)", async () => {
  const big = Array.from({ length: 4000 }, (_, i) => `Line ${i} of a long note, with a few words more to it.`).join(
    "\n\n",
  );
  const { base, notes, app } = twoVaults({
    "app/design.md": "# Design\n\nSee [[Far Name]].\n",
    "app/far.md": "---\naliases: [Far Name]\n---\n# Far\n",
    "app/big.md": `# Big\n\n${big}\n`,
  });
  // Where its index is, a folder: read, it's none; written, it's refused.
  const index = join(cacheDir(locateVault({ root: app })), "index.json");
  rmSync(index);
  mkdirSync(index);
  // The big note parsed here only from the threads' chunks: never whole, on this thread.
  const parsedWhole: string[] = [];
  const entry = Graph.prototype.entry;
  Graph.prototype.entry = function (this: Graph, rel, chunks) {
    if (this.root === app && !chunks && [...this.pendingPaths()].includes(rel)) parsedWhole.push(rel);
    return entry.call(this, rel, chunks);
  };
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      await read(h);
      const g = vaultGraph(h.app, app)!;
      for (let i = 0; g.pendingCount && i < 1000; i++) await Bun.sleep(5);
      expect(g.pendingCount).toBe(0);
      expect(g.resolveLink({ kind: "wiki", target: "Far Name" }, "design.md").path).toBe("far.md");
    });
  } finally {
    Graph.prototype.entry = entry;
  }
  expect(parsedWhole).toContain("far.md");
  expect(parsedWhole).not.toContain("big.md");
});

test("a tab of another vault's file, that vault without an index: built on the thread, its links by a name found (#10)", async () => {
  const { base, notes, app } = twoVaults(
    {
      "app/design.md": "# Design\n\nSee [[Far Name]].\n",
      "app/far.md": "---\naliases: [Far Name]\n---\n# Far\n",
    },
    false,
  );
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    // As a tab kept from a peek comes back with the session: a buffer of that file here, shown.
    const buf = h.app.buffer(join(app, "design.md"))!;
    h.app.makeView(buf);
    expect(buf.elsewhere?.graph).toBeTruthy();
    const g = buf.elsewhere!.graph!;
    expect(g.resolveLink({ kind: "wiki", target: "Far Name" }, "design.md").path).toBeNull();
    for (let i = 0; g.pendingCount && i < 400; i++) await Bun.sleep(5);
    expect(g.pendingCount).toBe(0);
    expect(g.resolveLink({ kind: "wiki", target: "Far Name" }, "design.md").path).toBe("far.md");
    expect(existsSync(join(cacheDir(locateVault({ root: app })), "index.json"))).toBe(true);
  });
});

test("the other vault's settings changed since its first peek: its graph here opened again with them, once (#10)", async () => {
  const { base, notes, app } = twoVaults({ "app/old/n.md": "# N\n\n[the design](../design.md)\n" });
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    expect(await read(h)).toContain("[old/n.md:3](<old/n.md#L3>)");
    const first = vaultGraph(h.app, app)!;
    await h.keys("esc");
    const config = join(app, ".slipbox", "config.toml");
    writeFileSync(config, readFileSync(config, "utf8").replace('# exclude = ["archive/"]', 'exclude = ["old/"]'));
    await h.keys("enter");
    expect(await read(h)).not.toContain("old/n.md");
    const second = vaultGraph(h.app, app)!;
    expect(second).not.toBe(first);
    expect(second.notes.has("old/n.md")).toBe(false);
    expect(h.app.view!.buf.elsewhere?.graph).toBe(second);
    // Nothing changed since: the same graph, not opened again.
    await h.keys("esc", "enter");
    await read(h);
    expect(vaultGraph(h.app, app)).toBe(second);
  });
});

test("a folder the other vault follows a link to: its notes among the backlinks, and in the graph here (VV-D6, #10)", async () => {
  const { base, notes, app } = twoVaults();
  const outer = join(base, "outer");
  mkdirSync(outer);
  writeFileSync(join(outer, "x.md"), "# X\n\n[the design](../design.md)\n");
  symlinkSync(outer, join(app, "linked"));
  setLinkAnswer(join(app, "linked"), "follow");
  forgetProbes(); // asked on neither thread yet
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    expect(await read(h)).toContain("[linked/x.md:3](<linked/x.md#L3>) — the design");
    expect(vaultGraph(h.app, app)!.notes.has("linked/x.md")).toBe(true);
  });
});

test("another vault's index with a link it can't say where: the rest of the backlinks shown (#10)", async () => {
  const { base, notes } = twoVaults();
  const third = join(base, "third");
  mkdirSync(third);
  writeFileSync(join(third, "t.md"), "# T\n");
  initVault(third, `pthird${made}`);
  // As another slipbox might have written it: a link without its text, one without a line.
  const index = join(cacheDir(locateVault({ root: third })), "index.json");
  mkdirSync(dirname(index), { recursive: true });
  const link = { kind: "markdown", target: "../app/design.md", heading: null, block: null, alias: null, column: 1 };
  writeFileSync(
    index,
    JSON.stringify({
      entries: {
        "t.md": {
          links: [
            { ...link, line: 3 },
            { ...link, line: 0 },
          ],
        },
      },
    }),
  );
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    const text = await read(h);
    expect(text).toContain("**Linked from** (2):");
    expect(text).toContain("[links.md:1](<links.md#L1>)");
    expect(text).toContain("third/t.md:3](<../third/t.md#L3>)\n");
  });
});

test("catching the graph here up failing keeps the backlinks its thread worked out (#10)", async () => {
  const { base, notes, app } = twoVaults();
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    await read(h);
    await h.keys("esc");
    writeFileSync(join(app, "plan.md"), "# Plan\n\nAfter [the design](design.md).\n");
    const build = Graph.prototype.build;
    Graph.prototype.build = function (this: Graph, ...args: Parameters<Graph["build"]>) {
      if (this.root === app) throw new Error("the disk went away");
      return build.apply(this, args);
    };
    try {
      await h.keys("enter");
      expect(await read(h)).toContain("[plan.md:3](<plan.md#L3>)");
    } finally {
      Graph.prototype.build = build;
    }
  });
});

test("the graph here opened again for a changed walk keeps its reach when the vaults in it didn't change (#10)", async () => {
  const { base, notes, app } = twoVaults();
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    await read(h);
    const reach = vaultGraph(h.app, app)!.reach;
    await h.keys("esc");
    writeFileSync(join(app, "plan.md"), "# Plan\n\nAfter [the design](design.md).\n");
    await h.keys("enter");
    await read(h);
    expect(vaultGraph(h.app, app)!.notes.has("plan.md")).toBe(true);
    expect(vaultGraph(h.app, app)!.reach).toBe(reach);
  });
});

test("another vault reached only to resolve a link, its index behind: caught up on the thread, a name only a newer note declares found (#10)", async () => {
  const { base, notes, app } = twoVaults();
  // Since app's index: a note declaring a name.
  writeFileSync(join(app, "far.md"), "---\naliases: [Far Name]\n---\n# Far\n");
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    // As a link's resolution reaches it: by this TUI's reach, no peek, no tab.
    const g = h.app.reach.graphAt(app)!;
    expect(g.pendingCount).toBeGreaterThan(0);
    for (let i = 0; g.pendingCount && i < 400; i++) await Bun.sleep(5);
    expect(g.pendingCount).toBe(0);
    expect(g.resolveLink({ kind: "wiki", target: "Far Name" }, "design.md").path).toBe("far.md");
  });
});

test("a move found by the thread is known to the graph here: its redirects read again (17.12, #10)", async () => {
  const { base, notes, app } = twoVaults();
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    await read(h);
    expect(vaultGraph(h.app, app)!.redirects?.follow("links.md")).toBeNull();
    await h.keys("esc");
    // links.md moved, its text as it was: a move, as the walk finds one.
    writeFileSync(join(app, "moved.md"), readFileSync(join(app, "links.md")));
    rmSync(join(app, "links.md"));
    await h.keys("enter");
    await read(h);
    expect(vaultGraph(h.app, app)!.redirects?.follow("links.md")).toBe("moved.md");
  });
});

test("the settings' signature is a graph's own: its walk's, not a theme's or a key's (#10)", () => {
  const a = structuredClone(DEFAULT_CONFIG);
  const b = structuredClone(DEFAULT_CONFIG);
  b.ui.line_numbers = !a.ui.line_numbers;
  expect(configSignature(b)).toBe(configSignature(a));
  b.walk.exclude = ["old/"];
  expect(configSignature(b)).not.toBe(configSignature(a));
});

test("another vault with no index here, reached to resolve a link: its index built on the thread, a name only a note declares found (D259)", async () => {
  const { base, notes, app } = twoVaults({ "app/far.md": "---\naliases: [Far Name]\n---\n# Far\n" }, false);
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    const g = h.app.reach.graphAt(app)!;
    expect(g.resolveLink({ kind: "wiki", target: "Far Name" }, "design.md").path).toBeNull();
    for (let i = 0; g.pendingCount && i < 400; i++) await Bun.sleep(5);
    expect(g.pendingCount).toBe(0);
    expect(g.resolveLink({ kind: "wiki", target: "Far Name" }, "design.md").path).toBe("far.md");
    expect(existsSync(join(cacheDir(locateVault({ root: app })), "index.json"))).toBe(true);
  });
});

test("a third vault a peeked vault's links reach, with no index here: caught up too, held by that vault's reach (D259)", async () => {
  const { base, notes, app } = twoVaults({ "third/far.md": "---\naliases: [Far Name]\n---\n# Far\n" });
  const third = join(base, "third");
  mkdirSync(join(third, ".slipbox"), { recursive: true });
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    await read(h);
    const there = vaultGraph(h.app, app)!.reach!.graphAt(third)!;
    for (let i = 0; there.pendingCount && i < 400; i++) await Bun.sleep(5);
    expect(there.pendingCount).toBe(0);
    expect(there.resolveLink({ kind: "wiki", target: "Far Name" }, "x.md").path).toBe("far.md");
  });
});

test("another vault's graph this TUI reaches never writes its index here: its thread does (#10)", async () => {
  const { base, notes, app } = twoVaults();
  writeFileSync(join(app, "more.md"), "# More\n");
  const index = join(cacheDir(locateVault({ root: app })), "index.json");
  const before = readFileSync(index, "utf8");
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    const g = h.app.reach.graphAt(app, { known: true })!;
    g.ensureAll();
    expect(g.writtenAt).toBeNull();
    expect(readFileSync(index, "utf8")).toBe(before);
  });
});

test("a vault nested in this one without an index is built on the thread, not parsed whole here (#10)", async () => {
  const { base, notes } = twoVaults({ "notes/nested/n.md": "# N\n\n[home](../index.md)\n" });
  const nested = join(notes, "nested");
  mkdirSync(join(nested, ".slipbox"));
  const { roots } = await parsedHere(async () => {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      h.app.graph.backlinks("index.md");
      for (let i = 0; i < 400 && !existsSync(join(cacheDir(locateVault({ root: nested })), "index.json")); i++)
        await Bun.sleep(5);
      // Built, this vault's backlinks have its link: read again once it's written.
      for (let i = 0; i < 400 && !h.app.graph.backlinks("index.md").some((b) => b.from.endsWith("n.md")); i++)
        await Bun.sleep(5);
      expect(h.app.graph.backlinks("index.md").map((b) => b.from)).toContain(join(nested, "n.md"));
    });
  });
  expect(existsSync(join(cacheDir(locateVault({ root: nested })), "index.json"))).toBe(true);
  expect(roots).not.toContain(nested);
});

test("another vault's notes its index lacks, its thread failing, are parsed here in slices: for a peek, and for a kept tab (#10)", async () => {
  for (const via of ["peek", "tab"] as const) {
    const { base, notes, app } = twoVaults();
    // A note come since its index, declaring a name only it has.
    writeFileSync(join(app, "far.md"), "---\naliases: [Far Name]\n---\n# Far\n");
    stopBacklinkJobs();
    backlinkThread.factory = () => {
      throw new Error("no threads here");
    };
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      // Held already, taken from the machine's list: nothing else asks its thread to catch it up.
      const g = h.app.reach.graphAt(app, { known: true })!;
      expect(g.pendingCount).toBeGreaterThan(0);
      if (via === "peek") {
        await h.keys("tab", "enter");
        expect(await read(h)).toContain("**Linked from:** not worked out");
      } else h.app.makeView(h.app.buffer(join(app, "links.md"))!);
      for (let i = 0; g.pendingCount && i < 400; i++) await Bun.sleep(5);
      expect(g.pendingCount).toBe(0);
      expect(g.resolveLink({ kind: "wiki", target: "Far Name" }, "design.md").path).toBe("far.md");
    });
  }
  stopBacklinkJobs();
});

test("the thread reads a vault a peeked note's links reach by name writing nothing of that vault's — this TUI's own among them: its index, its redirects, its commit caught up with (#10)", async () => {
  const { base, notes, app, n } = twoVaults({ "notes/old.md": "# Old\n\nA note about to move.\n" });
  const git = (...args: string[]) =>
    Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", notes, ...args]);
  git("init", "-q");
  git("add", "-A");
  git("commit", "-qm", "notes");
  const loc = locateVault({ root: notes });
  openGraph(loc, DEFAULT_CONFIG, true); // its index, as this TUI keeps it
  rmSync(join(stateDir(loc), "heads.json"), { force: true });
  // Since: a note moved, its text as it was; a note come, with a name only it declares; app's note naming it.
  writeFileSync(join(notes, "new.md"), readFileSync(join(notes, "old.md")));
  rmSync(join(notes, "old.md"));
  writeFileSync(join(notes, "far.md"), "---\naliases: [Far Name]\n---\n# Far\n");
  writeFileSync(join(app, "design.md"), `# Design\n\nSee [[pnotes${n}:Far Name]].\n`);
  const index = join(cacheDir(loc), "index.json");
  const before = readFileSync(index, "utf8");
  const opened: string[] = [];
  const graphAt = Reach.prototype.graphAt;
  Reach.prototype.graphAt = function (this: Reach, root, opts) {
    opened.push(realpathSync(root));
    return graphAt.call(this, root, opts);
  };
  try {
    await onlyRootsUnder(base, async () => {
      recordLocation(loc); // known by its name, as once it's been opened
      expect((await backlinksThere({ root: app, rel: "design.md" })).indexed).toBe(true);
    });
  } finally {
    Reach.prototype.graphAt = graphAt;
  }
  expect(opened).toContain(realpathSync(notes));
  expect(readFileSync(index, "utf8")).toBe(before);
  expect(existsSync(join(stateDir(loc), "redirects.json"))).toBe(false);
  expect(existsSync(join(stateDir(loc), "heads.json"))).toBe(false);
});

test("a peek's thread that builds the index of a vault nested in the peeked one says so: this vault's backlinks read again, its link among them (#10)", async () => {
  const { base, notes, app } = twoVaults();
  // Nested in app since app's index, never indexed, its note linking here: app's own notes unchanged.
  const lab = join(app, "lab");
  mkdirSync(join(lab, ".slipbox"), { recursive: true });
  writeFileSync(join(lab, "n.md"), "# Lab\n\nBack to [the index](../../notes/index.md).\n");
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    const fromLab = () => h.app.graph.backlinks("index.md").some((b) => b.from === join(lab, "n.md"));
    expect(fromLab()).toBe(false);
    const generation = h.app.graph.generation;
    await h.keys("tab", "enter");
    await read(h);
    expect(h.app.graph.generation).toBeGreaterThan(generation);
    expect(fromLab()).toBe(true);
  });
});

test("another vault reached for a link, its notes only deleted since its index: caught up on the thread, this vault's backlinks without them (#10)", async () => {
  const { base, notes, app } = twoVaults({ "app/to-notes.md": "Back to [the index](../notes/index.md).\n" });
  rmSync(join(app, "to-notes.md"));
  const gone = join(app, "to-notes.md");
  await onlyRootsUnder(base, async () => {
    recordLocation(locateVault({ root: app })); // known on this machine: its index read for links here
    const h = await harness({ root: notes, open: "index.md" });
    const from = () => h.app.graph.backlinks("index.md").map((b) => b.from);
    const generation = h.app.graph.generation;
    const g = h.app.reach.graphAt(app)!;
    expect(g.pendingCount).toBe(0);
    expect(g.indexBehind).toBe(true);
    for (let i = 0; i < 400 && from().includes(gone); i++) await Bun.sleep(5);
    expect(from()).not.toContain(gone);
    expect(h.app.graph.generation).toBeGreaterThan(generation);
  });
});

test("another vault's index rewritten within the same mtime, said written: this vault's backlinks read it again (#10)", async () => {
  const { base, notes, app } = twoVaults({ "app/to-notes.md": "Back to [the index](../notes/index.md).\n" });
  const index = join(cacheDir(locateVault({ root: app })), "index.json");
  // A coarse clock's: whole seconds, the same for both writes.
  const tick = 1_700_000_000;
  utimesSync(index, tick, tick);
  await onlyRootsUnder(base, async () => {
    recordLocation(locateVault({ root: app }));
    const h = await harness({ root: notes, open: "index.md" });
    const from = () => h.app.graph.backlinks("index.md").map((b) => b.from);
    expect(from()).toContain(join(app, "to-notes.md"));
    // The note gone, its vault's index written again within the same tick.
    rmSync(join(app, "to-notes.md"));
    openGraph(locateVault({ root: app }), DEFAULT_CONFIG, true);
    utimesSync(index, tick, tick);
    h.app.graph.othersChanged();
    expect(from()).not.toContain(join(app, "to-notes.md"));
  });
});

test("the thread never indexes this TUI's own vault, nested in the one asked about and without an index: its index is the main thread's (#10)", async () => {
  const { base, app } = twoVaults();
  const lab = join(realpathSync(app), "lab");
  mkdirSync(join(lab, ".slipbox"), { recursive: true });
  writeFileSync(join(lab, "n.md"), "# Lab\n\nBack to [design](../design.md).\n");
  const index = join(cacheDir(locateVault({ root: lab })), "index.json");
  await onlyRootsUnder(base, async () => {
    // Asked of the thread itself, as the peek asks.
    const a = await askBacklinks({ root: app, rel: "design.md", own: lab });
    expect(a?.indexed && a.others).toEqual([]);
    expect(existsSync(index)).toBe(false);
    // Another TUI's: built.
    const b = await askBacklinks({ root: app, rel: "design.md" });
    expect(b?.indexed && b.others).toEqual([locateVault({ root: lab }).key]);
    expect(existsSync(index)).toBe(true);
  });
});

test("the thread doesn't parse whole a vault a peeked note's links reach by name: where they land is no backlink of it (#10)", async () => {
  const { base, notes, app, n } = twoVaults();
  const loc = locateVault({ root: notes });
  openGraph(loc, DEFAULT_CONFIG, true);
  writeFileSync(join(notes, "far.md"), "---\naliases: [Far Name]\n---\n# Far\n"); // since its index
  writeFileSync(join(app, "design.md"), `# Design\n\nSee [[pnotes${n}:Far Name]].\n`);
  await onlyRootsUnder(base, async () => {
    recordLocation(loc);
    const { roots } = await parsedHere(() => backlinksThere({ root: app, rel: "design.md" }));
    expect(roots).not.toContain(realpathSync(notes));
    expect(roots).not.toContain(notes);
  });
});

test("another vault's graph this TUI reaches writes nothing of its state: no moves found, no commit caught up with — its thread does (#10)", async () => {
  const { base, notes, app } = twoVaults();
  const git = (...args: string[]) =>
    Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", app, ...args]);
  git("init", "-q");
  git("add", "-A");
  git("commit", "-qm", "app");
  const loc = locateVault({ root: app });
  rmSync(join(stateDir(loc), "heads.json"), { force: true });
  // A note moved since app's index, its text as it was: a move, as the walk finds one.
  writeFileSync(join(app, "moved.md"), readFileSync(join(app, "links.md")));
  rmSync(join(app, "links.md"));
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    expect(h.app.reach.graphAt(app, { known: true })).not.toBeNull();
    expect(existsSync(join(stateDir(loc), "redirects.json"))).toBe(false);
    expect(existsSync(join(stateDir(loc), "heads.json"))).toBe(false);
  });
});

test("the thread finds vaults by the root markers your config names, as this thread does (21.1, #10)", async () => {
  const { base, app } = twoVaults();
  // A vault nested in app by a marker only your config names.
  const lab = join(realpathSync(app), "lab");
  mkdirSync(join(lab, ".mark"), { recursive: true });
  writeFileSync(join(lab, "n.md"), "# Lab\n\nBack to [design](../design.md).\n");
  setRootMarkers([".slipbox", ".mark"]);
  try {
    await onlyRootsUnder(base, async () => {
      const a = await askBacklinks({ root: app, rel: "design.md" });
      // Found there as a vault of its own, and built: not taken for app's own notes.
      expect(a?.indexed && a.others).toEqual([locateVault({ root: lab }).key]);
    });
  } finally {
    setRootMarkers(null);
  }
});

test("a graph opened anew for changed settings tells nobody it was opened: its catch-up was answered just now (#10)", async () => {
  const { base, notes, app } = twoVaults();
  await onlyRootsUnder(base, async () => {
    const told: string[] = [];
    const reach = new Reach(locateVault({ root: notes }), { opened: (g) => told.push(g.root) });
    expect(reach.graphAt(app)).not.toBeNull();
    expect(reach.reopen(app)).not.toBeNull();
    expect(told).toHaveLength(1);
  });
});

test("a note slipbox can't read doesn't have its vault's index written again at each run: nothing said written (#10)", async () => {
  if (process.getuid?.() === 0) return; // root reads it all the same
  const { base, app } = twoVaults();
  const locked = join(app, "locked.md");
  writeFileSync(locked, "# Locked\n");
  fs.chmodSync(locked, 0o000);
  try {
    await onlyRootsUnder(base, async () => {
      const first = await backlinksThere({ root: app, rel: "design.md" });
      const second = await backlinksThere({ root: app, rel: "design.md" });
      expect(first.indexed && first.wrote).toBe(false);
      expect(second.indexed && second.wrote).toBe(false);
    });
  } finally {
    fs.chmodSync(locked, 0o644);
  }
});

test("a vault with no index whose every note slipbox can't read has one written all the same: it's indexed, not built at each peek (#10)", async () => {
  if (process.getuid?.() === 0) return; // root reads them all the same
  const { base, app } = twoVaults({}, false);
  const index = join(cacheDir(locateVault({ root: app })), "index.json");
  const notes = readdirSync(app).filter((n) => n.endsWith(".md"));
  for (const n of notes) fs.chmodSync(join(app, n), 0o000);
  try {
    await onlyRootsUnder(base, async () => {
      expect(existsSync(index)).toBe(false);
      await backlinksThere({ root: app, rel: null });
      expect(existsSync(index)).toBe(true);
    });
  } finally {
    for (const n of notes) fs.chmodSync(join(app, n), 0o644);
  }
});
