// A changed note's text, and the background parse's, read on the disk threads (SD-T6; SD-D3, SD-D5, SD-D6, SD-D12):
// the watcher's batch applied once its texts come, an open note reloaded from what was read, the background parse
// going on with the notes that answer, and a key that needs every note waiting for them, `esc` giving it up. What waits
// is told by the hold (`Hold`): the disk threads' reads of a `held` folder held, and this thread's too, so a read put
// back here holds the test past the hold's deadline (`gaveUp`), and it fails.

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stamp } from "../../../../src/core/foundation/platform/fsutil.ts";
import type { WatchChange } from "../../../../src/core/workspace/graph/watch.ts";
import { BACKGROUND_PARSE } from "../../../../src/tui/documents/buffers/buffer.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { HELD_MS, type Hold } from "../../../fixtures/walk/slow.ts";
import { makeHeldKeys } from "../../../support/tui/held-keys.ts";
import { type Harness, harness, makeSandbox, statusRow } from "../../../tui-harness.ts";

const sandbox = makeSandbox();
const { holding, untilHeld } = makeHeldKeys();

/** A folder of `files` (path → text) in the sandbox, by its real path. */
function tree(files: Record<string, string>): string {
  const dir = realpathSync(mkdtempSync(join(sandbox, "note-text-")));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

/** slipbox in a vault of `files`, `open` open: its reads on the disk threads, as the TUI's are. */
async function vaultWith(files: Record<string, string>, open = "index.md"): Promise<Harness> {
  const root = tree({ ".slipbox/config.toml": "", "index.md": "# Index\n", ...files });
  return harness({ root, open, listOffThread: true, config: (c) => void (c.render.notes = false) });
}

/** Its notes left to parse, as a first build without an index leaves them: stubs, for the background parse. */
function unparsed(h: Harness): void {
  h.app.watch.builds.offThread = false;
  h.app.graph.build(false, "lazy");
  h.app.watch.builds.offThread = true;
}

/** Every note in `a/` parsed: the slices before `held`'s, in the walk's order. */
const othersParsed = (h: Harness) => !h.app.graph.unparsedOver(0).some((f) => f.rel.startsWith("a/"));

/** Awaited till `done` holds: said and thrown by HELD_MS. */
async function until(done: () => boolean, what: string): Promise<void> {
  const end = performance.now() + HELD_MS;
  while (!done()) {
    if (performance.now() > end) throw new Error(`${what} never came`);
    await Bun.sleep(5);
  }
}

/** The watcher's word that `rel` changed (or `kind`), given to the feed. */
function told(h: Harness, rel: string, kind: WatchChange["kind"] = "changed"): void {
  h.app.feed.receive({ changes: [{ rel, kind, isNote: true }], rescan: false });
}

/** Once the feed has applied what it holds, its texts in. */
const applied = (h: Harness) => new Promise<void>((resolve) => h.app.feed.whenApplied(resolve));

/** A key handled, and drawn, while a disk thread waits in `held`. */
async function keyMeanwhile(h: Harness, held: Hold): Promise<void> {
  await h.keys("ctrl+p");
  expect(h.frame()).toContain("Open note");
  await h.keys("escape");
  expect(held.waiting).toBeGreaterThanOrEqual(1);
}

/** The Info panel's count of the open note's backlinks, as it shows it. */
const backlinksShown = (h: Harness) => h.app.info.rows().find((r) => r.key === "backlinks")?.value;
const said = (h: Harness) => h.app.messages.map((m) => m.text);
const backlinks = (h: Harness, rel: string) =>
  h.app.graph
    .backlinks(rel)
    .map((b) => b.from)
    .sort();

describe("a changed note's text read on a disk thread (SD-T6)", () => {
  test("held: a note under `held` rewritten by an agent — its batch waits for its text, a key handled and drawn meanwhile; let go, its new links and backlinks are in the graph", async () => {
    const h = await vaultWith({ "held/a.md": "# A\n", "b.md": "# B\n" });
    const held = holding();
    writeFileSync(join(h.root, "held/a.md"), "# A\n\n[[b]]\n");
    told(h, "held/a.md");
    await untilHeld(held);
    await keyMeanwhile(h, held);
    expect(backlinks(h, "b.md")).toEqual([]);
    held.release();
    await until(() => backlinks(h, "b.md").includes("held/a.md"), "its backlink");
    expect(h.app.graph.linksOf("held/a.md").map((l) => l.path)).toEqual(["b.md"]);
    expect(held.gaveUp).toBe(0);
  });

  test("held: an open note under `held` rewritten — `↻ … reloaded` once let go; typed into before it came, the conflict prompt asks instead", async () => {
    const h = await vaultWith({ "held/n.md": "# N\n" }, "held/n.md");
    let held = holding();
    writeFileSync(join(h.root, "held/n.md"), "# N, rewritten\n");
    told(h, "held/n.md");
    await untilHeld(held);
    await keyMeanwhile(h, held);
    expect(h.app.view!.buf.source).toBe("# N\n");
    held.release();
    await until(() => h.app.view!.buf.source === "# N, rewritten\n", "the note reloaded");
    expect(said(h)).toContain("↻ held/n.md changed on disk — reloaded");
    expect(held.gaveUp).toBe(0);
    // Typed into while its text is out: asked, never reloaded over what's typed. Held on the disk threads alone: what's
    // typed has the note's own problems read here, which isn't this read.
    held = holding(() => false);
    writeFileSync(join(h.root, "held/n.md"), "# N, again\n");
    told(h, "held/n.md");
    await untilHeld(held);
    await h.keys("A", "x", "escape");
    held.release();
    await until(() => h.app.overlay?.kind === "list", "the conflict prompt");
    expect((h.app.overlay as ListOverlay).title).toBe("held/n.md changed on disk, and you have unsaved changes");
    expect(h.app.view!.buf.source).toBe("# N, rewrittenx\n");
    expect(held.gaveUp).toBe(0);
  });

  test("held: an open note under `held` the watcher says came, its text unchanged — a key handled meanwhile; let go, it's neither reloaded nor asked about", async () => {
    const h = await vaultWith({ "held/n.md": "# N\n" }, "held/n.md");
    const version = h.app.view!.buf.version;
    const held = holding();
    told(h, "held/n.md", "created");
    await untilHeld(held);
    await keyMeanwhile(h, held);
    const done = applied(h);
    held.release();
    await done;
    expect(h.app.view!.buf.version).toBe(version);
    expect(h.app.overlay).toBeNull();
    expect(said(h).filter((t) => t.startsWith("↻"))).toEqual([]);
    expect(held.gaveUp).toBe(0);
  });

  test("held: an open file the graph doesn't know, the look found changed — read there, a key handled meanwhile; reloaded once let go", async () => {
    const h = await vaultWith({ "held/n.md": "# N\n" }, "held/n.md");
    const buf = h.app.view!.buf;
    // No note of the graph's: the look's news reloads it, not told to the graph.
    h.app.graph.removeFile("held/n.md");
    writeFileSync(join(h.root, "held/n.md"), "# N, rewritten\n");
    const at = stamp(buf.abs);
    const held = holding();
    h.app.watch.polled([{ buf, at }]);
    await untilHeld(held);
    await keyMeanwhile(h, held);
    expect(buf.source).toBe("# N\n");
    held.release();
    await until(() => buf.source === "# N, rewritten\n", "the file reloaded");
    expect(held.gaveUp).toBe(0);
  });

  test("races: a vault left while a batch's text is out drops it; a note changed twice ends as its second", async () => {
    const h = await vaultWith({ "held/a.md": "# A\n", "b.md": "# B\n" });
    let held = holding();
    writeFileSync(join(h.root, "held/a.md"), "# A\n\n[[b]]\n");
    told(h, "held/a.md");
    await untilHeld(held);
    // The vault left (its feed reset): the answer, when it comes, is for none.
    h.app.feed.reset();
    held.release();
    // Asked after it, one at a time across the threads: answered after it.
    writeFileSync(join(h.root, "b.md"), "# B, after\n");
    told(h, "b.md");
    await until(() => h.app.graph.notes.get("b.md")?.title === "B, after", "the later batch");
    expect(h.app.graph.linksOf("held/a.md")).toEqual([]);
    // Changed again while its first text was out: the graph ends as the second.
    held = holding();
    writeFileSync(join(h.root, "held/a.md"), "# A\n\n[[index]]\n");
    told(h, "held/a.md");
    await untilHeld(held);
    writeFileSync(join(h.root, "held/a.md"), "# A\n\n[[b]]\n");
    told(h, "held/a.md");
    held.release();
    await until(() => backlinks(h, "b.md").includes("held/a.md"), "the second text");
    await applied(h);
    expect(h.app.graph.linksOf("held/a.md").map((l) => l.path)).toEqual(["b.md"]);
    expect(held.gaveUp).toBe(0);
  });

  test("a batch's text not read in time: `⚠ disk not answering`, said once; read again a while later, then taken in and cleared", async () => {
    const h = await vaultWith({ "held/a.md": "# A\n", "b.md": "# B\n" });
    const held = holding(undefined, 300);
    h.app.feed.againMs = 50;
    writeFileSync(join(h.root, "held/a.md"), "# A\n\n[[b]]\n");
    told(h, "held/a.md");
    const gaveUp = "disk not answering: a change to a note wasn't read; it's read again in a minute";
    await until(() => said(h).includes(gaveUp), "the give-up said");
    expect(statusRow(h.frame())).toContain("⚠ disk not answering");
    expect(backlinks(h, "b.md")).toEqual([]);
    held.release();
    await until(() => backlinks(h, "b.md").includes("held/a.md"), "read again");
    expect(statusRow(h.frame())).not.toContain("disk not answering");
    expect(said(h).filter((t) => t === gaveUp)).toHaveLength(1);
    expect(held.gaveUp).toBe(0);
  });
});

describe("the background parse's texts read on the disk threads (SD-T6, SD-D12)", () => {
  /** A vault of a hundred notes, ten under `held`, each of those linking to `index.md` and tagged `#held`. */
  const hundred = (): Record<string, string> => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 90; i++) files[`a/n${i}.md`] = `# N${i}\n\n#plain\n`;
    for (let i = 0; i < 10; i++) files[`held/h${i}.md`] = `# H${i}\n\n#held [[index]]\n`;
    return files;
  };

  test("held: a vault of a hundred notes, ten under `held` — the parse goes on with the others, a key handled meanwhile; let go, all of them indexed", async () => {
    const h = await vaultWith(hundred());
    unparsed(h);
    expect(h.app.graph.pendingCount).toBeGreaterThanOrEqual(100);
    const held = holding();
    h.app.watch.indexInBackground();
    await untilHeld(held);
    await until(() => othersParsed(h), "the others parsed");
    await keyMeanwhile(h, held);
    held.release();
    await h.app.watch.whenIndexed();
    expect(h.app.graph.pendingCount).toBe(0);
    expect(backlinks(h, "index.md")).toHaveLength(10);
    expect(held.gaveUp).toBe(0);
  });

  test("held: a big note under `held` — read there before and after its parse on the parse threads; let go, indexed", async () => {
    const big = `# Big\n\n[[index]]\n\n${"words and more words\n".repeat(Math.ceil(BACKGROUND_PARSE / 20) + 10)}`;
    const h = await vaultWith({ "held/big.md": big });
    unparsed(h);
    const held = holding();
    h.app.watch.indexInBackground();
    await untilHeld(held);
    await keyMeanwhile(h, held);
    held.release();
    await h.app.watch.whenIndexed();
    expect(backlinks(h, "index.md")).toEqual(["held/big.md"]);
    expect(held.gaveUp).toBe(0);
  });

  test("held: the tags asked for, notes under `held` not parsed yet — `reading notes…`, a frame drawn, `esc` gives it up; let go, the list has their tags", async () => {
    const h = await vaultWith(hundred());
    unparsed(h);
    const held = holding();
    await h.app.run("tag.list");
    await untilHeld(held);
    expect(h.app.reads.busy).toBe(true);
    expect(statusRow(h.frame())).toContain("reading notes…");
    expect(h.app.overlay).toBeNull();
    // `esc`: given up, out of turn, nothing opened.
    h.app.input.handleKey("escape");
    await until(() => !h.app.reads.busy, "the wait given up");
    expect(h.app.overlay).toBeNull();
    expect(statusRow(h.frame())).not.toContain("reading notes…");
    // Asked again, let go: the list, their tag in it.
    await h.app.run("tag.list");
    expect(h.app.reads.busy).toBe(true);
    held.release();
    await h.app.reads.settled();
    const list = h.app.overlay as ListOverlay;
    expect(list.items.map((i) => i.label)).toEqual(["#held", "#plain"]);
    expect(list.items[0]!.hint).toBe("10 notes");
    expect(held.gaveUp).toBe(0);
  });

  test("held: a rename with a note under `held` not parsed yet waits, then repairs its link", async () => {
    const h = await vaultWith({ "b.md": "# B\n", "held/a.md": "# A\n\n[[b]]\n" }, "b.md");
    unparsed(h);
    const held = holding();
    await h.app.run("file.rename c");
    await untilHeld(held);
    expect(h.app.reads.busy).toBe(true);
    expect(h.app.overlay).toBeNull();
    held.release();
    await h.app.reads.settled();
    expect((h.app.overlay as ListOverlay).title).toContain("b.md → c.md");
    await h.keys("enter");
    expect(readFileSync(join(h.root, "held/a.md"), "utf8")).toBe("# A\n\n[[c]]\n");
    expect(held.gaveUp).toBe(0);
  });

  test("held: notes under `held` not parsed yet — the Problems tab and the Info panel drawn at once, their counts marked partial, a key handled meanwhile; let go, whole and the mark gone", async () => {
    const h = await vaultWith({ ...hundred(), "held/broken.md": "# Broken\n\n[[nowhere]]\n" });
    await h.app.run("problems.open");
    await h.app.run("info.toggle");
    unparsed(h);
    const held = holding();
    h.app.watch.indexInBackground();
    await untilHeld(held);
    await until(() => othersParsed(h), "the others parsed");
    const frame = h.frame();
    expect(frame).toMatch(/All \(\d+…\)/);
    expect(backlinksShown(h)).toMatch(/^\d+…$/);
    await keyMeanwhile(h, held);
    held.release();
    await h.app.watch.whenIndexed();
    const after = h.frame();
    expect(after).toMatch(/All \(1\)/);
    expect(backlinksShown(h)).toBe("10");
    expect(after).not.toContain("…)");
    expect(held.gaveUp).toBe(0);
  });
});
