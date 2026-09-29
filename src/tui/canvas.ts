// The drawing surface the TUI paints on. The app draws only through this interface; the OpenTUI
// implementation (opentui.ts) is the one file that touches the renderer's frame buffer, which is
// the "only the final draw step touches OpenTUI" rule from docs/idea.md. TextCanvas is an
// in-memory implementation for tests.

import type { CellStyle } from "../core/layout/style.ts";
import type { Color } from "../core/theme/theme.ts";
import { graphemes, graphemeWidth } from "../core/width.ts";

export interface Canvas {
  readonly width: number;
  readonly height: number;
  fill(x: number, y: number, w: number, h: number, bg: Color | null): void;
  /** Draw one grapheme at a cell. `w` is its display width from the one width function. */
  cell(x: number, y: number, g: string, w: number, style: CellStyle): void;
  /** Draw ASCII text in one call (fast path). */
  ascii(x: number, y: number, text: string, style: CellStyle): void;
}

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

/** Draw `text` at (x, y), clipped to `maxW` columns. Returns the columns used. */
export function drawText(c: Canvas, x: number, y: number, text: string, style: CellStyle, maxW = Number.POSITIVE_INFINITY): number {
  if (y < 0 || y >= c.height || maxW <= 0) return 0;
  const limit = Math.min(maxW, c.width - x);
  if (limit <= 0) return 0;
  if (PRINTABLE_ASCII.test(text)) {
    const t = text.length > limit ? text.slice(0, limit) : text;
    if (t) c.ascii(x, y, t, style);
    return t.length;
  }
  let used = 0;
  for (const g of graphemes(text)) {
    const w = graphemeWidth(g);
    if (used + w > limit) break;
    if (w > 0) c.cell(x + used, y, g, w, style);
    used += w;
  }
  return used;
}

/** In-memory canvas: characters only, plus the style of each cell for assertions. */
export class TextCanvas implements Canvas {
  readonly rows: string[][];
  readonly styles: (CellStyle | null)[][];
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.rows = Array.from({ length: height }, () => Array(width).fill(" "));
    this.styles = Array.from({ length: height }, () => Array(width).fill(null));
  }
  /**
   * Cells about to be written from `x0` to `x1` (exclusive) on row `y`: a wide character cut by the
   * edge loses its other half to a blank, as a terminal (and OpenTUI) shows it.
   */
  private splitWide(y: number, x0: number, x1: number): void {
    const row = this.rows[y]!;
    if (x0 > 0 && row[x0] === "") {
      let h = x0 - 1;
      while (h > 0 && row[h] === "") h--;
      for (let k = h; k < x0; k++) row[k] = " ";
    }
    for (let k = x1; k < this.width && row[k] === ""; k++) row[k] = " ";
  }
  fill(x: number, y: number, w: number, h: number, bg: Color | null): void {
    for (let r = Math.max(0, y); r < y + h && r < this.height; r++) {
      this.splitWide(r, Math.max(0, x), Math.min(this.width, x + w));
      for (let k = Math.max(0, x); k < x + w && k < this.width; k++) {
        this.rows[r]![k] = " ";
        this.styles[r]![k] = bg ? { fg: "default", bg, bold: false, italic: false, underline: false, strike: false, dim: false } : null;
      }
    }
  }
  cell(x: number, y: number, g: string, w: number, style: CellStyle): void {
    if (y < 0 || y >= this.height || x < 0 || x >= this.width) return;
    this.splitWide(y, x, Math.min(this.width, x + Math.max(1, w)));
    this.rows[y]![x] = g;
    this.styles[y]![x] = style;
    for (let k = 1; k < w && x + k < this.width; k++) this.rows[y]![x + k] = "";
  }
  ascii(x: number, y: number, text: string, style: CellStyle): void {
    for (let i = 0; i < text.length; i++) this.cell(x + i, y, text[i]!, 1, style);
  }
  toString(): string {
    return this.rows.map((r) => r.join("").replace(/\s+$/, "")).join("\n");
  }
  line(y: number): string {
    return this.rows[y]!.join("");
  }
}
