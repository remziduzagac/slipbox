// Tables (2.2, 2.3): a grid whose columns share the width (`table.ts` allocates it), each cell wrapped in its column;
// one record per row when no grid fits. A data file's table of records too (16.12), a cell that's a link drawn as a
// field's value is.

import type { Nodes, Table, TableCell } from "mdast";
import type { CellLink } from "../data.ts";
import { expandTabs, sanitize } from "../foundation/text/sanitize.ts";
import type { Role } from "../theme/theme.ts";
import { stringWidth } from "../foundation/text/width.ts";
import { A_BOLD, type Line, type Span } from "./ir.ts";
import { allocate, PADDING } from "./table.ts";
import { fit, longestWord, measure, naturalWidth, wrapSpans } from "./wrap.ts";
import { type Ctx, type Style, TEXT, srcOf, textOf } from "./render-context.ts";
import { inline } from "./render-inline.ts";
import { dataValueLink } from "./render-data.ts";

export function table(node: Table, ctx: Ctx, width: number): Line[] {
  const g = ctx.opts.glyphs;
  const b = g.box;
  const src = srcOf(node);
  const ncols = Math.max(...node.children.map((r) => r.children.length));
  const align = node.align ?? [];
  const cells: Span[][][] = node.children.map((row, ri) => {
    const style: Style = ri === 0 ? { role: "table_header", attrs: A_BOLD } : TEXT;
    const out: Span[][] = [];
    for (let c = 0; c < ncols; c++) {
      const cell = row.children[c] as TableCell | undefined;
      // A records table's cell whose value is a link (a data file's, 16.15), drawn as a field's is.
      const l = ri > 0 ? (cell?.data as { link?: CellLink } | undefined)?.link : undefined;
      const value = l ? textOf(cell as unknown as Nodes) : "";
      const dl = l ? dataValueLink(ctx, l, value, srcOf(row)) : null;
      out.push(
        dl
          ? [{ text: expandTabs(sanitize(value)), role: dl.role, attrs: 0, src: srcOf(row), link: dl.link }]
          : cell
            ? inline(cell.children, ctx, style, srcOf(row))
            : [],
      );
    }
    return out;
  });
  const desired: number[] = [];
  const minimum: number[] = [];
  for (let c = 0; c < ncols; c++) {
    let d = 1;
    let m = 1;
    for (const row of cells) {
      d = Math.max(d, naturalWidth(row[c]!));
      m = Math.max(m, longestWord(row[c]!));
    }
    desired.push(d + 2 * PADDING);
    minimum.push(m + 2 * PADDING);
  }
  // Measure every cell once; the allocator asks for line counts at many widths.
  const measured = cells.map((row) => row.map((spans) => measure(spans)));
  const alloc = allocate(desired, minimum, width, (col, w) => {
    let splits = 0;
    const lines = measured.map((row) => {
      const f = fit(row[col]!, w);
      splits += f.splits;
      return f.lines;
    });
    return { lines, splits };
  });
  if (alloc.mode === "records") return tableRecords(node, cells, ctx, width);

  const widths = alloc.widths;
  // Each rule belongs to a source line: the top to the table's first, the header rule to the
  // delimiter line, a rule between rows and the bottom to the row above them — so a cursor or a
  // window top on a rule comes back to that rule after a re-layout, not to the table's top.
  const border = (l: string, m: string, r: string, h: string, at = src): Line => ({
    spans: [{ text: l + widths.map((w) => h.repeat(w)).join(m) + r, role: "table_border", attrs: 0 }],
    src: at,
  });
  const wrapped = cells.map((row) => row.map((spans, c) => wrapSpans(spans, widths[c]! - 2 * PADDING)));
  const multiLine = wrapped.slice(1).some((row) => row.some((rows) => rows.length > 1));
  const out: Line[] = [border(b.tl, b.tm, b.tr, b.h)];
  wrapped.forEach((row, ri) => {
    const height = Math.max(...row.map((r) => r.length));
    const rowSrc = srcOf(node.children[ri]!);
    for (let k = 0; k < height; k++) {
      const spans: Span[] = [{ text: b.v, role: "table_border", attrs: 0 }];
      row.forEach((cellRows, c) => {
        const content = cellRows[k] ?? [];
        const cw = content.reduce((a, s) => a + stringWidth(s.text), 0);
        const room = widths[c]! - 2 * PADDING - cw;
        const a = align[c];
        const left = a === "right" ? room : a === "center" ? Math.floor(room / 2) : 0;
        spans.push({ text: " ".repeat(PADDING + left), role: "text", attrs: 0 });
        spans.push(...content);
        spans.push({ text: " ".repeat(room - left + PADDING), role: "text", attrs: 0 });
        spans.push({ text: b.v, role: "table_border", attrs: 0 });
      });
      out.push({ spans, src: rowSrc });
    }
    if (ri === 0) out.push(border(b.hl, b.hx, b.hr, b.hh, rowSrc + 1));
    else if (multiLine && ri < wrapped.length - 1) out.push(border(b.ml, b.mm, b.mr, b.h, rowSrc));
  });
  out.push(border(b.bl, b.bm, b.br, b.h, srcOf(node.children[node.children.length - 1]!)));
  return out;
}

/** Narrow collapse: one record per row, `header: value`, when no grid can fit. */
function tableRecords(node: Table, cells: Span[][][], ctx: Ctx, width: number): Line[] {
  const g = ctx.opts.glyphs;
  const header = cells[0] ?? [];
  const labels = header.map(
    (h, c) =>
      h
        .map((s) => s.text)
        .join("")
        .trim() || `#${c + 1}`,
  );
  // Labels in an aligned column (at most a third of the width), values hanging beside them.
  const labelW = Math.max(1, Math.min(Math.max(...labels.map((l) => stringWidth(l))), Math.floor(width / 3)));
  const valueW = Math.max(1, width - labelW - 2);
  const out: Line[] = [];
  const rule = (src: number): Line => ({
    spans: [{ text: g.rule.repeat(width), role: "table_border", attrs: 0 }],
    src,
  });
  cells.slice(1).forEach((row, ri) => {
    const src = srcOf(node.children[ri + 1]!);
    out.push(rule(src));
    row.forEach((spans, c) => {
      // The header's own spans, so a link in it stays a link (placed at its first record).
      const head = header[c]?.some((sp) => sp.text.trim())
        ? header[c]!.map((sp) => ({
            ...sp,
            role: sp.link !== undefined ? sp.role : ("table_header" as Role),
            attrs: sp.attrs | A_BOLD,
          }))
        : [{ text: labels[c] ?? `#${c + 1}`, role: "table_header" as Role, attrs: A_BOLD }];
      const labelRows = wrapSpans(head, labelW);
      const valueRows = wrapSpans(spans, valueW);
      const n = Math.max(labelRows.length, valueRows.length);
      for (let k = 0; k < n; k++) {
        const label = labelRows[k] ?? [];
        const lw = label.reduce((a, sp) => a + stringWidth(sp.text), 0);
        out.push({
          spans: [...label, { text: " ".repeat(labelW - lw + 2), role: "text", attrs: 0 }, ...(valueRows[k] ?? [])],
          src,
        });
      }
    });
  });
  // A table with a header only: its column names, one per row, so it doesn't vanish.
  if (!out.length && labels.length) {
    const src = srcOf(node);
    out.push(rule(src));
    for (const l of labels)
      for (const row of wrapSpans([{ text: l, role: "table_header", attrs: A_BOLD }], width))
        out.push({ spans: row, src });
  }
  if (out.length) out.push(rule(srcOf(node)));
  return out;
}
