// A peek's backlinks (VV-D7, D259; design/tui.md § The peek): worked out on a thread of their own, the note shown at
// once; as the other vault is now, at each peek; its index built when it has none.
import { afterEach, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import * as vaultModule from "../src/core/vault.ts";
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
import { basename, dirname, join } from "node:path";
import {
  askBacklinks,
  backlinksThere,
  backlinkThread,
  configSignature,
  stopBacklinkJobs,
  vaultSignature,
} from "../src/core/backlinks-jobs.ts";
import { DEFAULT_CONFIG } from "../src/core/config.ts";
import { atomicWrite, STALE_TEMP_MS, sweepTemps, tempPath, tempRandom } from "../src/core/fsutil.ts";
import { Graph, openGraph } from "../src/core/graph.ts";
import { walkHomeNow } from "../src/core/home.ts";
import { cacheDir, stateDir } from "../src/core/paths.ts";
import { Reach } from "../src/core/reach.ts";
import { noteIndexed, readRoots, writeRoots } from "../src/core/registry.ts";
import { planMakeVault, planUnmakeVault } from "../src/core/rename-vaults.ts";
import { Redirects } from "../src/core/redirects.ts";
import { forgetProbes, setLinkAnswer } from "../src/core/symlinks.ts";
import { homeAt, initVault, locateVault, recordLocation, setRootMarkers } from "../src/core/vault.ts";
import { keepCaughtUp, peekOf, peekProbe, vaultGraph } from "../src/tui/peek.ts";
import { type Harness, harness, makeSandbox, onlyRootsUnder } from "./tui-harness.ts";

const sandbox = makeSandbox();
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

/** The peek's backlinks, once their thread has answered. */
async function read(h: Harness): Promise<string> {
  await peekOf(h.app)?.reading;
  return h.app.view!.buf.source;
}

/** The graphs whose notes were all parsed on this thread while `run` ran: by their roots. */
async function parsedHere<T>(run: () => Promise<T>): Promise<{ result: T; roots: string[] }> {
  const roots: string[] = [];
  const was = Graph.prototype.ensureAll;
  Graph.prototype.ensureAll = function (this: Graph) {
    roots.push(this.root);
    return was.call(this);
  };
  try {
    return { result: await run(), roots };
  } finally {
    Graph.prototype.ensureAll = was;
  }
}

const factory = backlinkThread.factory;
afterEach(() => {
  backlinkThread.factory = factory;
});

test("a later peek lists the backlinks the other vault has now, not those of the first peek (#10)", async () => {
  const { base, notes, app } = twoVaults();
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    expect(h.app.view!.buf.abs).toBe(join(app, "design.md"));
    let text = await read(h);
    expect(text).toContain("**Linked from** (1):");
    expect(text).toContain("[links.md:1](<links.md#L1>)");
    await h.keys("esc");
    // Meanwhile, in app: a note comes that links to design.md, and links.md stops linking to it.
    writeFileSync(join(app, "plan.md"), "# Plan\n\nAfter [the design](design.md).\n");
    writeFileSync(join(app, "links.md"), "Nothing here now.\n");
    await h.keys("enter");
    expect(h.app.view!.buf.abs).toBe(join(app, "design.md"));
    text = await read(h);
    expect(text).toContain("[plan.md:3](<plan.md#L3>) — the design");
    expect(text).not.toContain("links.md");
    // And the graph its links are read in knows the new note: a link to it isn't broken.
    expect(vaultGraph(h.app, app)!.notes.has("plan.md")).toBe(true);
  });
});

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

test("a peek's backlinks shown only in the peek they were asked for: moved on, kept as a tab, or opened again (#10)", async () => {
  const { base, notes, app } = twoVaults({
    "app/design.md": "# Design\n\nShip [the plan](plan.md).\n",
    "app/plan.md": "# Plan\n\n[back](design.md)\n",
  });
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    // Moved on before they came: a link inside the peek, to plan.md; its own backlinks, not design.md's.
    await h.keys("tab", "enter");
    const first = peekOf(h.app)!;
    await h.keys("tab", "enter");
    expect(h.app.view!.buf.abs).toBe(join(app, "plan.md"));
    await first.reading;
    expect(h.app.view!.buf.source).not.toContain("links.md");
    let text = await read(h);
    expect(text.match(/\*\*Linked from/g)).toHaveLength(1);
    expect(text).toContain("[design.md:3](<design.md#L3>) — the plan");
    expect(text).not.toContain("links.md");
    // Kept as a tab before they came: the tab is the file, nothing added to it.
    await h.keys("ctrl+o");
    const kept = peekOf(h.app)!;
    await h.keys("t");
    await kept.reading;
    expect(h.app.floating).toBeNull();
    expect(h.app.view!.buf.source).toBe("# Design\n\nShip [the plan](plan.md).\n");
    // Closed and opened again at once: the second peek's own, once.
    await h.app.run("tab.close");
    await h.keys("tab", "enter", "esc", "enter");
    text = await read(h);
    expect(h.app.view!.buf.abs).toBe(join(app, "design.md"));
    expect(text.match(/\*\*Linked from/g)).toHaveLength(1);
    expect(text).toContain("[plan.md:3](<plan.md#L3>) — back");
  });
});

test("a file come to the other vault since its first peek, no note among them, is known to the next peek's links (#10)", async () => {
  const { base, notes, app } = twoVaults({ "app/design.md": "# Design\n\n![the chart](chart.png)\n" });
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    await read(h);
    expect(vaultGraph(h.app, app)!.filePaths()).not.toContain("chart.png");
    await h.keys("esc");
    writeFileSync(join(app, "chart.png"), "not really a picture");
    await h.keys("enter");
    await read(h);
    expect(vaultGraph(h.app, app)!.filePaths()).toContain("chart.png");
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

test("a vault nested in the peeked one, never indexed, has its links among the backlinks: recorded here, indexed on the thread", async () => {
  const { base, notes, app } = twoVaults();
  const sub = join(app, "sub");
  mkdirSync(sub);
  writeFileSync(join(sub, "deep.md"), "# Deep\n\n[up](../design.md)\n");
  // A vault by its marker alone: not in the machine's list until something records it.
  mkdirSync(join(sub, ".slipbox"));
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    const text = await read(h);
    expect(text).toContain("**Linked from** (2):");
    expect(text).toContain("[sub/deep.md:3](<sub/deep.md#L3>) — up");
  });
});

test("a Reach that doesn't record leaves the machine's list alone; one that doesn't index nested vaults leaves theirs unbuilt", async () => {
  const top = realpathSync(mkdtempSync(join(sandbox, "reach-")));
  const here = join(top, "here");
  const there = join(top, "there");
  const nested = join(there, "nested");
  for (const [dir, note] of [
    [here, "a.md"],
    [there, "b.md"],
    [nested, "c.md"],
  ] as const) {
    mkdirSync(join(dir, ".slipbox"), { recursive: true });
    writeFileSync(join(dir, note), "# Note\n");
  }
  await onlyRootsUnder(top, async () => {
    const listed = () => readRoots().map((v) => v.path);
    const g = new Reach(locateVault({ root: here }), { record: false }).graphAt(there)!;
    expect(g.thorough).toBe(true);
    expect(listed()).not.toContain(there);
    const r = new Reach(locateVault({ root: there }), { record: false });
    r.discover(g);
    expect(listed()).not.toContain(nested);
    expect(existsSync(join(cacheDir(locateVault({ root: nested })), "index.json"))).toBe(true);
    // Recorded, its index left to whoever reads it: the peek's main thread.
    const own = new Reach(locateVault({ root: here }), { thorough: false }).graphAt(there)!;
    expect(own.thorough).toBe(false);
    expect(listed()).toContain(there);
  });
});

test("two writes of a file never share a temporary file, within a millisecond or from two threads, its name no longer than it was (#10)", () => {
  const now = Date.now;
  Date.now = () => 1;
  try {
    const a = tempPath("/v/index.json");
    const b = tempPath("/v/index.json");
    expect(a).not.toBe(b);
    expect(a).toContain(`-${process.pid}-0-`);
  } finally {
    Date.now = now;
  }
  // As long at most as the process and the millisecond made it: a note named near the 255-byte limit still saves.
  const name = "n".repeat(200);
  expect(basename(tempPath(`/v/${name}.md`)).length).toBeLessThanOrEqual(
    `.${name}.md.slipbox-${process.pid}-${Date.now()}.tmp`.length,
  );
});

test("a vault come into the peeked one since its first peek has its links among the next peek's backlinks, and is recorded", async () => {
  const { base, notes, app } = twoVaults();
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    expect(await read(h)).toContain("**Linked from** (1):");
    await h.keys("esc");
    const later = join(app, "later");
    mkdirSync(join(later, ".slipbox"), { recursive: true });
    writeFileSync(join(later, "n.md"), "# N\n\n[the design](../design.md)\n");
    await h.keys("enter");
    const text = await read(h);
    expect(text).toContain("**Linked from** (2):");
    expect(text).toContain("[later/n.md:3](<later/n.md#L3>) — the design");
    expect(readRoots().map((v) => v.path)).toContain(later);
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

test("the thread's requests: one at a time, never cancelled; the newest peek's waits, an older one answered null; a tab's waits apart", async () => {
  stopBacklinkJobs();
  const sent: { id: number; root: string; rel: string | null }[] = [];
  let fake: { onmessage: ((e: { data: unknown }) => void) | null } = { onmessage: null };
  backlinkThread.factory = () => {
    fake = { onmessage: null };
    return Object.assign(fake, {
      onerror: null,
      postMessage: (m: (typeof sent)[number]) => sent.push(m),
      terminate() {},
    }) as unknown as Worker;
  };
  const reply = (i: number, data: object = {}) =>
    fake.onmessage!({
      data: {
        id: sent[i]!.id,
        indexed: true,
        wrote: false,
        others: [],
        signature: "s",
        config: "c",
        rows: sent[i]!.rel === null ? null : [],
        ...data,
      },
    });
  const settle = () => Bun.sleep(0);
  try {
    const a = askBacklinks({ root: "/r", rel: "a.md" });
    const b = askBacklinks({ root: "/r", rel: "b.md" });
    const tab = askBacklinks({ root: "/t", rel: null });
    const c = askBacklinks({ root: "/r", rel: "c.md" });
    expect(await b).toBeNull(); // a newer peek's came
    // A tab's catch-up of a vault a peek's request reads, running: it rides on it, answered with its answer.
    const riding = askBacklinks({ root: "/r", rel: null });
    expect(sent.map((m) => m.rel)).toEqual(["a.md"]);
    reply(0);
    expect((await a)?.indexed).toBe(true);
    expect(await riding).toMatchObject({ indexed: true, rows: null });
    await settle();
    // The peek's before the tab's.
    expect(sent.map((m) => m.rel)).toEqual(["a.md", "c.md"]);
    reply(1, { rows: [{ from: "/r/x.md", shown: "x.md", line: 2, text: "c" }] });
    expect(await c).toMatchObject({ rows: [{ shown: "x.md", line: 2 }] });
    await settle();
    expect(sent.map((m) => m.rel)).toEqual(["a.md", "c.md", null]);
    // An answer that isn't one is refused.
    reply(2, { rows: [{ from: 1 }] });
    await expect(tab).rejects.toThrow("the thread's answer isn't one");
  } finally {
    stopBacklinkJobs();
  }
});

test("a peek into home with no index says so and builds none: home's is built in slices while nobody works (VV-D2, D259)", async () => {
  const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
  const notes = join(home, "notes");
  mkdirSync(join(notes, ".slipbox"), { recursive: true });
  writeFileSync(join(notes, "index.md"), "# Index\n\n[the list](../todo.md)\n");
  writeFileSync(join(home, "todo.md"), "# To do\n");
  const before = process.env.HOME;
  process.env.HOME = home;
  try {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    expect(h.app.view!.buf.abs).toBe(join(home, "todo.md"));
    expect(peekOf(h.app)!.reading).toBeUndefined();
    expect(h.frame()).toContain("Linked from: ~ has no index here yet — o goes there, and finds them.");
    expect(existsSync(join(cacheDir(homeAt(home)), "index.json"))).toBe(false);
  } finally {
    process.env.HOME = before;
  }
});

test("ctrl+o back to a row of a peek's backlinks puts the cursor on that row, once the list has come (#10)", async () => {
  const { base, notes, app } = twoVaults({ "app/plan.md": "# Plan\n\nAfter [the design](design.md).\n" });
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    await read(h);
    const v = h.app.view!;
    const row = h.app.currentLayout(v).links.find((l) => l.text.startsWith("plan.md:3"))!;
    h.app.moveCursor(v, { row: row.line, col: row.col });
    const line = h.app.view!.curAnchor.anchor.line;
    await h.keys("enter");
    expect(h.app.view!.buf.abs).toBe(join(app, "plan.md"));
    await h.keys("ctrl+o");
    // Back, the list it showed here at once, the cursor on its row — before the thread's comes again.
    expect(h.app.view!.buf.abs).toBe(join(app, "design.md"));
    expect(h.app.view!.buf.source).toContain("[plan.md:3](<plan.md#L3>)");
    h.frame();
    expect(h.app.view!.curAnchor.anchor.line).toBe(line);
    // A key meanwhile moves it, and the list come again leaves it where the key did.
    await h.keys("k");
    const moved = h.app.view!.curAnchor.anchor.line;
    expect(moved).toBeLessThan(line);
    await read(h);
    h.frame();
    expect(h.app.view!.curAnchor.anchor.line).toBe(moved);
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

/** A thread that answers when told: the requests it was sent, and whether it was let go. */
function fakeThread() {
  const sent: { id: number; root: string; rel: string | null }[] = [];
  const thread = { onmessage: null as ((e: { data: unknown }) => void) | null, stopped: 0, started: 0 };
  backlinkThread.factory = () => {
    thread.started++;
    thread.onmessage = null;
    return Object.assign(thread, {
      onerror: null,
      postMessage: (m: (typeof sent)[number]) => sent.push(m),
      terminate() {
        thread.stopped++;
      },
    }) as unknown as Worker;
  };
  const reply = (i: number, data: object = {}) =>
    thread.onmessage!({
      data: {
        id: sent[i]!.id,
        indexed: true,
        wrote: false,
        others: [],
        signature: "s",
        config: "c",
        rows: sent[i]!.rel === null ? null : [],
        ...data,
      },
    });
  return { sent, thread, reply };
}

test("a kept tab's catch-up running gives way to a peek's request, and runs again after it; a new environment, a new thread", async () => {
  stopBacklinkJobs();
  const { sent, thread, reply } = fakeThread();
  const settle = () => Bun.sleep(0);
  try {
    const tab = askBacklinks({ root: "/big", rel: null });
    expect(sent.map((m) => m.rel)).toEqual([null]);
    const peek = askBacklinks({ root: "/r", rel: "a.md" });
    await settle();
    // The tab's taken back (its thread let go), the peek's sent to a new one; then the tab's again.
    expect(thread.stopped).toBe(1);
    expect(sent.map((m) => m.rel)).toEqual([null, "a.md"]);
    reply(1);
    expect((await peek)?.indexed).toBe(true);
    await settle();
    expect(sent.map((m) => m.rel)).toEqual([null, "a.md", null]);
    reply(2);
    expect((await tab)?.indexed).toBe(true);
    // The environment changed (a test's sandbox, a folder of its own): the next request starts a thread anew.
    const started = thread.started;
    process.env.SLIPBOX_TEST_MARK = "changed";
    try {
      const again = askBacklinks({ root: "/r", rel: "b.md" });
      await settle();
      expect(thread.started).toBe(started + 1);
      reply(3);
      await again;
    } finally {
      delete process.env.SLIPBOX_TEST_MARK;
    }
  } finally {
    stopBacklinkJobs();
  }
});

test("a file of another vault read here asks its thread to catch that vault up only once it's shown: refused or read alone, never (#10)", async () => {
  const { base, notes, app } = twoVaults({ "app/data.txt": "text\u0000with a NUL\n" });
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      expect(h.app.buffer(join(app, "data.txt"))).toBeNull();
      // Read for an edit (a language server's), never shown: nothing asked of the thread.
      const buf = h.app.buffer(join(app, "design.md"))!;
      expect(buf).not.toBeNull();
      await Bun.sleep(0);
      expect(sent).toEqual([]);
      h.app.makeView(buf);
      await Bun.sleep(0);
      expect(sent.map((m) => [m.root, m.rel])).toEqual([[app, null]]);
      // Its catch-up done, another view of it (a split): not asked again.
      reply(0);
      await Bun.sleep(0);
      h.app.makeView(buf);
      await Bun.sleep(0);
      expect(sent.map((m) => [m.root, m.rel])).toEqual([[app, null]]);
    });
  } finally {
    stopBacklinkJobs();
  }
});

test("going into the peeked vault lets go of what its thread works on: its answer would find nobody (#10)", async () => {
  const { base, notes, app } = twoVaults();
  stopBacklinkJobs();
  const { sent, thread } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      expect(sent.map((m) => m.rel)).toEqual(["design.md"]);
      const reading = peekOf(h.app)!.reading;
      await h.keys("o");
      expect(h.app.loc.root).toBe(app);
      expect(thread.stopped).toBe(1);
      await reading; // answered null: nothing shown, nothing waited for
    });
  } finally {
    stopBacklinkJobs();
  }
});

test("two answers for a vault whose settings changed, the first still catching its graph up: every buffer on the graph there after (#10)", async () => {
  const { base, notes, app } = twoVaults();
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  const probe = peekProbe.followed;
  let open!: () => void;
  const gate = new Promise<void>((r) => {
    open = r;
  });
  peekProbe.followed = async (root) => {
    await gate;
    return probe(root);
  };
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      // A tab of app's file: its catch-up answered first, with settings other than its graph's; its probe held back.
      const tab = h.app.buffer(join(app, "links.md"))!;
      h.app.makeView(tab);
      await Bun.sleep(0);
      reply(0, { config: "other settings" });
      await Bun.sleep(0);
      // A peek meanwhile, its answer the same while the first catch-up waits.
      await h.keys("tab", "enter");
      const peek = peekOf(h.app)!;
      await Bun.sleep(0);
      expect(sent.map((m) => m.rel)).toEqual([null, "design.md"]);
      reply(1, { config: "other settings" });
      await Bun.sleep(0);
      open();
      await peek.reading;
      for (let i = 0; i < 20; i++) await Bun.sleep(1);
      const now = vaultGraph(h.app, app);
      expect(tab.elsewhere?.graph).toBe(now);
      expect(h.app.view!.buf.elsewhere?.graph).toBe(now);
    });
  } finally {
    peekProbe.followed = probe;
    stopBacklinkJobs();
  }
});

test("a graph let go of, opened anew with other settings, stops being parsed here: its index never written over the new one (#10)", async () => {
  const { base, notes, app } = twoVaults();
  // Since app's index: many notes, none parsed, so its graph here is parsed a slice at a time for a while.
  for (let i = 0; i < 3000; i++) writeFileSync(join(app, `m${i}.md`), `# M${i}\n\n[design](design.md)\n`);
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  const parsedOf = new Map<Graph, number>();
  const parseSome = Graph.prototype.parseSome;
  Graph.prototype.parseSome = function (this: Graph, ...args: Parameters<Graph["parseSome"]>) {
    parsedOf.set(this, (parsedOf.get(this) ?? 0) + 1);
    return parseSome.apply(this, args);
  };
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      const g0 = vaultGraph(h.app, app)!;
      // Its walk other than the thread's, its index not written: opened again here, then parsed a slice at a time. (The
      // peek's request: its opening asked a catch-up of the vault first, which the peek's took back.)
      expect(sent.at(-1)?.rel).toBe("design.md");
      reply(sent.length - 1, { signature: "another walk", config: configSignature(g0.config) });
      await peekOf(h.app)!.reading;
      for (let i = 0; i < 50 && !parsedOf.get(g0); i++) await Bun.sleep(2);
      expect(parsedOf.get(g0)).toBeGreaterThan(0);
      // The next peek's answer: other settings — the graph opened anew, the old one let go of.
      await h.keys("esc", "enter");
      await Bun.sleep(0);
      reply(sent.length - 1, { config: "other settings" });
      await peekOf(h.app)!.reading;
      expect(vaultGraph(h.app, app)).not.toBe(g0);
      const then = parsedOf.get(g0)!;
      await Bun.sleep(300);
      expect(parsedOf.get(g0)! - then).toBeLessThanOrEqual(1);
      expect(g0.pendingCount).toBeGreaterThan(0);
      h.app.quitting = true; // the new graph's parse, stopped with the test
    });
  } finally {
    Graph.prototype.parseSome = parseSome;
    stopBacklinkJobs();
  }
});

test("a vault caught up once at a time: a tab's catch-up rides on the request of its vault, waits again if it's taken back", async () => {
  stopBacklinkJobs();
  const { sent, thread, reply } = fakeThread();
  const settle = () => Bun.sleep(0);
  try {
    const running = askBacklinks({ root: "/a", rel: null });
    const twice = askBacklinks({ root: "/a", rel: null }); // rides on the one running: another graph's, say
    const waiting = askBacklinks({ root: "/b", rel: null });
    const peekB = askBacklinks({ root: "/b", rel: "n.md" });
    // /a's taken back for the peek's: it and the one riding on it wait again.
    await settle();
    expect(sent.map((m) => [m.root, m.rel])).toEqual([
      ["/a", null],
      ["/b", "n.md"],
    ]);
    reply(1);
    expect((await peekB)?.indexed).toBe(true);
    expect(await waiting).toMatchObject({ indexed: true, rows: null }); // rode on the peek's of /b
    await settle();
    expect(sent.map((m) => m.root)).toEqual(["/a", "/b", "/a"]);
    reply(2, { others: ["nested"] });
    // Taken back mid-run, /a's index may have been written by the run let go: said written, so it's read again.
    expect(await running).toMatchObject({ indexed: true, wrote: true, others: ["nested"] });
    // The one riding on it answered by the same run, its index's write said by the one it rode on alone.
    expect(await twice).toMatchObject({ indexed: true, rows: null, wrote: false, others: [] });
    // A peek's request of a vault whose catch-up runs waits for it: that work is its own, its thread kept.
    const stopped = thread.stopped;
    const tab = askBacklinks({ root: "/c", rel: null });
    const peekC = askBacklinks({ root: "/c", rel: "m.md" });
    await settle();
    expect(thread.stopped).toBe(stopped);
    expect(sent.filter((m) => m.root === "/c").map((m) => m.rel)).toEqual([null]);
    reply(sent.length - 1);
    expect(await tab).toMatchObject({ indexed: true, wrote: false });
    await settle();
    expect(sent.filter((m) => m.root === "/c").map((m) => m.rel)).toEqual([null, "m.md"]);
    reply(sent.length - 1);
    expect((await peekC)?.indexed).toBe(true);
  } finally {
    stopBacklinkJobs();
  }
});

test("a write never goes through what's already at its temporary file's name: another name taken", () => {
  const dir = mkdtempSync(join(sandbox, "tmp-"));
  const victim = join(dir, "victim.txt");
  writeFileSync(victim, "as it was\n");
  const target = join(dir, "note.md");
  const names = ["aaaaaaaa", "bbbbbbbb"];
  const random = tempRandom.next;
  tempRandom.next = () => names.shift() ?? "cccccccc";
  try {
    // Something already at the name the first write would take.
    symlinkSync(victim, join(dir, `.note.md.slipbox-${process.pid}-0-aaaaaaaa.tmp`));
    atomicWrite(target, "the note\n");
  } finally {
    tempRandom.next = random;
  }
  expect(readFileSync(target, "utf8")).toBe("the note\n");
  expect(readFileSync(victim, "utf8")).toBe("as it was\n");
});

test("a note linked from more than the thread's mailbox held at once still lists them all (#10)", async () => {
  const { base, notes } = twoVaults();
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      // An answer past the 16 MB a mailbox takes by default.
      const row = { from: "/v/a.md", shown: "a.md", line: 1, text: "x".repeat(9_000_000) };
      reply(sent.length - 1, { rows: [row] });
      expect(await read(h)).toContain("**Linked from** (1):");
    });
  } finally {
    stopBacklinkJobs();
  }
});

test("an answer without rows for a note's backlinks is said not worked out, and nothing throws (#10)", async () => {
  const { base, notes } = twoVaults();
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      reply(sent.length - 1, { rows: null });
      expect(await read(h)).toContain("**Linked from:** not worked out — the thread's answer isn't one.");
    });
    // Nor one that doesn't say whether it wrote another vault's index.
    const catchUp = askBacklinks({ root: "/r", rel: null });
    await Bun.sleep(0);
    reply(sent.length - 1, { others: undefined });
    await expect(catchUp).rejects.toThrow("the thread's answer isn't one");
    const keys = askBacklinks({ root: "/r", rel: null });
    await Bun.sleep(0);
    reply(sent.length - 1, { others: [1] });
    await expect(keys).rejects.toThrow("the thread's answer isn't one");
  } finally {
    stopBacklinkJobs();
  }
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

test("the other vault's index unwritable, a second peek while its notes are parsed here doesn't start them again (#10)", async () => {
  const { base, notes, app } = twoVaults();
  for (let i = 0; i < 3000; i++) writeFileSync(join(app, `m${i}.md`), `# M${i}\n\n[design](design.md)\n`);
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      const g = vaultGraph(h.app, app)!;
      const config = configSignature(g.config);
      reply(sent.length - 1, { signature: "another walk", config });
      await peekOf(h.app)!.reading;
      for (let i = 0; i < 100 && g.pendingCount > 2900; i++) await Bun.sleep(2);
      const left = g.pendingCount;
      expect(left).toBeLessThan(3000);
      // The next peek's answer, the walk as the graph's now: no rebuild, the parse going on.
      await h.keys("esc", "enter");
      await Bun.sleep(0);
      reply(sent.length - 1, { signature: (await import("../src/core/backlinks-jobs.ts")).vaultSignature(g), config });
      await peekOf(h.app)!.reading;
      expect(g.pendingCount).toBeLessThanOrEqual(left);
      h.app.quitting = true;
    });
  } finally {
    stopBacklinkJobs();
  }
});

test("a peek's backlinks shown before the graph here is caught up: its probe of a link that may not answer doesn't hold them (#10)", async () => {
  const { base, notes } = twoVaults();
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  const probe = peekProbe.followed;
  let open!: () => void;
  const gate = new Promise<void>((r) => {
    open = r;
  });
  peekProbe.followed = async (root) => {
    await gate;
    return probe(root);
  };
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      const row = { from: join(base, "app", "links.md"), shown: "links.md", line: 1, text: "design" };
      reply(sent.length - 1, { signature: "another walk", rows: [row] });
      for (let i = 0; i < 50 && !h.app.view!.buf.source.includes("(1)"); i++) await Bun.sleep(2);
      expect(h.app.view!.buf.source).toContain("**Linked from** (1):");
      open();
      await peekOf(h.app)!.reading;
    });
  } finally {
    peekProbe.followed = probe;
    stopBacklinkJobs();
  }
});

test("a rename that makes a vault gives this TUI a new reach: a kept tab and the peek open read through it, the peek's backlinks shown (#10)", async () => {
  const { base, notes, app } = twoVaults({ "notes/sub/s.md": "# S\n" });
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      const tab = h.app.buffer(join(app, "links.md"))!;
      h.app.makeView(tab);
      await h.keys("tab", "enter");
      // The tab's catch-up of that vault first: the peek's request waits for it.
      expect(sent.map((m) => m.rel)).toEqual([null]);
      reply(0);
      for (let i = 0; i < 100 && !sent.some((m) => m.rel === "design.md"); i++) await Bun.sleep(5);
      const was = h.app.reach;
      h.app.renaming.apply(planMakeVault(h.app.graph, "sub", null));
      expect(h.app.reach).not.toBe(was);
      expect(tab.elsewhere?.graph).toBe(vaultGraph(h.app, app));
      expect(peekOf(h.app)).not.toBeNull();
      expect(h.app.view!.buf.elsewhere?.graph).toBe(vaultGraph(h.app, app));
      const row = { from: join(app, "links.md"), shown: "links.md", line: 1, text: "design" };
      reply(
        sent.findLastIndex((m) => m.rel === "design.md"),
        { rows: [row] },
      );
      expect(await read(h)).toContain("**Linked from** (1):");
    });
  } finally {
    stopBacklinkJobs();
  }
});

test("Graph.writtenAt: set when it writes its index, not when it has nothing to write or can't (#10)", () => {
  const { app } = twoVaults();
  const loc = locateVault({ root: app });
  expect(openGraph(loc, DEFAULT_CONFIG, true, "lazy").writtenAt).toBeNull(); // fresh: nothing to write
  writeFileSync(join(app, "more.md"), "# More\n");
  const g = openGraph(loc, DEFAULT_CONFIG, true, "lazy");
  g.ensureAll();
  expect(g.writtenAt).toBeNumber();
  const index = join(cacheDir(loc), "index.json");
  rmSync(index);
  mkdirSync(index);
  writeFileSync(join(app, "again.md"), "# Again\n");
  const failed = openGraph(loc, DEFAULT_CONFIG, true, "lazy");
  failed.ensureAll();
  expect(failed.writtenAt).toBeNull();
});

test("a rename's new reach while a peek's request runs: its answer catches up the new reach's graph, a newer name found (#10)", async () => {
  const { base, notes, app } = twoVaults({
    "notes/sub/s.md": "# S\n",
    "app/design.md": "# Design\n\nSee [[Far Name]].\n",
  });
  // Since app's index: a note declaring the name.
  writeFileSync(join(app, "far.md"), "---\naliases: [Far Name]\n---\n# Far\n");
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      const asked = sent.findLastIndex((m) => m.rel === "design.md");
      const old = vaultGraph(h.app, app)!;
      h.app.renaming.apply(planMakeVault(h.app.graph, "sub", null));
      const now = vaultGraph(h.app, app)!;
      expect(now).not.toBe(old);
      expect(now.pendingCount).toBeGreaterThan(0);
      // The old reach's request answered: its walk the new graph's, its settings too — the new graph caught up.
      reply(asked, { signature: "another walk", config: configSignature(now.config) });
      await read(h);
      for (let i = 0; i < 400 && now.pendingCount; i++) await Bun.sleep(5);
      expect(now.pendingCount).toBe(0);
      expect(now.resolveLink({ kind: "wiki", target: "Far Name" }, "design.md").path).toBe("far.md");
      h.app.quitting = true;
    });
  } finally {
    stopBacklinkJobs();
  }
});

test("a rename's new reach asks a catch-up for each other vault's graph it gives a tab, nothing else asking (#10)", async () => {
  const { base, notes, app } = twoVaults({ "notes/sub/s.md": "# S\n" });
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      h.app.makeView(h.app.buffer(join(app, "links.md"))!);
      await Bun.sleep(0);
      expect(sent.map((m) => [m.root, m.rel])).toEqual([[app, null]]);
      reply(0);
      await Bun.sleep(0);
      h.app.renaming.apply(planMakeVault(h.app.graph, "sub", null));
      await Bun.sleep(0);
      expect(sent.map((m) => [m.root, m.rel])).toEqual([
        [app, null],
        [app, null],
      ]);
    });
  } finally {
    stopBacklinkJobs();
  }
});

test("a tab's catch-up isn't lost when the peek's request it rides on is taken back for a newer peek's (#10)", async () => {
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  const settle = () => Bun.sleep(0);
  try {
    const peekB = askBacklinks({ root: "/b", rel: "n.md" });
    const tabA = askBacklinks({ root: "/a", rel: null });
    const peekA = askBacklinks({ root: "/a", rel: "n.md" }); // takes back /b's; /a's tab rides on it
    await settle();
    const peekC = askBacklinks({ root: "/c", rel: "n.md" }); // takes back /a's: its rider waits again
    expect(await peekB).toBeNull();
    expect(await peekA).toBeNull();
    await settle();
    expect(sent.map((m) => m.root)).toEqual(["/b", "/a", "/c"]);
    reply(2);
    expect((await peekC)?.indexed).toBe(true);
    await settle();
    expect(sent.at(-1)).toMatchObject({ root: "/a", rel: null });
    reply(sent.length - 1);
    expect((await tabA)?.indexed).toBe(true);
  } finally {
    stopBacklinkJobs();
  }
});

test("a peek's request running for another vault gives way to a newer peek's, and that vault is caught up after (#10)", async () => {
  const { base, notes, app } = twoVaults({
    "notes/index.md": "# Index\n\n[design](../app/design.md) and [t](../third/t.md)\n",
    "third/t.md": "# T\n",
  });
  initVault(join(base, "third"), `pthird${made}`);
  stopBacklinkJobs();
  const { sent, thread, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      expect(sent.map((m) => m.rel)).toEqual(["design.md"]);
      await h.keys("esc", "tab", "enter");
      await Bun.sleep(0);
      // app's taken back (its thread let go), the third's sent at once.
      expect(thread.stopped).toBe(1);
      expect(sent.map((m) => m.rel)).toEqual(["design.md", "t.md"]);
      reply(1);
      await read(h);
      await Bun.sleep(0);
      // Then app's vault caught up, as its peek would have.
      expect(sent.at(-1)).toMatchObject({ root: app, rel: null });
    });
  } finally {
    stopBacklinkJobs();
  }
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

test("a temporary file of the index left by a thread let go of mid-write is swept once it's old (#10)", async () => {
  const { base, notes, app } = twoVaults();
  const dir = cacheDir(locateVault({ root: app }));
  const old = join(dir, `.index.json.slipbox-1-7-deadbeef.tmp`);
  const fresh = join(dir, `.index.json.slipbox-1-8-cafebabe.tmp`);
  const other = join(dir, `.heads.json.slipbox-1-7-deadbeef.tmp`);
  for (const f of [old, fresh, other]) writeFileSync(f, "{");
  const hour = new Date(Date.now() - 2 * STALE_TEMP_MS);
  utimesSync(old, hour, hour);
  utimesSync(other, hour, hour);
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    await read(h);
  });
  expect(existsSync(old)).toBe(false);
  expect(existsSync(fresh)).toBe(true); // a write may be under way to it
  expect(existsSync(other)).toBe(true); // not the index's
  sweepTemps(dir, "heads.json");
  expect(existsSync(other)).toBe(false);
});

test("home with an index slipbox can't read (another version's) isn't indexed by a peek: home's is the background index's (VV-D2, #10)", async () => {
  const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
  const notes = join(home, "notes");
  mkdirSync(join(notes, ".slipbox"), { recursive: true });
  writeFileSync(join(notes, "index.md"), "# Index\n\n[the list](../todo.md)\n");
  writeFileSync(join(home, "todo.md"), "# To do\n");
  const before = process.env.HOME;
  process.env.HOME = home;
  try {
    const index = join(cacheDir(homeAt(home)), "index.json");
    mkdirSync(dirname(index), { recursive: true });
    const old = JSON.stringify({ version: 1, entries: {} });
    writeFileSync(index, old);
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    expect(await read(h)).toContain("has no index here yet");
    expect(readFileSync(index, "utf8")).toBe(old);
  } finally {
    process.env.HOME = before;
    stopBacklinkJobs();
  }
});

test("a vault whose settings changed and that can't be opened again: its buffers keep the graph they had (#10)", async () => {
  const { base, notes, app } = twoVaults();
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      const g = vaultGraph(h.app, app)!;
      // Opened again, it can't be (a graph that won't build).
      const build = Graph.prototype.build;
      Graph.prototype.build = function (this: Graph, ...args) {
        if (this !== g && this.root === g.root) throw new Error("can't be read");
        return build.apply(this, args);
      };
      try {
        reply(sent.length - 1, { config: "other settings" });
        await read(h);
      } finally {
        Graph.prototype.build = build;
      }
      expect(h.app.view!.buf.elsewhere?.graph).toBe(g);
      expect(h.app.reach.held(app)).toBe(g);
    });
  } finally {
    stopBacklinkJobs();
  }
});

test("the first peek into a vault whose index is behind starts one thread, asked the peek's request alone (#10)", async () => {
  const { base, notes } = twoVaults();
  writeFileSync(join(base, "app", "new.md"), "# New\n");
  stopBacklinkJobs();
  const { sent, thread } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      await Bun.sleep(0);
      expect(thread.started).toBe(1);
      expect(thread.stopped).toBe(0);
      expect(sent.map((m) => m.rel)).toEqual(["design.md"]);
    });
  } finally {
    stopBacklinkJobs();
  }
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

test("a vault taken from the machine's list (a search of every vault) asks its thread nothing: no link reached it (#10)", async () => {
  const { base, notes, app } = twoVaults({}, false);
  stopBacklinkJobs();
  const { sent } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      h.app.reach.graphAt(app, { known: true });
      await Bun.sleep(0);
      expect(sent).toEqual([]);
    });
  } finally {
    stopBacklinkJobs();
  }
});

test("the thread stopped under a peek's request: nothing asked again for its vault, as when its peek moved on (#10)", async () => {
  const { base, notes } = twoVaults();
  stopBacklinkJobs();
  const { sent } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      const reading = peekOf(h.app)!.reading;
      expect(sent.map((m) => m.rel)).toEqual(["design.md"]);
      stopBacklinkJobs();
      await reading;
      await Bun.sleep(0);
      expect(sent.map((m) => m.rel)).toEqual(["design.md"]);
    });
  } finally {
    stopBacklinkJobs();
  }
});

test("a write that fails leaves no temporary file behind (a full disk)", () => {
  const dir = mkdtempSync(join(sandbox, "fail-"));
  // What can't be written: the write throws, as on a full disk.
  expect(() => atomicWrite(join(dir, "note.md"), {} as unknown as Uint8Array)).toThrow();
  expect(readdirSync(dir).filter((n) => n.endsWith(".tmp"))).toEqual([]);
});

test("a third vault a peeked vault's links reach is caught up no more once that vault's graph is let go of (#10)", async () => {
  const { base, notes, app } = twoVaults({ "third/far.md": "# Far\n" });
  const third = join(base, "third");
  mkdirSync(join(third, ".slipbox"));
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      const peeked = vaultGraph(h.app, app)!;
      reply(sent.length - 1, { config: configSignature(peeked.config), signature: "another walk" });
      await read(h);
      // The peeked vault's links reach the third: its graph, held by the peeked vault's reach, asks its catch-up.
      const there = peeked.reach!.graphAt(third)!;
      await Bun.sleep(0);
      expect(sent.at(-1)).toMatchObject({ root: third, rel: null });
      expect(there.pendingCount).toBeGreaterThan(0);
      // The peeked vault's graph let go of — its settings changed — before the third's answer comes.
      await h.keys("esc", "enter");
      await Bun.sleep(0);
      reply(
        sent.findLastIndex((m) => m.rel === "design.md"),
        { config: "other settings" },
      );
      await read(h);
      expect(vaultGraph(h.app, app)).not.toBe(peeked);
      await Bun.sleep(0);
      reply(
        sent.findLastIndex((m) => m.root === third),
        { signature: "another walk", config: configSignature(there.config) },
      );
      await Bun.sleep(300);
      expect(there.pendingCount).toBeGreaterThan(0);
    });
  } finally {
    stopBacklinkJobs();
  }
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

test("a temporary file left beside a vault's index or its redirects is swept at their next write (#10)", () => {
  const { app } = twoVaults();
  const loc = locateVault({ root: app });
  const hour = new Date(Date.now() - 2 * STALE_TEMP_MS);
  const stale = (dir: string, name: string) => {
    mkdirSync(dir, { recursive: true });
    const f = join(dir, `.${name}.slipbox-1-7-deadbeef.tmp`);
    writeFileSync(f, "{");
    utimesSync(f, hour, hour);
    return f;
  };
  const index = stale(cacheDir(loc), "index.json");
  const redirects = stale(stateDir(loc), "redirects.json");
  writeFileSync(join(app, "more.md"), "# More\n");
  openGraph(loc, DEFAULT_CONFIG, true);
  expect(existsSync(index)).toBe(false);
  new Redirects(join(stateDir(loc), "redirects.json")).add([["a.md", "b.md"]]);
  expect(existsSync(redirects)).toBe(false);
});

test("home with an index of this version whose every note changed since is caught up, not said to have none (VV-D2, #10)", async () => {
  const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
  const notes = join(home, "notes");
  mkdirSync(join(notes, ".slipbox"), { recursive: true });
  writeFileSync(join(notes, "index.md"), "# Index\n\n[the list](../todo.md)\n");
  writeFileSync(join(home, "todo.md"), "# To do\n");
  const before = process.env.HOME;
  process.env.HOME = home;
  try {
    openGraph(homeAt(home), DEFAULT_CONFIG, true);
    expect(existsSync(join(cacheDir(homeAt(home)), "index.json"))).toBe(true);
    const later = new Date(Date.now() + 60_000);
    utimesSync(join(home, "todo.md"), later, later);
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    const text = await read(h);
    expect(text).not.toContain("has no index here yet");
    expect(text).toContain("**Linked from:** no note links here.");
  } finally {
    process.env.HOME = before;
    stopBacklinkJobs();
  }
});

test("a rename that unmakes a vault while a peek into it is open: its file isn't caught up as a vault any more (#10)", async () => {
  const { base, notes } = twoVaults({ "notes/sub/s.md": "# S\n", "notes/to-sub.md": "# To sub\n\n[s](sub/s.md)\n" });
  initVault(join(notes, "sub"), `psub${made}`);
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "to-sub.md" });
      await h.keys("tab", "enter");
      const buf = h.app.view!.buf;
      expect(buf.elsewhere?.graph).toBeTruthy();
      reply(sent.length - 1);
      await read(h);
      const asked = sent.length;
      h.app.renaming.apply(planUnmakeVault(h.app.graph, "sub"));
      await Bun.sleep(0);
      // Its file is this vault's now: read without a vault's links, nothing asked of the thread for it.
      expect(buf.elsewhere?.graph ?? null).toBeNull();
      expect(sent.length).toBe(asked);
    });
  } finally {
    stopBacklinkJobs();
  }
});

test("back at a place whose list its thread now can't give: its old rows not kept with it (#10)", async () => {
  const { base, notes, app } = twoVaults({
    "app/design.md": "# Design\n\nShip [the plan](plan.md).\n",
    "app/plan.md": "# Plan\n",
  });
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      const row = { from: join(app, "links.md"), shown: "links.md", line: 1, text: "design" };
      reply(sent.length - 1, { rows: [row] });
      await read(h);
      expect(peekOf(h.app)!.rows).toHaveLength(1);
      await h.keys("tab", "enter");
      expect(h.app.view!.buf.abs).toBe(join(app, "plan.md"));
      reply(sent.length - 1);
      await read(h);
      await h.keys("ctrl+o");
      expect(peekOf(h.app)!.rows).toHaveLength(1); // shown again at once
      reply(sent.length - 1, { indexed: false });
      await read(h);
      expect(peekOf(h.app)!.rows).toBeUndefined();
      expect(h.app.view!.buf.source).not.toContain("links.md");
    });
  } finally {
    stopBacklinkJobs();
  }
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

test("a request that fails is said failed to every one riding on it: each one's graph is parsed where it's held (#10)", async () => {
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    const peek = askBacklinks({ root: "/r", rel: "a.md" });
    const riding = askBacklinks({ root: "/r", rel: null });
    reply(0, { error: "out of memory" });
    const said = await Promise.allSettled([peek, riding]);
    expect(said.map((r) => (r.status === "rejected" ? (r.reason as Error).message : r.status))).toEqual([
      "out of memory",
      "out of memory",
    ]);
    expect(sent).toHaveLength(1);
  } finally {
    stopBacklinkJobs();
  }
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

test("this TUI's own vault, reached from a peeked vault's links, asks its thread nothing: its index and its state are this thread's (#10)", async () => {
  const { base, notes, app } = twoVaults();
  stopBacklinkJobs();
  const { sent } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      const own = vaultGraph(h.app, app)!.reach!.graphAt(notes)!;
      expect(own.indexBehind).toBe(true);
      await Bun.sleep(0);
      expect(sent.map((m) => m.root)).not.toContain(own.root);
    });
  } finally {
    stopBacklinkJobs();
  }
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

test("a write that fails says why, and leaves no temporary file behind, even when closing it fails too (a failing disk)", () => {
  const dir = mkdtempSync(join(sandbox, "close-"));
  const real = fs.closeSync;
  const close = spyOn(fs, "closeSync").mockImplementation((fd) => {
    real(fd);
    throw Object.assign(new Error("EIO: i/o error, close"), { code: "EIO" });
  });
  const write = spyOn(fs, "writeSync").mockImplementation(() => {
    throw Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });
  });
  try {
    expect(() => atomicWrite(join(dir, "note.md"), "text")).toThrow("ENOSPC");
    expect(readdirSync(dir)).toEqual([]);
    write.mockRestore();
    // Written, and its close failing: never renamed into place, nothing left behind.
    expect(() => atomicWrite(join(dir, "note.md"), "text")).toThrow("EIO");
    expect(readdirSync(dir)).toEqual([]);
  } finally {
    close.mockRestore();
    write.mockRestore();
  }
});

test("an answer that changes nothing of a graph a link opened records no root of it in the machine's list (#10)", async () => {
  const { base, notes, app } = twoVaults();
  const lab = join(realpathSync(app), "lab");
  mkdirSync(join(lab, ".slipbox"), { recursive: true });
  writeFileSync(join(lab, "n.md"), "# Lab\n");
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      const g = h.app.reach.graphAt(app, { known: true })!;
      keepCaughtUp(h.app, g);
      await Bun.sleep(0);
      reply(sent.length - 1, { signature: vaultSignature(g), config: configSignature(g.config) });
      for (let i = 0; i < 10; i++) await Bun.sleep(1);
      expect(readRoots().map((v) => v.path)).not.toContain(lab);
      // One that changes it: its roots found, and recorded.
      keepCaughtUp(h.app, g);
      await Bun.sleep(0);
      reply(sent.length - 1, { config: configSignature(g.config) });
      for (let i = 0; i < 100 && !readRoots().some((v) => v.path === lab); i++) await Bun.sleep(5);
      expect(readRoots().map((v) => v.path)).toContain(lab);
    });
  } finally {
    stopBacklinkJobs();
  }
});

test("a Reach's nested roots without an index, found: indexed, opened alone, or left alone, as it says (#10)", () => {
  const top = realpathSync(mkdtempSync(join(sandbox, "nested-")));
  const there = join(top, "there");
  const nested = join(there, "nested");
  for (const [dir, note] of [
    [there, "b.md"],
    [nested, "c.md"],
  ] as const) {
    mkdirSync(join(dir, ".slipbox"), { recursive: true });
    writeFileSync(join(dir, note), "# Note\n");
  }
  const loc = locateVault({ root: there });
  const g = openGraph(loc, DEFAULT_CONFIG, true, "lazy");
  const index = join(cacheDir(locateVault({ root: nested })), "index.json");
  const none = new Reach(loc, { record: false, nested: "none" });
  none.discover(g);
  expect(none.held(nested)).toBeUndefined();
  const open = new Reach(loc, { record: false, nested: "open" });
  open.discover(g);
  expect(open.held(nested)).toBeTruthy();
  expect(existsSync(index)).toBe(false);
  // Read alone, its others write nothing: its first index is written all the same.
  const built = new Reach(loc, { record: false, readOnly: true });
  built.discover(g);
  expect(existsSync(index)).toBe(true);
  expect(built.written()).toEqual([locateVault({ root: nested }).key]);
});

test("an answer that wrote an index but changes nothing of the graph here still lays every view out again: this vault's backlinks with it (#10)", async () => {
  const { base, notes, app } = twoVaults();
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      const g = h.app.reach.graphAt(app, { known: true })!;
      let laidOut = 0;
      const relayoutAll = h.app.relayoutAll.bind(h.app);
      h.app.relayoutAll = () => {
        laidOut++;
        relayoutAll();
      };
      keepCaughtUp(h.app, g);
      await Bun.sleep(0);
      reply(sent.length - 1, { wrote: true, signature: vaultSignature(g), config: configSignature(g.config) });
      for (let i = 0; i < 100 && !laidOut; i++) await Bun.sleep(1);
      expect(laidOut).toBe(1);
    });
  } finally {
    stopBacklinkJobs();
  }
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

test("a vault nested in the peeked one, built on the thread, is stamped indexed in the machine's list (20.9, #10)", async () => {
  const { base, notes, app } = twoVaults();
  const lab = join(realpathSync(app), "lab");
  mkdirSync(join(lab, ".slipbox"), { recursive: true });
  writeFileSync(join(lab, "n.md"), "# Lab\n");
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    await read(h);
    expect(readRoots().find((v) => v.path === lab)?.indexed).toBeString();
  });
});

test("an answer that wrote an index makes the explorer's rows again: a vault's says whether it has one (VV-D9, #10)", async () => {
  const { base, notes, app } = twoVaults();
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      const g = h.app.reach.graphAt(app, { known: true })!;
      let made = 0;
      const invalidate = h.app.explorer.invalidateTree.bind(h.app.explorer);
      h.app.explorer.invalidateTree = () => {
        made++;
        invalidate();
      };
      keepCaughtUp(h.app, g);
      await Bun.sleep(0);
      reply(sent.length - 1, { signature: vaultSignature(g), config: configSignature(g.config) });
      for (let i = 0; i < 10; i++) await Bun.sleep(1);
      expect(made).toBe(0); // nothing written
      keepCaughtUp(h.app, g);
      await Bun.sleep(0);
      reply(sent.length - 1, { wrote: true, signature: vaultSignature(g), config: configSignature(g.config) });
      for (let i = 0; i < 100 && !made; i++) await Bun.sleep(1);
      expect(made).toBe(1);
    });
  } finally {
    stopBacklinkJobs();
  }
});

test("home's notes its index lacks, its thread failing, aren't parsed here: home's are the background index's (VV-D2, #10)", async () => {
  const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
  const notes = join(home, "notes");
  mkdirSync(join(notes, ".slipbox"), { recursive: true });
  writeFileSync(join(notes, "index.md"), "# Index\n\n[the list](../todo.md)\n");
  writeFileSync(join(home, "todo.md"), "# To do\n");
  const before = process.env.HOME;
  process.env.HOME = home;
  try {
    openGraph(homeAt(home), DEFAULT_CONFIG, true);
    writeFileSync(join(home, "later.md"), "# Later\n"); // since home's index
    stopBacklinkJobs();
    backlinkThread.factory = () => {
      throw new Error("no threads here");
    };
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    expect(await read(h)).toContain("**Linked from:** not worked out");
    const g = vaultGraph(h.app, home)!;
    expect(g.pendingCount).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) await Bun.sleep(5);
    expect(g.pendingCount).toBeGreaterThan(0);
  } finally {
    process.env.HOME = before;
    stopBacklinkJobs();
  }
});

test("a run taken back stays said written until an answer reads its vault's index: one that can't keeps the mark (#10)", async () => {
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  const settle = () => Bun.sleep(0);
  try {
    const first = askBacklinks({ root: "/h", rel: "a.md" });
    const other = askBacklinks({ root: "/o", rel: "b.md" }); // takes /h's back, mid-run
    expect(await first).toBeNull();
    await settle();
    reply(sent.length - 1);
    await other;
    const unread = askBacklinks({ root: "/h", rel: null });
    await settle();
    reply(sent.length - 1, { indexed: false });
    expect(await unread).toEqual({ indexed: false });
    const read = askBacklinks({ root: "/h", rel: null });
    await settle();
    reply(sent.length - 1);
    expect(await read).toMatchObject({ indexed: true, wrote: true });
  } finally {
    stopBacklinkJobs();
  }
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

test("an answer with other settings for a graph a link opened finds the roots around it once, for the graph opened anew (#10)", async () => {
  const { base, notes, app } = twoVaults();
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  let discovered = 0;
  const discover = Reach.prototype.discover;
  Reach.prototype.discover = function (this: Reach, g) {
    discovered++;
    return discover.call(this, g);
  };
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      const g = h.app.reach.graphAt(app, { known: true })!;
      discovered = 0;
      keepCaughtUp(h.app, g);
      await Bun.sleep(0);
      reply(sent.length - 1, { config: "other settings" });
      for (let i = 0; i < 200 && h.app.reach.held(app) === g; i++) await Bun.sleep(1);
      expect(h.app.reach.held(app)).not.toBe(g);
      expect(discovered).toBe(1);
    });
  } finally {
    Reach.prototype.discover = discover;
    stopBacklinkJobs();
  }
});

test("an answer that changes nothing of the graph here still has its redirects read again: its thread may have found moves (17.12, #10)", async () => {
  const { base, notes, app } = twoVaults();
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      const g = h.app.reach.graphAt(app, { known: true })!;
      expect(g.redirects?.follow("old.md")).toBeNull();
      // Its thread found a move and wrote it; the walk here is the thread's.
      new Redirects(join(stateDir(locateVault({ root: app })), "redirects.json")).add([["old.md", "links.md"]]);
      keepCaughtUp(h.app, g);
      await Bun.sleep(0);
      reply(sent.length - 1, { signature: vaultSignature(g), config: configSignature(g.config) });
      for (let i = 0; i < 100 && g.redirects?.follow("old.md") !== "links.md"; i++) await Bun.sleep(1);
      expect(g.redirects?.follow("old.md")).toBe("links.md");
    });
  } finally {
    stopBacklinkJobs();
  }
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

test("a vault first taken from the machine's list (a widened search), then reached by a link: its catch-up asked then (#10)", async () => {
  const { base, notes, app } = twoVaults();
  writeFileSync(join(app, "far.md"), "---\naliases: [Far Name]\n---\n# Far\n"); // since its index
  stopBacklinkJobs();
  const { sent } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      const searched = h.app.reach.graphAt(app, { known: true })!;
      await Bun.sleep(0);
      expect(sent.filter((m) => m.root === searched.root)).toEqual([]);
      expect(h.app.reach.graphAt(app)).toBe(searched);
      await Bun.sleep(0);
      expect(sent.filter((m) => m.root === searched.root).map((m) => m.rel)).toEqual([null]);
      h.app.reach.graphAt(app);
      await Bun.sleep(0);
      expect(sent.filter((m) => m.root === searched.root)).toHaveLength(1);
    });
  } finally {
    stopBacklinkJobs();
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

test("home's walk made on the thread is never kept there; one made on the main thread is, by any graph of home (VV-D2, T12)", async () => {
  const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
  const notes = join(home, "notes");
  mkdirSync(join(notes, ".slipbox"), { recursive: true });
  writeFileSync(join(notes, "index.md"), "# Index\n\n[the list](../todo.md)\n");
  writeFileSync(join(home, "todo.md"), "# To do\n");
  const before = process.env.HOME;
  process.env.HOME = home;
  try {
    walkHomeNow(homeAt(home), DEFAULT_CONFIG); // its walk kept
    openGraph(homeAt(home), DEFAULT_CONFIG, true); // and its index
    const kept = join(cacheDir(homeAt(home)), "walk.json");
    const was = readFileSync(kept, "utf8");
    // A folder come since: the walk made now has it.
    mkdirSync(join(home, "later"));
    writeFileSync(join(home, "later", "a.md"), "# A\n");
    // Asked of the thread itself, as the peek asks.
    expect((await askBacklinks({ root: home, rel: "todo.md" }))?.indexed).toBe(true);
    expect(readFileSync(kept, "utf8")).toBe(was);
    // The TUI's graph of home, writing nothing else of home's: on this thread, its walk is kept.
    const reached = new Reach(locateVault({ root: notes }), { readOnly: true, record: false }).graphAt(home)!;
    expect(reached.notes.has("later/a.md")).toBe(true);
    expect(readFileSync(kept, "utf8")).toContain("later");
  } finally {
    process.env.HOME = before;
    stopBacklinkJobs();
  }
});

test("a vault nested in the peeked one since its last peek, built on the thread, is stamped indexed once it's recorded (20.9, #10)", async () => {
  const { base, notes, app } = twoVaults();
  await onlyRootsUnder(base, async () => {
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    await read(h);
    await h.keys("esc");
    const lab = join(realpathSync(app), "lab");
    mkdirSync(join(lab, ".slipbox"), { recursive: true });
    writeFileSync(join(lab, "n.md"), "# Lab\n");
    await h.keys("enter");
    await read(h);
    expect(readRoots().find((v) => v.path === lab)?.indexed).toBeString();
  });
});

test("a temporary file only minutes old isn't swept: another writer's, on a share whose clock is behind (#10)", () => {
  const dir = mkdtempSync(join(sandbox, "skew-"));
  const f = join(dir, ".index.json.slipbox-1-7-deadbeef.tmp");
  writeFileSync(f, "{");
  const minutes = new Date(Date.now() - 10 * 60_000);
  utimesSync(f, minutes, minutes);
  sweepTemps(dir, "index.json");
  expect(existsSync(f)).toBe(true);
  const hours = new Date(Date.now() - 2 * STALE_TEMP_MS);
  utimesSync(f, hours, hours);
  sweepTemps(dir, "index.json");
  expect(existsSync(f)).toBe(false);
});

test("a vault the machine's list opened, reached by a link later: recorded as seen then, as one a link opens is (17.11, #10)", async () => {
  const { base, notes } = twoVaults();
  // A vault nothing here links to.
  const far = join(realpathSync(base), "far");
  mkdirSync(far);
  writeFileSync(join(far, "a.md"), "# A\n");
  initVault(far, `pfar${made}`);
  stopBacklinkJobs();
  fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      const seen = () => readRoots().find((v) => v.path === far)?.seen;
      // Seen long ago: a reach records it again (17.11).
      const was = "2020-01-01T00:00:00.000Z";
      writeRoots(readRoots().map((v) => (v.path === far ? { ...v, seen: was } : v)));
      h.app.reach.graphAt(far, { known: true });
      expect(seen()).toBe(was);
      h.app.reach.graphAt(far);
      expect(seen()).not.toBe(was);
    });
  } finally {
    stopBacklinkJobs();
  }
});

test("several roots stamped indexed at once: each stamped, the machine's list written once (20.9)", async () => {
  const { base, notes, app } = twoVaults();
  await onlyRootsUnder(base, async () => {
    for (const root of [notes, app]) recordLocation(locateVault({ root }));
    const keys = [notes, app].map((root) => locateVault({ root }).key);
    let writes = 0;
    const rename = fs.renameSync;
    const spy = spyOn(fs, "renameSync").mockImplementation((from, to) => {
      writes++;
      return rename(from, to);
    });
    try {
      noteIndexed(keys, new Date("2026-10-24T05:00:00Z"));
    } finally {
      spy.mockRestore();
    }
    expect(writes).toBe(1);
    expect(
      readRoots()
        .filter((v) => keys.includes(v.key))
        .map((v) => v.indexed),
    ).toEqual(["2026-10-24T05:00:00.000Z", "2026-10-24T05:00:00.000Z"]);
  });
});

test("the vault an answer wrote the index of is stamped indexed even when catching the graph here up fails (20.9, #10)", async () => {
  const { base, notes, app } = twoVaults();
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      const g = vaultGraph(h.app, app)!;
      const build = Graph.prototype.build;
      Graph.prototype.build = function (this: Graph, ...args) {
        if (this === g) throw new Error("can't be read");
        return build.apply(this, args);
      };
      try {
        reply(sent.length - 1, { wrote: true, config: configSignature(g.config) });
        await read(h);
      } finally {
        Graph.prototype.build = build;
      }
      expect(readRoots().find((v) => v.key === g.loc.key)?.indexed).toBeString();
    });
  } finally {
    stopBacklinkJobs();
  }
});

test("nested vaults an answer built aren't stamped once slipbox is quitting (#10)", async () => {
  const { base, notes, app } = twoVaults();
  const lab = join(realpathSync(app), "lab");
  mkdirSync(join(lab, ".slipbox"), { recursive: true });
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  const probe = peekProbe.followed;
  let open!: () => void;
  const gate = new Promise<void>((r) => {
    open = r;
  });
  peekProbe.followed = async (root) => {
    await gate;
    return probe(root);
  };
  try {
    await onlyRootsUnder(base, async () => {
      recordLocation(locateVault({ root: lab }));
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      const peek = peekOf(h.app)!;
      const g = vaultGraph(h.app, app)!;
      // An answer that changes the graph here: its rebuild waits on the probe, and slipbox quits meanwhile.
      reply(sent.length - 1, { others: [locateVault({ root: lab }).key], config: configSignature(g.config) });
      await Bun.sleep(0);
      let laidOut = 0;
      h.app.relayoutAll = () => {
        laidOut++;
      };
      h.app.quitting = true;
      open();
      await peek.reading;
      expect(readRoots().find((v) => v.path === lab)?.indexed).toBeUndefined();
      expect(laidOut).toBe(0); // nothing laid out for a screen going away
    });
  } finally {
    peekProbe.followed = probe;
    stopBacklinkJobs();
  }
});

test("home's graph opened anew for changed settings, with notes it still lacks: neither parsed here nor asked again — they wait for home's next peek (VV-D2, #10)", async () => {
  const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
  const notes = join(home, "notes");
  mkdirSync(join(notes, ".slipbox"), { recursive: true });
  writeFileSync(join(notes, "index.md"), "# Index\n\n[the list](../todo.md)\n");
  writeFileSync(join(home, "todo.md"), "# To do\n");
  const before = process.env.HOME;
  process.env.HOME = home;
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    openGraph(homeAt(home), DEFAULT_CONFIG, true);
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    const g = vaultGraph(h.app, home)!;
    const asked = sent.length;
    // A note come since the thread's walk: the graph opened anew lacks it.
    writeFileSync(join(home, "later.md"), "# Later\n");
    reply(sent.length - 1, { config: "other settings" });
    await read(h);
    for (let i = 0; i < 40; i++) await Bun.sleep(1);
    const fresh = vaultGraph(h.app, home)!;
    expect(fresh).not.toBe(g);
    expect(fresh.pendingCount).toBeGreaterThan(0);
    // Asked again, it would be again at each answer for a note slipbox can't read: never done.
    expect(sent.slice(asked)).toEqual([]);
  } finally {
    process.env.HOME = before;
    stopBacklinkJobs();
  }
});

test("a root the machine's list opened, recorded when a link reaches it: that failing, the link is resolved all the same (#10)", async () => {
  const { base, notes } = twoVaults();
  const far = join(realpathSync(base), "far");
  mkdirSync(far);
  writeFileSync(join(far, "a.md"), "# A\n");
  initVault(far, `pfar${made}`);
  stopBacklinkJobs();
  fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      const h = await harness({ root: notes, open: "index.md" });
      const g = h.app.reach.graphAt(far, { known: true })!;
      const spy = spyOn(vaultModule, "recordLocation").mockImplementation(() => {
        throw new Error("the machine's list can't be written");
      });
      try {
        expect(h.app.reach.graphAt(far)).toBe(g);
      } finally {
        spy.mockRestore();
      }
    });
  } finally {
    stopBacklinkJobs();
  }
});
