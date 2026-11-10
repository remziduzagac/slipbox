// The TUI's look each second, off the screen's thread (SD-T4; SD-D3, SD-D5, SD-D6, SD-D13): the open files no watcher
// sees and their ways, your config and the vault's, git's state and what's drawn of it, the CLI's activity file, the
// root's tool's settings — asked of a disk thread while keys are handled and frames drawn, taken when they answer against
// what's there then. What waits is told by the hold (`Hold`), never by a clock (#75): a `held` folder holds the disk
// threads' reads under it, and this thread's too, so a read of it left here holds the test's key until it gives up
// (`gaveUp`).
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { setReadWait } from "../../../../src/core/foundation/platform/disk.ts";
import { activityFile } from "../../../../src/core/workspace/graph/autoindex.ts";
import { linkKey } from "../../../../src/core/workspace/vaults/symlinks.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { diskThreads, setWalkWorker } from "../../../../src/core/workspace/walk/walk-thread.ts";
import { LOOK_AGAIN_MS, type Look } from "../../../../src/tui/app/runtime/look.ts";
import { HELD_MS, Hold, heldReads } from "../../../fixtures/walk/slow.ts";
import { type Harness, harness, makeSandbox, whereNow } from "../../../tui-harness.ts";

const sandbox = makeSandbox();

/** The test's hold, let go of when it ends. */
let hold: Hold | null = null;
/** slipbox's state folder as the test found it, when it moved it (`stateHeld`). */
let stateWas: { value: string | undefined } | null = null;

afterEach(() => {
  setReadWait(null);
  hold?.release();
  hold = null;
  setWalkWorker(null);
  if (stateWas) {
    if (stateWas.value === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = stateWas.value;
    stateWas = null;
  }
});

/** slipbox's state folder under `held`, from now on until the test ends: the scratch, the activity file. */
function stateHeld(): void {
  stateWas = { value: process.env.XDG_STATE_HOME };
  process.env.XDG_STATE_HOME = join(folder("look-state"), "held");
}

/** The disk threads' reads under a `held` folder held by a hold of the test's (`deadline`: each look's, short), let go
 *  of to start with: what the App reads as it starts is its start's. */
function holding(deadline?: number): Hold {
  const h = new Hold();
  hold = h;
  const worker = () => {
    const w = h.worker();
    w.postMessage({ holdReads: true });
    return w;
  };
  setWalkWorker(worker, deadline === undefined ? undefined : { step: deadline, whole: deadline });
  h.release();
  return h;
}

/** Held from now on: the disk threads' reads under `held`, and this thread's. */
function holdNow(h: Hold): void {
  h.again();
  setReadWait(heldReads);
}

/** Awaited till a disk thread waits in a `held` folder; thrown by HELD_MS, the look never reaching it. */
async function untilHeld(h: Hold): Promise<void> {
  const end = performance.now() + HELD_MS;
  while (!h.waiting) {
    if (performance.now() > end) throw new Error("the look never reached `held`");
    await Bun.sleep(5);
  }
}

/** A key handled and its frame drawn while the look is out: the switcher opened, and closed. The frame it drew. */
async function keyMeanwhile(h: Harness): Promise<string> {
  const frame = await h.keys("ctrl+p");
  expect(frame).toContain("┌─ Open");
  await h.keys("escape");
  return frame;
}

/** The App's look made off the screen's thread, as the TUI's is. */
function offThread(h: Harness): Look {
  h.app.watch.look.offThread = true;
  return h.app.watch.look;
}

/** A look asked for and answered. */
async function looked(look: Look): Promise<void> {
  look.request();
  await look.settled();
}

/** A folder of the sandbox, by its real path. */
const folder = (name: string) => realpathSync(mkdtempSync(join(sandbox, `${name}-`)));

/** `path` written, its mtime `s` seconds on: a change the look's stamps see, however soon after the last. */
function rewrite(path: string, text: string, s = 10): void {
  writeFileSync(path, text);
  const at = statSync(path).mtimeMs / 1000 + s;
  utimesSync(path, at, at);
}

const git = (cwd: string, ...args: string[]) =>
  Bun.spawnSync([
    "git",
    "-c",
    "user.email=t@example.invalid",
    "-c",
    "user.name=t",
    "-c",
    "commit.gpgsign=false",
    "-C",
    cwd,
    ...args,
  ]);

/** A vault on `main`, its repository's own folder (`--separate-git-dir`) under `held`: git's state read there, the
 *  notes not. Null without git. */
function repo(): { root: string; gitDir: string } | null {
  const top = folder("look-git");
  const root = join(top, "vault");
  const gitDir = join(top, "held", "git");
  mkdirSync(join(root, ".slipbox"), { recursive: true });
  writeFileSync(join(root, "index.md"), "# Index\n");
  if (git(top, "init", "-q", "-b", "main", "--separate-git-dir", gitDir, root).exitCode !== 0) return null;
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "start");
  return { root, gitDir };
}

/** The scratch open — outside the vault, in slipbox's state folder, under `held` — as an agent has written it. */
async function scratchOpen(opts: Parameters<typeof harness>[0] = {}) {
  stateHeld();
  const h = await harness(opts);
  const look = offThread(h);
  const scratch = h.app.scratch.location().path;
  mkdirSync(dirname(scratch), { recursive: true });
  writeFileSync(scratch, "# Scratch\n");
  h.app.open(scratch);
  const buf = h.app.view!.buf;
  expect([buf.abs, buf.rel, buf.source]).toEqual([scratch, null, "# Scratch\n"]);
  return { h, look, buf, scratch };
}

describe("the TUI's look each second, off the screen's thread (SD-T4)", () => {
  test("the scratch outside the vault, held: a key handled and drawn while its stat is out; let go, what an agent wrote meanwhile is read", async () => {
    const held = holding();
    const { h, look, buf, scratch } = await scratchOpen();
    holdNow(held);
    look.request();
    await untilHeld(held);
    rewrite(scratch, "# Scratch\n\nAn agent's line.\n");
    await keyMeanwhile(h);
    expect(buf.source).toBe("# Scratch\n");
    held.release();
    await look.settled();
    expect(buf.source).toBe("# Scratch\n\nAn agent's line.\n");
    expect(held.gaveUp).toBe(0);
  });

  test("git's folder held: a key handled and drawn, the top bar the branch kept, while HEAD is asked; let go, a branch switched meanwhile seen and drawn, then a rebase started meanwhile", async () => {
    const held = holding();
    const r = repo();
    if (!r) return;
    const h = await harness({ root: r.root, open: "index.md" });
    const look = offThread(h);
    await looked(look);
    expect(whereNow(h)).toContain("main");
    holdNow(held);
    expect(git(r.root, "checkout", "-q", "-b", "feat").exitCode).toBe(0);
    look.request();
    await untilHeld(held);
    await keyMeanwhile(h);
    // What's drawn is what was kept: HEAD isn't read as it's drawn.
    expect(whereNow(h)).toContain("main");
    held.release();
    await look.settled();
    expect(h.app.messages.map((m) => m.text)).toContain("switched to branch feat");
    expect(whereNow(h)).toContain("feat");
    // A rebase started meanwhile (git's own files, as `git rebase` leaves them between its steps).
    holdNow(held);
    mkdirSync(join(r.gitDir, "rebase-merge"));
    writeFileSync(join(r.gitDir, "rebase-merge", "head-name"), "refs/heads/feat\n");
    writeFileSync(join(r.gitDir, "rebase-merge", "msgnum"), "1\n");
    writeFileSync(join(r.gitDir, "rebase-merge", "end"), "2\n");
    look.request();
    await untilHeld(held);
    expect(await keyMeanwhile(h)).not.toContain("rebasing");
    held.release();
    await look.settled();
    expect(h.frame().split("\n")[0]).toContain("rebasing 1/2");
    expect(held.gaveUp).toBe(0);
  });

  test("an open file whose way goes through a held folder: a key handled meanwhile; let go, a link not followed on its way still refused", async () => {
    const held = holding();
    const top = folder("look-way");
    const root = join(top, "vault");
    const out = join(top, "out");
    mkdirSync(join(root, ".slipbox"), { recursive: true });
    mkdirSync(join(root, "held"));
    mkdirSync(out);
    writeFileSync(join(root, "index.md"), "# Index\n");
    writeFileSync(join(out, "far.md"), "# Far\n");
    const link = join(root, "held", "data");
    symlinkSync(out, link);
    const h = await harness({ root, open: "index.md" });
    const look = offThread(h);
    // The explorer hidden: its row of the link, and what its marks read of it, are the explorer's (SD-T7).
    h.app.sidebar.visible = false;
    // Looked at once, then no more: the link isn't followed.
    h.app.following.looking.add(linkKey(link));
    h.app.open(join(link, "far.md"));
    const far = h.app.view!.buf;
    expect([far.rel, far.throughLink]).toEqual([null, true]);
    h.app.following.looking.delete(linkKey(link));
    holdNow(held);
    rewrite(join(out, "far.md"), "# Far\n\nChanged out there.\n");
    look.request(true);
    await untilHeld(held);
    await keyMeanwhile(h);
    held.release();
    await look.settled();
    // Nothing read through it.
    expect(far.source).toBe("# Far\n");
    expect(held.gaveUp).toBe(0);
  });

  test("your config's folder held: a key handled; let go, a setting changed meanwhile is applied", async () => {
    const held = holding();
    const file = join(folder("look-config"), "held", "config.toml");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "[ui]\nline_numbers = false\n");
    const h = await harness({ configFile: file });
    const look = offThread(h);
    holdNow(held);
    rewrite(file, "[ui]\nline_numbers = true\n");
    look.request();
    await untilHeld(held);
    await keyMeanwhile(h);
    expect(h.app.ui.line_numbers).toBe(false);
    held.release();
    await look.settled();
    expect(h.app.ui.line_numbers).toBe(true);
    expect(h.app.messages.some((m) => m.text.includes("config reloaded"))).toBe(true);
    expect(held.gaveUp).toBe(0);
  });

  test("the CLI's activity file, as the look last found it, holds the background index back: never statted as it's asked", async () => {
    const held = holding();
    stateHeld();
    let now = Date.now();
    const h = await harness({ now: () => now, config: (c) => (c.index.idle_seconds = 1) });
    const look = offThread(h);
    mkdirSync(dirname(activityFile()), { recursive: true });
    writeFileSync(activityFile(), "");
    await looked(look);
    expect(look.activityAt).toBe(statSync(activityFile()).mtimeMs);
    // An agent's command a moment ago: someone's working.
    now = look.activityAt + 500;
    h.app.lastInputAt = 0;
    holdNow(held);
    expect(h.app.watch.nobodyWorking(now)).toBe(false);
    now += 2000;
    expect(h.app.watch.nobodyWorking(now)).toBe(true);
    // Another command since, found by the next look.
    held.release();
    rewrite(activityFile(), "", (now - look.activityAt) / 1000);
    await looked(look);
    expect(h.app.watch.nobodyWorking(now)).toBe(false);
    expect(held.gaveUp).toBe(0);
  });

  test("Obsidian's settings as the look read them: the links' convention says them, never reading them as it's said; read again once they change", async () => {
    holding();
    const root = folder("look-tool");
    mkdirSync(join(root, ".obsidian"));
    writeFileSync(join(root, ".obsidian", "app.json"), '{"newLinkFormat": "relative"}\n');
    writeFileSync(join(root, "a.md"), "# A\n\n[[b]]\n");
    writeFileSync(join(root, "b.md"), "# B\n");
    const h = await harness({ root, open: "a.md" });
    const look = offThread(h);
    await looked(look);
    // The Links section's path, the panel drawn afresh.
    const path = () => {
      h.app.info.cache = null;
      const rows = h.app.info.rows();
      return rows.slice(rows.findIndex((r) => r.key === "writes")).find((r) => r.key === "path")?.value;
    };
    expect(path()).toBe("relative");
    rewrite(join(root, ".obsidian", "app.json"), '{"newLinkFormat": "absolute"}\n');
    expect(path()).toBe("relative");
    await looked(look);
    expect(path()).toBe("from the vault's top");
  });

  test("git writing (its lock held): a batch the watcher brings waits for git's state, asked off the screen's thread, then for the lock to go; applied once", async () => {
    const held = holding();
    const r = repo();
    if (!r) return;
    const h = await harness({ root: r.root, open: "index.md" });
    const look = offThread(h);
    await looked(look);
    holdNow(held);
    writeFileSync(join(r.gitDir, "index.lock"), "");
    writeFileSync(join(r.root, "new.md"), "# New\n");
    h.app.feed.receive({ changes: [{ rel: "new.md", kind: "created", isNote: true }], rescan: false });
    await untilHeld(held);
    await keyMeanwhile(h);
    expect(h.app.graph.notes.has("new.md")).toBe(false);
    held.release();
    // Git's state answered, the lock still there: held until it goes.
    const end = performance.now() + HELD_MS;
    while (!h.app.feed.seen?.locked && performance.now() < end) await Bun.sleep(5);
    expect(h.app.feed.seen?.locked).toBe(true);
    expect(h.app.graph.notes.has("new.md")).toBe(false);
    rmSync(join(r.gitDir, "index.lock"));
    while (!h.app.graph.notes.has("new.md") && performance.now() < end) await Bun.sleep(5);
    expect(h.app.graph.notes.has("new.md")).toBe(true);
    expect(held.gaveUp).toBe(0);
  });
});

describe("what a look finds, taken against what's there when it answers (SD-D5)", () => {
  test("an answer for a vault left meanwhile is dropped", async () => {
    const held = holding();
    const r = repo();
    if (!r) return;
    const other = folder("look-other");
    mkdirSync(join(other, ".slipbox"));
    writeFileSync(join(other, "index.md"), "# Other\n");
    const h = await harness({ root: r.root, open: "index.md" });
    const look = offThread(h);
    await looked(look);
    holdNow(held);
    expect(git(r.root, "checkout", "-q", "-b", "feat").exitCode).toBe(0);
    look.request();
    await untilHeld(held);
    h.app.vaults.switchVault(locateVault({ root: other }), null);
    held.release();
    await look.settled();
    expect(h.app.loc.root).toBe(other);
    expect(h.app.messages.map((m) => m.text).filter((t) => t.startsWith("switched to"))).toEqual([]);
    // The vault left's checkout isn't taken for the one open.
    expect(h.app.git.checkout).toBeNull();
    expect(held.gaveUp).toBe(0);
  });

  test("an answer for a buffer closed meanwhile is dropped", async () => {
    const held = holding();
    const { h, look, buf, scratch } = await scratchOpen();
    holdNow(held);
    look.request();
    await untilHeld(held);
    rewrite(scratch, "# Scratch\n\nAn agent's line.\n");
    // Gone from the open buffers, as a rename leaves the one it replaces.
    h.app.buffers.delete(buf.key);
    held.release();
    await look.settled();
    expect(buf.source).toBe("# Scratch\n");
    expect(held.gaveUp).toBe(0);
  });
});

describe("a look given up on (SD-D6)", () => {
  test("said once; nothing asked for a minute, then asked again; said no more until one answers", async () => {
    const held = holding(300);
    let now = 1_000_000;
    const { h, look } = await scratchOpen({ now: () => now });
    const asked = spyOn(diskThreads(), "look");
    const said = () => h.app.messages.filter((m) => m.text.startsWith("⚠ disk not answering")).length;
    held.again();
    look.tick();
    await look.settled();
    expect([asked.mock.calls.length, said()]).toEqual([1, 1]);
    expect(h.app.messages.at(-1)!.text).toBe(
      "⚠ disk not answering: your config, git and the open files weren't read in time — looked at again in a minute",
    );
    // Within the minute: nothing asked.
    now += LOOK_AGAIN_MS - 1;
    look.tick();
    await look.settled();
    expect(asked.mock.calls.length).toBe(1);
    // A minute on: asked again, given up on again, not said again.
    now += 1;
    look.tick();
    await look.settled();
    expect([asked.mock.calls.length, said()]).toEqual([2, 1]);
    // Answered: the next given up on is said again.
    held.release();
    now += LOOK_AGAIN_MS;
    look.tick();
    await look.settled();
    expect(asked.mock.calls.length).toBeGreaterThan(2);
    held.again();
    now += 1000;
    look.tick();
    await look.settled();
    expect(said()).toBe(2);
  });
});
