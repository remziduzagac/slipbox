// The scratch's places checked (D229): an entry's `**At:**` with its lines fenced after it, against its file now. The
// lines still there, nothing is said; found elsewhere in the file, they moved — the `At:` offered their new place; found
// nowhere, they changed; the file gone, it's said. An entry without lines (a line's capture, text alone) has nothing to
// compare, nor has a review's diff or a problem's message, which are no file's text.

import { isAbsolute, join } from "node:path";
import type { Code, InlineCode, Paragraph, RootContent } from "mdast";
import { parseMarkdown } from "../../documents/markdown/parse.ts";
import type { Problem } from "../../documents/diagnostics/diagnostics.ts";
import { AT, formatRef, parseRef, type Ref } from "./capture.ts";

/** The fence a problem's message goes into the scratch in, after its place (EG-D5): no file's lines, never compared. */
export const MESSAGE_FENCE = "text";

/** A place that no longer holds its lines: the problem on its `At:`, and where they are now when they moved. */
export interface StalePlace {
  problem: Problem;
  /** The `At:` as written (`path:42-51`), and the lines it names now, when they moved. */
  target: string;
  now: Ref | null;
}

/** The place a paragraph's `**At:**` names: its code span, after the label and a space. */
function placeIn(p: Paragraph): InlineCode | null {
  const label = AT.slice(2, -2);
  for (let i = 2; i < p.children.length; i++) {
    const [l, gap, code] = [p.children[i - 2]!, p.children[i - 1]!, p.children[i]!];
    if (
      l.type === "strong" &&
      l.children.length === 1 &&
      l.children[0]!.type === "text" &&
      l.children[0]!.value === label &&
      gap.type === "text" &&
      gap.value === " " &&
      code.type === "inlineCode"
    )
      return code;
  }
  return null;
}

const span = (from: number, lines: number) => (lines > 1 ? `lines ${from}–${from + lines - 1}` : `line ${from}`);

/**
 * The scratch's places whose lines aren't what was captured. `read` gives a file's text now, or null when there's
 * none — undefined while it's being read (SD-T11), its places said nothing of; paths are from `project`, the vault's
 * top, or absolute.
 */
export function stalePlaces(
  scratch: string,
  project: string,
  read: (abs: string) => string | null | undefined,
): StalePlace[] {
  const out: StalePlace[] = [];
  const nodes = parseMarkdown(scratch).tree.children;
  nodes.forEach((n: RootContent, i) => {
    const next = nodes[i + 1];
    if (n.type !== "paragraph" || next?.type !== "code") return;
    const code = placeIn(n);
    const ref = code ? parseRef(code.value) : null;
    const lines = (next as Code).value;
    if (!code?.position || !ref || !lines || next.lang === "diff" || next.lang === MESSAGE_FENCE) return;
    const at = { start: code.position.start, end: code.position.end };
    const problem = (id: string, message: string, fix?: Problem["fix"]): Problem => ({
      start: { line: at.start.line, column: at.start.column },
      end: { line: at.end.line, column: at.end.column },
      severity: "warning",
      source: "slipbox",
      code: id,
      message,
      // The link drawn for it: the place as written.
      target: code.value,
      ...(fix ? { fix } : {}),
    });
    const text = read(isAbsolute(ref.path) ? ref.path : join(project, ref.path));
    if (text === undefined) return;
    if (text === null) {
      out.push({ problem: problem("place-missing", `${ref.path}: no such file`), target: code.value, now: null });
      return;
    }
    const file = text.split("\n").map((l) => l.replace(/\r$/, ""));
    const count = lines.split("\n").length;
    // Still there: the lines it names hold what was captured (a part of them, for a selection within a line).
    if (
      file
        .slice(ref.startLine - 1, ref.endLine)
        .join("\n")
        .includes(lines)
    )
      return;
    // Moved: found elsewhere, the nearest to where they were.
    const whole = file.join("\n");
    let best: number | null = null;
    for (let k = whole.indexOf(lines); k >= 0; k = whole.indexOf(lines, k + 1)) {
      const line = whole.slice(0, k).split("\n").length;
      if (best === null || Math.abs(line - ref.startLine) < Math.abs(best - ref.startLine)) best = line;
    }
    const was = span(ref.startLine, ref.endLine - ref.startLine + 1);
    if (best === null) {
      out.push({ problem: problem("place-changed", `${was} changed since captured`), target: code.value, now: null });
      return;
    }
    const now: Ref = { ...ref, startLine: best, endLine: best + count - 1 };
    const fix = { title: `Point At: to ${span(best, count)}`, text: formatRef(now) };
    out.push({
      problem: problem("place-moved", `${was} moved: now ${span(best, count)}`, fix),
      target: code.value,
      now,
    });
  });
  return out;
}
