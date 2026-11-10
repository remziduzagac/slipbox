// The TUI's look each second, off the screen's thread (SD-T4; SD-D3, SD-D5, SD-D6, SD-D13): the open files no watcher
// sees and their ways, your config and the vault's, git's state and what's drawn of it, the CLI's activity file, the
// root's tool's settings — asked of a disk thread while keys are handled and frames drawn, taken when they answer against
// what's there then. What waits is told by the hold (`Hold`), never by a clock (#75): a `held` folder holds the disk
// threads' reads under it, and this thread's too, so a read of it left here holds the test's key until it gives up
// (`gaveUp`), named with what asked for it (`gaveUpHere`). A test of the disk threads alone holds them alone: a read
// here, whoever's, isn't what it's about.
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
import { WorkerRequestError } from "../../../../src/core/foundation/workers/worker-requests.ts";
import { operationAgain } from "../../../../src/core/workspace/git/branches/operation-status.ts";
import { activityFile } from "../../../../src/core/workspace/graph/autoindex.ts";
import { linkKey } from "../../../../src/core/workspace/vaults/symlinks.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { diskThreads, setWalkWorker } from "../../../../src/core/workspace/walk/walk-thread.ts";
import { LOOK_AGAIN_MS, type Look } from "../../../../src/tui/app/runtime/look.ts";
import { HELD_MS, Hold, heldReads } from "../../../fixtures/walk/slow.ts";
import { answerSwitch, type Harness, harness, makeSandbox, statusRow, whereNow } from "../../../tui-harness.ts";

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

/** No read given up on, on any thread: none left on this one, where it would have held the keys. */
function noneGaveUp(h: Hold): void {
  expect({ gaveUp: h.gaveUp, here: h.gaveUpHere }).toEqual({ gaveUp: 0, here: [] });
}

/** Awaited till a disk thread waits in a `held` folder; thrown by HELD_MS, the look never reaching it. A test holds
 *  once a look has answered (`looked`), the thread started: a busy machine's slow start isn't counted in it. */
async function untilHeld(h: Hold): Promise<void> {
  const end = performance.now() + HELD_MS;
  while (!h.waiting) {
    if (performance.now() > end) throw new Error("the look never reached `held`");
    await Bun.sleep(5);
  }
}

/** A key handled and its frame drawn while the look is out: the leader's keys shown, and closed. The frame it drew. (Not
 *  the switcher: its preview's reads are a list's, SD-T5's.) */
async function keyMeanwhile(h: Harness): Promise<string> {
  const frame = await h.keys("space");
  expect(frame).toContain("+find");
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
 *  notes not. Or, `free`, not under it. */
function repo(free = false): { root: string; gitDir: string } {
  const top = folder("look-git");
  const root = join(top, "vault");
  const gitDir = join(top, free ? "free" : "held", "git");
  mkdirSync(join(root, ".slipbox"), { recursive: true });
  writeFileSync(join(root, ".slipbox", "config.toml"), '[vault]\nname = "looked"\n');
  mkdirSync(dirname(gitDir));
  writeFileSync(join(root, "index.md"), "# Index\n");
  for (const [cwd, ...args] of [
    [top, "init", "-q", "-b", "main", "--separate-git-dir", gitDir, root],
    [root, "add", "-A"],
    [root, "commit", "-q", "-m", "start"],
  ] as [string, ...string[]][]) {
    const r = git(cwd, ...args);
    if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
  }
  return { root, gitDir };
}

/** The vault's scratch, as an agent has written it, opened: outside the vault, in slipbox's state folder — under
 *  `held` once `stateHeld`, where a look reads git's state, then stats it, and waits. */
function openScratch(h: Harness): string {
  const scratch = h.app.scratch.location().path;
  mkdirSync(dirname(scratch), { recursive: true });
  writeFileSync(scratch, "# Scratch\n");
  h.app.open(scratch);
  return scratch;
}

/** Awaited till `cond` holds — what another thread, git or the feed does, told by what it leaves — or thrown by
 *  HELD_MS. */
async function until(cond: () => boolean, what: string): Promise<void> {
  const end = performance.now() + HELD_MS;
  while (!cond()) {
    if (performance.now() > end) throw new Error(`never: ${what}`);
    await Bun.sleep(5);
  }
}

/** The messages said so far that start with `start`. */
const said = (h: Harness, start: string) => h.app.messages.map((m) => m.text).filter((t) => t.startsWith(start));

/** The scratch open — outside the vault, in slipbox's state folder, under `held` — as an agent has written it. */
async function scratchOpen(opts: Parameters<typeof harness>[0] = {}) {
  stateHeld();
  const h = await harness(opts);
  const look = offThread(h);
  const scratch = openScratch(h);
  const buf = h.app.view!.buf;
  expect([buf.abs, buf.rel, buf.source]).toEqual([scratch, null, "# Scratch\n"]);
  return { h, look, buf, scratch };
}

describe("the TUI's look each second, off the screen's thread (SD-T4)", () => {
  test("the scratch outside the vault, held: a key handled and drawn while its stat is out; let go, what an agent wrote meanwhile is read", async () => {
    const held = holding();
    const { h, look, buf, scratch } = await scratchOpen();
    await looked(look);
    holdNow(held);
    look.request();
    await untilHeld(held);
    rewrite(scratch, "# Scratch\n\nAn agent's line.\n");
    await keyMeanwhile(h);
    expect(buf.source).toBe("# Scratch\n");
    held.release();
    await look.settled();
    expect(buf.source).toBe("# Scratch\n\nAn agent's line.\n");
    noneGaveUp(held);
  });

  test("git's folder held: a key handled and drawn, the top bar the branch kept, while HEAD is asked; let go, a branch switched meanwhile seen and drawn, then a rebase started meanwhile", async () => {
    const held = holding();
    const r = repo();
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
    await keyMeanwhile(h);
    // The top bar's branch as drawn, whatever room the vault's path leaves it.
    expect(whereNow(h)).not.toContain("rebasing");
    held.release();
    await look.settled();
    expect(whereNow(h)).toContain("feat rebasing 1/2");
    noneGaveUp(held);
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
    await looked(look);
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
    noneGaveUp(held);
  });

  test("your config's folder held: a key handled; let go, a setting changed meanwhile is applied", async () => {
    const held = holding();
    const file = join(folder("look-config"), "held", "config.toml");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "[ui]\nline_numbers = false\n");
    const h = await harness({ configFile: file });
    const look = offThread(h);
    await looked(look);
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
    noneGaveUp(held);
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
    const at = statSync(activityFile()).mtimeMs;
    expect(look.activityAt).toBe(at);
    // An agent's command a moment ago: someone's working.
    now = at + 500;
    h.app.lastInputAt = 0;
    holdNow(held);
    expect(h.app.watch.nobodyWorking(now)).toBe(false);
    now += 2000;
    expect(h.app.watch.nobodyWorking(now)).toBe(true);
    // Another command since, found by the next look.
    held.release();
    rewrite(activityFile(), "", (now - at) / 1000);
    await looked(look);
    expect(h.app.watch.nobodyWorking(now)).toBe(false);
    noneGaveUp(held);
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
    noneGaveUp(held);
  });
});

describe("what a look finds, taken against what's there when it answers (SD-D5)", () => {
  test("an answer for a vault left meanwhile is dropped", async () => {
    const held = holding();
    const r = repo();
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
    // The look held on its thread; the switch's own reads of the vault left (SD-T9's) go here at once.
    setReadWait(null);
    h.app.vaults.switchVault(locateVault({ root: other }), null);
    await answerSwitch(h);
    held.release();
    await look.settled();
    expect(h.app.loc.root).toBe(other);
    expect(h.app.messages.map((m) => m.text).filter((t) => t.startsWith("switched to"))).toEqual([]);
    // The vault left's checkout isn't taken for the one open.
    expect(h.app.git.checkout).toBeNull();
    noneGaveUp(held);
  });

  test("an answer for a buffer closed meanwhile is dropped", async () => {
    const held = holding();
    const { h, look, buf, scratch } = await scratchOpen();
    await looked(look);
    holdNow(held);
    look.request();
    await untilHeld(held);
    rewrite(scratch, "# Scratch\n\nAn agent's line.\n");
    // Gone from the open buffers, as a rename leaves the one it replaces.
    h.app.buffers.delete(buf.key);
    held.release();
    await look.settled();
    expect(buf.source).toBe("# Scratch\n");
    noneGaveUp(held);
  });
});

describe("a look given up on (SD-D6)", () => {
  test("said once; nothing asked for a minute, then asked again; said no more until one answers", async () => {
    const held = holding(300);
    let now = 1_000_000;
    const { h, look } = await scratchOpen({ now: () => now });
    const asked = spyOn(diskThreads(), "look");
    const said = () => h.app.messages.filter((m) => m.text.startsWith("disk not answering")).length;
    held.again();
    look.tick();
    await look.settled();
    expect([asked.mock.calls.length, said()]).toEqual([1, 1]);
    expect(h.app.messages.at(-1)!.text).toBe(
      "disk not answering: the look at your config, git and the open files gave up; it looks again in a minute",
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

  test("nothing asked for a minute, however it's asked for — a look wanted, a build's look of every file, one asked for while the last was out, the feed's question — and what was wanted asked once it's over", async () => {
    holding();
    let now = 1_000_000;
    const { h, look } = await scratchOpen({ now: () => now });
    await looked(look);
    const asked = spyOn(diskThreads(), "look");
    asked.mockRejectedValueOnce(new WorkerRequestError("worker request deadline exceeded", "deadline"));
    look.tick();
    // Wanted while that one is out: asked once it may be, and settled once it has answered.
    let answered = false;
    const wanted = look.request().then(() => {
      answered = true;
    });
    await look.settled();
    expect(said(h, "disk not answering")).toHaveLength(1);
    void look.request();
    h.app.watch.poll(true);
    h.app.feed.receive({ changes: [], rescan: false });
    await Bun.sleep(0);
    look.tick();
    expect(asked.mock.calls.length).toBe(1);
    expect(answered).toBe(false);
    // The minute over: what was wanted, every open file among it, asked at the next tick.
    now += LOOK_AGAIN_MS;
    look.tick();
    await wanted;
    expect(asked.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test("`⚠ disk not answering` on the status line, as for the watcher's look given up on, until a look answers", async () => {
    holding();
    let now = 1_000_000;
    const h = await harness({ now: () => now });
    const look = offThread(h);
    await looked(look);
    expect(statusRow(h.frame())).not.toContain("disk not answering");
    spyOn(diskThreads(), "look").mockRejectedValueOnce(
      new WorkerRequestError("worker request deadline exceeded", "deadline"),
    );
    look.tick();
    await look.settled();
    expect(statusRow(h.frame())).toContain("⚠ disk not answering");
    // A minute on, a look answered: gone.
    now += LOOK_AGAIN_MS;
    look.tick();
    await look.settled();
    expect(statusRow(h.frame())).not.toContain("disk not answering");
  });
});

describe("git's state taken in the order it was asked, whatever order the answers come in", () => {
  test("a look asked before a checkout, answered after the feed's question asked since: HEAD never moves back", async () => {
    holding();
    const r = repo(true);
    const h = await harness({ root: r.root, open: "index.md" });
    const look = offThread(h);
    await looked(look);
    // The look's answer, read (main), kept back till the feed's question asked after it has been answered: the disk
    // threads' background requests answer in the order asked, but nothing here counts on it.
    const threads = diskThreads();
    const real = threads.look.bind(threads);
    let read = () => {};
    const wasRead = new Promise<void>((r) => {
      read = r;
    });
    let letGo = () => {};
    const kept = new Promise<void>((r) => {
      letGo = r;
    });
    spyOn(threads, "look").mockImplementationOnce(async (batch) => {
      const answer = await real(batch);
      read();
      await kept;
      return answer;
    });
    look.request();
    await wasRead;
    expect(git(r.root, "checkout", "-q", "-b", "feat").exitCode).toBe(0);
    // A batch the watcher brings: git's state asked again, and answered first.
    h.app.feed.receive({ changes: [], rescan: false });
    await until(() => said(h, "switched to").length > 0, "the feed's question answered");
    letGo();
    await look.settled();
    expect(said(h, "switched to")).toEqual(["switched to branch feat"]);
    expect(whereNow(h)).toContain("feat");
  });

  test("what's under way read again by a key (a rebase aborted) after a look was asked: the look's answer, older, never draws it back", async () => {
    const held = holding();
    const r = repo(true);
    stateHeld();
    const h = await harness({ root: r.root, open: "index.md" });
    const look = offThread(h);
    openScratch(h);
    mkdirSync(join(r.gitDir, "rebase-merge"));
    writeFileSync(join(r.gitDir, "rebase-merge", "head-name"), "refs/heads/main\n");
    writeFileSync(join(r.gitDir, "rebase-merge", "msgnum"), "1\n");
    writeFileSync(join(r.gitDir, "rebase-merge", "end"), "2\n");
    await looked(look);
    // The top bar's branch as drawn, whatever room the vault's path leaves it.
    expect(whereNow(h)).toContain("main rebasing 1/2");
    holdNow(held);
    look.request();
    await untilHeld(held);
    // The rebase aborted, and the key that did it reads what's under way at once.
    rmSync(join(r.gitDir, "rebase-merge"), { recursive: true });
    expect(operationAgain(h.app, h.app.git.checkout!)).toBeNull();
    held.release();
    await look.settled();
    expect(whereNow(h)).not.toContain("rebasing");
    noneGaveUp(held);
  });
});

describe("a slow disk under a key that runs git", () => {
  test("a branch switched from the branches list, git's folder held: what the key does next waits for the switch to be seen and done, as on the screen's thread; keys handled meanwhile", async () => {
    const held = holding();
    const r = repo();
    expect(git(r.root, "branch", "feat").exitCode).toBe(0);
    const h = await harness({ root: r.root, open: "index.md" });
    const look = offThread(h);
    await looked(look);
    // What the switch does after HEAD is seen: git's files looked at again (`refreshNow`), the switch said or not.
    const order: string[] = [];
    spyOn(h.app.git, "refreshNow").mockImplementation(async () => {
      order.push(said(h, "switched to branch feat").length ? "after the switch" : "before the switch");
    });
    const checked = spyOn(look, "checkHead");
    h.app.git.openBranches();
    holdNow(held);
    await h.keys(..."feat".split(""), "enter");
    await until(() => checked.mock.calls.length > 0, "the switch done by git");
    await untilHeld(held);
    await keyMeanwhile(h);
    expect(order).toEqual([]);
    held.release();
    await until(() => order.length > 0, "git's files looked at again");
    expect(order).toEqual(["after the switch"]);
    noneGaveUp(held);
  });
});

describe("what a look holds and stamps", () => {
  test("a look holds one disk thread, however much it asks: a key's read goes past it while git's folder and the scratch are held", async () => {
    const held = holding();
    const r = repo();
    stateHeld();
    const h = await harness({ root: r.root, open: "index.md" });
    const look = offThread(h);
    openScratch(h);
    await looked(look);
    // The disk threads alone held: what this test asks is of them, and a read of a `held` folder here — another
    // feature's — would hold its key too.
    held.again();
    look.request();
    await untilHeld(held);
    const free = folder("look-free");
    const [s] = await diskThreads().stat([free], "key");
    expect([held.letGo, s && "kind" in s ? s.kind : s]).toEqual([false, "dir"]);
    held.release();
    await look.settled();
    noneGaveUp(held);
  });

  test("in the background, as the watcher's look: while one of its requests is out, the look and the feed's question wait their turn, and a key's read takes the other thread", async () => {
    const held = holding();
    const h = await harness();
    const look = offThread(h);
    await looked(look);
    const slow = join(folder("look-watcher"), "held");
    mkdirSync(slow);
    held.again();
    // The watcher's look, its stat held.
    const watcher = diskThreads().look({ stat: { paths: [slow] }, background: true });
    await untilHeld(held);
    let answered = false;
    const wanted = look.request().then(() => {
      answered = true;
    });
    h.app.feed.receive({ changes: [], rescan: false });
    await until(() => diskThreads().waiting === 2, "the look and the feed's question waiting their turn");
    const [s] = await diskThreads().stat([folder("look-free")], "key");
    expect([s && "kind" in s ? s.kind : s, answered, diskThreads().waiting]).toEqual(["dir", false, 2]);
    held.release();
    await watcher;
    await wanted;
    await until(() => diskThreads().waiting === 0, "the feed's question asked");
    noneGaveUp(held);
  });

  test("Obsidian at work, rewriting what's in .obsidian/: its settings aren't read again, nor the convention said again", async () => {
    holding();
    const root = folder("look-busy-tool");
    mkdirSync(join(root, ".obsidian"));
    writeFileSync(join(root, ".obsidian", "app.json"), '{"newLinkFormat": "relative"}\n');
    writeFileSync(join(root, "a.md"), "# A\n");
    const h = await harness({ root, open: "a.md" });
    const look = offThread(h);
    await looked(look);
    const asked = spyOn(diskThreads(), "look");
    // Obsidian saves its workspace: the folder changes, its settings file doesn't.
    writeFileSync(join(root, ".obsidian", "workspace.json"), "{}\n");
    const at = statSync(join(root, ".obsidian")).mtimeMs / 1000 + 10;
    utimesSync(join(root, ".obsidian"), at, at);
    await looked(look);
    expect(asked.mock.calls.map(([b]) => (b.jobs ?? []).map((j) => j.op))).toEqual([["git"]]);
  });

  test("the activity file not yet found, the first look held: someone may be working, and the background index waits", async () => {
    const held = holding();
    stateHeld();
    const now = Date.now() + 60_000;
    mkdirSync(dirname(activityFile()), { recursive: true });
    // An agent's command a minute before `now`: once the look finds it, nobody is working.
    writeFileSync(activityFile(), "");
    const h = await harness({ now: () => now, config: (c) => (c.index.idle_seconds = 1) });
    const look = offThread(h);
    holdNow(held);
    h.app.lastInputAt = 0;
    look.request();
    await untilHeld(held);
    expect(h.app.watch.nobodyWorking(now)).toBe(false);
    held.release();
    await look.settled();
    expect(h.app.watch.nobodyWorking(now)).toBe(true);
    noneGaveUp(held);
  });

  test("the look given up on: the activity file's stamp no longer known, and the background index waits", async () => {
    holding();
    stateHeld();
    let now = Date.now() + 60_000;
    mkdirSync(dirname(activityFile()), { recursive: true });
    writeFileSync(activityFile(), "");
    const h = await harness({ now: () => now, config: (c) => (c.index.idle_seconds = 1) });
    const look = offThread(h);
    await looked(look);
    h.app.lastInputAt = 0;
    expect(h.app.watch.nobodyWorking(now)).toBe(true);
    spyOn(diskThreads(), "look").mockRejectedValueOnce(
      new WorkerRequestError("worker request deadline exceeded", "deadline"),
    );
    look.tick();
    await look.settled();
    expect(said(h, "disk not answering")).toHaveLength(1);
    expect(h.app.watch.nobodyWorking(now)).toBe(false);
    // A minute on, a look answered: known again.
    now += LOOK_AGAIN_MS;
    look.tick();
    await look.settled();
    expect(h.app.watch.nobodyWorking(now)).toBe(true);
  });
});
