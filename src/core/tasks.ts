// Task checkboxes (plan 4.11): toggling `[ ]` ⇄ `[x]` as a one-byte edit to the file's bytes, so
// nothing else changes — not a BOM, not CRLF line endings, not bytes that aren't valid UTF-8.

import type { Root } from "mdast";
import { plainText, visit } from "./parse.ts";

/** A list item's task marker at the start of a line: optional `>` quote prefixes, the bullet or
 *  number, then `[ ]`, `[x]` or `[X]`. Matched on the line's bytes read one per character. */
const TASK_RE = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)\[([ xX])\]/;

export interface TaskToggle {
  bytes: Uint8Array;
  /** The state after the toggle. */
  checked: boolean;
}

/**
 * Toggle the task marker on 1-based `line`. Null when that line has no task marker (the file
 * changed, or the line isn't a task item's first line).
 */
export function toggleTask(bytes: Uint8Array, line: number): TaskToggle | null {
  let start = 0;
  for (let n = 1; n < line; n++) {
    const nl = bytes.indexOf(0x0a, start);
    if (nl < 0) return null;
    start = nl + 1;
  }
  if (line < 1 || start > bytes.length) return null;
  let end = bytes.indexOf(0x0a, start);
  if (end < 0) end = bytes.length;
  // A UTF-8 BOM before the first line is not part of it.
  if (line === 1 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  const text = String.fromCharCode(...bytes.subarray(start, Math.min(end, start + 200)));
  const m = TASK_RE.exec(text);
  if (!m) return null;
  const at = start + m[1]!.length + 1;
  const checked = m[2] === " ";
  const out = new Uint8Array(bytes);
  out[at] = checked ? 0x78 /* x */ : 0x20;
  return { bytes: out, checked };
}

export interface TaskItem {
  /** The 1-based line of the item's marker. */
  line: number;
  checked: boolean;
  /** The item's first line of text, without its marker. */
  text: string;
}

/**
 * The innermost task item holding 1-based `line` — its marker's line, or any line of it, its nested items' included
 * — from the parsed tree: its first and last line and its state. Null when no task item holds the line.
 */
export function taskHolding(tree: Root, line: number): { line: number; end: number; checked: boolean } | null {
  let found: { line: number; end: number; checked: boolean } | null = null;
  visit(tree, (node) => {
    if (node.type !== "listItem" || typeof node.checked !== "boolean" || !node.position) return;
    const { start, end } = node.position;
    // Nested items start later: the latest start holding the line is the innermost.
    if (line < start.line || line > end.line || (found && start.line <= found.line)) return;
    found = { line: start.line, end: end.line, checked: node.checked };
  });
  return found;
}

/**
 * The note's task items, from the parsed tree (so a `- [ ]` inside a code block isn't one), in
 * order. The CLI's `task` lists them; `toggleTask` changes one by its line.
 */
export function listTasks(tree: Root): TaskItem[] {
  const out: TaskItem[] = [];
  visit(tree, (node) => {
    if (node.type !== "listItem" || typeof node.checked !== "boolean" || !node.position) return;
    const first = node.children[0];
    const text = first ? plainText(first).split("\n")[0]!.trim() : "";
    out.push({ line: node.position.start.line, checked: node.checked, text });
  });
  return out;
}
