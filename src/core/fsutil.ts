// Filesystem helpers shared by every face. Writes are atomic (plan 4.6): temp file plus rename
// in the same directory, so a crash or a full disk never truncates a note.

import {
  accessSync,
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { threadId } from "node:worker_threads";

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/**
 * How old a temporary file is, at least, once no write is still under way to it: a write takes seconds, and a network
 * share's clock may be minutes off this machine's — another writer's file just made can look minutes old.
 */
export const STALE_TEMP_MS = 60 * 60_000;

/**
 * The temporary files `atomicWrite` left beside `name` in `dir` (`.<name>.slipbox-…tmp`) and no write is under way to
 * any more: a thread let go of mid-write (#10), a process stopped, leaves one behind.
 */
export function sweepTemps(dir: string, name: string, now = Date.now()): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const n of names) {
    if (!n.startsWith(`.${name}.slipbox-`) || !n.endsWith(".tmp")) continue;
    try {
      if (now - statSync(join(dir, n)).mtimeMs > STALE_TEMP_MS) unlinkSync(join(dir, n));
    } catch {}
  }
}

/** The random part of a temporary file's name (`tempPath`; a test's own repeats). */
export const tempRandom = { next: (): string => randomBytes(4).toString("hex") };

/**
 * Where `atomicWrite` writes `path` first, beside it: a name of its own, whatever else writes the file — another
 * process, another thread of this one (the walk's, T12; one writing another vault's index, #10) — by the process,
 * the thread and a random part, as the export's spool names its own; no longer than the process and the millisecond
 * made it, so a file's name near the system's limit still writes.
 */
export function tempPath(path: string): string {
  return join(dirname(path), `.${basename(path)}.slipbox-${process.pid}-${threadId}-${tempRandom.next()}.tmp`);
}

/**
 * Write `path` atomically; returns the written file's stamp, taken from the temp file itself (a
 * rename keeps mtime and size) — never a stat of the path afterwards, which could see another
 * process's write that landed in between and take it for ours.
 */
export function atomicWrite(path: string, content: string | Uint8Array): Stamp {
  const dir = dirname(path);
  ensureDir(dir);
  // A file being replaced keeps its permissions.
  let mode = 0o644;
  try {
    mode = statSync(path).mode & 0o7777;
  } catch {}
  // Made anew, never anything already at its name opened: a name taken, another.
  let tmp = tempPath(path);
  let fd: number;
  for (let tries = 1; ; tries++) {
    try {
      fd = openSync(tmp, "wx", mode);
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST" || tries >= 8) throw err;
      tmp = tempPath(path);
    }
  }
  let written: Stamp;
  try {
    writeSync(fd, typeof content === "string" ? Buffer.from(content, "utf8") : content);
    fsyncSync(fd);
    const st = fstatSync(fd);
    written = { mtimeMs: st.mtimeMs, size: st.size };
  } catch (err) {
    // A write that failed (a full disk) leaves nothing half-written behind it, and says why: not the close failing
    // after it (a failing disk, a network's).
    try {
      closeSync(fd);
    } catch {}
    try {
      unlinkSync(tmp);
    } catch {}
    throw err;
  }
  try {
    closeSync(fd);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {}
    throw err;
  }
  try {
    chmodSync(tmp, mode); // the umask may have narrowed it
  } catch {}
  try {
    renameSync(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {}
    throw err;
  }
  return written;
}

export class WriteRefused extends Error {}

/**
 * Write a note in place (plan 4.6, 7.5): atomically, through a symlink to the file it points at
 * (the link stays a link), and never outside `root` — a symlink out of the vault is refused, unless
 * the caller vouches for the links on its way (`through`: home's followed links, Elsewhere's; VV-D6).
 */
export function writeNote(
  root: string,
  path: string,
  content: string | Uint8Array,
  opts: { through?: boolean } = {},
): Stamp {
  const target = realTarget(path);
  let realRoot = root;
  try {
    realRoot = realpathSync(root);
  } catch {}
  const rel = relative(realRoot, target);
  if (!opts.through && (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)))
    throw new WriteRefused(`${path} resolves outside the vault (${target}) — not writing there`);
  return atomicWrite(target, content);
}

/**
 * Where a write to `path` really lands: the file's real path, or, for a file not there yet, the
 * real path of its nearest existing folder with the rest appended — a symlinked folder on the way
 * counts, so a new file can't be slipped out of the vault through one.
 */
export function realTarget(path: string): string {
  try {
    return realpathSync(path);
  } catch {}
  const rest: string[] = [];
  let dir = resolve(path);
  for (;;) {
    rest.unshift(basename(dir));
    const up = dirname(dir);
    if (up === dir) return resolve(path);
    dir = up;
    try {
      return join(realpathSync(dir), ...rest);
    } catch {}
  }
}

/**
 * Whether a relative path (as `relative` gives it) climbs out of where it's from: a ".." segment
 * first, or another drive's. A name that merely starts with dots ("..notes") stays in.
 */
export function climbsOut(rel: string): boolean {
  return (
    rel === ".." ||
    rel.startsWith(`..${sep}`) ||
    rel.startsWith("../") ||
    isAbsolute(rel) ||
    (process.platform === "win32" && /^[A-Za-z]:/.test(rel))
  );
}

/** Whether a write to `path` would land inside `root` (both by their real paths). */
export function landsInside(root: string, path: string): boolean {
  let realRoot = root;
  try {
    realRoot = realpathSync(root);
  } catch {}
  return !climbsOut(relative(realRoot, realTarget(path)));
}

/**
 * Whether what a move takes at `path` is inside `root` (D260): a symlink moved as a link (`asLink`) by its own entry,
 * in its folder by that folder's real path, wherever it leads; anything else by its real path, as `landsInside`.
 */
export function entryInside(root: string, path: string, asLink: boolean): boolean {
  let link = false;
  try {
    link = asLink && lstatSync(path).isSymbolicLink();
  } catch {}
  return landsInside(root, link ? dirname(resolve(path)) : path);
}

/** Whether anything is at `path` — a link leading nowhere too, which `existsSync` says isn't there. */
export function entryAt(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

export interface Stamp {
  mtimeMs: number;
  size: number;
}

export function stamp(path: string): Stamp | null {
  try {
    const st = statSync(path);
    return { mtimeMs: st.mtimeMs, size: st.size };
  } catch {
    return null;
  }
}

export interface DecodedFile {
  text: string;
  bom: boolean;
  crlf: boolean;
  invalidUtf8: boolean;
}

const decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });
const strictDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Read as UTF-8 (0.11): invalid bytes become U+FFFD and are flagged; the BOM is noted. */
export function readText(path: string): DecodedFile {
  return decodeText(readRegular(path));
}

/**
 * A file's bytes, only when it is a regular file of at most `max` bytes. A cloned or unpacked vault
 * can hold a symlink to /dev/zero, a FIFO or a tty: reading one would never end (or never start).
 * Opened without blocking, so a FIFO is refused rather than waited on.
 */
export function readRegular(path: string, max = Number.POSITIVE_INFINITY): Buffer {
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

/** The small files a vault controls (config, .gitignore, version): 1 MB is far more than any needs. */
export const SMALL_FILE = 1 << 20;

export function decodeText(bytes: Uint8Array): DecodedFile {
  let invalidUtf8 = false;
  let text: string;
  try {
    text = strictDecoder.decode(bytes);
  } catch {
    invalidUtf8 = true;
    text = decoder.decode(bytes);
  }
  const bom = text.charCodeAt(0) === 0xfeff;
  if (bom) text = text.slice(1);
  return { text, bom, crlf: text.includes("\r\n"), invalidUtf8 };
}

export function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(path: string, value: unknown): void {
  atomicWrite(path, JSON.stringify(value, null, 2) + "\n");
}

/** The files in `dir` that `match` names, last changed more than `ms` ago, removed; what can't be read or removed is
 *  left. A state folder's leftovers: a restart's notes, background upgrades' answers (UPG). */
export function removeOlderThan(dir: string, ms: number, match = /^/, now = Date.now()): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of names) {
    if (!match.test(e)) continue;
    const file = join(dir, e);
    try {
      if (now - statSync(file).mtimeMs > ms) rmSync(file, { force: true });
    } catch {}
  }
}

/**
 * A state file whose absolute paths name places in a folder that moved (21.8: the trash's, the undo
 * log's): each string that is `from` or a path in it rewritten to the same place in `to`. Nothing
 * written when nothing changed, or the file isn't there.
 */
export function carryPaths(file: string, from: string, to: string): void {
  const data = readJson<unknown>(file, undefined);
  if (data === undefined) return;
  let changed = false;
  const carry = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (v !== from && !v.startsWith(`${from}${sep}`)) return v;
      changed = true;
      return to + v.slice(from.length);
    }
    if (Array.isArray(v)) return v.map(carry);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, carry(x)]));
    return v;
  };
  const next = carry(data);
  if (changed) writeJson(file, next);
}

/** Why a folder can't be read, in a few words (VV-D5); null when it can. */
export function folderUnreadable(dir: string): string | null {
  try {
    if (!statSync(dir).isDirectory()) return "it isn't a folder";
    // Listed (read) and gone into (searched): both, as the account running slipbox may.
    accessSync(dir, constants.R_OK | constants.X_OK);
    return null;
  } catch (err) {
    return unreadableWords((err as NodeJS.ErrnoException).code ?? (err as Error).message);
  }
}

/** Why a folder couldn't be read, by its error's code, in `folderUnreadable`'s words (a listing's too, T12). */
export function unreadableWords(code: string): string {
  if (code === "EACCES" || code === "EPERM") return "you may not read it (no permission)";
  if (code === "ENOENT") return "it isn't there";
  if (code === "ENOTDIR") return "it isn't a folder";
  return code;
}
