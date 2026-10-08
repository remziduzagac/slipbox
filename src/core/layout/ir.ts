// Layout IR (plan 2.1): pure, framework-agnostic. mdast in, styled lines out.
// Only the final draw step (tui/ or the ANSI writer) turns this into terminal output, which is
// what insulates slipbox from OpenTUI churn and makes rendering snapshot-testable.

import type { Role } from "../theme/theme.ts";
import { stringWidth } from "../width.ts";

export const A_BOLD = 1;
export const A_ITALIC = 2;
export const A_UNDERLINE = 4;
export const A_STRIKE = 8;
export const A_DIM = 16;

export interface Span {
  text: string;
  role: Role;
  /** Attributes added on top of the role's own (A_* bits). */
  attrs: number;
  /** Background role override; otherwise the role's own background, else the line fill. */
  bg?: Role;
  /** Index into Layout.links. */
  link?: number;
  /** 1-based source line this text came from. */
  src?: number;
  /** A task item's checkbox: the item's first and last source lines (plan 4.11). */
  task?: { line: number; end: number; checked: boolean };
  /** A button (a code cell's, 24.13): what it does, `action:line` — drawn as a button, clicked to do it. */
  button?: string;
}

export interface Line {
  spans: Span[];
  /** 1-based source line of the first text on this row — reload anchoring stores these (3.5). */
  src: number;
  /** Role whose background extends to the full layout width (headings, code blocks). */
  fill?: Role;
  /** Set on the first row of a heading: index into Layout.headings. */
  heading?: number;
  /**
   * Source-mode rows only (4.13): for each cell of the row, in order, the UTF-16 offset in source
   * line `src` of the grapheme drawn there; `end` is the offset just past the row (where the next
   * wrapped row starts, or the line's length).
   */
  srcMap?: { cells: number[]; end: number };
  /** A frame row drawn in the layout (the lens's rules): no text of the note, never the cursor's. */
  decor?: boolean;
  /** The lens's rows: its rules, the air outside them, and its rows of markdown. */
  lens?: "top" | "bottom" | "pad" | "source";
  /** The first row of a footnote's definition: its identifier (what a `[^ref]` link targets). */
  footnoteDef?: string;
  /** A folded group's row (the code view's imports, 24.5): `enter` folds or unfolds the group starting on that line. */
  fold?: number;
  /** A code cell's box (24.13): the columns of its borders drawn over this row's spaces there (a border a tree line
   *  meets is drawn into the row instead, 24.14). */
  frame?: number[];
  /** A code cell's row (24.13): the columns its own text takes — the rest is the cell's padding: no cursor stop there,
   *  so no mark either. */
  text?: [number, number];
  /** A picture's first row (12.x): the file, and the columns and rows it takes — this row and the `rows - 1` after
   *  it, blank frame rows the drawing puts the image over. */
  image?: Picture;
}

/** A picture drawn in a note (12.x): its file (absolute), and the cells it takes. */
export interface Picture {
  src: string;
  cols: number;
  rows: number;
}

export type LinkKind = "wiki" | "embed" | "markdown" | "image" | "footnote" | "tag";

export interface LayoutLink {
  kind: LinkKind;
  /** Wiki target name, or the URL. */
  target: string;
  heading: string | null;
  /** Visible text. */
  text: string;
  status: LinkStatus;
  /** First row and column the link is drawn at; -1 until placed. */
  line: number;
  col: number;
  src: number;
  /** A link drawn inside an embed (1.11): the embedded note it's resolved from, not the one shown. */
  from?: string;
}

export type LinkStatus = "resolved" | "unresolved" | "ambiguous" | "external" | "unknown";

export interface LayoutHeading {
  level: number;
  text: string;
  slug: string;
  /** An explicit id (`## Setup {#setup}`). */
  id?: string;
  /** Row index in Layout.lines. */
  line: number;
  src: number;
}

export interface Layout {
  lines: Line[];
  links: LayoutLink[];
  headings: LayoutHeading[];
  width: number;
  /** Rows the last line of defence had to cut to the width: a block's bug, lost text. Always 0. */
  clipped?: number;
  /** The notes drawn inside this one (1.11), nested ones too, by absolute path: a change to one re-lays it out. */
  embedded?: string[];
  /** The code view's cells (24.13): each one's lines, its title, and its definition's name (where references start). */
  cells?: { from: number; to: number; title: string; name?: { line: number; column: number } }[];
}

export function spanWidthText(spans: Span[]): string {
  return spans.map((s) => s.text).join("");
}

/**
 * The source line of what's at column `col` of a row: its span's own (a rendered paragraph joins
 * its source lines into rows that carry only the first), else the row's.
 */
export function srcAt(line: Line, col: number): number {
  let x = 0;
  for (const span of line.spans) {
    const w = stringWidth(span.text);
    if (col < x + w) return span.src ?? line.src;
    x += w;
  }
  return line.src;
}

/** Where line `src`'s text starts among the rows: the first row with a span from it, and its column. */
export function posOfSrc(lines: Line[], src: number): { row: number; col: number } | null {
  for (let row = 0; row < lines.length; row++) {
    let x = 0;
    for (const span of lines[row]!.spans) {
      if (span.src === src && span.text.trim()) return { row, col: x };
      x += stringWidth(span.text);
    }
  }
  return null;
}
