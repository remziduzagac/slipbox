// A note opened reads on a disk thread (SD-T5, SD-D4): the key waits for it, the keys after it wait their turn and act
// on the note once it's there, the screen draws meanwhile (`reading <note>…`), and `esc` gives it up. What waits is
// told by the hold (`Hold`), never by a clock (#75): its folder `held`, held on the disk threads and on this thread
// too, so a read put back here holds the key past the hold's deadline (`gaveUp`) and the test fails.

import { describe, expect, spyOn, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setReadWait } from "../../../../src/core/foundation/platform/disk.ts";
import { tildePath } from "../../../../src/core/foundation/platform/paths.ts";
import type { SessionTab } from "../../../../src/core/workspace/session/position.ts";
import { elsewhereAt } from "../../../../src/core/workspace/vaults/vault.ts";
import { diskThreads } from "../../../../src/core/workspace/walk/walk-thread.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { peekAt, peekOf, peekStep } from "../../../../src/tui/documents/navigation/peek.ts";
import { makeHeldKeys } from "../../../support/tui/held-keys.ts";
import { type Harness, harness, makeSandbox, makeVault } from "../../../tui-harness.ts";

const sandbox = makeSandbox();
const { holding, untilHeld, threadsStopped } = makeHeldKeys();

/** A vault with `files` (path → text) besides its own, opened in source mode, its key reads on the disk threads. */
async function vaultWith(files: Record<string, string>, root = makeVault()): Promise<Harness> {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  const h = await harness({ root, config: (c) => void (c.render.notes = false) });
  h.app.reads.offThread = true;
  return h;
}

/** A key handled, not awaited: it may wait on a read. */
const press = (h: Harness, key: string) => h.app.input.handleKey(key);

/** Whether a read here is a key's resolution of a link: made at once, as before (SD-D17: only drawing answers a link
 *  from what's kept) — the stat of its file and, on a disk that folds case (macOS), the folders on its way listed for
 *  its name's case (`onDisk`) — and through the seam since SD-T11, so a hold sees it. Its way and its text are read on
 *  a disk thread, and held here. */
function resolvingHere(): boolean {
  const was = Error.stackTraceLimit;
  Error.stackTraceLimit = 50;
  try {
    return /\b(?:onDisk|resolvePath)\b/.test(new Error().stack ?? "");
  } finally {
    Error.stackTraceLimit = was;
  }
}

/** What this thread holds under `held` as a link there is followed: all but the key's resolution of it. */
const followedHere = () => !resolvingHere();

/** The switcher open, `typed` typed in it: its rows those files. */
async function switcher(h: Harness, typed: string): Promise<void> {
  await h.keys("ctrl+p");
  await h.keys(...typed.split(""));
}

const said = (h: Harness) => h.app.messages.map((m) => m.text);

describe("a note opened reads on a disk thread (SD-T5)", () => {
  test("held: opened from the switcher, it says it's being read; the keys typed meanwhile wait, and act on it once it's there", async () => {
    const h = await vaultWith({ "held/a.md": "one\ntwo\n" });
    const held = holding();
    await switcher(h, "held/a");
    const enter = press(h, "enter");
    await untilHeld(held);
    expect(h.frame()).toContain("reading held/a.md…");
    const j = press(h, "j");
    const x = press(h, "x");
    // A frame drawn while the read waits: the keys wait their turn, the window still says so.
    expect(held.waiting).toBeGreaterThanOrEqual(1);
    expect(h.frame()).toContain("reading held/a.md…");
    expect(h.app.view!.buf.key).toBe("index.md");
    held.release();
    await Promise.all([enter, j, x]);
    expect(h.app.view!.buf.key).toBe("held/a.md");
    expect(h.app.view!.buf.source).toBe("one\nwo\n");
    expect(h.frame()).not.toContain("reading held/a.md…");
    expect(held.gaveUp).toBe(0);
  });

  test("held: esc while it reads leaves the window on the note before, the keys typed meanwhile dropped; the answer opens nothing", async () => {
    const h = await vaultWith({ "held/a.md": "one\ntwo\n" });
    const held = holding();
    const row = h.app.view!.cur.row;
    await switcher(h, "held/a");
    const enter = press(h, "enter");
    await untilHeld(held);
    const j = press(h, "j");
    // Taken at once, out of turn: the read given up before its answer.
    await press(h, "escape");
    expect(h.frame()).not.toContain("reading held/a.md…");
    expect(h.app.view!.buf.key).toBe("index.md");
    held.release();
    await Promise.all([enter, j]);
    await h.app.reads.settled();
    expect(h.app.view!.buf.key).toBe("index.md");
    expect(h.app.view!.cur.row).toBe(row);
    expect(h.app.buffers.has("held/a.md")).toBe(false);
    expect(h.app.tabs).toHaveLength(1);
    expect(said(h).join("\n")).not.toContain("didn't answer");
  });

  test("past a shortened deadline: said, and nothing opened", async () => {
    const h = await vaultWith({ "held/a.md": "one\n" });
    holding(undefined, 300);
    await switcher(h, "held/a");
    await press(h, "enter");
    await h.app.reads.settled();
    expect(said(h)).toContain("held/a.md didn't answer: not opened");
    expect(h.app.view!.buf.key).toBe("index.md");
    expect(h.app.buffers.has("held/a.md")).toBe(false);
  });

  test("held: a click on a link while a read waits does nothing", async () => {
    // Rendered, its links followed by a click; split, the read said in one window and index.md's links in the other.
    const h = await harness({ root: makeVault() });
    mkdirSync(join(h.root, "held"));
    writeFileSync(join(h.root, "held", "a.md"), "one\n");
    h.app.reads.offThread = true;
    await h.app.run("window.split_side");
    const reading = h.app.view!;
    const other = h.app.allViews().find((v) => v !== reading)!;
    const held = holding();
    const opening = h.app.open("held/a.md");
    await untilHeld(held);
    const rows = h.frame().split("\n");
    const readAt = rows.find((r) => r.includes("reading held/a.md…"))!.indexOf("reading held/a.md…");
    const y = rows.findIndex((r) => r.includes("Links: alpha"));
    // The link in the window not being read into.
    const xs = [...rows[y]!.matchAll(/Links: alpha/g)].map((m) => m.index! + "Links: ".length + 1);
    const x = xs.find((at) => Math.abs(at - readAt) > 30)!;
    h.app.mouse.handle({ type: "down", x, y, button: 0 });
    h.app.mouse.handle({ type: "up", x, y, button: 0 });
    held.release();
    await opening;
    await h.app.reads.settled();
    expect(reading.buf.key).toBe("held/a.md");
    expect(other.buf.key).toBe("index.md");
    expect(h.app.buffers.has("notes/alpha.md")).toBe(false);
    // No read waiting, the same click follows it.
    h.frame();
    h.app.mouse.handle({ type: "down", x, y, button: 0 });
    h.app.mouse.handle({ type: "up", x, y, button: 0 });
    await h.app.reads.settled();
    expect(h.app.buffers.has("notes/alpha.md")).toBe(true);
  });

  test("held: the session's tabs read the shown one first, one at a time, a disk thread free for a stat meanwhile", async () => {
    const h = await vaultWith({ "held/a.md": "aye\n", "held/b.md": "bee\n" });
    const held = holding();
    const tabs: SessionTab[] = [
      { panes: [{ path: "held/a.md" }], active: 0 },
      { panes: [{ path: "held/b.md" }], active: 0 },
    ] as SessionTab[];
    const coming = h.app.session.openTabs(tabs, 1)!;
    await untilHeld(held);
    expect(h.frame()).toContain("reading held/b.md…");
    // A thread free while the tab's read waits: a stat asked now answers.
    const [st] = await diskThreads().stat([join(h.root, "index.md")], "look");
    expect(st && "kind" in st ? st.kind : st).toBe("file");
    expect(held.waiting).toBe(1);
    held.release();
    await coming;
    // The rest read behind it, the keys free.
    expect(h.app.reads.busy).toBe(false);
    await h.app.session.behind;
    expect(h.app.tabs.map((t) => t.views[0]!.buf.key)).toEqual(["index.md", "held/a.md", "held/b.md"]);
    expect(h.app.view!.buf.key).toBe("held/b.md");
    expect(held.gaveUp).toBe(0);
  });

  test("a binary file, a file you may not write, another vault's file and one through a link not followed open as before", async () => {
    const root = makeVault();
    const other = makeVault();
    const apart = join(sandbox, "apart-for-opening");
    mkdirSync(apart, { recursive: true });
    writeFileSync(join(apart, "kept.md"), "# Kept apart\n");
    symlinkSync(join(apart, "kept.md"), join(root, "linked.md"));
    writeFileSync(join(root, "data.txt"), "a\u0000b\n");
    writeFileSync(join(root, "locked.md"), "# Locked\n");
    chmodSync(join(root, "locked.md"), 0o444);
    // Each opened as a tab would open it — read here at once, or on a disk thread — and what it gave and said.
    const opened = async (offThread: boolean, path: string) => {
      const h = await harness({ root, config: (c) => void (c.render.notes = false) });
      h.app.reads.offThread = offThread;
      const was = h.app.messages.length;
      const b = await h.app.bufferOpening.load(path, h.app.view);
      const said = h.app.messages.slice(was).map((m) => m.text);
      return { key: b?.key ?? null, readOnly: b?.readOnly ?? null, elsewhere: b?.elsewhere?.vault ?? null, said };
    };
    const off: Record<string, Awaited<ReturnType<typeof opened>>> = {};
    for (const path of ["data.txt", "locked.md", join(other, "index.md"), "linked.md"]) {
      off[path] = await opened(true, path);
      expect(off[path]).toEqual(await opened(false, path));
    }
    // As before: refused, said why; read-only where you may not write it (unless you may: root); another vault's,
    // marked so; not followed, refused, said so.
    expect(off["data.txt"]).toMatchObject({ key: null, said: ["data.txt holds binary bytes; slipbox opens text"] });
    expect(off["locked.md"]!.key).toBe("locked.md");
    expect(off[join(other, "index.md")]!.elsewhere).toBe("fixture");
    expect(off["linked.md"]!.key).toBeNull();
    expect(off["linked.md"]!.said.join("\n")).toContain("isn't followed");
  });

  test("held: a note through a link not followed, opened by a key, has its way checked on a disk thread; asked, and looked at, it opens", async () => {
    // A link named `held`, so its way is held: checked on this thread, the key would wait past the hold (`gaveUp`).
    const root = makeVault();
    const out = join(sandbox, "out-for-opening");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "far.md"), "# Far\n\nfar away\n");
    symlinkSync(out, join(root, "held"));
    writeFileSync(join(root, "index.md"), "# Index\n\n[far](held/far.md)\n");
    const h = await harness({ root, open: "index.md" });
    h.app.reads.offThread = true;
    h.app.drawn.offThread = true;
    const held = holding(followedHere);
    await h.keys("tab");
    const enter = press(h, "enter");
    await untilHeld(held);
    expect(h.frame()).toContain("reading held/far.md…");
    held.release();
    await enter;
    await h.app.reads.settled();
    // Not read: asked first, as a link not followed is.
    expect((h.app.overlay as ListOverlay).title).toContain("leads out of");
    expect(h.app.view!.buf.key).toBe("index.md");
    expect(h.app.buffers.has(join(root, "held", "far.md"))).toBe(false);
    // Just looked at: read on a disk thread too, then opened read-only, never the vault's.
    await h.keys("l");
    await h.app.reads.settled();
    expect(h.app.view!.buf.abs).toBe(join(root, "held", "far.md"));
    expect(h.app.view!.buf.readOnly).toBe(`just looking: ${tildePath(join(root, "held"))} isn't followed — read-only`);
    expect(held.gaveUp).toBe(0);
  });

  test("held: a note open through a link, the link forgotten, opened again by a key: its way checked on a disk thread, asked again", async () => {
    const root = makeVault();
    const out = join(sandbox, "out-for-reopening");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "far.md"), "# Far\n\nfar away\n");
    symlinkSync(out, join(root, "held"));
    writeFileSync(join(root, "index.md"), "# Index\n\n[far](held/far.md)\n");
    const h = await harness({ root, open: "index.md" });
    // Looked at, read here: open through the link, read-only.
    await h.keys("tab", "enter", "l");
    expect(h.app.view!.buf.throughLink).toBe(true);
    h.app.following.forget(join(root, "held"));
    await h.app.open("index.md");
    h.app.reads.offThread = true;
    h.app.drawn.offThread = true;
    await h.keys("tab");
    const held = holding(followedHere);
    const enter = press(h, "enter");
    await untilHeld(held);
    held.release();
    await enter;
    await h.app.reads.settled();
    expect((h.app.overlay as ListOverlay).title).toContain("follow it?");
    expect(h.app.view!.buf.key).toBe("index.md");
    expect(held.gaveUp).toBe(0);
  });

  test("held: a followed link pointed elsewhere since, its note open, opened again by a key: its way checked on a disk thread, asked again", async () => {
    const root = makeVault();
    const [a, b] = ["shelf-a-for-opening", "shelf-b-for-opening"].map((n) => join(sandbox, n)) as [string, string];
    for (const [dir, says] of [
      [a, "On shelf A."],
      [b, "On shelf B."],
    ] as const) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "far.md"), `# Far\n\n${says}\n`);
    }
    symlinkSync(a, join(root, "held"));
    writeFileSync(join(root, "index.md"), "# Index\n\n[far](held/far.md)\n");
    const h = await harness({ root, open: "index.md" });
    // Followed, read here: the vault's note, open.
    await h.keys("tab", "enter", "f");
    await h.app.following.settled();
    expect(h.app.view!.buf.key).toBe("held/far.md");
    await h.app.open("index.md");
    // Pointed elsewhere from outside: what was followed is where it led.
    rmSync(join(root, "held"));
    symlinkSync(b, join(root, "held"));
    h.app.reads.offThread = true;
    await h.keys("tab");
    const held = holding();
    const enter = press(h, "enter");
    // This thread holds the link while the key is taken, not while drawing (SD-T11's).
    setReadWait(null);
    await untilHeld(held);
    held.release();
    await enter;
    await h.app.reads.settled();
    expect((h.app.overlay as ListOverlay).title).toContain("follow it?");
    expect(h.app.view!.buf.key).toBe("index.md");
    expect(h.app.buffers.get("held/far.md")!.source).toContain("On shelf A.");
    expect(held.gaveUp).toBe(0);
  });

  test("held: a note through a followed link, opened, is one request of a disk thread: its way checked with its read", async () => {
    const root = makeVault();
    const shelf = join(sandbox, "shelf-for-one-request");
    mkdirSync(shelf, { recursive: true });
    writeFileSync(join(shelf, "far.md"), "# Far\n");
    writeFileSync(join(shelf, "near.md"), "# Near\n\nclose by\n");
    symlinkSync(shelf, join(root, "held"));
    writeFileSync(join(root, "index.md"), "# Index\n\n[far](held/far.md)\n");
    const h = await harness({ root, open: "index.md" });
    // Followed, read here.
    await h.keys("tab", "enter", "f");
    await h.app.following.settled();
    await h.app.open("index.md");
    h.app.reads.offThread = true;
    // The disk threads held alone: what's drawn of the note's links reads through the link here (SD-T11's).
    const held = holding(() => false);
    const asked = spyOn(diskThreads(), "open");
    const opened = h.app.open("held/near.md");
    await untilHeld(held);
    held.release();
    await opened;
    await h.app.reads.settled();
    expect(h.app.view!.buf.key).toBe("held/near.md");
    expect(asked).toHaveBeenCalledTimes(1);
    expect(held.gaveUp).toBe(0);
  });

  test("held: a note made by ctrl+n is read on a disk thread, then typed into", async () => {
    const h = await vaultWith({});
    await h.keys("ctrl+n");
    for (const c of "held/idea") await h.keys(c);
    // The disk threads held alone: the note is made here, written and stamped, as a save is.
    const held = holding(() => false);
    const enter = press(h, "enter");
    await untilHeld(held);
    expect(h.frame()).toContain("reading held/idea.md…");
    held.release();
    await enter;
    await h.app.reads.settled();
    const v = h.app.view!;
    expect(v.buf.key).toBe("held/idea.md");
    // Typed into once it's there: making it was the editing key's first press.
    expect(v.insert).toBe(true);
    expect(held.gaveUp).toBe(0);
  });

  test("held: a list's preview says it's reading, and shows the row selected once it's read", async () => {
    const h = await vaultWith({ "held/a.md": "aye aye\n", "held/b.md": "bee bee\n" });
    const held = holding();
    await switcher(h, "held/");
    await untilHeld(held);
    expect(h.frame()).toContain("reading…");
    // The keys go on: the selection moves on while the first row's read waits.
    await h.keys("down");
    expect(h.frame()).toContain("reading…");
    held.release();
    const end = performance.now() + 10_000;
    while (!h.frame().includes("bee bee") && performance.now() < end) await Bun.sleep(5);
    const f = h.frame();
    expect(f).toContain("bee bee");
    expect(f).not.toContain("aye aye");
    // The first row's read, moved past, wasn't given up: no thread started afresh for it.
    expect(threadsStopped()).toBe(0);
    expect(held.gaveUp).toBe(0);
  });

  test("held: a preview's rows moved past: the read out finishes, those waiting for a thread are withdrawn, a thread left for a key", async () => {
    const h = await vaultWith({ "held/a.md": "aye aye\n", "held/b.md": "bee bee\n", "held/c.md": "sea sea\n" });
    const held = holding();
    await switcher(h, "held/");
    await untilHeld(held);
    // The second row's read waits for the first's thread: a preview's reads take one at most.
    await h.keys("down");
    expect(diskThreads().waiting).toBe(1);
    const [st] = await diskThreads().stat([join(h.root, "index.md")], "key");
    expect(st && "kind" in st ? st.kind : st).toBe("file");
    // Moved past before it's sent: withdrawn, the third's waiting in its place.
    await h.keys("down");
    expect(diskThreads().waiting).toBe(1);
    held.release();
    const end = performance.now() + 10_000;
    while (!h.frame().includes("sea sea") && performance.now() < end) await Bun.sleep(5);
    expect(h.frame()).toContain("sea sea");
    expect(threadsStopped()).toBe(0);
    expect(held.gaveUp).toBe(0);
  });

  test("held: :e! reads the note again on a disk thread, the keys after it waiting", async () => {
    const h = await vaultWith({ "held/a.md": "one\ntwo\n" });
    await h.app.openInNewTab("held/a.md");
    await h.app.reads.settled();
    await h.keys("x");
    expect(h.app.view!.buf.source).toBe("ne\ntwo\n");
    const held = holding();
    const reverted = h.app.run("file.revert");
    await untilHeld(held);
    expect(h.frame()).toContain("reading held/a.md…");
    const j = press(h, "j");
    held.release();
    await Promise.all([reverted, j]);
    expect(h.app.view!.buf.source).toBe("one\ntwo\n");
    expect(h.app.view!.cur.row).toBe(1);
    expect(held.gaveUp).toBe(0);
  });

  test("held: a peek says it's reading until its file comes", async () => {
    const h = await vaultWith({});
    const dir = join(sandbox, "peeked", "held");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "far.md"), "# Far\n\nfar away\n");
    const held = holding();
    peekAt(h.app, join(dir, "far.md"), elsewhereAt(dir));
    expect(h.app.floating?.kind).toBe("peek");
    expect(h.frame()).toContain("reading…");
    // The keys free meanwhile.
    expect(h.app.reads.busy).toBe(false);
    held.release();
    const end = performance.now() + 10_000;
    while (!h.frame().includes("far away") && performance.now() < end) await Bun.sleep(5);
    expect(h.frame()).toContain("far away");
    expect(held.gaveUp).toBe(0);
  });

  test("held: a peek read while another's read is out: the first isn't given up, its answer dropped; one not sent yet is withdrawn", async () => {
    const h = await vaultWith({});
    const dir = join(sandbox, "peeked-twice", "held");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "one.md"), "# One\n\nthe first\n");
    writeFileSync(join(dir, "two.md"), "# Two\n\nthe second\n");
    writeFileSync(join(dir, "three.md"), "# Three\n\nthe third\n");
    const held = holding();
    peekAt(h.app, join(dir, "one.md"), elsewhereAt(dir));
    await untilHeld(held);
    peekAt(h.app, join(dir, "two.md"), elsewhereAt(dir));
    // Its thread kept: the first read goes on, its answer for a peek no longer shown; the second waits for it.
    expect(threadsStopped()).toBe(0);
    expect(diskThreads().waiting).toBe(1);
    // The second, not sent yet, withdrawn.
    peekAt(h.app, join(dir, "three.md"), elsewhereAt(dir));
    expect(diskThreads().waiting).toBe(1);
    held.release();
    const end = performance.now() + 10_000;
    while ((held.waiting || !h.frame().includes("the third")) && performance.now() < end) await Bun.sleep(5);
    expect(h.frame()).toContain("the third");
    expect(h.frame()).not.toContain("the first");
    expect(threadsStopped()).toBe(0);
    expect(held.gaveUp).toBe(0);
  });

  test("held: a step back in a peek to a place gone since leaves the peek where it is, the place let go of, said", async () => {
    const h = await vaultWith({});
    h.app.reads.offThread = false;
    const dir = join(sandbox, "stepped", "held");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "one.md"), "# One\n\nthe first\n");
    writeFileSync(join(dir, "two.md"), "# Two\n\nthe second\n");
    peekAt(h.app, join(dir, "one.md"), elsewhereAt(dir));
    peekAt(h.app, join(dir, "two.md"), elsewhereAt(dir));
    rmSync(join(dir, "one.md"));
    h.app.reads.offThread = true;
    const held = holding();
    peekStep(h.app, "back");
    await untilHeld(held);
    // Where it was while the place is read.
    expect(h.frame()).toContain("the second");
    expect(h.frame()).not.toContain("reading…");
    held.release();
    const end = performance.now() + 10_000;
    while (!said(h).some((m) => m.endsWith("one.md is gone")) && performance.now() < end) await Bun.sleep(5);
    expect(said(h).at(-1)).toEndWith("one.md is gone");
    const p = peekOf(h.app)!;
    expect(p.abs).toBe(join(dir, "two.md"));
    expect([p.back, p.fwd]).toEqual([[], []]);
    expect(h.frame()).toContain("the second");
    expect(held.gaveUp).toBe(0);
  });

  test("a step back in a peek to a place behind a link not followed since: not read, so no list of its backlinks", async () => {
    const h = await vaultWith({});
    h.app.reads.offThread = false;
    const dir = join(sandbox, "stepped-past-a-link");
    const out = join(sandbox, "stepped-out");
    mkdirSync(dir, { recursive: true });
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "far.md"), "# Far\n\nfar away\n");
    writeFileSync(join(dir, "two.md"), "# Two\n\nthe second\n");
    symlinkSync(out, join(dir, "through"));
    peekAt(h.app, join(dir, "through", "far.md"), elsewhereAt(dir));
    peekAt(h.app, join(dir, "two.md"), elsewhereAt(dir));
    // The place kept with the backlinks it listed, as one read before its link wasn't followed.
    peekOf(h.app)!.back[0]!.rows = [{ from: "x.md", shown: "x", line: 1, text: "a link here" }];
    peekStep(h.app, "back");
    const p = peekOf(h.app)!;
    expect(p.abs).toBe(join(dir, "through", "far.md"));
    expect(p.unread).toBe(true);
    expect(p.rows).toBeUndefined();
  });

  test("held: a peek through a link its place hasn't followed has its way checked on a disk thread, and isn't read", async () => {
    const h = await vaultWith({});
    const dir = join(sandbox, "peeked-through");
    const out = join(sandbox, "peeked-out");
    mkdirSync(dir, { recursive: true });
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "far.md"), "# Far\n\nfar away\n");
    // A link named `held`, so its way is held: checked on this thread, the peek would wait past the hold (`gaveUp`).
    symlinkSync(out, join(dir, "held"));
    const held = holding();
    peekAt(h.app, join(dir, "held", "far.md"), elsewhereAt(dir));
    await untilHeld(held);
    expect(h.frame()).toContain("reading…");
    expect(h.app.reads.busy).toBe(false);
    held.release();
    const peeked = () => (h.app.floating?.kind === "peek" ? h.app.floating.view.buf.source : "");
    const end = performance.now() + 10_000;
    while (!peeked().includes("isn't followed") && performance.now() < end) await Bun.sleep(5);
    expect(peeked()).toContain("isn't followed in Elsewhere");
    expect(peeked()).not.toContain("far away");
    expect(held.gaveUp).toBe(0);
  });

  test("held: a peek through a link of the vault's not followed asks once its way is checked on a disk thread; looked at, it's read in its place", async () => {
    const root = makeVault();
    const cloned = makeVault();
    writeFileSync(join(cloned, "hub.md"), "# Hub\n\nthe hub itself\n");
    // A link named `held`, so its way is held: checked on this thread, the peek would wait past the hold (`gaveUp`).
    symlinkSync(cloned, join(root, "held"));
    writeFileSync(join(root, "own.md"), "# Own\n\n[c](held/hub.md)\n");
    const h = await harness({ root, open: "own.md" });
    h.app.reads.offThread = true;
    const peeked = () => (h.app.floating?.kind === "peek" ? h.app.floating.view.buf.source : "");
    const until = async (done: () => boolean) => {
      const end = performance.now() + 10_000;
      while (!done() && performance.now() < end) await Bun.sleep(5);
    };
    const held = holding((path) => path === join(root, "held") && followedHere());
    await h.keys("tab");
    const enter = press(h, "enter");
    // This thread holds the link while the key is taken, but for the key's resolution of it, not after: the other
    // vault's graph the peek shows is built here, through it, once it's open (SD-D7).
    setReadWait(null);
    await enter;
    await untilHeld(held);
    expect(h.frame()).toContain("reading…");
    held.release();
    await until(() => h.app.overlay?.kind === "list");
    expect((h.app.overlay as ListOverlay).title).toStartWith(
      `${tildePath(join(root, "held"))} → ${tildePath(cloned)} leads out`,
    );
    expect(peeked()).toContain("isn't followed");
    // Just looked at: read again, in the peek's place, not a place further on.
    await h.keys("l");
    await until(() => peeked().includes("the hub itself"));
    expect(peeked()).toContain("the hub itself");
    expect(h.app.floating?.kind === "peek" && h.app.floating.peek.back).toEqual([]);
    expect(held.gaveUp).toBe(0);
  });
});
