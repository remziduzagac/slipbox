// The one seam the reads of the disk go through (SD-D10): a folder's listing, a path's stat and lstat (its real path
// too, whether anything is there, and whether you may use it), a file's bytes. Each is node:fs's own call, made on whichever thread asks — the
// screen's, the walk's, a listing's — and the CLI's, which calls these directly. What it adds is for the tests alone: a
// terminal test's slow disk (`SLIPBOX_SLOW_DISK`, `slowDisk`) and a unit test's hold (tests/fixtures/walk/slow.ts).
//
// Two listings, apart (SD-T1). The walk's (`readFolder`: a walk, the explorer's listing threads, the filter) takes the
// stand-in on every thread, the screen's too, as since T12, so a walk put back on the screen's thread is slowed there
// and T12's checks see it; a test holds it with `setFolderReader`. The rest (`entries`: the watcher's listings, the
// explorer's tree; and every stat and read here) takes the stand-in on every thread but the screen's, and a test's hold
// on the thread that asks (`setReadWait`): on the screen's thread those go at once, as they did, until the task that
// moves each off it.

import {
  accessSync,
  closeSync,
  constants,
  type Dirent,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  type Stats,
  statSync,
} from "node:fs";
import { basename } from "node:path";
import { isMainThread } from "node:worker_threads";

/** A slow disk stood in for: the folder's name, its listing's delay, the threads' deadline, each stat's and read's. */
export interface SlowDisk {
  name: string;
  ms: number;
  deadline?: number;
  stat?: number;
}

/**
 * A slow disk, for the terminal tests (T12; `SLIPBOX_SLOW_DISK=<folder name>:<ms>[:<deadline ms>[:<stat ms>]]`): a
 * folder of that name takes so long to list (the walk's listing on every thread, `entries` on every thread but the
 * screen's) — the disk a check can't mount. Given a fourth part, each stat and read of a path with that folder on its
 * way takes so long too, on every thread but the screen's; none when it's left out (`<name>:<ms>::<stat ms>` gives one
 * without a deadline). Its deadline is walk-thread.ts's.
 */
export function slowDisk(env = process.env): SlowDisk | null {
  const [name, ms, deadline, stat] = (env.SLIPBOX_SLOW_DISK ?? "").split(":");
  if (!name || !(Number(ms) > 0)) return null;
  return {
    name,
    ms: Number(ms),
    ...(Number(deadline) > 0 ? { deadline: Number(deadline) } : {}),
    ...(Number(stat) > 0 ? { stat: Number(stat) } : {}),
  };
}

/** The slow disk this process was given, read once as each thread starts. */
const given = slowDisk();

/** The slow disk the walk's listing stands in for on this thread: on every thread, the screen's too (`readFolder`). */
let walkSlow: SlowDisk | null = given;

/** The slow disk the rest of the seam stands in for on this thread (`entries`, each stat and read): on every thread but
 *  the screen's, whose reads go at once until the task that moves each off it. */
let stood: SlowDisk | null = isMainThread ? null : given;

/** This thread's slow disk, a test's (none: null): `seam` for `entries` and each stat and read, `walk` for the walk's
 *  listing — the same unless given. */
export function setSlowDisk(seam: SlowDisk | null, walk: SlowDisk | null = seam): void {
  stood = seam;
  walkSlow = walk;
}

/** The slow disks this thread stands in for: the walk's listing's, and the rest of the seam's. */
export function slowDiskHere(): { walk: SlowDisk | null; seam: SlowDisk | null } {
  return { walk: walkSlow, seam: stood };
}

/** Whether a folder named `name` is on the way to `path`, or is `path` itself. */
export function onTheWay(path: string, name: string): boolean {
  return path.split(/[\\/]/).includes(name);
}

const walkListing = (abs: string): Dirent[] => {
  if (walkSlow && basename(abs) === walkSlow.name) Bun.sleepSync(walkSlow.ms);
  return readdirSync(abs, { withFileTypes: true });
};

/** How the walk lists a folder: `readdirSync`, a terminal test's slow disk held up on every thread (`walkSlow`), unless
 *  a test holds it up itself (`setFolderReader`). */
export let folderReader = walkListing;

/** A folder's entries, typed, as the walk reads them (a walk's listings, the explorer's listing threads', the filter's):
 *  the stand-in on every thread, the screen's too, as since T12. */
export function readFolder(abs: string): Dirent[] {
  return folderReader(abs);
}

/** A test's folder reader for the walk (T12: one held up on purpose, as a slow disk is); null, `readdirSync` again. */
export function setFolderReader(read: ((abs: string) => Dirent[]) | null): void {
  folderReader = read ?? walkListing;
}

/** A test's wait before each of the rest of the seam's reads on this thread (a hold); none, the slow disk's. */
let held: ((path: string) => void) | null = null;

/** Before a stat or a read of `path`: a test's hold, else a terminal test's slow disk, given a fourth part, on a thread
 *  that took it. */
function readWait(path: string): void {
  if (held) held(path);
  else if (stood?.stat && onTheWay(path, stood.name)) Bun.sleepSync(stood.stat);
}

/** A test's wait before `entries` and each stat and read through the seam on this thread (a hold, as
 *  `setFolderReader`'s on the walk's listing); null, the slow disk's again. */
export function setReadWait(wait: ((path: string) => void) | null): void {
  held = wait;
}

/**
 * A folder's entries, typed, read for what isn't a walk — the watcher's listings, the explorer's tree (SD-T1 moved them
 * here): a test's hold on this thread (`setReadWait`), else a terminal test's slow disk on a thread that took it; on
 * the screen's thread at once, as before, until the tasks that move them (SD-T3, SD-T7).
 */
export function entries(abs: string): Dirent[] {
  if (held) held(abs);
  else if (stood && basename(abs) === stood.name) Bun.sleepSync(stood.ms);
  return readdirSync(abs, { withFileTypes: true });
}

/** `path`'s stat, its links followed: `statSync`'s, thrown as it throws. */
export function stat(path: string): Stats {
  readWait(path);
  return statSync(path);
}

/** `path`'s own stat, a link's not followed: `lstatSync`'s. */
export function lstat(path: string): Stats {
  readWait(path);
  return lstatSync(path);
}

/** Whether anything is at `path`, its links followed: `existsSync`'s answer, false for any error. */
export function exists(path: string): boolean {
  readWait(path);
  return existsSync(path);
}

/** Whether this account may use `path` as `mode` asks (`constants.R_OK`, …): `accessSync`'s, thrown as it throws. */
export function access(path: string, mode: number): void {
  readWait(path);
  accessSync(path, mode);
}

/** `path`'s real path, every link on its way followed: `realpathSync`'s. */
export function realpath(path: string): string {
  readWait(path);
  return realpathSync(path);
}

/** A file's bytes, whole: `readFileSync`'s. */
export function readFile(path: string): Buffer {
  readWait(path);
  return readFileSync(path);
}

/**
 * A file's bytes, only when it is a regular file of at most `max` bytes. A cloned or unpacked vault
 * can hold a symlink to /dev/zero, a FIFO or a tty: reading one would never end (or never start).
 * Opened without blocking, so a FIFO is refused rather than waited on.
 */
export function readRegular(path: string, max = Number.POSITIVE_INFINITY): Buffer {
  return readRegularStat(path, max).bytes;
}

/** `readRegular`'s bytes and the stat it checked them by, both of the one file it opened: a file renamed over the path
 *  meanwhile (a save written aside) is neither's. */
export function readRegularStat(path: string, max = Number.POSITIVE_INFINITY): { bytes: Buffer; stat: Stats } {
  readWait(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw Object.assign(new Error(`${path}: not a regular file`), { code: "ENOTREG" });
    if (stat.size > max) throw Object.assign(new Error(`${path}: larger than ${max} bytes`), { code: "EFBIG" });
    return { bytes: readFileSync(fd), stat };
  } finally {
    closeSync(fd);
  }
}
