// Task checkboxes (plan 4.11): toggling `[ ]` ⇄ `[x]` as a one-byte edit to the file's bytes, so
// nothing else changes — not a BOM, not CRLF line endings, not bytes that aren't valid UTF-8.

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
