// Owner-local panels drawing: SideView, naturalWidths, sideView.

import type { App, SidePaneState } from "../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../terminal/canvas.ts";
import type { Rect } from "../../screen/geometry.ts";
import type { Geometry } from "../../screen/geometry/contracts.ts";
import { roleStyle } from "../../screen/style.ts";
import type { Color } from "../../../../core/rendering/theme/theme.ts";
import { stringWidth, truncate, splitAtWidth } from "../../../../core/foundation/text/width.ts";
import { drawHScrollbar } from "../../../documents/views/drawing/chrome/scrollbars.ts";

/** A side pane's list viewport: its rows' natural width and, when they don't fit, the sideways
 *  offset and the row under the list that the horizontal scrollbar takes. */
export interface SideView {
  list: Rect;
  /** Columns for text: the last one is the vertical scrollbar's. */
  cols: number;
  natural: number;
  left: number;
  hbar: Rect | null;
}

export const naturalWidths = new WeakMap<object, number>();

export function sideView<T extends object>(
  rect: Rect,
  rows: T[],
  text: (row: T) => string,
  state: SidePaneState,
  least = 0,
): SideView {
  const cols = Math.max(1, rect.w - 1);
  let cached = naturalWidths.get(rows);
  if (cached === undefined) {
    cached = 0;
    for (const row of rows) cached = Math.max(cached, stringWidth(text(row)) + 1);
    naturalWidths.set(rows, cached);
  }
  const natural = Math.max(cached, least);
  if (natural <= cols || rect.h < 4) {
    state.left = 0;
    return { list: rect, cols, natural, left: 0, hbar: null };
  }
  const list = { ...rect, h: rect.h - 1 };
  state.left = Math.max(0, Math.min(state.left ?? 0, natural - cols));
  return { list, cols, natural, left: state.left, hbar: { x: rect.x, y: rect.y + rect.h - 1, w: cols, h: 1 } };
}

/** One side-pane row's text from the view's offset: clipped when the pane scrolls sideways,
 *  cut with an ellipsis otherwise (a pane too short for the bar); `reserve` columns kept at its end. */
export function sideRow(text: string, sv: SideView, reserve = 0): string {
  const cols = Math.max(1, sv.cols - reserve);
  if (!sv.hbar) return truncate(text, cols);
  return splitAtWidth(splitAtWidth(text, sv.left)[1], cols)[0];
}

export function sideHScrollbar(
  app: App,
  c: Canvas,
  sv: SideView,
  pane: "sidebar" | "outline",
  active: boolean,
  bg: Color | null,
  geo: Geometry,
): void {
  if (!sv.hbar) return;
  drawHScrollbar(app, c, sv.hbar, sv.natural, sv.left, active, bg);
  geo.scrollbars.push({ ...sv.hbar, pane, total: sv.natural, horizontal: true });
}

/**
 * After an explorer row's name, dimmed: a vault's name when it isn't its folder's (17.13), up to `nameEnd`; then, to
 * the right, ending at `describeEnd`, what describes the row (VV-D9) — a vault's branch, where a link points — where
 * there's room for it after the name, two spaces between, cut short with `…` when it doesn't fit whole.
 */
export function drawDescribed(
  app: App,
  c: Canvas,
  at: { x: number; y: number; w: number },
  vaultName: string | undefined,
  describe: string | undefined,
  o: { nameEnd: number; describeEnd: number; bg: Color | null; fit?: (room: number) => string },
): void {
  const dim = { ...roleStyle(app.theme, "dim", o.bg), bg: o.bg };
  let after = at.w;
  if (vaultName && at.w + 1 < o.nameEnd) {
    const room = o.nameEnd - at.w - 1;
    after += 1 + drawText(c, at.x + at.w + 1, at.y, truncate(vaultName, room), dim, room);
  }
  if (!describe) return;
  const room = o.describeEnd - after - 2;
  if (room < Math.min(stringWidth(describe), 6)) return;
  // Cut to fit as the row says (a link's place from its front, its state kept), else from the end.
  const text = o.fit ? o.fit(room) : truncate(describe, room);
  const w = stringWidth(text);
  drawText(c, at.x + o.describeEnd - w, at.y, text, dim, w);
}
