import type { CellStyle } from "../../../core/rendering/layout/style.ts";
import type { Color, Role, Theme } from "../../../core/rendering/theme/theme.ts";

export const CHANGE_MARKER_MS = 3000;
export function roleStyle(theme: Theme, role: Role, page: Color | null): CellStyle {
  const r = theme.roles[role];
  return {
    fg: r.fg ?? theme.fg,
    bg: r.bg ?? page,
    bold: !!r.bold,
    italic: !!r.italic,
    underline: !!r.underline,
    strike: false,
    dim: !!r.dim,
    inverse: !!r.inverse,
  };
}
export function pageBg(theme: Theme): Color | null {
  return theme.bg === "default" ? null : theme.bg;
}
export function markStyle(theme: Theme, role: Role): Partial<CellStyle> {
  const r = theme.roles[role];
  const out: Partial<CellStyle> = {};
  if (r.bg) out.bg = r.bg;
  if (r.fg) out.fg = r.fg;
  if (r.bold) out.bold = true;
  if (r.underline) out.underline = true;
  if (r.inverse) out.inverse = true;
  return out;
}
