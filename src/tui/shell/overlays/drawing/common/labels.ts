// Owner-local overlays drawing: marked, wrapWords, drawKeys.

import type { App } from "../../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../../terminal/canvas.ts";
import { roleStyle } from "../../../screen/style.ts";
import { truncate, stringWidth } from "../../../../../core/foundation/text/width.ts";
import { sanitizeMap } from "../../../../../core/foundation/text/sanitize.ts";
import type { Color } from "../../../../../core/rendering/theme/theme.ts";

/**
 * Text as it's drawn (sanitized) and a match's positions in it: the positions are the raw text's
 * own (match.ts), and a control or an escape taken out would shift every one after it.
 */
export function marked(raw: string, positions: Iterable<number>): { text: string; pos: Set<number> } {
  const m = sanitizeMap(raw);
  const pos = new Set<number>();
  for (const p of positions) {
    const at = m.at[p];
    if (at !== undefined && at >= 0) pos.add(at);
  }
  return { text: m.text, pos };
}

/** Words into lines of at most `width` columns. */
export function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && stringWidth(`${line} ${word}`) > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.map((l) => truncate(l, width));
}

/**
 * Key bindings as keycaps ending at `right`, each binding one cap (a sequence stays inside it),
 * in columns `colW` wide so they line up from row to row. Without a keycap background (NO_COLOR)
 * the columns are separated by " · ". Returns the width used; keys that don't fit are dropped.
 */
export function drawKeys(
  app: App,
  c: Canvas,
  right: number,
  y: number,
  keys: string[],
  room: number,
  selected: boolean,
  rowBg: Color | null,
  colW: number[],
): number {
  const theme = app.theme;
  const cap = roleStyle(theme, selected ? "keycap_selected" : "keycap", rowBg);
  const plain = cap.bg === rowBg;
  const pad = plain ? 0 : 2; // the cap's own spaces
  const gap = plain ? 3 : 1;
  const cols = colW.filter((wd) => wd > 0).length;
  const widthOf = (n: number) => colW.slice(0, n).reduce((a, wd) => a + wd + pad, 0) + (n - 1) * gap;
  let n = cols;
  while (n > 0 && widthOf(n) > room) n--;
  if (!n) return 0;
  let x = right - widthOf(n);
  const sepSt = { ...roleStyle(theme, "overlay_dim", rowBg), bg: rowBg };
  for (let i = 0; i < n; i++) {
    const k = keys[i];
    if (k) {
      if (plain && i > 0) drawText(c, x - 2, y, "·", sepSt);
      drawText(c, x, y, plain ? k : ` ${k} `, cap);
    }
    x += colW[i]! + pad + gap;
  }
  return widthOf(n);
}
