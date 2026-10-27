// Reviewing a change a hunk at a time (GIT-D3): what the review shows of a hunk — its lines as staged and as they are,
// with a few of the file's around them, diffed as every diff is (GIT-D2) — how it finds a hunk again once the file or
// the index has moved under it, the scratch's entry a note for the agent makes, and what the review says at its end.

import { formatEntry } from "./workspace/mutations/capture.ts";
import { changeDiff, type GitChange } from "./gitsigns.ts";
import { type DiffViewRow, diffView } from "./merge.ts";

/** A hunk's lines in the file now (from 1): an added or changed run's own; a deletion's, the line before it (or 1). */
export function hunkLines(c: GitChange): { from: number; to: number } {
  if (c.kind !== "delete") return { from: c.from, to: c.to };
  const at = Math.max(1, c.from - 1);
  return { from: at, to: at };
}

/**
 * A hunk as the review draws it: its lines as staged and as they are, with up to `context` of the file's lines (`now`,
 * the file as it is) on each side, diffed — each row's `line` the file's; `own`, the excerpt's.
 */
export function hunkView(
  c: GitChange,
  now: string[],
  context = 3,
): { before: string; after: string; rows: DiffViewRow[] } {
  // Where the hunk is in the file now (from 0): a deletion's, where its lines were.
  const at = c.from - 1;
  const first = Math.max(0, at - context);
  const lead = now.slice(first, at);
  const trail = now.slice(at + c.now.length, at + c.now.length + context);
  const text = (ls: string[]) => (ls.length ? `${ls.join("\n")}\n` : "");
  const before = text([...lead, ...c.was, ...trail]);
  const after = text([...lead, ...c.now, ...trail]);
  const rows = diffView(before, after, new Set(), context).map((r) =>
    r.kind === "@@" ? { ...r, line: r.line + first, text: `line ${r.line + first}` } : { ...r, line: r.line + first },
  );
  return { before, after, rows };
}

/** Two hunks the same change: the same lines as staged, and now. */
export const sameChange = (a: GitChange, b: GitChange): boolean =>
  a.was.length === b.was.length &&
  a.now.length === b.now.length &&
  a.was.every((l, i) => l === b.was[i]) &&
  a.now.every((l, i) => l === b.now[i]);

/**
 * A hunk found again among a file's changes now (after the index or the file moved): the same change where it was —
 * at its line in the file, or at its place in what's staged, whichever didn't move under it. Null when it isn't there:
 * gone, or the same lines elsewhere, which are another change.
 */
export function findChange(fresh: GitChange[], old: GitChange): GitChange | null {
  return fresh.find((c) => sameChange(c, old) && (c.from === old.from || c.wasAt === old.wasAt)) ?? null;
}

/**
 * A hunk where it is once another of its file was dealt with: `done` reverted (the file's lines after it moved) or kept
 * (what's staged after it moved). Each hunk after it is where the review looks for it again.
 */
export function movedBy(c: GitChange, done: GitChange, how: "reverted" | "kept"): GitChange {
  if (how === "reverted") {
    if (c.from <= done.from) return c;
    const by = done.was.length - done.now.length;
    return { ...c, from: c.from + by, to: c.to + by };
  }
  return c.wasAt > done.wasAt ? { ...c, wasAt: c.wasAt + done.now.length - done.was.length } : c;
}

/**
 * A note for the agent on a hunk, as the scratch keeps it: where it is (`path:from-to`), its diff, and the note. `abs`
 * is the file's path, `project` the vault's root, which the place is said from.
 */
export function hunkEntry(abs: string, c: GitChange, note: string, project: string): string {
  const { from, to } = hunkLines(c);
  return formatEntry(
    {
      ref: { path: abs, startLine: from, endLine: to },
      snippetText: changeDiff(c),
      lang: "diff",
      text: note,
      ask: true,
      cwd: project,
    },
    project,
  );
}

/** What a review did with its hunks: kept (staged), reverted, noted for the agent, skipped, left as they were. */
export interface Tally {
  kept: number;
  reverted: number;
  noted: number;
  skipped: number;
  left: number;
}

/** What the review says at its end: what was kept, reverted and noted — and, a note written, the key that copies it. */
export function tallyText(t: Tally, copyKey = "space s y"): string {
  const done = [
    t.kept ? `${t.kept} kept (staged)` : "",
    t.reverted ? `${t.reverted} reverted` : "",
    t.noted
      ? `${t.noted} note${t.noted === 1 ? "" : "s"} for the agent in the scratch — ${copyKey} copies ${t.noted === 1 ? "it" : "them"}`
      : "",
  ].filter(Boolean);
  const rest = [
    t.skipped ? `${t.skipped} skipped` : "",
    t.left ? `${t.left} left as ${t.left === 1 ? "it was" : "they were"}` : "",
  ].filter(Boolean);
  return `review: ${done.length ? done.join(", ") : "nothing kept, reverted or noted"}${rest.length ? `; ${rest.join(", ")}` : ""}`;
}
