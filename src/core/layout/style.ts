// Span → concrete style, shared by the TUI's draw step and the CLI's ANSI writer so both faces
// show the same thing.

import type { Color, Role, Theme } from "../theme/theme.ts";
import { A_BOLD, A_DIM, A_ITALIC, A_STRIKE, A_UNDERLINE, type Line, type Span } from "./ir.ts";

export interface CellStyle {
  fg: Color;
  bg: Color | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  dim: boolean;
}

export function lineFillBg(theme: Theme, line: Line): Color | null {
  return line.fill ? (theme.roles[line.fill].bg ?? null) : null;
}

export function spanStyle(theme: Theme, span: Span, line: Line, overlayRole?: Role): CellStyle {
  const r = theme.roles[span.role];
  const o = overlayRole ? theme.roles[overlayRole] : undefined;
  const a = span.attrs;
  return {
    fg: o?.fg ?? r.fg ?? theme.fg,
    bg: o?.bg ?? (span.bg ? theme.roles[span.bg].bg : undefined) ?? r.bg ?? lineFillBg(theme, line),
    bold: !!(o?.bold || r.bold || a & A_BOLD),
    italic: !!(r.italic || a & A_ITALIC),
    underline: !!(o?.underline || r.underline || a & A_UNDERLINE),
    strike: !!(a & A_STRIKE),
    dim: !!(r.dim || a & A_DIM),
  };
}
