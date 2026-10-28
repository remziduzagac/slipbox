// Code-cell framing and headers. Text widths still come only from foundation/text/width.
import type { CodeDef, CodeImports } from "../../../../documents/syntax/syntax.ts";
import type { Severity } from "../../../../documents/diagnostics/diagnostics.ts";
import type { Glyphs } from "../../../theme/glyphs.ts";
import type { Role } from "../../../theme/theme.ts";
import { graphemes, stringWidth, truncate } from "../../../../foundation/text/width.ts";
import { A_BOLD, type Line, type Span } from "../../ir.ts";
import type { Cell, CellSpec } from "../contracts.ts";
import { toSpans } from "../wrapping/rows.ts";

const SEVERITY_ORDER: Severity[] = ["error", "warning", "info", "hint"];

/**
 * A box's left line where a tree line meets it: `┤` (the line drawn into the row, no longer over it) — `┬` on a folded
 * box's top. A band has none: the line touches its header.
 */
export function joint(line: Line, at: number, g: Glyphs): Line {
  let c = 0;
  let here = "";
  for (const s of line.spans) for (const gr of graphemes(s.text)) if (c++ === at) here = gr;
  if (here === g.box.tl) return putAt(line, at, g.box.tm, "cell_line");
  if (!line.frame?.includes(at)) return line;
  return { ...putAt(line, at, g.box.mr, "cell_line"), frame: line.frame.filter((x) => x !== at) };
}

/** A row with `text` drawn from column `at` (over its indentation's spaces), spaces added where the row is short. */
export function putAt(line: Line, at: number, text: string, role: Role): Line {
  const put = graphemes(text);
  const out: Span[] = [];
  const emit = (t: string, base: Span | null) => {
    const s: Span = base ? { ...base, text: t } : { text: t, role, attrs: 0 };
    const last = out[out.length - 1];
    if (
      last &&
      last.role === s.role &&
      last.attrs === s.attrs &&
      last.src === s.src &&
      last.link === s.link &&
      last.button === s.button
    )
      last.text += t;
    else out.push(s);
  };
  const space: Span = { text: " ", role: "text", attrs: 0 };
  let c = 0;
  for (const s of line.spans) {
    for (const gr of graphemes(s.text)) {
      emit(c >= at && c < at + put.length ? put[c - at]! : gr, c >= at && c < at + put.length ? null : s);
      c++;
    }
  }
  for (; c < at + put.length; c++) emit(c >= at ? put[c - at]! : " ", c >= at ? null : space);
  return { ...line, spans: out };
}

/** A row of code: its cells as spans, each mapped to its place in line `src`. */
export function plainRow(cells: Cell[], src: number, end: number): Line {
  return { spans: toSpans(cells, src), src, srcMap: { cells: cells.map((c) => c.at), end } };
}

/**
 * A row inside a cell: `column` in, then a column and a space (the box's border, or the band's edge), the row, and
 * spaces to the cell's right edge — every added cell of a code row mapped where the row's text starts (or ends).
 */
export function framedRow(l: Line, column: number, inner: number, style: "box" | "band"): Line {
  const side = style === "box" ? 2 : 1;
  const w = l.spans.reduce((n, s) => n + stringWidth(s.text), 0);
  const left: Span = { text: " ".repeat(column + side), role: "text", attrs: 0 };
  const right: Span = { text: " ".repeat(Math.max(0, inner - w) + side), role: "text", attrs: 0 };
  const out: Line = { ...l, spans: [left, ...l.spans, right], text: [column + side, column + side + w] };
  if (l.srcMap) {
    const first = l.srcMap.cells[0] ?? l.srcMap.end;
    out.srcMap = {
      cells: [
        ...Array(column + side).fill(first),
        ...l.srcMap.cells,
        ...Array(Math.max(0, inner - w) + side).fill(l.srcMap.end),
      ],
      end: l.srcMap.end,
    };
  }
  if (style === "box")
    out.frame = [column]; // its left line: no right one
  else out.fill = "code_block";
  return out;
}

/**
 * A cell's header: in a box, its top border with the cell's kind and name in it; on a band, the band's first row. Then
 * its lines, and its buttons at the right — its problems (`⚠ 2`, opening the panel), where it's used, copy, edit (the
 * lens on it), the scratch, and fold.
 */
export function cellHeader(
  c: CellSpec,
  column: number,
  inner: number,
  style: "box" | "band",
  problems: readonly { line: number; severity: Severity }[],
  shut: boolean,
  g: Glyphs,
): Line {
  const key = c.from;
  const total = inner + (style === "box" ? 4 : 2);
  const worst = problems.length ? SEVERITY_ORDER.find((s) => problems.some((p) => p.severity === s))! : null;
  const sign =
    worst === "error"
      ? g.problemError
      : worst === "warning"
        ? g.problemWarn
        : worst === "info"
          ? g.problemInfo
          : g.problemHint;
  const buttons: Span[] = [];
  const add = (text: string, action: string, role: Role = "dim") => {
    if (buttons.length) buttons.push({ text: " ", role: "text", attrs: 0 });
    buttons.push({ text, role, attrs: 0, button: `${action}:${key}` });
  };
  if (worst)
    add(
      `${sign}${problems.length > 1 ? problems.length : ""}`,
      "problems",
      worst === "error" ? "error" : worst === "warning" ? "warn" : "info",
    );
  if (c.def) add(g.cellRefs, "references");
  add(g.cellCopy, "copy");
  add(g.cellEdit, "edit");
  add(g.cellScratch, "scratch");
  add(shut ? g.foldClosed : g.foldOpen, "fold");
  const lines = c.from === c.to ? `${c.from}` : `${c.from}–${c.to}`;
  const bw = buttons.reduce((n, s) => n + stringWidth(s.text), 0);
  const box = style === "box";
  const open = box ? `${g.box.tl}${g.box.h} ` : " ";
  const close = box ? ` ${g.box.h.repeat(2)}` : " "; // its top line runs to the edge: no corner
  // A comment's box: its mark alone (`¶`), no title — what it is, it says. A definition's: its word, `struct: ` — the
  // first to go where the name wouldn't fit beside it.
  const fixed = stringWidth(open) + stringWidth(close) + bw + stringWidth(lines) + 4;
  const word = c.term && stringWidth(c.term) + 2 + stringWidth(c.title) <= total - fixed ? `${c.term}: ` : "";
  const markW = word ? stringWidth(word) : c.mark ? stringWidth(c.mark) + (c.prose ? 0 : 1) : 0;
  const room = total - stringWidth(open) - stringWidth(close) - markW - bw - stringWidth(lines) - 4;
  const title = c.prose ? "" : truncate(c.title, Math.max(1, room));
  const fill = Math.max(
    1,
    total - stringWidth(open) - stringWidth(close) - markW - stringWidth(title) - stringWidth(lines) - bw - 3,
  );
  const edge: Role = box ? "cell_line" : "text";
  const spans: Span[] = [
    { text: " ".repeat(column), role: "text", attrs: 0 },
    { text: open, role: edge, attrs: 0 },
  ];
  if (word) spans.push({ text: word, role: "dim", attrs: 0 });
  else if (c.mark) spans.push({ text: c.prose ? c.mark : `${c.mark} `, role: c.markRole, attrs: A_BOLD });
  // A definition's name in the text's own colour, bold — apart from the code's colour for it, below.
  if (title) spans.push({ text: title, role: c.def ? "strong" : "dim", attrs: c.def ? A_BOLD : 0 });
  spans.push({ text: ` ${(box ? g.box.h : " ").repeat(fill)} `, role: edge, attrs: 0 });
  spans.push({ text: `${lines} `, role: "dim", attrs: 0 });
  spans.push(...buttons);
  spans.push({ text: close, role: edge, attrs: 0 });
  // Decoration (a frame row): never the cursor's, no line number — its buttons are clicked. A folded cell's is the cell's
  // one row: the cursor stops there, so the key that folded it opens it again.
  return { spans, src: c.from, ...(shut ? {} : { decor: true }), ...(box ? {} : { fill: "breadcrumb_band" as Role }) };
}

/** A separator comment as a section's rule: `── Title ───…` across the width (a rule alone without a title). */
export function sectionRow(title: string, width: number, src: number, g: Glyphs): Line {
  const head = title ? `${g.rule.repeat(2)} ` : "";
  const name = title ? truncate(title, Math.max(1, width - 6)) : "";
  const rest = Math.max(0, width - stringWidth(head) - stringWidth(name) - (title ? 1 : 0));
  const spans: Span[] = [];
  if (head) spans.push({ text: head, role: "rule", attrs: 0, src });
  if (name) spans.push({ text: `${name} `, role: "h3", attrs: A_BOLD, src });
  spans.push({ text: g.rule.repeat(rest), role: "rule", attrs: 0, src });
  return { spans, src };
}

/** A line's indentation in front of prose: the guides of its levels from `from` (none on the page), then spaces. */
export function indentSpans(column: number, unit: number, g: Glyphs, from = unit): Span[] {
  const out: Span[] = [];
  for (let c = 0; c < column; c++) {
    const guide = c >= from && c % unit === 0;
    const text = guide ? g.guide : " ";
    const role: Role = guide ? "tree_guide" : "text";
    const last = out[out.length - 1];
    if (last && last.role === role) last.text += text;
    else out.push({ text, role, attrs: 0 });
  }
  return out;
}

/**
 * A run of imports' row: folded, `▸ imports` and the modules (as many as fit) and how many; open, `▾ imports`. A header
 * folded so (24.22): `▸ license · MIT`, `▸ generated · protoc`, else its lines' count.
 */
export function foldRow(run: CodeImports, open: boolean, width: number, g: Glyphs): Line {
  const head = `${open ? g.foldOpen : g.foldClosed} ${run.kind ?? "imports"}`;
  if (run.kind) {
    const what = run.modules[0] ?? `${run.end - run.start + 1} lines`;
    const spans: Span[] = [{ text: head, role: "dim", attrs: A_BOLD, src: run.start }];
    if (!open)
      spans.push({
        text: ` · ${truncate(what, Math.max(1, width - stringWidth(head) - 3))}`,
        role: "dim",
        attrs: 0,
        src: run.start,
      });
    return { spans, src: run.start, fold: run.start };
  }
  const count = `(${run.modules.length})`;
  const names = open
    ? ""
    : truncate(run.modules.join(" · "), Math.max(0, width - stringWidth(head) - stringWidth(count) - 5));
  const spans: Span[] = [{ text: head, role: "dim", attrs: A_BOLD, src: run.start }];
  if (names) spans.push({ text: `  ${names}`, role: "dim", attrs: 0, src: run.start });
  spans.push({ text: ` ${count}`, role: "dim", attrs: 0, src: run.start });
  return { spans, src: run.start, fold: run.start };
}

/** The margin's mark for a definition's kind. */
export function markOf(def: CodeDef, g: Glyphs): string {
  return def.kind === "function"
    ? g.codeFunction
    : def.kind === "class"
      ? g.codeClass
      : def.kind === "type"
        ? g.codeType
        : g.codeValue;
}
