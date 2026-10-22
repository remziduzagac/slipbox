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
  inverse?: boolean;
}

export function lineFillBg(theme: Theme, line: Line): Color | null {
  return line.fill ? (theme.roles[line.fill].bg ?? null) : null;
}

export function spanStyle(theme: Theme, span: Span, line: Line, overlayRole?: Role): CellStyle {
  const r = theme.roles[span.role];
  const o = overlayRole ? theme.roles[overlayRole] : undefined;
  // The background's role: its colour, and where a theme has none to give (the terminal's, NO_COLOR) its weight and
  // underline — a diff's changed words still marked (GIT-D2).
  const b = span.bg ? theme.roles[span.bg] : undefined;
  const a = span.attrs;
  return {
    fg: o?.fg ?? r.fg ?? theme.fg,
    bg: o?.bg ?? b?.bg ?? r.bg ?? lineFillBg(theme, line),
    bold: !!(o?.bold || r.bold || b?.bold || a & A_BOLD),
    italic: !!(r.italic || a & A_ITALIC),
    underline: !!(o?.underline || r.underline || b?.underline || a & A_UNDERLINE),
    strike: !!(a & A_STRIKE),
    dim: !!(r.dim || a & A_DIM),
    // A role drawn in reverse (a highlight without colour, NO_COLOR).
    ...(r.inverse ? { inverse: true } : {}),
  };
}
