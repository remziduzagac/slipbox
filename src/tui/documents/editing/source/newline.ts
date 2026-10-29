// Newline indentation, list continuation and fence admission.

import type { App, View } from "../../../app/runtime/app.ts";
import { indentUnit } from "../../../../core/documents/editing/indent.ts";
import { lineOf, lineText, offsetOf, placeAt } from "./position.ts";
import { insertText } from "./text.ts";

/**
 * A new line after the cursor's text, carrying its indentation, and continuing a list: the same
 * bullet, the next number, an empty task box. On a list item with nothing after its marker, Enter
 * ends the list instead (the marker goes).
 */
export function newline(app: App, view: View): void {
  const at = offsetOf(app, view);
  const src = lineOf(view, at);
  const start = view.buf.lineStarts()[src - 1] ?? 0;
  const line = lineText(view, src);
  const before = line.slice(0, at - start);
  // A list item continues — but not inside a code block (a diff's + lines, a - in YAML), and not
  // on a thematic break (* * *), which only looks like a bullet.
  const listy = !inFence(view, src) && !/^\s*([-*_])(\s*\1){2,}\s*$/.test(line);
  const m = listy ? /^(\s*)(?:([-*+])|(\d{1,9})([.)]))(\s+)(\[[ xX]\]\s+)?/.exec(line) : null;
  if (m && at - start >= m[0].length && !line.slice(m[0].length).trim()) {
    // An empty item: end the list.
    view.buf.edit(start, line.length, m[1]!);
    return placeAt(app, view, start + m[1]!.length, true);
  }
  let lead = /^\s*/.exec(before)![0];
  if (m && at - start >= m[0].length) {
    const marker = m[2] ?? `${Number(m[3]) + 1}${m[4]}`;
    lead = `${m[1]}${marker}${m[5]}${m[6] ? "[ ] " : ""}`;
  }
  // Code (25.1): after an opening bracket, a level in — the closing one right after the cursor to a line of its own;
  // after a `:` in Python or YAML, a level in too.
  const after = line.slice(at - start);
  const opener = view.buf.kind.group !== "note" && !m ? before.trimEnd().at(-1) : undefined;
  if (opener && (OPENS[opener] || (opener === ":" && /^(python|yaml)$/.test(view.buf.kind.format)))) {
    const inner = lead + indentUnit(view.buf.indent());
    if (OPENS[opener] && after.trimStart().startsWith(OPENS[opener]!)) {
      insertText(app, view, view.buf.eol + inner + view.buf.eol + lead);
      return placeAt(app, view, at + view.buf.eol.length + inner.length, true);
    }
    return insertText(app, view, view.buf.eol + inner);
  }
  // The last line of a note with no final newline (or an empty note): the new line gets a line
  // ending too, or it would be no line at all and typing would land on the line before.
  if (at === view.buf.source.length && !view.buf.source.endsWith("\n")) {
    view.buf.edit(at, 0, view.buf.eol + lead + view.buf.eol);
    return placeAt(app, view, at + view.buf.eol.length + lead.length, true);
  }
  insertText(app, view, view.buf.eol + lead);
}

/** Whether source line `src` (1-based) is inside a fenced code block: the fences above it, counted. */
function inFence(view: View, src: number): boolean {
  let fence: string | null = null;
  for (let n = 1; n < src; n++) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(lineText(view, n));
    if (!f) continue;
    if (!fence) fence = f[1]!;
    else if (f[1]![0] === fence[0] && f[1]!.length >= fence.length) fence = null;
  }
  return fence !== null;
}

/** The brackets a line ending in one opens: a new line inside goes a level in (25.1). */
const OPENS: Record<string, string> = { "{": "}", "[": "]", "(": ")" };
