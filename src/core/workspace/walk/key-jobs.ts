// A key's own reads (SD-T5, SD-D4) that ask more than a `stat` or a `read`. Opening a file: its way checked for a link
// not followed (VV-D6, `blockingLink`, as the TUI's look checks an open file's), then its text and the stamp of the file
// it opened (`readTextStamped`), and what else an open reads of it — whether you may write it (VV-D5) and, for a file
// outside the vault open, the vault it's in (VV-D7). A git read's start: what it's read against — git's index,
// `HEAD` and its commit, the note's file — to tell, once git answers, whether any moved. Each is answered on a disk
// thread (disk-jobs.ts hands it here), or here at once on a test's App, which reads on the screen's thread unless asked
// (SD-D10) — the same code either way.

import { constants } from "node:fs";
import { dirname, join } from "node:path";
import * as disk from "../../foundation/platform/disk.ts";
import { readTextStamped } from "../../foundation/platform/fsutil.ts";
import { headCommit, headOf } from "../git/git.ts";
import { blockingLink, type LinkPlace } from "../vaults/symlinks.ts";
import { vaultOf } from "../vaults/vault.ts";
import type { ReadAnswer } from "./disk-jobs.ts";

/** A file to open (by its whole path); `outside` the vault open, its own vault looked for; its way checked from each
 *  of `ways` in turn (VV-D6), the links looked at this once by their keys (`looking`; none: not checked, another vault's
 *  file). `textOnly`: its text alone, for a preview or a peek — not whether you may write it, nor what's looked at.
 *  `wayOnly`: its way alone, nothing read — a buffer open already, through a link. */
export interface OpenAsk {
  path: string;
  outside: boolean;
  ways: LinkPlace[];
  looking: string[];
  textOnly?: boolean;
  wayOnly?: boolean;
}

/** A file read for opening it: its text and stamp, or its error's code (null: not read, a link not followed on its way:
 *  `blocked`, `at` the place of `ways` that keeps it); why you may not write it (null: you may); asked for, the vault
 *  it's in (null: none, Elsewhere's); and the link looked at it's read through (`looked`: read-only, never indexed). */
export interface OpenAnswer {
  read: ReadAnswer | null;
  unwritable: string | null;
  vault: string | null;
  blocked: { link: string; target: string | null; at: number } | null;
  looked: string | null;
}

/** A place as its way is checked from it (`blockingLink`): what a disk thread is sent of a vault's location. */
export function linkPlace(loc: LinkPlace): LinkPlace {
  return { mode: loc.mode, root: loc.root, ...(loc.workDir ? { workDir: loc.workDir } : {}) };
}

/** Why a file can't be written, when it can be read (VV-D5): not by you, or not in its folder; null when it can. */
export function fileUnwritable(path: string): string | null {
  try {
    disk.access(path, constants.W_OK);
    // A save writes beside it and renames it over the file: its folder must take that.
    disk.access(dirname(path), constants.W_OK);
    return null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "EACCES" || code === "EPERM" || code === "EROFS"
      ? code === "EROFS"
        ? "its disk is read-only"
        : "you may not write it (no permission)"
      : null;
  }
}

/** `ask` answered: its way checked, then, nothing keeping it, the file read, then, read, what else an open asks of it. */
export function answerOpen(ask: OpenAsk): OpenAnswer {
  const none = { unwritable: null, vault: null, blocked: null, looked: null };
  const looking = new Set(ask.looking);
  for (const [at, place] of ask.ways.entries()) {
    const blocked = blockingLink(place, ask.path, { looking: (k) => looking.has(k) });
    if (blocked) return { ...none, read: null, blocked: { ...blocked, at } };
  }
  if (ask.wayOnly) return { ...none, read: null };
  let read: ReadAnswer;
  try {
    read = readTextStamped(ask.path);
  } catch (err) {
    read = { error: (err as NodeJS.ErrnoException).code ?? String(err) };
  }
  if ("error" in read || ask.textOnly) return { ...none, read };
  const own = ask.ways[0];
  return {
    read,
    unwritable: fileUnwritable(ask.path),
    vault: ask.outside ? vaultOf(ask.path) : null,
    blocked: null,
    looked: own && looking.size ? (blockingLink(own, ask.path)?.link ?? null) : null,
  };
}

/** What a git read is read against: the checkout's git folders (null: none), and the note's file (null: none). */
export interface GitAsk {
  git: { gitDir: string; common: string } | null;
  note: string | null;
}

/** A git read's ground, each part a stamp ("" for none): git's index, `HEAD` and the commit it's at, the note's file. */
export interface GitAnswer {
  index: string;
  head: string;
  note: string;
}

const stampOf = (path: string): string => {
  try {
    const s = disk.stat(path);
    return `${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`;
  } catch {
    return "";
  }
};

/** `ask` answered: git's index statted, `HEAD` read, and the note's file statted. */
export function answerGit(ask: GitAsk): GitAnswer {
  const g = ask.git;
  return {
    index: g ? stampOf(join(g.gitDir, "index")) : "",
    head: g ? JSON.stringify([headOf(g), headCommit(g)]) : "",
    note: ask.note ? stampOf(ask.note) : "",
  };
}
