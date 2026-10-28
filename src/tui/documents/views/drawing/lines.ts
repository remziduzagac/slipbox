// Owner-local pane drawing: offsetMarks, CodeClip, drawLine.

import type { App } from "../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../../shell/terminal/canvas.ts";
import { roleStyle, markStyle } from "../../../shell/screen/style.ts";
import { stringWidth, graphemes, graphemeWidth } from "../../../../core/foundation/text/width.ts";
import { cells } from "../../editing/cursor.ts";
import type { Role, Color, Theme } from "../../../../core/rendering/theme/theme.ts";
import { type CodeScroll, type Line, scrolledCol, scrolledInSight } from "../../../../core/rendering/layout/ir.ts";
import { spanStyle } from "../../../../core/rendering/layout/style.ts";

/**
 * The columns of one row that source ranges (UTF-16 offsets in its line) cover. One past the
 * line's end (an error's missing `)`) marks the last cell, on the line's last row.
 */
export function offsetMarks(
  line: Line,
  ranges: { from: number; to: number }[] | undefined,
  lastRow: boolean,
  role: Role,
): { from: number; to: number; role: Role }[] {
  if (!ranges || !line.srcMap) return [];
  const cs = cells(line);
  const out: { from: number; to: number; role: Role }[] = [];
  for (const e of ranges) {
    const hit = cs.filter((k) => k.at! >= e.from && k.at! < e.to);
    if (hit.length) out.push({ from: hit[0]!.x, to: hit[hit.length - 1]!.x + hit[hit.length - 1]!.w, role });
    else if (lastRow && e.from >= line.srcMap.end && cs.length)
      out.push({ from: cs[cs.length - 1]!.x, to: cs[cs.length - 1]!.x + cs[cs.length - 1]!.w, role });
  }
  return out;
}

/** A code block that scrolls sideways, on one of its code rows: its code from column `x`, drawn from `off` columns in,
 *  `w` columns of it; side by side (GIT-D7), its second text from `right` the same. */
export type CodeClip = CodeScroll & { off: number };

/**
 * Draw one layout row from column `left` (wrapping off, scrolled sideways), `maxW` columns of it.
 * `marks` override styles by column range; the link under the cursor too. `clip`: a code block's row scrolled on its
 * own — its code drawn `clip.off` columns to the left, inside its `clip.w` columns, what's before and after it hidden.
 */
export function drawLine(
  c: Canvas,
  x: number,
  y: number,
  line: Line,
  maxW: number,
  theme: Theme,
  band: Color | null,
  page: Color | null,
  focusLink: number,
  marks: { from: number; to: number; role: Role }[],
  left = 0,
  clip?: CodeClip,
): void {
  let col = 0;
  const end = left + maxW;
  const fillBg = line.fill ? theme.roles[line.fill].bg : undefined;
  for (const span of line.spans) {
    if (col >= end && !clip) break;
    const focused = focusLink >= 0 && span.link === focusLink;
    const st = spanStyle(theme, span, line, focused ? "link_focus" : undefined);
    // The cursor-row band replaces the page and the block's fill, never a span's own background;
    // off the cursor row, text keeps its block's fill (a code block's text on its background).
    if (band && (!st.bg || st.bg === fillBg)) st.bg = band;
    else if (!st.bg) st.bg = page;
    if (!marks.length && !left && !clip) {
      const w = drawText(c, x + col, y, span.text, st, maxW - col);
      if (w < stringWidth(span.text)) return; // cut at the edge (a wide character that didn't fit)
      col += w;
      continue;
    }
    for (const g of graphemes(span.text)) {
      const w = graphemeWidth(g);
      // Where it's drawn: in a scrolled code block's code, `off` columns to the left; scrolled out of it, not at all.
      let at = col;
      if (clip && col >= clip.x && clip.right !== undefined) {
        // Side by side (GIT-D7): each text from the one offset, what's fixed between them where it is.
        const first = scrolledInSight(clip, col, clip.off);
        const last = scrolledInSight(clip, col + w - 1, clip.off);
        if (!first || !last) {
          // A wide character cut by a text's left edge shows as a blank.
          if (!first && last) c.cell(x + scrolledCol(clip, col + w - 1, clip.off) - left, y, " ", 1, st);
          col += w;
          continue;
        }
        at = scrolledCol(clip, col, clip.off);
      } else if (clip && col >= clip.x) {
        const from = clip.x + clip.off;
        if (col < from) {
          // A wide character cut by the block's left edge shows as a blank.
          if (col + w > from) c.cell(x + clip.x - left, y, " ", 1, st);
          col += w;
          continue;
        }
        if (col + w > from + clip.w) return;
        at = col - clip.off;
      }
      if (at + w > end) return;
      // A wide character cut by the left edge shows as a blank.
      if (at < left) {
        if (at + w > left) c.cell(x, y, " ", 1, st);
        col += w;
        continue;
      }
      const mark = marks.find((m) => col >= m.from && col < m.to);
      const cell = mark ? { ...st, ...markStyle(theme, mark.role) } : st;
      if (w > 0) c.cell(x + at - left, y, g, w, cell);
      col += w;
    }
  }
}

/**
 * A scrolled code block's row: `‹` in its gutter while text of the row is hidden to the left, `›` in its right margin
 * while some is to the right. `x` is the screen column of the row's column 0.
 */
export function codeMarks(
  app: App,
  c: Canvas,
  x: number,
  y: number,
  line: Line,
  clip: CodeClip,
  band: Color | null,
  page: Color | null,
): void {
  const fill = line.fill ? app.theme.roles[line.fill].bg : undefined;
  const st = { ...roleStyle(app.theme, "code_gutter", page), bg: band ?? fill ?? page };
  // Each text's own: one, or side by side (GIT-D7) two, the second drawn `total - w` columns to the left.
  const texts =
    clip.right === undefined
      ? [{ from: clip.x, to: Number.POSITIVE_INFINITY, at: clip.x }]
      : [
          { from: clip.x, to: clip.x + clip.total, at: clip.x },
          { from: clip.right, to: Number.POSITIVE_INFINITY, at: clip.right - (clip.total - clip.w) },
        ];
  for (const t of texts) {
    const text = cells(line).filter((k) => k.x >= t.from && k.x < t.to && !/^\s$/.test(k.g));
    if (!text.length) continue;
    if (text[0]!.x < t.from + clip.off) drawText(c, x + t.at - 1, y, app.glyphs.codeLeft, st, 1);
    const last = text[text.length - 1]!;
    if (last.x + last.w > t.from + clip.off + clip.w) drawText(c, x + t.at + clip.w, y, app.glyphs.codeRight, st, 1);
  }
}
