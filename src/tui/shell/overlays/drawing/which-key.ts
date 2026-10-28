// Owner-local overlays drawing: drawWhichKey.

import type { App } from "../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../terminal/canvas.ts";
import type { Geometry } from "../../screen/geometry/contracts.ts";
import { coverHot } from "../../screen/geometry.ts";
import { roleStyle } from "../../screen/style.ts";
import { keyText } from "../../screen/controls.ts";
import { truncate, stringWidth } from "../../../../core/foundation/text/width.ts";

/**
 * The which-key popup, framed like the other popups: a bordered box on the overlay background
 * with the pending keys as its title, the hint in the bottom border, and the same margin. Inside,
 * `key → name` entries in up to three columns (each sized to its own entries), explanations
 * underneath. It sits centred just above the bottom of the content area.
 */
export function drawWhichKey(app: App, c: Canvas, top: number, bottom: number, geo: Geometry): void {
  const theme = app.theme;
  const entries = app.input.whichKeyEntries();
  if (!entries.length) return;
  const shownKey = (key: string) =>
    key
      .split(" ")
      .map((k) => keyText(app, k))
      .join(" ");
  const GAP = 4;
  const maxW = Math.min(c.width - 8, 140);
  const room = bottom - top - 2; // the margin above and below
  const layoutFor = (n: number, compact = false) => {
    const perCol = Math.ceil(entries.length / n);
    const widths: { key: number; text: number }[] = [];
    for (let k = 0; k < n; k++) {
      const col = entries.slice(k * perCol, (k + 1) * perCol);
      if (!col.length) break;
      widths.push({
        key: Math.min(16, Math.max(...col.map((e) => stringWidth(shownKey(e.key))))) + 2, // " → "
        text: Math.min(44, Math.max(...col.map((e) => Math.max(stringWidth(e.label), stringWidth(e.desc))))),
      });
    }
    // Inside the borders: a column of padding each side, the columns, gaps between them.
    const size = () => widths.reduce((a, w) => a + w.key + 1 + w.text, 0) + (widths.length - 1) * GAP + 4;
    // Shorten the widest text columns before losing explanations to an extra row of entries.
    // Keep twenty text cells where available; narrower screens use fewer columns as before.
    if (compact)
      while (size() > maxW) {
        const widest = widths.reduce((a, b) => (b.text > a.text ? b : a));
        if (widest.text <= 20) break;
        widest.text--;
      }
    return { perCol, widths, total: size() };
  };
  let plan = layoutFor(1);
  for (const n of [3, 2]) {
    const p = layoutFor(n);
    if (p.total <= maxW) {
      plan = p;
      break;
    }
  }
  if (entries.some((e) => e.desc) && plan.perCol * 2 + 2 > room)
    for (const n of [3, 2]) {
      const compact = layoutFor(n, true);
      if (compact.total <= maxW && compact.perCol * 2 + 2 <= room) {
        plan = compact;
        break;
      }
    }
  const rows = plan.perCol;
  if (room < 3) return; // no room for even a box with one row
  // Inside the borders, a blank row above and below the entries.
  const withDesc = entries.some((e) => e.desc) && rows * 2 + 2 <= room;
  const entryH = withDesc ? 2 : 1;
  // The blank rows only with the explanations: shrinking drops them first, and they don't come
  // back once the explanations are gone.
  const pad = withDesc && rows * 2 + 4 <= room ? 1 : 0;
  const h = Math.max(3, Math.min(room, rows * entryH + 2 + 2 * pad));
  // The pending keys and their group's name; a top-level prefix's explanation too, which no popup above it shows
  // (DF-D31): the box as wide as it needs, as far as the screen allows.
  const name = app.input.groupName(app.pending);
  const said = name ? app.input.groupExplanation(app.pending) : "";
  const title = app.pending.length
    ? ` ${shownKey(app.pending.join(" "))} ›${name ? ` ${name}${said ? `: ${said}` : ""}` : ""} `
    : ` ${name} `;
  const fit = Math.min(maxW, Math.max(plan.total, 40));
  const w = said ? Math.max(fit, Math.min(c.width - 8, stringWidth(title) + 6)) : fit;
  const x0 = Math.floor((c.width - w) / 2);
  const y0 = bottom - 1 - h;
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  const desc = { ...dim, bg: bg.bg };
  c.fill(x0 - 2, y0 - 1, w + 4, h + 2, bg.bg);
  geo.popup = { x: x0 - 2, y: y0 - 1, w: w + 4, h: h + 2 };
  coverHot(geo, geo.popup);
  const b = app.glyphs.box;
  drawText(c, x0, y0, `${b.tl}${b.h}`, border);
  // Cut, it keeps the space before the border's rule.
  const tw = drawText(c, x0 + 2, y0, `${truncate(title.trimEnd(), w - 7)} `, { ...border, bold: true });
  drawText(c, x0 + 2 + tw, y0, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x0, y0 + k, b.v, border, 1);
    drawText(c, x0 + w - 1, y0 + k, b.v, border, 1);
  }
  // Entries that don't fit (a short screen) are counted in the bottom border; the hint is left
  // out when the box is too narrow for it.
  const visibleRows = Math.floor((h - 2 - 2 * pad) / entryH);
  const hiddenCount = entries.filter((_, i) => i % rows >= visibleRows).length;
  const hintText = `${hiddenCount ? `+${hiddenCount} more · ` : ""}${app.pending.length ? "backspace up · esc cancel" : "keys repeat · any other key leaves"}`;
  // Too narrow for the hint: the count alone, which must not be lost with it.
  const countOnly = hiddenCount ? `+${hiddenCount} more` : "";
  const hint =
    stringWidth(hintText) + 2 <= w - 4
      ? ` ${hintText} `
      : countOnly && stringWidth(countOnly) + 2 <= w - 4
        ? ` ${countOnly} `
        : "";
  const bottomRule = `${b.bl}${b.h.repeat(Math.max(0, w - 2 - stringWidth(hint)))}`;
  drawText(c, x0, y0 + h - 1, bottomRule, border);
  drawText(c, x0 + stringWidth(bottomRule), y0 + h - 1, hint, dim);
  drawText(c, x0 + w - 1, y0 + h - 1, b.br, border);
  const keySt = { ...roleStyle(theme, "which_key_key", bg.bg), bg: bg.bg };
  const grpSt = { ...roleStyle(theme, "which_key_group", bg.bg), bg: bg.bg, bold: true };
  const colX: number[] = [];
  plan.widths.reduce((x, cw) => (colX.push(x), x + cw.key + 1 + cw.text + GAP), x0 + 2);
  entries.forEach((e, i) => {
    const col = Math.floor(i / rows);
    const row = i % rows;
    const y = y0 + 1 + pad + row * entryH;
    const cw = plan.widths[col];
    if (y >= y0 + h - 1 - pad || !cw) return;
    const x = colX[col]!;
    const textX = x + cw.key + 1;
    const textW = Math.min(cw.text, x0 + w - 2 - textX);
    if (textW <= 0) return; // no room for the name inside the box
    const id = `wk:${e.key.split(" ")[0]}`;
    // As wide as it's drawn: a column cut by the box's edge never spills past its border.
    geo.hot.push({ id, x, y, w: cw.key + 1 + textW, h: entryH });
    const hover = app.mouse.hover === id;
    if (hover) c.fill(x, y, cw.key + 1 + textW, entryH, theme.roles.hover.bg ?? null);
    const rowBg = hover ? (theme.roles.hover.bg ?? bg.bg) : bg.bg;
    drawText(c, x, y, truncate(shownKey(e.key), cw.key - 2), { ...keySt, bg: rowBg });
    drawText(c, x + cw.key - 1, y, "→", { ...bg, bg: rowBg });
    drawText(
      c,
      textX,
      y,
      truncate(e.label, textW),
      e.group ? { ...grpSt, bg: rowBg } : { ...bg, bg: rowBg, bold: true },
    );
    if (withDesc && e.desc && y + 1 < y0 + h - 1 - pad)
      drawText(c, textX, y + 1, truncate(e.desc, textW), { ...desc, bg: rowBg });
  });
}
