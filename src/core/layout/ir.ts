// Layout IR (plan 2.1): pure, framework-agnostic. mdast in, styled lines out.
// Only the final draw step (tui/ or the ANSI writer) turns this into terminal output, which is
// what insulates slipbox from OpenTUI churn and makes rendering snapshot-testable.

import type { Role } from "../theme/theme.ts";

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
}

export interface Line {
  spans: Span[];
  /** 1-based source line of the first text on this row — reload anchoring stores these (3.5). */
  src: number;
  /** Role whose background extends to the full layout width (headings, code blocks). */
  fill?: Role;
  /** Set on the first row of a heading: index into Layout.headings. */
  heading?: number;
}

export type LinkKind = "wiki" | "embed" | "markdown" | "image" | "footnote";

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
}

export type LinkStatus = "resolved" | "unresolved" | "ambiguous" | "external" | "unknown";

export interface LayoutHeading {
  level: number;
  text: string;
  slug: string;
  /** Row index in Layout.lines. */
  line: number;
  src: number;
}

export interface Layout {
  lines: Line[];
  links: LayoutLink[];
  headings: LayoutHeading[];
  width: number;
}

export function spanWidthText(spans: Span[]): string {
  return spans.map((s) => s.text).join("");
}
