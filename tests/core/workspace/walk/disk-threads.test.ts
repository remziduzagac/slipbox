// The disk threads (SD-D2, SD-T2): the explorer's listing threads grown into what every read of the vault open asks
// off the main thread. Each request answers what the same code answers here; a walk holds one thread only while the
// other is free; a deadline is the asker's; a batch is answered whole or failed; quitting refuses what's asked; a
// thread idle for a minute is let go of. What waits is told by the hold (`Hold`), never by a clock (#75); the minute
// idle is the test's own clock's.
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { folderUnreadable, readText, stamp } from "../../../../src/core/foundation/platform/fsutil.ts";
import { WorkerRequestError, WorkerRequests } from "../../../../src/core/foundation/workers/worker-requests.ts";
import { type HomeWalk, homeWalk } from "../../../../src/core/workspace/vaults/home.ts";
import { homeFilter } from "../../../../src/core/workspace/vaults/home/filter.ts";
import { homeAt } from "../../../../src/core/workspace/vaults/vault.ts";
import type { PathStat, ReadAnswer } from "../../../../src/core/workspace/walk/disk-jobs.ts";
import { listFolder } from "../../../../src/core/workspace/walk/listing.ts";
import { listDirectory, WalkFilter, type WalkResult, walkVault } from "../../../../src/core/workspace/walk/walk.ts";
import { DiskThreads, IDLE_MS } from "../../../../src/core/workspace/walk/walk-thread.ts";
import { HELD_MS, Hold } from "../../../fixtures/walk/slow.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

const sandbox = makeCoreSandbox();
const LIST_WORKER = new URL("../../../../src/core/workspace/walk/list-worker.ts", import.meta.url).href;
const SLOW_WORKER = new URL("../../../fixtures/walk/slow-worker.ts", import.meta.url).href;
const WALK = DEFAULT_CONFIG.walk;

/** A note's bytes as an editor on another system might leave them: a BOM, CRLF, an invalid byte. */
const BYTES = Buffer.concat([Buffer.from("﻿# Note\r\n\r\nText "), Buffer.from([0xff]), Buffer.from("\r\n")]);

/** A folder of `files` (path → text) in the sandbox, by its real path. */
function tree(files: Record<string, string | Buffer>): string {
  const dir = realpathSync(mkdtempSync(join(sandbox, "disk-")));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

/** A place with `held/a.md` and `free/b.md`. */
function heldAndFree() {
  const root = tree({ "held/a.md": "# A\n", "free/b.md": "# B\n" });
  return {
    root,
    held: join(root, "held"),
    free: join(root, "free"),
    a: join(root, "held/a.md"),
    b: join(root, "free/b.md"),
  };
}

const codeOf = (err: unknown) => (err as NodeJS.ErrnoException).code ?? String(err);

/** `path` statted here, as a disk thread words it. */
function statHere(path: string, own = false): PathStat {
  try {
    const st = own ? lstatSync(path) : statSync(path);
    const kind = st.isFile() ? "file" : st.isDirectory() ? "dir" : st.isSymbolicLink() ? "link" : "other";
    return { kind, mtimeMs: st.mtimeMs, ctimeMs: st.ctimeMs, size: st.size };
  } catch (err) {
    return { error: codeOf(err) };
  }
}

/** `path` read here, as a note's load reads it (`readText`, then `stamp`). */
function readHere(path: string): ReadAnswer {
  try {
    return { ...readText(path), stamp: stamp(path) };
  } catch (err) {
    return { error: codeOf(err) };
  }
}

const shown = (s: PathStat | ReadAnswer) => ("error" in s ? `error ${s.error}` : "kind" in s ? s.kind : "text");

/** The test's hold, let go of when it ends. */
let hold: Hold | null = null;
const open: DiskThreads[] = [];

afterEach(() => {
  hold?.release();
  hold = null;
  for (const t of open.splice(0)) t.stop();
});

/** Disk threads whose `held` folders — a listing, a walk's, a stat or a read under one — wait on a hold: their workers
 *  made, those let go of, and what each was sent. */
function held(opts: ConstructorParameters<typeof DiskThreads>[1] = {}) {
  const h = new Hold();
  hold = h;
  const made: Worker[] = [];
  const ended: Worker[] = [];
  const sent: { op: string; dir?: string }[] = [];
  const threads = new DiskThreads(() => {
    const w = h.worker();
    w.postMessage({ holdReads: true });
    const post = w.postMessage.bind(w);
    w.postMessage = (m: { op?: string; dir?: string }) => {
      if (m?.op) sent.push({ op: m.op, ...(m.dir ? { dir: m.dir } : {}) });
      post(m);
    };
    const end = w.terminate.bind(w);
    w.terminate = () => {
      ended.push(w);
      end();
    };
    made.push(w);
    return w;
  }, opts);
  open.push(threads);
  return { hold: h, threads, made, ended, sent };
}

/** Awaited until `n` readers wait on the hold — said, and thrown, by HELD_MS, short of the test's timeout. */
async function untilWaiting(h: Hold, n = 1): Promise<void> {
  const end = performance.now() + HELD_MS;
  while (h.waiting < n) {
    if (performance.now() > end) throw new Error(`fewer than ${n} waited on \`held\``);
    await Bun.sleep(2);
  }
}

/** `p`, and whether it has settled yet. */
function watched<T>(p: Promise<T>): { p: Promise<T>; came: () => boolean } {
  let came = false;
  const q = p.finally(() => {
    came = true;
  });
  return { p: q, came: () => came };
}

/** The workers let go of, each by the order it was made in. */
const letGo = (made: Worker[], ended: Worker[]) => ended.map((w) => made.indexOf(w));

/** Why a request failed: its kind. */
const failure = (p: Promise<unknown>) =>
  p.then(
    () => "answered",
    (err: Error) => (err instanceof WorkerRequestError ? err.kind : err.message),
  );

describe("the disk threads (SD-D2)", () => {
  test.each([
    ["the disk threads' own worker", LIST_WORKER],
    ["a test's worker serving the walk's thread too", SLOW_WORKER],
  ])("each request answers what the same code answers here (%s)", async (_, url) => {
    const root = tree({ "note.md": BYTES, "plain.md": "# Plain\n", "sub/c.md": "# C\n", "index.json": '{"a":1}\n' });
    const note = join(root, "note.md");
    const fifo = join(root, "pipe");
    expect(Bun.spawnSync(["mkfifo", fifo]).exitCode).toBe(0);
    symlinkSync(note, join(root, "link.md"));
    const locked = join(root, "locked");
    const lockedNote = join(root, "locked.md");
    mkdirSync(locked);
    writeFileSync(lockedNote, "# Locked\n");
    const threads = new DiskThreads(() => new Worker(url));
    open.push(threads);
    const paths = [note, join(root, "sub"), join(root, "gone.md"), fifo, join(root, "link.md"), lockedNote];
    const asRoot = process.getuid?.() === 0;
    chmodSync(locked, 0o000);
    chmodSync(lockedNote, 0o000);
    try {
      // A stat, its links followed or not: a file, a folder, a path not there, a FIFO, a link, a file you may not read.
      const stats = await threads.stat(paths, "look");
      expect(stats).toEqual(paths.map((p) => statHere(p)));
      expect(stats.map(shown)).toEqual(["file", "dir", "error ENOENT", "other", "file", "file"]);
      expect(await threads.stat(paths, "look", true)).toEqual(paths.map((p) => statHere(p, true)));
      expect(shown((await threads.stat([join(root, "link.md")], "look", true))[0]!)).toBe("link");
      // A read: the BOM, CRLF and an invalid byte as `readText` reads them, with its stamp; the rest refused as here.
      const reads = await Promise.all(paths.map((p) => threads.read(p, "key")));
      expect(reads).toEqual(paths.map(readHere));
      expect(reads[0]).toMatchObject({ bom: true, crlf: true, invalidUtf8: true, stamp: stamp(note) });
      expect(reads.map(shown)).toEqual([
        "text",
        "error ENOTREG",
        "error ENOENT",
        "error ENOTREG",
        "text",
        asRoot ? "text" : "error EACCES",
      ]);
      // A folder's access, in `folderUnreadable`'s words.
      const dirs = [join(root, "sub"), note, join(root, "gone"), locked];
      const access = await Promise.all(dirs.map((d) => threads.access(d, "key")));
      expect(access).toEqual(dirs.map(folderUnreadable));
      expect(access.slice(0, 3)).toEqual([null, "it isn't a folder", "it isn't there"]);
      if (!asRoot) expect(access[3]).toBe("you may not read it (no permission)");
      // A folder listed, hidden names or not; one you may not read says why.
      for (const hidden of [false, true])
        expect(await threads.list(root, WALK, hidden)).toEqual(listFolder(root, WALK, hidden));
      expect(await threads.list(locked, WALK, false)).toEqual(listFolder(locked, WALK, false));
    } finally {
      chmodSync(locked, 0o755);
      chmodSync(lockedNote, 0o644);
    }
    // The vault walked whole, its top listed (Elsewhere), with its index's text and stamp, or none.
    const settings = new WalkFilter(root, WALK).settings;
    const index = join(root, "index.json");
    const st = statSync(index);
    expect(await threads.walk({ how: "vault", filter: settings, index })).toEqual({
      walk: walkVault(root, new WalkFilter(root, WALK)),
      index: { text: '{"a":1}\n', stamp: `${st.mtimeMs}:${st.size}` },
    });
    expect(await threads.walk({ how: "listed", filter: settings, index: join(root, "none.json") })).toEqual({
      walk: listDirectory(root, new WalkFilter(root, WALK)),
      index: { text: null, stamp: "" },
    });
  });

  test("home's walk on a disk thread is home's walk here: kept brought up to now, the folders asked for, handed back unkept", async () => {
    const home = tree({ "a.md": "# A\n", "notes/b.md": "# B\n", "notes/deep/c.md": "# C\n", "proj/.git/HEAD": "x\n" });
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const loc = homeAt(home);
      const filter = homeFilter(loc, DEFAULT_CONFIG);
      const threads = new DiskThreads();
      open.push(threads);
      const here = homeWalk(loc, filter, ["notes"], undefined, false);
      const answer = await threads.walk({
        how: "home",
        filter: filter.settings,
        home: { key: loc.key, asked: ["notes"] },
      });
      // When it was walked aside: each takes the time it's made at, and stamps its folders by it.
      const stamped = (w: WalkResult) => ({ ...w, times: w.times && [...w.times.keys()].sort() });
      const untimed = (h: HomeWalk) => ({
        ...h,
        walk: stamped(h.walk),
        walked: 0,
        ...(h.unkept ? { unkept: { ...h.unkept, walk: stamped(h.unkept.walk), walked: 0 } } : {}),
      });
      expect(answer.index).toBeUndefined();
      expect(untimed({ walk: answer.walk, ...answer.home! })).toEqual(untimed(here));
      expect(answer.walk.files.map((f) => f.rel)).toContain("notes/deep/c.md");
    } finally {
      process.env.HOME = before;
    }
  });

  test("held: a stat under `held` holds one thread; a stat elsewhere asked meanwhile is answered by the other", async () => {
    const { threads, hold: h } = held();
    const { a, b } = heldAndFree();
    const first = watched(threads.stat([a], "look"));
    await untilWaiting(h);
    expect(await threads.stat([b], "look")).toEqual([statHere(b)]);
    expect([first.came(), h.waiting]).toEqual([false, 1]);
    h.release();
    expect(await first.p).toEqual([statHere(a)]);
    expect(h.gaveUp).toBe(0);
  });

  test("held: a walk takes a thread only while the other is free — a stat answered meanwhile, a second walk waiting for the first", async () => {
    const { threads, hold: h } = held();
    const vault = tree({ "a.md": "# A\n", "held/h.md": "# H\n" });
    const quick = tree({ "q.md": "# Q\n" });
    const q = join(quick, "q.md");
    const settings = (root: string) => new WalkFilter(root, WALK).settings;
    const order: string[] = [];
    const first = threads.walk({ how: "vault", filter: settings(vault) }).finally(() => order.push("first"));
    await untilWaiting(h);
    expect(await threads.stat([q], "look")).toEqual([statHere(q)]);
    const second = threads.walk({ how: "vault", filter: settings(quick) }).finally(() => order.push("second"));
    // Asked after it, a stat goes past it to the thread left free; the second walk waits for the first's thread.
    expect(await threads.stat([q], "look")).toEqual([statHere(q)]);
    expect([threads.waiting, order, h.waiting]).toEqual([1, [], 1]);
    h.release();
    const [one, two] = await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
    expect(one.walk).toEqual(walkVault(vault, new WalkFilter(vault, WALK)));
    expect(two.walk).toEqual(walkVault(quick, new WalkFilter(quick, WALK)));
    expect(h.gaveUp).toBe(0);
  });

  test("past a shortened deadline: the request fails `deadline`, its thread started afresh, the next request answered", async () => {
    const { threads, made, ended } = held({ deadlines: { look: 300, key: 300, explorer: 300, walk: 300 } });
    const { a, b } = heldAndFree();
    expect(await failure(threads.stat([a], "look"))).toBe("deadline");
    expect([made.length, letGo(made, ended)]).toEqual([1, [0]]);
    expect(await threads.stat([b], "look")).toEqual([statHere(b)]);
    expect(made.length).toBe(2);
    expect(letGo(made, ended)).toEqual([0]);
  });

  test("a listing a look asks gives up at the look's deadline, one the explorer asks at the explorer's", async () => {
    const { threads, hold: h } = held({ deadlines: { look: 300, key: 60_000, explorer: 60_000, walk: 60_000 } });
    const { held: dir } = heldAndFree();
    const explorer = watched(threads.list(dir, WALK, false));
    expect(await failure(threads.list(dir, WALK, false, "look"))).toBe("deadline");
    expect(explorer.came()).toBe(false);
    h.release();
    expect(await explorer.p).toEqual(listFolder(dir, WALK, false));
  });

  test("each request carries the deadline of what asked it, not of its kind", async () => {
    const deadlines = { look: 60_001, key: 60_002, explorer: 60_003, walk: 60_004 };
    const threads = new DiskThreads(undefined, { deadlines });
    open.push(threads);
    const { root, b, free } = heldAndFree();
    const asked = spyOn(WorkerRequests.prototype, "request");
    try {
      await threads.list(free, WALK, false);
      await threads.list(free, WALK, false, "look");
      await threads.stat([b], "look");
      await threads.stat([b], "key");
      await threads.read(b, "key");
      await threads.read(b, "look");
      await threads.access(free, "key");
      await threads.walk({ how: "vault", filter: new WalkFilter(root, WALK).settings });
      await threads.look({ stat: { paths: [b] }, list: [{ dir: free, walk: WALK, hidden: false }] });
      const sent = asked.mock.calls.map(([r, o]) => `${(r as { op: string }).op} ${o?.deadline}`);
      expect(sent).toEqual([
        "list 60003",
        "list 60001",
        "stat 60001",
        "stat 60002",
        "read 60002",
        "read 60001",
        "access 60002",
        "walk 60004",
        "stat 60001",
        "list 60001",
      ]);
    } finally {
      asked.mockRestore();
    }
  });

  test("held: a look's batch — its stats and its listings asked together — is answered once all have", async () => {
    const { threads, hold: h } = held();
    const { a, b, held: heldDir, free } = heldAndFree();
    const batch = watched(
      threads.look({
        stat: { paths: [a, b] },
        list: [
          { dir: free, walk: WALK, hidden: false },
          { dir: heldDir, walk: WALK, hidden: false },
        ],
      }),
    );
    // The stats on one thread, held; the free folder listed on the other, then the held one there, held.
    await untilWaiting(h, 2);
    expect(batch.came()).toBe(false);
    h.release();
    expect(await batch.p).toEqual({
      stats: [statHere(a), statHere(b)],
      listings: [listFolder(free, WALK, false), listFolder(heldDir, WALK, false)],
    });
  });

  test("a look's batch fails once one of it gives up, what of it still waits for a thread withdrawn, never sent", async () => {
    const { threads, sent } = held({ deadlines: { look: 300, key: 300, explorer: 300, walk: 300 } });
    const { a, held: heldDir, free } = heldAndFree();
    const batch = threads.look({
      stat: { paths: [a] },
      list: [
        { dir: heldDir, walk: WALK, hidden: false },
        { dir: free, walk: WALK, hidden: false },
      ],
    });
    expect(await failure(batch)).toBe("deadline");
    expect(threads.waiting).toBe(0);
    expect(sent).toEqual([{ op: "stat" }, { op: "list", dir: heldDir }]);
  });

  test("stopped (quitting): a request asked or waiting is refused, no thread started again for it", async () => {
    const { threads, hold: h, made } = held();
    const { root, a, b } = heldAndFree();
    const asked = [
      threads.stat([a], "look"),
      threads.read(a, "key"),
      threads.stat([b], "look"),
      threads.walk({ how: "vault", filter: new WalkFilter(root, WALK).settings }),
    ].map(failure);
    await untilWaiting(h, 2);
    expect(threads.waiting).toBe(2);
    threads.stop();
    expect(await Promise.all(asked)).toEqual(["stopped", "stopped", "stopped", "stopped"]);
    expect(await failure(threads.stat([b], "look"))).toBe("stopped");
    expect(made.length).toBe(2);
  });

  test("a thread asked nothing for a minute is let go of, on the test's clock — the second while the first is asked — and started again by the next request", async () => {
    let now = 0;
    const due = new Map<number, { at: number; run: () => void }>();
    let serial = 0;
    const timers = {
      setTimeout: (run: () => void, ms: number) => {
        due.set(++serial, { at: now + ms, run });
        return serial;
      },
      clearTimeout: (id: number) => void due.delete(id),
    } as unknown as typeof globalThis;
    const advance = (ms: number) => {
      now += ms;
      for (const [id, t] of [...due].sort(([, x], [, y]) => x.at - y.at)) if (t.at <= now && due.delete(id)) t.run();
    };
    const made: Worker[] = [];
    const ended: Worker[] = [];
    const threads = new DiskThreads(
      () => {
        const w = new Worker(LIST_WORKER);
        const end = w.terminate.bind(w);
        w.terminate = () => {
          ended.push(w);
          end();
        };
        made.push(w);
        return w;
      },
      { timers },
    );
    open.push(threads);
    const { b } = heldAndFree();
    const both = () => Promise.all([threads.stat([b], "look"), threads.stat([b], "look")]);
    // Both started at once.
    expect(await both()).toEqual([[statHere(b)], [statHere(b)]]);
    expect(made.length).toBe(2);
    // Half a minute on, the first asked again (a look every two seconds would); the second asked nothing.
    advance(IDLE_MS / 2);
    expect(await threads.stat([b], "look")).toEqual([statHere(b)]);
    expect(ended).toEqual([]);
    advance(IDLE_MS / 2);
    expect(letGo(made, ended)).toEqual([1]);
    // The next requests: the first's thread as it was, the second started again.
    expect(await both()).toEqual([[statHere(b)], [statHere(b)]]);
    expect([made.length, letGo(made, ended)]).toEqual([3, [1]]);
    // A minute with nothing asked: both let go of.
    advance(IDLE_MS);
    expect(letGo(made, ended).sort()).toEqual([0, 1, 2]);
    expect(await threads.stat([b], "look")).toEqual([statHere(b)]);
    expect(made.length).toBe(4);
  });
});
