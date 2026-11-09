// Who changed what, and a file's history (plans 26.4 and 22.1): a line's last commit by `git blame` — of the last
// commit, never the working tree, which could run a repository's filter (docs: the code-execution review); a line
// changed since is the working tree's own — and a file's commits by `git log --follow`, each with the path it had then,
// so a version from before a rename can be read; a branch's commits since its base, and the files each changed (EG-D4).
// Every command with `23.6`'s guards in a root not trusted, a file's path taken as that file, literally (`literalArgs`).

import { execFileSync } from "node:child_process";
import { posix, sep } from "node:path";
import type { Checkout } from "../git.ts";
import { type Changed, gitArgs, gitReadLater, literalArgs, literalEnv, parseNameStatus } from "../branches/gitops.ts";
import { diffLines } from "../merge/merge.ts";

const OPTS = {
  encoding: "utf8" as const,
  stdio: ["ignore", "pipe", "ignore"] as ["ignore", "pipe", "ignore"],
  timeout: 15_000,
  maxBuffer: 64 * 1024 * 1024,
};

/** A git command's output, or null; one given a file's path (`literal`) takes it as that file, never a pattern. */
function run(c: Pick<Checkout, "root">, args: string[], literal = false): string | null {
  try {
    return literal
      ? execFileSync("git", literalArgs(c.root, args), { ...OPTS, env: literalEnv() })
      : execFileSync("git", gitArgs(c.root, args), OPTS);
  } catch {
    return null;
  }
}

const posixPath = (p: string) => p.split(sep).join(posix.sep);

/** A commit, as a file's history and blame show it. */
export interface CommitInfo {
  hash: string;
  author: string;
  /** Seconds since the epoch. */
  time: number;
  subject: string;
  /** The file's path at that commit (a rename followed back). */
  path: string;
}

/** Where a line of the text now was in the last commit's (lines from 1), or null: it's changed since. */
export function lineInHead(head: string, now: string, line: number): number | null {
  const a = head.replace(/\r\n/g, "\n").split("\n");
  const b = now.replace(/\r\n/g, "\n").split("\n");
  let shift = 0;
  for (const h of diffLines(a, b)) {
    // The line before this change: as far off as the changes before it put it.
    if (line - 1 < h.bStart) break;
    if (line - 1 < h.bStart + h.bLen) return null;
    shift += h.aLen - h.bLen;
  }
  return line + shift;
}

/**
 * Lines `from` to `to` of the text now (from 1) as the last commit has them: the first and the last of them that are
 * committed, each where it was there; null when none is (each changed since, or the range past the text's end).
 */
export function linesInHead(head: string, now: string, from: number, to = from): { from: number; to: number } | null {
  // A byte order mark is no change to the first line, nor a line ending to any.
  const lines = (text: string) => text.replace(/^﻿/, "").replace(/\r\n/g, "\n").split("\n");
  const a = lines(head);
  const b = lines(now);
  const hunks = diffLines(a, b);
  /** Line `line` of the text now in the commit's, or null: changed since. */
  const at = (line: number): number | null => {
    let shift = 0;
    for (const h of hunks) {
      if (line - 1 < h.bStart) break;
      if (line - 1 < h.bStart + h.bLen) return null;
      shift += h.aLen - h.bLen;
    }
    return line + shift;
  };
  const [lo, hi] = from <= to ? [from, Math.min(to, b.length)] : [to, Math.min(from, b.length)];
  let first: number | null = null;
  for (let l = lo; l <= hi && first === null; l++) first = at(l);
  if (first === null) return null;
  let last: number | null = null;
  for (let l = hi; l >= lo && last === null; l--) last = at(l);
  return { from: first, to: last ?? first };
}

/** git blame's porcelain for one line: its commit's hash, author, time and subject. */
export function parseBlame(porcelain: string, path: string): CommitInfo | null {
  const lines = porcelain.split("\n");
  const hash = /^([0-9a-f]{40}) /.exec(lines[0] ?? "")?.[1];
  if (!hash) return null;
  const field = (k: string) => lines.find((l) => l.startsWith(`${k} `))?.slice(k.length + 1) ?? "";
  return {
    hash,
    author: field("author"),
    time: Number(field("author-time")) || 0,
    subject: field("summary"),
    path: field("filename") || path,
  };
}

/** Who last changed line `line` of a file as the last commit has it (lines from 1); null where git can't say. */
export function blameLine(c: Pick<Checkout, "root">, path: string, line: number): CommitInfo | null {
  const out = run(c, ["blame", "--porcelain", "-L", `${line},${line}`, "HEAD", "--", posixPath(path)], true);
  return out === null ? null : parseBlame(out, path);
}

/** A commit's whole message. */
export function messageOf(c: Pick<Checkout, "root">, hash: string): string {
  return (run(c, ["show", "-s", "--format=%B", "--end-of-options", hash]) ?? "").replace(/\s+$/, "");
}

/** `git log --follow`'s records — `\x01`, then hash, author, time and subject apart by `\0`, a blank line, the path. */
export function parseLog(out: string): CommitInfo[] {
  return out
    .split("\x01")
    .filter((r) => r.trim())
    .flatMap((r) => {
      const [head = "", ...rest] = r.split("\n");
      const [hash = "", author = "", time = "", subject = ""] = head.split("\0");
      const path = rest.map((l) => l.trim()).find(Boolean);
      return hash && path ? [{ hash, author, time: Number(time) || 0, subject, path }] : [];
    });
}

/** A file's commits, newest first — up to `max` — following it back through its renames. */
export function fileLog(c: Pick<Checkout, "root">, path: string, max = 500): CommitInfo[] | null {
  const out = run(
    c,
    [
      "log",
      "--follow",
      `--max-count=${max}`,
      "--format=%x01%H%x00%an%x00%at%x00%s",
      "--name-only",
      "--",
      posixPath(path),
    ],
    true,
  );
  return out === null ? null : parseLog(out);
}

/** Async forms for UI reads; the synchronous forms remain available to noninteractive callers. */
export async function blameLineLater(
  c: Pick<Checkout, "root">,
  path: string,
  line: number,
  signal?: AbortSignal,
): Promise<CommitInfo | null> {
  const out = await gitReadLater(
    c,
    ["blame", "--porcelain", "-L", `${line},${line}`, "HEAD", "--", posixPath(path)],
    true,
    signal,
  );
  return out === null ? null : parseBlame(out, path);
}
export async function messageLater(c: Pick<Checkout, "root">, hash: string, signal?: AbortSignal): Promise<string> {
  return (
    (await gitReadLater(c, ["show", "-s", "--format=%B", "--end-of-options", hash], false, signal)) ?? ""
  ).trimEnd();
}
export async function fileLogLater(
  c: Pick<Checkout, "root">,
  path: string,
  max = 500,
  signal?: AbortSignal,
): Promise<CommitInfo[] | null> {
  const out = await gitReadLater(
    c,
    [
      "log",
      "--follow",
      `--max-count=${max}`,
      "--format=%x01%H%x00%an%x00%at%x00%s",
      "--name-only",
      "--",
      posixPath(path),
    ],
    true,
    signal,
  );
  return out === null ? null : parseLog(out);
}

/** A commit of a branch's (EG-D4), as the git panel and `:log` list it: its first parent, for its files' changes. */
export interface BranchCommit {
  hash: string;
  /** Its first parent; null for a root commit. A merge's files are its changes against this one. */
  parent: string | null;
  author: string;
  /** Seconds since the epoch. */
  time: number;
  subject: string;
}

/** The format `branchLogLater` asks for: `\x01`, then hash, parents, author, time and subject apart by `\0`. */
const COMMIT_FORMAT = "--format=%x01%H%x00%P%x00%an%x00%at%x00%s";

/** `git log`'s records in `COMMIT_FORMAT`. */
export function parseCommits(out: string): BranchCommit[] {
  return out
    .split("\x01")
    .filter((r) => r.trim())
    .flatMap((r) => {
      const [hash = "", parents = "", author = "", time = "", subject = ""] = r.replace(/\n+$/, "").split("\0");
      return /^[0-9a-f]{40,64}$/.test(hash)
        ? [{ hash, parent: parents.split(" ")[0] || null, author, time: Number(time) || 0, subject }]
        : [];
    });
}

/** The commits on `branch` since it left `base` (`git log base..branch`), newest first, up to `max`; null without git. */
export async function branchLogLater(
  c: Pick<Checkout, "root">,
  base: string,
  branch: string,
  max = 500,
  signal?: AbortSignal,
): Promise<BranchCommit[] | null> {
  const out = await gitReadLater(
    c,
    ["log", `--max-count=${max}`, COMMIT_FORMAT, "--end-of-options", `${base}..${branch}`],
    false,
    signal,
  );
  return out === null ? null : parseCommits(out);
}

/**
 * The files a commit changed (`git diff-tree -r -M --name-status`): against its first parent, a merge's too; a root
 * commit's, every file added. By path; null without git.
 */
export async function commitFilesLater(
  c: Pick<Checkout, "root">,
  commit: Pick<BranchCommit, "hash" | "parent">,
  signal?: AbortSignal,
): Promise<Changed[] | null> {
  const against = commit.parent ? [commit.parent, commit.hash] : [commit.hash];
  const root = commit.parent ? [] : ["--root"];
  const out = await gitReadLater(
    c,
    ["diff-tree", "-r", "-M", "--name-status", "-z", "--no-commit-id", ...root, "--end-of-options", ...against],
    false,
    signal,
  );
  return out === null ? null : parseNameStatus(out).sort((a, b) => (a.path < b.path ? -1 : 1));
}
