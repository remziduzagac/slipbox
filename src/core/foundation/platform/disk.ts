// The one seam the reads of the disk go through (SD-D10): a folder's listing, a path's stat and lstat (its real path
// too, and whether anything is there), a file's bytes. Each is node:fs's own call, made on whichever thread asks — the
// screen's, the walk's, a listing's — and the CLI's, which calls these directly. What it adds is for the tests alone: a
// terminal test's slow disk (`SLIPBOX_SLOW_DISK`, `slowDisk`) and a unit test's hold (`setFolderReader`,
// `setReadWait`: tests/fixtures/walk/slow.ts), each reaching every read made through it, on every thread that takes it.

import {
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

/** A slow disk stood in for: the folder's name, its listing's delay, the threads' deadline, each stat's and read's. */
export interface SlowDisk {
  name: string;
  ms: number;
  deadline?: number;
  stat?: number;
}

/**
 * A slow disk, for the terminal tests (T12; `SLIPBOX_SLOW_DISK=<folder name>:<ms>[:<deadline ms>[:<stat ms>]]`): a
 * folder of that name takes so long to list, on whichever thread lists it — the disk a check can't mount. Given a
 * fourth part, each stat and read of a path with that folder on its way takes so long too; none when it's left out
 * (`<name>:<ms>::<stat ms>` gives one without a deadline). Its deadline is walk-thread.ts's.
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

/** The slow disk this process was given, read again only when its variable changed: asked before every read. */
let given: { raw: string | undefined; slow: SlowDisk | null } = { raw: undefined, slow: null };
function slowNow(): SlowDisk | null {
  const raw = process.env.SLIPBOX_SLOW_DISK;
  if (raw !== given.raw) given = { raw, slow: slowDisk() };
  return given.slow;
}

/** Whether a folder named `name` is on the way to `path`, or is `path` itself. */
export function onTheWay(path: string, name: string): boolean {
  return path.split(/[\\/]/).includes(name);
}

const readdirTyped = (abs: string): Dirent[] => {
  const slow = slowNow();
  if (slow && basename(abs) === slow.name) Bun.sleepSync(slow.ms);
  return readdirSync(abs, { withFileTypes: true });
};

/** How a folder is listed: `readdirSync` (a terminal test's slow disk held up: `slowDisk`), unless a test holds it up
 *  itself (`setFolderReader`). */
export let folderReader = readdirTyped;

/** A folder's entries, typed: as the walk reads them, the explorer's listings and the watcher's too. */
export function readFolder(abs: string): Dirent[] {
  return folderReader(abs);
}

/** A test's folder reader (T12: one held up on purpose, as a slow disk is); null, `readdirSync` again. */
export function setFolderReader(read: ((abs: string) => Dirent[]) | null): void {
  folderReader = read ?? readdirTyped;
}

/** Before a stat or a read of `path`: a terminal test's slow disk, given a fourth part, taking its time. */
const slowReads = (path: string): void => {
  const slow = slowNow();
  if (slow?.stat && onTheWay(path, slow.name)) Bun.sleepSync(slow.stat);
};

/** What each stat and read through the seam does first: `slowReads`, unless a test holds them up (`setReadWait`). */
let readWait = slowReads;

/** A test's wait before each stat and read through the seam (a hold, as `setFolderReader`'s on a listing); null, the
 *  slow disk's again. */
export function setReadWait(wait: ((path: string) => void) | null): void {
  readWait = wait ?? slowReads;
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
  readWait(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw Object.assign(new Error(`${path}: not a regular file`), { code: "ENOTREG" });
    if (st.size > max) throw Object.assign(new Error(`${path}: larger than ${max} bytes`), { code: "EFBIG" });
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}
