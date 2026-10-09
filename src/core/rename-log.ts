// The renames log (7.4): each rename, move, relink or replace across files (25.4) carried out in a
// vault — every file it rewrote, with the span of its text that was different before, and what
// moved — so the last one can be undone exactly, as long as nothing it wrote has changed since. In
// the vault's state, as its redirects are: personal, never committed.

import { join } from "node:path";
import { readJson, writeJson } from "./fsutil.ts";
import { type Keyed, stateDir } from "./paths.ts";

export interface LoggedFile {
  /** Where the file is after the rename (absolute); how it's shown, and its vault's name when another's. */
  abs: string;
  shown: string;
  vault: string | null;
  /** The lines it changed, for the undo's preview. */
  edits: { line: number; before: string; after: string }[];
  /** The text as the rename left it, by hash; and where it differs from before: `length` characters at `at`, which were `was`. */
  hash: string;
  at: number;
  length: number;
  was: string;
}

export interface LoggedRename {
  id: string;
  /** When (ISO). */
  at: string;
  kind: "note" | "folder" | "vault" | "relink" | "heading" | "convert" | "replace";
  from: string;
  to: string;
  move: { from: string; to: string; dir: boolean } | null;
  /** The first folder the move made to hold what moved (absolute), if it made one. */
  made: string | null;
  /** The branch it was made on (5.9): undone only there. Absent in a log written before. */
  branch?: string | null;
  moves: [string, string][];
  vaults: [string, string][];
  files: LoggedFile[];
}

interface LogFile {
  version: 1;
  renames: LoggedRename[];
}

/** How many renames are kept, the newest last. */
const KEEP = 20;

const logFile = (v: Keyed) => join(stateDir(v), "renames.json");

export function readRenames(v: Keyed): LoggedRename[] {
  const f = readJson<LogFile | null>(logFile(v), null);
  return f?.version === 1 && Array.isArray(f.renames) ? f.renames.filter((r) => r && typeof r.id === "string" && Array.isArray(r.files)) : [];
}

function save(v: Keyed, renames: LoggedRename[]): void {
  try {
    writeJson(logFile(v), { version: 1, renames: renames.slice(-KEEP) } satisfies LogFile);
  } catch {}
}

export function logRename(v: Keyed, r: LoggedRename): void {
  save(v, [...readRenames(v), r]);
}

/** A rename undone: out of the log. */
export function forgetRename(v: Keyed, id: string): void {
  save(v, readRenames(v).filter((r) => r.id !== id));
}

/** Where `next` differs from `text`: `length` characters of it at `at`, which were `was`. */
export function changedSpan(text: string, next: string): { at: number; length: number; was: string } {
  const max = Math.min(text.length, next.length);
  let at = 0;
  while (at < max && text[at] === next[at]) at++;
  let tail = 0;
  while (tail < max - at && text[text.length - 1 - tail] === next[next.length - 1 - tail]) tail++;
  return { at, length: next.length - at - tail, was: text.slice(at, text.length - tail) };
}
