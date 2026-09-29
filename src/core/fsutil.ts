// Filesystem helpers shared by every face. Writes are atomic (plan 4.6): temp file plus rename
// in the same directory, so a crash or a full disk never truncates a note.

import { chmodSync, closeSync, constants, fstatSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/**
 * Write `path` atomically; returns the written file's stamp, taken from the temp file itself (a
 * rename keeps mtime and size) — never a stat of the path afterwards, which could see another
 * process's write that landed in between and take it for ours.
 */
export function atomicWrite(path: string, content: string | Uint8Array): Stamp {
  const dir = dirname(path);
  ensureDir(dir);
  const tmp = join(dir, `.${basename(path)}.slipbox-${process.pid}-${Date.now()}.tmp`);
  // A file being replaced keeps its permissions.
  let mode = 0o644;
  try {
    mode = statSync(path).mode & 0o7777;
  } catch {}
  const fd = openSync(tmp, "w", mode);
  let written: Stamp;
  try {
    writeSync(fd, typeof content === "string" ? Buffer.from(content, "utf8") : content);
    fsyncSync(fd);
    const st = fstatSync(fd);
    written = { mtimeMs: st.mtimeMs, size: st.size };
  } finally {
    closeSync(fd);
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
 * (the link stays a link), and never outside `root` — a symlink out of the vault is refused.
 */
export function writeNote(root: string, path: string, content: string | Uint8Array): Stamp {
  const target = realTarget(path);
  let realRoot = root;
  try {
    realRoot = realpathSync(root);
  } catch {}
  const rel = relative(realRoot, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new WriteRefused(`${path} resolves outside the vault (${target}) — not writing there`);
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

/** Whether a write to `path` would land inside `root` (both by their real paths). */
export function landsInside(root: string, path: string): boolean {
  let realRoot = root;
  try {
    realRoot = realpathSync(root);
  } catch {}
  const rel = relative(realRoot, realTarget(path));
  return !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel));
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
