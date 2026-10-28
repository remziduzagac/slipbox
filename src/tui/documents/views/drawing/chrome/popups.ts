// Owner-local pane drawing: drawCompletion, drawSignature.

import type { App } from "../../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../../../shell/terminal/canvas.ts";
import type { Rect } from "../../../../shell/screen/geometry.ts";
import { roleStyle } from "../../../../shell/screen/style.ts";
import { truncate, stringWidth } from "../../../../../core/foundation/text/width.ts";
import { sanitize } from "../../../../../core/foundation/text/sanitize.ts";

/** Completion's popup (19.16): up to ten items under the cursor (above it when there's no room), the chosen one marked, each item's detail dimmed beside it. */
export function drawCompletion(app: App, c: Canvas, at: { x: number; y: number }, top: number, bottom: number): Rect {
  const comp = app.completion!;
  const theme = app.theme;
  const rows = Math.min(10, comp.shown.length);
  const first = Math.max(0, Math.min(comp.selected - rows + 1, comp.shown.length - rows));
  const items = comp.shown
    .slice(first, first + rows)
    .map((i) => ({ label: sanitize(i.label), detail: sanitize(i.detail ?? i.labelDetails?.description ?? "") }));
  const labelW = Math.min(40, Math.max(...items.map((i) => stringWidth(i.label))));
  const detailW = Math.min(30, Math.max(0, ...items.map((i) => stringWidth(i.detail))));
  const w = Math.min(c.width, labelW + (detailW ? detailW + 2 : 0) + 2);
  const y0 = at.y + 1 + rows <= bottom ? at.y + 1 : Math.max(top, at.y - rows);
  const x0 = Math.max(0, Math.min(at.x, c.width - w));
  items.forEach((item, k) => {
    const chosen = first + k === comp.selected;
    const st = roleStyle(theme, chosen ? "overlay_selected" : "overlay", null);
    c.fill(x0, y0 + k, w, 1, st.bg);
    drawText(c, x0 + 1, y0 + k, truncate(item.label, labelW), st, labelW);
    if (detailW && item.detail)
      drawText(
        c,
        x0 + 1 + labelW + 2,
        y0 + k,
        truncate(item.detail, detailW),
        { ...roleStyle(theme, "overlay_dim", st.bg), bg: st.bg },
        detailW,
      );
  });
  return { x: x0, y: y0, w, h: rows };
}

/** The signature being typed (19.16): one line above the cursor, its active parameter marked. */
export function drawSignature(app: App, c: Canvas, at: { x: number; y: number }, top: number): void {
  const sig = app.signature!;
  const theme = app.theme;
  const label = sanitize(sig.label);
  const w = Math.min(c.width, stringWidth(label) + 2);
  const y = at.y - 1 >= top ? at.y - 1 : at.y + 1;
  const x = Math.max(0, Math.min(at.x, c.width - w));
  const st = roleStyle(theme, "overlay", null);
  c.fill(x, y, w, 1, st.bg);
  if (!sig.active) return void drawText(c, x + 1, y, label, st, w - 2);
  // The parameter's offsets are the server's label's: each part sanitized on its own.
  const [a, b] = sig.active;
  let px = x + 1;
  px += drawText(c, px, y, sanitize(sig.label.slice(0, a)), st);
  px += drawText(c, px, y, sanitize(sig.label.slice(a, b)), {
    ...roleStyle(theme, "overlay_match", st.bg),
    bg: st.bg,
    bold: true,
  });
  drawText(c, px, y, sanitize(sig.label.slice(b)), st, Math.max(0, x + w - 1 - px));
}
