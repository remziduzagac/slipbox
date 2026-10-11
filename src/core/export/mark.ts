// The mark a Markdown export carries (plan 10.3): what lets a later export replace it, though it's a note, and what tells
// its pictures' folder from any other (DF-D25). Apart from the writers, so the graph reads it without loading them.

import { readFileSync } from "node:fs";

/** The mark a Markdown export carries in its frontmatter: what lets a later export replace it, though it's a note. */
export const EXPORT_MARK = "generator: slipbox";

/** Whether the file at `abs` is an earlier Markdown export: its frontmatter carries the mark. */
export function isExport(abs: string): boolean {
  try {
    const head = readFileSync(abs, "utf8").slice(0, 2048);
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(head)?.[1] ?? "";
    return fm.split(/\r?\n/).some((line) => line.trim() === EXPORT_MARK);
  } catch {
    return false;
  }
}
