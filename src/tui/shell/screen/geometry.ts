import type { CellStyle } from "../../../core/rendering/layout/style.ts";
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** A clickable region: its id says what a click does (see Mouse.clickHot). */
export interface Hot extends Rect {
  id: string;
}
/** A bar's rows: `h` rows from `y`, its text on the middle one. */
export interface Band {
  y: number;
  h: number;
}
export interface HotGeometry {
  hot: Hot[];
}
/** Horizontal rules and vertical borders, without pane, view or App ownership. */
export interface RuleGeometry {
  rules: { y: number; x0: number; x1: number }[];
  verticals: { x: number; y0: number; y1: number; style: CellStyle }[];
}
export const mid = (b: Band) => b.y + Math.floor(b.h / 2);
/**
 * A pane drawn over the note: the rules under it are cut out (they're hidden, and must not make
 * joints at its border), and so are the borders it covers (the explorer's, under the outline).
 */
export function clipRules(geo: RuleGeometry, r: Rect): void {
  const out: RuleGeometry["rules"] = [];
  for (const rule of geo.rules) {
    if (rule.y < r.y || rule.y >= r.y + r.h || rule.x1 <= r.x || rule.x0 >= r.x + r.w) {
      out.push(rule);
      continue;
    }
    if (rule.x0 < r.x) out.push({ ...rule, x1: r.x });
    if (rule.x1 > r.x + r.w) out.push({ ...rule, x0: r.x + r.w });
  }
  geo.rules = out;
  // Only borders the pane actually covers (a tab separator above it stays).
  geo.verticals = geo.verticals.filter((v) => v.x < r.x || v.x >= r.x + r.w || v.y1 < r.y || v.y0 >= r.y + r.h);
}
/** A pane drawn over the content hides the click targets under it. */
export function coverHot(geo: HotGeometry, r: Rect): void {
  geo.hot = geo.hot.filter((h) => h.x + h.w <= r.x || h.x >= r.x + r.w || h.y + h.h <= r.y || h.y >= r.y + r.h);
}
