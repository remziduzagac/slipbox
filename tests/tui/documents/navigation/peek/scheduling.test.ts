import { expect, spyOn, test } from "bun:test";

import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  askBacklinks,
  backlinkThread,
  configSignature,
  stopBacklinkJobs,
  vaultSignature,
} from "../../../../../src/core/workspace/graph/backlinks-jobs.ts";
import { DEFAULT_CONFIG } from "../../../../../src/core/application/config/config.ts";

import { Graph, openGraph } from "../../../../../src/core/workspace/graph/graph.ts";

import { stateDir } from "../../../../../src/core/foundation/platform/paths.ts";
import { Reach } from "../../../../../src/core/workspace/links/reach.ts";
import { readRoots, writeRoots } from "../../../../../src/core/workspace/vaults/registry.ts";
import { planMakeVault, planUnmakeVault } from "../../../../../src/core/workspace/mutations/rename/rename-vaults.ts";
import { Redirects } from "../../../../../src/core/workspace/links/redirects.ts";

import { homeAt, initVault, locateVault, recordLocation } from "../../../../../src/core/workspace/vaults/vault.ts";
import * as vaultModule from "../../../../../src/core/workspace/vaults/vault.ts";

import { keepCaughtUp, peekOf, peekProbe, vaultGraph } from "../../../../../src/tui/documents/navigation/peek.ts";
import { harness, onlyRootsUnder } from "../../../../tui-harness.ts";
import { makePeekFixture } from "../../../../support/tui/peek-fixture.ts";

// File-owned peek setup retains its model sandbox and afterEach mock reset.
const { sandbox, read, fakeThread } = makePeekFixture();

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
      reply(sent.length - 1, {
        signature: (await import("../../../../../src/core/workspace/graph/backlinks-jobs.ts")).vaultSignature(g),
        config,
      });
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
      spyOn(h.app, "relayoutAll").mockImplementation(() => {
        laidOut++;
        relayoutAll();
      });
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
      spyOn(h.app.explorer, "invalidateTree").mockImplementation(() => {
        made++;
        invalidate();
      });
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
      let laidOut = 0;
      const relayoutAll = h.app.relayoutAll.bind(h.app);
      spyOn(h.app, "relayoutAll").mockImplementation(() => {
        laidOut++;
        relayoutAll();
      });
      try {
        reply(sent.length - 1, { wrote: true, config: configSignature(g.config) });
        await read(h);
      } finally {
        Graph.prototype.build = build;
      }
      expect(readRoots().find((v) => v.key === g.loc.key)?.indexed).toBeString();
      // Every view laid out again all the same: this vault's backlinks from it are read again.
      expect(laidOut).toBeGreaterThan(0);
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
      spyOn(h.app, "relayoutAll").mockImplementation(() => {
        laidOut++;
      });
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

test("home's graph here with notes still to parse isn't built again at each answer: only when its index was written since, by anyone (VV-D2, #10)", async () => {
  const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
  const notes = join(home, "notes");
  mkdirSync(join(notes, ".slipbox"), { recursive: true });
  writeFileSync(join(notes, "index.md"), "# Index\n\n[the list](../todo.md)\n");
  writeFileSync(join(home, "todo.md"), "# To do\n");
  const before = process.env.HOME;
  process.env.HOME = home;
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  const build = Graph.prototype.build;
  try {
    openGraph(homeAt(home), DEFAULT_CONFIG, true);
    writeFileSync(join(home, "later.md"), "# Later\n"); // since home's index: to parse in the graph here
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter");
    const g = vaultGraph(h.app, home)!;
    expect(g.pendingCount).toBeGreaterThan(0);
    let built = 0;
    Graph.prototype.build = function (this: Graph, ...args) {
      if (this === g) built++;
      return build.apply(this, args);
    };
    const same = { signature: vaultSignature(g), config: configSignature(g.config) };
    reply(sent.length - 1, same);
    await read(h);
    expect(built).toBe(0);
    // Said written, the index the same: nothing to read again.
    keepCaughtUp(h.app, g);
    await Bun.sleep(0);
    reply(sent.length - 1, { ...same, wrote: true });
    for (let i = 0; i < 20; i++) await Bun.sleep(1);
    expect(built).toBe(0);
    // Written by another (the background index, the CLI), said by nobody: read again.
    openGraph(homeAt(home), DEFAULT_CONFIG, true);
    keepCaughtUp(h.app, g);
    await Bun.sleep(0);
    reply(sent.length - 1, same);
    for (let i = 0; i < 100 && !built; i++) await Bun.sleep(1);
    expect(built).toBe(1);
    expect(g.pendingCount).toBe(0);
  } finally {
    Graph.prototype.build = build;
    process.env.HOME = before;
    stopBacklinkJobs();
  }
});

test("a graph of home held by another reach, its catch-up riding on a run that wrote home's index: it reads that index too (VV-D2, #10)", async () => {
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
    writeFileSync(join(home, "later.md"), "---\naliases: [Later On]\n---\n# Later\n"); // since home's index
    const h = await harness({ root: notes, open: "index.md" });
    const a = h.app.reach.graphAt(home, { known: true })!;
    // Another reach's graph of home: a third vault's, say.
    const other = new Reach(locateVault({ root: notes }), { thorough: false, readOnly: true });
    const b = other.graphAt(home)!;
    expect(a).not.toBe(b);
    expect(b.pendingCount).toBeGreaterThan(0);
    keepCaughtUp(h.app, a);
    keepCaughtUp(h.app, b, () => other);
    await Bun.sleep(0);
    expect(sent).toHaveLength(1); // b's rides on a's
    // The run writes home's index, the later note in it.
    openGraph(homeAt(home), DEFAULT_CONFIG, true);
    reply(0, { wrote: true, signature: vaultSignature(b), config: configSignature(b.config) });
    for (let i = 0; i < 200 && (a.pendingCount || b.pendingCount); i++) await Bun.sleep(1);
    expect(b.pendingCount).toBe(0);
    expect(b.resolveLink({ kind: "wiki", target: "Later On" }, "todo.md").path).toBe("later.md");
  } finally {
    process.env.HOME = before;
    stopBacklinkJobs();
  }
});

test("nested vaults an answer built are stamped even when laying the screen out again fails (20.9, #10)", async () => {
  const { base, notes, app } = twoVaults();
  const lab = join(realpathSync(app), "lab");
  mkdirSync(join(lab, ".slipbox"), { recursive: true });
  stopBacklinkJobs();
  const { sent, reply } = fakeThread();
  try {
    await onlyRootsUnder(base, async () => {
      recordLocation(locateVault({ root: lab }));
      const h = await harness({ root: notes, open: "index.md" });
      await h.keys("tab", "enter");
      const peek = peekOf(h.app)!;
      const g = vaultGraph(h.app, app)!;
      spyOn(h.app, "relayoutAll").mockImplementation(() => {
        throw new Error("can't lay out");
      });
      reply(sent.length - 1, {
        others: [locateVault({ root: lab }).key],
        signature: vaultSignature(g),
        config: configSignature(g.config),
      });
      await peek.reading;
      expect(readRoots().find((v) => v.path === lab)?.indexed).toBeString();
    });
  } finally {
    stopBacklinkJobs();
  }
});
