// Filesystem helpers shared by every face. Writes are atomic (plan 4.6): temp file plus rename
// in the same directory, so a crash or a full disk never truncates a note.

import { chmodSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative } from "node:path";

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function atomicWrite(path: string, content: string | Uint8Array): void {
  const dir = dirname(path);
  ensureDir(dir);
  const tmp = join(dir, `.${basename(path)}.slipbox-${process.pid}-${Date.now()}.tmp`);
  // A file being replaced keeps its permissions.
  let mode = 0o644;
  try {
    mode = statSync(path).mode & 0o7777;
  } catch {}
  const fd = openSync(tmp, "w", mode);
  try {
    writeSync(fd, typeof content === "string" ? Buffer.from(content, "utf8") : content);
    fsyncSync(fd);
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
}

export class WriteRefused extends Error {}

/**
 * Write a note in place (plan 4.6, 7.5): atomically, through a symlink to the file it points at
 * (the link stays a link), and never outside `root` — a symlink out of the vault is refused.
 */
export function writeNote(root: string, path: string, content: string | Uint8Array): void {
  let target = path;
  try {
    target = realpathSync(path);
  } catch {}
  let realRoot = root;
  try {
    realRoot = realpathSync(root);
  } catch {}
  const rel = relative(realRoot, target);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new WriteRefused(`${path} resolves outside the vault (${target}) — not writing there`);
  atomicWrite(target, content);
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
  const bytes = readFileSync(path);
  return decodeText(bytes);
}

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
