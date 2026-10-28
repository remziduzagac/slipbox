// Owner-local screen drawing: drawTabs.

import type { Band } from "../../shell/screen/geometry.ts";
import { CHANGE_MARKER_MS, roleStyle, pageBg } from "../../shell/screen/style.ts";
import { button } from "../../shell/screen/controls.ts";
import type { Role } from "../../../core/rendering/theme/theme.ts";
import { stringWidth, truncate } from "../../../core/foundation/text/width.ts";
import type { App } from "../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../shell/terminal/canvas.ts";
import type { Geometry } from "../../shell/screen/geometry/contracts.ts";

/** The tab strip, under the top bar whenever a note is open, right of the explorer. */
export function drawTabs(app: App, c: Canvas, x0: number, band: Band, geo: Geometry): void {
  const theme = app.theme;
  const page = pageBg(theme);
  const stripBg = theme.roles.tab.bg ?? page;
  c.fill(x0, band.y, c.width - x0, band.h, stripBg);
  geo.tabStrip = { x: x0, y: band.y, w: c.width - x0, h: band.h };
  const border = roleStyle(theme, "border", page);
  // A ┃ after each tab, joined to the rules above and below the strip.
  const separator = (x: number) => {
    drawText(c, x, band.y, app.glyphs.vbar, border, 1);
    geo.verticals.push({ x, y0: band.y - 1, y1: band.y + band.h, style: border });
  };
  const labels = app.tabs.map((t, i) => {
    const v = t.views[t.active]!;
    // Unsaved changes (any tab showing the note), else a recent change on disk.
    const changed = v.buf.dirty ? " •" : v.buf.changedAt && app.now() - v.buf.changedAt < CHANGE_MARKER_MS ? " ↻" : "";
    // Another vault's file, kept from a peek (VV-D7): marked with that vault's name.
    const e = v.buf.elsewhere;
    const name = e?.rel ? `${e.vault}: ${e.rel.split("/").pop()!}` : app.displayName(v.buf).split("/").pop()!;
    return ` ${i + 1} ${t.pinned ? `${app.glyphs.pin} ` : ""}${truncate(name, e ? 36 : 24)}${changed} `;
  });
  const close = `${app.glyphs.close} `;
  const widths = labels.map((l) => stringWidth(l) + stringWidth(close) + 1);
  // What fits: from the first tab, scrolled just enough to show the active one. When some don't
  // fit, a "+N" button at the far right opens the tab list.
  const room = c.width - x0;
  const fits = (from: number, to: number, reserve: number) =>
    widths.slice(from, to + 1).reduce((a, w) => a + w, 0) <= room - reserve;
  let from = 0;
  let to = widths.length - 1;
  if (!fits(from, to, 0)) {
    const more = (hidden: number) => stringWidth(` +${hidden} `) + 1;
    const active = Math.min(app.activeTab, widths.length - 1);
    to = active;
    while (from < to && !fits(from, to, more(widths.length - (to - from + 1)))) from++;
    while (to + 1 < widths.length && fits(from, to + 1, more(widths.length - (to - from + 2)))) to++;
  }
  const hidden = widths.length - (to - from + 1);
  const moreLabel = ` +${hidden} `;
  // Tabs stop before the +N button (and its border), even when the one tab left is cut short.
  const limit = hidden > 0 ? c.width - stringWidth(moreLabel) - 1 : c.width;
  let x = x0;
  let lastSep = -1;
  for (let i = from; i <= to && x < limit; i++) {
    const role: Role = i !== app.activeTab ? "tab" : app.region === "content" ? "tab_active" : "tab_active_idle";
    const w = button(app, c, x, band, labels[i]!, role, `tab:${i}`, geo, stripBg, limit - x);
    geo.tabs.push({ x, y: band.y, w, h: band.h, index: i });
    x += w;
    const tabBg = roleStyle(theme, role, stripBg).bg ?? stripBg;
    x += button(app, c, x, band, close, role, `tabclose:${i}`, geo, tabBg, limit - x);
    if (x < limit) {
      separator(x);
      lastSep = x;
    }
    x += 1;
  }
  if (hidden > 0) {
    const label = moreLabel;
    const bx = c.width - stringWidth(label);
    // Its own border — also after a tab cut short — unless the last tab's is (nearly) next to it.
    if (lastSep < bx - 2) separator(bx - 1);
    button(app, c, bx, band, label, "tab", "tabmore:", geo, stripBg);
  }
}
