// Owner-local pane drawing: severityGlyph, SEVERITY_ROLE, MARK_ROLE.

import { stringWidth } from "../../../../../core/foundation/text/width.ts";
import type { Problem, Severity } from "../../../../../core/documents/diagnostics/diagnostics.ts";
import type { Role } from "../../../../../core/rendering/theme/theme.ts";
import type { Glyphs } from "../../../../../core/rendering/theme/glyphs.ts";
import type { Line, Layout } from "../../../../../core/rendering/layout/ir.ts";
import { offsetMarks } from "../lines.ts";

/** Each severity's sign, in the glyph set in use: beside its line (the problems bar) and on the status line. */
export function severityGlyph(g: Glyphs, s: Severity): string {
  return s === "error"
    ? g.problemError
    : s === "warning"
      ? g.problemWarn
      : s === "info"
        ? g.problemInfo
        : g.problemHint;
}

/** Each severity's colour, in the bar, the line numbers and the status line. */
export const SEVERITY_ROLE: Record<Severity, Role> = {
  error: "error",
  warning: "warn",
  info: "info",
  hint: "status_dim",
};

/** Each severity's mark over the text (19.10); a syntax error keeps its own role (16.9). */
export const MARK_ROLE: Record<Severity, Role> = {
  error: "problem_error",
  warning: "problem_warn",
  info: "problem_info",
  hint: "problem_info",
};

/** Problems by each source line they cover (a long one's first 200). */
export function problemLines(problems: Problem[]): Map<number, Problem[]> {
  const out = new Map<number, Problem[]>();
  for (const p of problems) {
    for (let l = p.start.line; l <= Math.min(p.end.line, p.start.line + 200); l++)
      out.set(l, [...(out.get(l) ?? []), p]);
  }
  return out;
}

/** Each source line's first row in a layout: where the bar counts its problems. */
const firstRowCache = new WeakMap<Layout, Map<number, number>>();

function firstRows(layout: Layout): Map<number, number> {
  let m = firstRowCache.get(layout);
  if (m) return m;
  m = new Map();
  layout.lines.forEach((line, row) => {
    if (line.decor) return;
    if (!m!.has(line.src)) m!.set(line.src, row);
    for (const span of line.spans)
      if (span.src !== undefined && span.text.trim() && !m!.has(span.src)) m!.set(span.src, row);
  });
  firstRowCache.set(layout, m);
  return m;
}

/** The bar's problems by row: each at the first row of its line, or of the next line drawn (a line the
 *  rendered view doesn't show, as a blank one between blocks). */
export function barRows(layout: Layout, problems: Problem[]): Map<number, Problem[]> {
  const first = firstRows(layout);
  const out = new Map<number, Problem[]>();
  for (const p of problems) {
    let row = first.get(p.start.line);
    if (row === undefined) row = layout.lines.findIndex((l) => !l.decor && l.src >= p.start.line);
    if (row >= 0) out.set(row, [...(out.get(row) ?? []), p]);
  }
  return out;
}

/**
 * Where a row's problems are, to underline (19.10). A source row knows each cell's offset: the span
 * itself. A rendered one knows each span's line: a link's problem marks the link as drawn, any other
 * the text that came from its lines.
 */
export function problemMarks(
  line: Line,
  layout: Layout,
  onLine: Map<number, Problem[]>,
  lastRow: boolean,
  as?: Role,
): { from: number; to: number; role: Role }[] {
  const out: { from: number; to: number; role: Role }[] = [];
  const role = (p: Problem): Role => as ?? (p.source === "syntax" ? "syntax_error" : MARK_ROLE[p.severity]);
  if (line.srcMap) {
    for (const p of onLine.get(line.src) ?? []) {
      const from = line.src === p.start.line ? p.start.column - 1 : 0;
      const to = line.src === p.end.line ? Math.max(p.end.column - 1, from + 1) : Number.POSITIVE_INFINITY;
      out.push(...offsetMarks(line, [{ from, to }], lastRow, role(p)));
    }
    return out;
  }
  let x = 0;
  for (const span of line.spans) {
    const w = stringWidth(span.text);
    const src = span.src ?? line.src;
    const link = span.link !== undefined ? layout.links[span.link] : undefined;
    for (const p of onLine.get(src) ?? []) {
      const hit =
        p.target !== undefined
          ? link !== undefined && link.src === p.start.line && link.target === p.target
          : span.text.trim() !== "";
      if (hit) out.push({ from: x, to: x + w, role: role(p) });
    }
    x += w;
  }
  return out;
}
