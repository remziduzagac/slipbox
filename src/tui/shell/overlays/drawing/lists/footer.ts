// Owner-local overlays drawing: drawFooter.

import type { App, ListOverlay } from "../../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../../terminal/canvas.ts";
import { roleStyle } from "../../../screen/style.ts";
import { truncate, stringWidth } from "../../../../../core/foundation/text/width.ts";
import { wrapWords } from "../common/labels.ts";

/**
 * A list's footer, under a rule: the selected entry's name, its explanation (wrapping to a second
 * row), and its other bindings as keycaps. Always the same height, so the list doesn't jump.
 */
export function drawFooter(app: App, c: Canvas, o: ListOverlay, x: number, y: number, w: number): void {
  const theme = app.theme;
  const b = app.glyphs.box;
  drawText(c, x, y, `${b.ml}${b.h.repeat(w - 2)}${b.mr}`, roleStyle(theme, "overlay_border", null));
  const item = o.filtered[o.selected]?.item;
  if (!item || item.header) return;
  const text = roleStyle(theme, "overlay", null);
  const room = w - 4;
  drawText(c, x + 2, y + 1, truncate(item.label, room), { ...text, bold: true });
  const lines = wrapWords(item.detail ?? "", room);
  lines
    .slice(0, 2)
    .forEach((l, i) =>
      drawText(
        c,
        x + 2,
        y + 2 + i,
        i === 1 && lines.length > 2 ? truncate(`${l} ${lines.slice(2).join(" ")}`, room) : l,
        text,
      ),
    );
  if (item.more?.length) {
    const cap = roleStyle(theme, "keycap", text.bg);
    const plain = cap.bg === text.bg;
    let cx = x + 2 + drawText(c, x + 2, y + 4, "also ", roleStyle(theme, "overlay_dim", null));
    for (const [i, k] of item.more.entries()) {
      const label = plain ? (i ? ` · ${k}` : k) : ` ${k} `;
      if (cx + stringWidth(label) > x + w - 2) break;
      cx += drawText(c, cx, y + 4, label, plain ? text : cap) + (plain ? 0 : 1);
    }
  }
}
