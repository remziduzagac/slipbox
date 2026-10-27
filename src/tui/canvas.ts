// The drawing surface the TUI paints on. The app draws only through this interface; the OpenTUI
// implementation (opentui.ts) is the one file that touches the renderer's frame buffer, which is
// the "only the final draw step touches OpenTUI" rule (blueprint/design/how-it-works.md). TextCanvas is an
// in-memory implementation for tests.

import type { CellStyle } from "../core/rendering/layout/style.ts";
import type { Color } from "../core/rendering/theme/theme.ts";
import { sanitize, UNSAFE } from "../core/foundation/text/sanitize.ts";
import { graphemes, graphemeWidth } from "../core/foundation/text/width.ts";

export interface Canvas {
  readonly width: number;
  readonly height: number;
  /** The terminal cursor while typing; null hides it. Normal mode draws its block in the cells. */
  cursor?(at: { x: number; y: number } | null): void;
  fill(x: number, y: number, w: number, h: number, bg: Color | null): void;
  /** Draw one grapheme at a cell. `w` is its display width from the one width function. */
  cell(x: number, y: number, g: string, w: number, style: CellStyle): void;
  /** Draw ASCII text in one call (fast path). */
  ascii(x: number, y: number, text: string, style: CellStyle): void;
  /** The frame is drawn with ASCII glyphs: typographic symbols go as their ASCII look-alikes. */
  asciiGlyphs?: boolean;
  /** A picture (12.x), over `cols` × `rows` cells from (x, y): the part of it that shows (`crop`). Absent: the canvas
   *  draws none. */
  image?(x: number, y: number, cols: number, rows: number, src: string, crop: Crop): void;
}

/** The part of a picture drawn (12.x, PIC): of its `total` rows, from `skip`; of its `wide` columns, from `left`. */
export interface Crop {
  skip: number;
  total: number;
  left: number;
  wide: number;
}

/**
 * What a console without Unicode (`TERM=linux`, a locale that isn't UTF-8: the ASCII glyph set)
 * can't draw, as its ASCII look-alike, one column for one: the chrome's own marks (`•` unsaved,
 * `⚠`, `↻`, `●` watching, `›`, `…`) and the punctuation of messages and of notes alike. The rest
 * of the text (CJK, accents) goes as it is: nothing stands in for it.
 */
const ASCII_LOOKALIKE: Record<string, string> = {
  "—": "-",
  "–": "-",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "…": "~",
  "·": "-",
  "•": "*",
  "›": ">",
  "‹": "<",
  "→": ">",
  "←": "<",
  "↑": "^",
  "↓": "v",
  "⇄": "=",
  "⚠": "!",
  "✖": "x",
  "✗": "x",
  "×": "x",
  ℹ: "i",
  "↻": "~",
  "●": "*",
  "○": "o",
  "✓": "v",
  "\u00a0": " ",
};
const LOOKALIKES = new RegExp(`[${Object.keys(ASCII_LOOKALIKE).join("")}]`, "g");

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

/**
 * A grapheme as a canvas may put it on screen. Chrome draws names (files, folders, headings,
 * config labels) straight, some a letter at a time to highlight a match, so every canvas passes
 * each cell through here: a control or bidi override becomes what `sanitize` makes of it, a space
 * if nothing (it was measured one column wide).
 */
export function safeCell(g: string): string {
  return UNSAFE.test(g) ? sanitize(g) || " " : g;
}

/**
 * A grapheme as this canvas puts it on screen: safe (`safeCell`), and with ASCII glyphs its
 * look-alike — so a cell drawn on its own (the cursor's, a find match's, a filter's letter, a
 * row scrolled sideways) is what drawText would have made of it.
 */
export function glyphCell(c: Canvas, g: string): string {
  const s = safeCell(g);
  return c.asciiGlyphs ? (ASCII_LOOKALIKE[s] ?? s) : s;
}

/** Draw `text` at (x, y), clipped to `maxW` columns. Returns the columns used. */
export function drawText(
  c: Canvas,
  x: number,
  y: number,
  text: string,
  style: CellStyle,
  maxW = Number.POSITIVE_INFINITY,
): number {
  if (y < 0 || y >= c.height || maxW <= 0) return 0;
  const limit = Math.min(maxW, c.width - x);
  if (limit <= 0) return 0;
  if (c.asciiGlyphs && !PRINTABLE_ASCII.test(text)) text = text.replace(LOOKALIKES, (ch) => ASCII_LOOKALIKE[ch]!);
  if (PRINTABLE_ASCII.test(text)) {
    const t = text.length > limit ? text.slice(0, limit) : text;
    if (t) c.ascii(x, y, t, style);
    return t.length;
  }
  let used = 0;
  // Sanitized whole, so an escape sequence goes as a sequence (not just its ESC).
  for (const g of graphemes(sanitize(text))) {
    const w = graphemeWidth(g);
    if (used + w > limit) break;
    if (w > 0) c.cell(x + used, y, g, w, style);
    used += w;
  }
  return used;
}

/** In-memory canvas: characters only, plus the style of each cell for assertions. */
export class TextCanvas implements Canvas {
  nativeCursor: { x: number; y: number } | null = null;
  cursor(at: { x: number; y: number } | null): void {
    this.nativeCursor = at;
  }
  asciiGlyphs?: boolean;
  /** The pictures drawn, as asked (12.x): the tests read them. */
  readonly images: ({ x: number; y: number; cols: number; rows: number; src: string } & Crop)[] = [];
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
        this.styles[r]![k] = bg
          ? { fg: "default", bg, bold: false, italic: false, underline: false, strike: false, dim: false }
          : null;
      }
    }
  }
  cell(x: number, y: number, g: string, w: number, style: CellStyle): void {
    if (y < 0 || y >= this.height || x < 0 || x >= this.width) return;
    this.splitWide(y, x, Math.min(this.width, x + Math.max(1, w)));
    this.rows[y]![x] = glyphCell(this, g);
    this.styles[y]![x] = style;
    for (let k = 1; k < w && x + k < this.width; k++) this.rows[y]![x + k] = "";
  }
  ascii(x: number, y: number, text: string, style: CellStyle): void {
    for (let i = 0; i < text.length; i++) this.cell(x + i, y, text[i]!, 1, style);
  }
  image(x: number, y: number, cols: number, rows: number, src: string, crop: Crop): void {
    this.images.push({ x, y, cols, rows, src, ...crop });
  }
  toString(): string {
    return this.rows.map((r) => r.join("").replace(/\s+$/, "")).join("\n");
  }
  line(y: number): string {
    return this.rows[y]!.join("");
  }
}
