// The seam every read the slow-disk workstream moves goes through (SD-D10, SD-T1): a stat and a read of a file under a
// `held` folder wait until the hold is let go, on a thread of the test's and here, and answer what node:fs and
// `readText` answer; under any other folder, at once. The slow disk stood in for (`SLIPBOX_SLOW_DISK`) slows a stat
// or a read by its fourth part alone. What waits is told by the hold, never by a clock (#75).
import { afterEach, describe, expect, test } from "bun:test";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as disk from "../../../../src/core/foundation/platform/disk.ts";
import { type DecodedFile, readText, stamp } from "../../../../src/core/foundation/platform/fsutil.ts";
import { HELD_MS, Hold, heldReads, type StatSeen, statSeen } from "../../../fixtures/walk/slow.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

const sandbox = makeCoreSandbox();
const SLOW_BEFORE = process.env.SLIPBOX_SLOW_DISK;

/** A note's bytes as an editor on another system might leave them: a BOM, CRLF, an invalid byte. */
const BYTES = Buffer.concat([Buffer.from("﻿# Held\r\n\r\nText "), Buffer.from([0xff]), Buffer.from("\r\n")]);

/** A folder of the sandbox's with `held/a.md` and `free/b.md`, both of `BYTES`. */
function tree(): { held: string; free: string } {
  const root = realpathSync(mkdtempSync(join(sandbox, "disk-")));
  for (const dir of ["held", "free"]) mkdirSync(join(root, dir));
  const held = join(root, "held", "a.md");
  const free = join(root, "free", "b.md");
  for (const f of [held, free]) writeFileSync(f, BYTES);
  return { held, free };
}

type Answer = { stat?: StatSeen; text?: DecodedFile; error?: string };

/** A worker of the walk's tests holding `hold` (`slow-worker.ts`): asked a stat or a read made there through the seam,
 *  or to let the hold go once this thread waits on it. */
function onThread(hold: Hold) {
  const w = hold.worker();
  const next = <T>(key: string): Promise<T> =>
    new Promise((resolve) => {
      const on = (e: MessageEvent) => {
        if (!(key in (e.data ?? {}))) return;
        w.removeEventListener("message", on);
        resolve(e.data[key] as T);
      };
      w.addEventListener("message", on);
    });
  return {
    ask(op: "stat" | "read", path: string): Promise<Answer> {
      const answer = next<Answer>("seam");
      w.postMessage({ seam: { op, path } });
      return answer;
    },
    letGo(): Promise<true> {
      const done = next<true>("letGo");
      w.postMessage({ letGo: true });
      return done;
    },
    stop: () => w.terminate(),
  };
}

/** Awaited until a reader waits on the hold — said, and thrown, by HELD_MS, short of the test's timeout. */
async function untilWaiting(hold: Hold): Promise<void> {
  const end = performance.now() + HELD_MS;
  while (!hold.waiting) {
    if (performance.now() > end) throw new Error("nothing waited on `held`");
    await Bun.sleep(2);
  }
}

let held: Hold | null = null;
let stop: (() => void) | null = null;

afterEach(() => {
  held?.release();
  held = null;
  stop?.();
  stop = null;
  disk.setReadWait(null);
  if (SLOW_BEFORE === undefined) delete process.env.SLIPBOX_SLOW_DISK;
  else process.env.SLIPBOX_SLOW_DISK = SLOW_BEFORE;
});

describe("the seam every read goes through (SD-D10)", () => {
  test("on a test's thread: a stat and a read under `held` wait until it's let go, answering what they answer here; elsewhere at once", async () => {
    const { held: file, free } = tree();
    held = new Hold();
    const thread = onThread(held);
    stop = thread.stop;
    // Elsewhere: answered while the hold is on, nothing waiting, nothing let go.
    expect(await thread.ask("stat", free)).toEqual({ stat: statSeen(statSync(free)) });
    expect(await thread.ask("read", free)).toEqual({ text: readText(free) });
    expect([held.waiting, held.letGo, held.gaveUp]).toEqual([0, false, 0]);
    // Under `held`: the thread waits there; once let go, its answer is this thread's.
    for (const op of ["stat", "read"] as const) {
      held.again();
      let came = false;
      const answer = thread.ask(op, file).then((a) => {
        came = true;
        return a;
      });
      await untilWaiting(held);
      expect(came).toBe(false);
      held.release();
      expect(await answer).toEqual(op === "stat" ? { stat: statSeen(statSync(file)) } : { text: readText(file) });
    }
    expect(held.gaveUp).toBe(0);
    // Read as `readText` reads it: the BOM noted, CRLF kept, the invalid byte flagged.
    expect(readText(file)).toMatchObject({ bom: true, crlf: true, invalidUtf8: true });
  });

  test("here: every read of the seam under `held` waits until another thread lets it go, and answers as node:fs does; elsewhere at once", async () => {
    const { held: file, free } = tree();
    held = new Hold();
    const thread = onThread(held);
    stop = thread.stop;
    disk.setReadWait(heldReads);
    // What each read answers, through the seam and from node:fs itself.
    const reads: [string, (p: string) => unknown, (p: string) => unknown][] = [
      ["stat", (p) => statSeen(disk.stat(p)), (p) => statSeen(statSync(p))],
      ["lstat", (p) => statSeen(disk.lstat(p)), (p) => statSeen(lstatSync(p))],
      ["exists", (p) => disk.exists(p), () => true],
      ["realpath", (p) => disk.realpath(p), (p) => realpathSync(p)],
      ["readFile", (p) => disk.readFile(p), (p) => readFileSync(p)],
      ["readRegular", (p) => disk.readRegular(p), (p) => readFileSync(p)],
      ["stamp", (p) => stamp(p), (p) => ({ mtimeMs: statSync(p).mtimeMs, size: statSync(p).size })],
      ["readText", (p) => readText(p), (p) => readText(p)],
    ];
    for (const [name, seam, fs] of reads) {
      // Elsewhere: at once, the hold still on.
      expect([name, seam(free)]).toEqual([name, fs(free)]);
      expect([name, held.waiting, held.letGo]).toEqual([name, 0, false]);
      // Under `held`: this thread waits until the worker, once it sees it waiting, lets it go.
      const letGo = thread.letGo();
      const answer = seam(file);
      expect([name, held.letGo, held.gaveUp]).toEqual([name, true, 0]);
      await letGo;
      disk.setReadWait(null);
      expect([name, answer]).toEqual([name, fs(file)]);
      disk.setReadWait(heldReads);
      held.again();
    }
  });

  test("SLIPBOX_SLOW_DISK: a fourth part slows each stat and read of a path with the folder on its way; none without it", () => {
    expect(disk.slowDisk({ SLIPBOX_SLOW_DISK: "slowdisk:2500" })).toEqual({ name: "slowdisk", ms: 2500 });
    expect(disk.slowDisk({ SLIPBOX_SLOW_DISK: "slowdisk:8000:1500" })).toEqual({
      name: "slowdisk",
      ms: 8000,
      deadline: 1500,
    });
    expect(disk.slowDisk({ SLIPBOX_SLOW_DISK: "slowdisk:8000:1500:300" })).toEqual({
      name: "slowdisk",
      ms: 8000,
      deadline: 1500,
      stat: 300,
    });
    expect(disk.slowDisk({ SLIPBOX_SLOW_DISK: "slowdisk:8000::300" })).toEqual({
      name: "slowdisk",
      ms: 8000,
      stat: 300,
    });
    expect(disk.slowDisk({})).toBeNull();
    expect(disk.onTheWay("/v/held/a.md", "held")).toBe(true);
    expect(disk.onTheWay("/v/held", "held")).toBe(true);
    expect(disk.onTheWay("/v/helden/a.md", "held")).toBe(false);

    const { held: file, free } = tree();
    // No fourth part: a stat and a read under the folder at once — a minute's wait would be past the test's timeout.
    process.env.SLIPBOX_SLOW_DISK = "held:60000";
    expect(statSeen(disk.stat(file))).toEqual(statSeen(statSync(file)));
    expect(readText(file)).toEqual(readText(free));
    // A fourth part: each takes it under the folder; elsewhere, none.
    process.env.SLIPBOX_SLOW_DISK = "held:60000::150";
    for (const read of [() => disk.stat(file), () => readText(file), () => disk.exists(file)]) {
      const at = performance.now();
      read();
      expect(performance.now() - at).toBeGreaterThanOrEqual(145);
    }
    process.env.SLIPBOX_SLOW_DISK = "held:60000::60000";
    expect(statSeen(disk.stat(free))).toEqual(statSeen(statSync(free)));
  });
});
