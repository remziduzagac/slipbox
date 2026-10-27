// A file's changes against what's staged (plan 26.1): the runs of lines the text — as it is now, unsaved typing
// included — has that git's index hasn't, each as the gutter signs it: lines added, lines changed, lines deleted
// (marked on the line before them, or the first line when they were the first). Line endings don't count: a checkout
// that turns LF into CRLF changes no line. Nor does a byte order mark, which git keeps in the file's text and slipbox
// keeps apart from it (a change's lines never carry it).

import { comparable, diffLines } from "./merge/merge.ts";

/** A run of changed lines: where it is now (`from`–`to`, lines from 1; a deletion's `to` is `from - 1`), what it was. */
export interface GitChange {
  kind: "add" | "change" | "delete";
  from: number;
  to: number;
  /** Where its staged lines were: their first's index (from 0). */
  wasAt: number;
  /** The lines as staged, and as they are now. */
  was: string[];
  now: string[];
}

/** How the gutter marks a line: added, changed, deleted below it — or above it, where it's the first. */
export type GitSign = "add" | "change" | "delete" | "topdelete";

const lines = (text: string) => comparable(text).split("\n");

/** The changes from `staged` to `text`, in order. Null staged (a file git doesn't have): every line added. */
export function gitChanges(staged: string | null, text: string): GitChange[] {
  const now = lines(text);
  // The empty "line" after a final newline is no line of the file.
  const count = (ls: string[]) => (ls.length && ls[ls.length - 1] === "" ? ls.length - 1 : ls.length);
  if (staged === null)
    return count(now)
      ? [{ kind: "add", from: 1, to: count(now), wasAt: 0, was: [], now: now.slice(0, count(now)) }]
      : [];
  const was = lines(staged);
  return diffLines(was.slice(0, count(was)), now.slice(0, count(now))).map((h) => ({
    kind: h.aLen === 0 ? "add" : h.bLen === 0 ? "delete" : "change",
    from: h.bStart + 1,
    to: h.bStart + h.bLen,
    wasAt: h.aStart,
    was: was.slice(h.aStart, h.aStart + h.aLen),
    now: now.slice(h.bStart, h.bStart + h.bLen),
  }));
}

/** Each line's sign, by line (from 1): a deletion's on the line before it, else (deleted from the top) the first. */
export function gitSigns(changes: GitChange[]): Map<number, GitSign> {
  const out = new Map<number, GitSign>();
  for (const c of changes) {
    if (c.kind === "delete") {
      if (c.from > 1) {
        if (!out.has(c.from - 1)) out.set(c.from - 1, "delete");
      } else if (!out.has(1)) out.set(1, "topdelete");
      continue;
    }
    for (let n = c.from; n <= c.to; n++) out.set(n, c.kind);
  }
  return out;
}

/** The change at line `line`, or holding it — a deletion's being the line its sign is on. */
export function changeAt(changes: GitChange[], line: number): GitChange | null {
  return (
    changes.find((c) => (c.kind === "delete" ? line === Math.max(1, c.from - 1) : line >= c.from && line <= c.to)) ??
    null
  );
}

/** A change as a diff's text: its lines as staged (`-`), then as they are (`+`). */
export function changeDiff(c: GitChange): string {
  return [...c.was.map((l) => `-${l}`), ...c.now.map((l) => `+${l}`)].join("\n");
}
