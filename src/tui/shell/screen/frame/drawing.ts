// Owner-local screen drawing: drawRail, drawJoints.

import { roleStyle, pageBg } from "../style.ts";
import { button } from "../controls.ts";
import type { App } from "../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../terminal/canvas.ts";
import { LEFT_VIEWS, RIGHT_VIEWS } from "../../panels/panels.ts";
import type { Geometry } from "../geometry/contracts.ts";

/**
 * A rail: a column of buttons at one edge, one per row from the top. Tinted (the `rail` role), it
 * needs no border; without colour to tint it (NO_COLOR) a border on its inner side, at `bx`,
 * sets it apart, joined to the rules it meets. The left rail runs from under the top bar and
 * holds the left panel's views; the right one from under the tab strip, with the right panel's.
 */
export function drawRail(
  app: App,
  c: Canvas,
  side: "left" | "right",
  bx: number,
  y0: number,
  top: number,
  bottom: number,
  borderEnd: number,
  geo: Geometry,
): void {
  const theme = app.theme;
  const page = pageBg(theme);
  const tint = theme.roles.rail.bg ?? null;
  const w = side === "left" ? app.panels.leftRailWidth : app.panels.rightRailWidth;
  // The rail's columns: [x0, x0 + w); with a border, the buttons sit beside it.
  const x0 = side === "left" ? 0 : c.width - w;
  const bg = tint ?? page;
  c.fill(x0, top, w, bottom + 1 - top, bg);
  let x = x0;
  if (!tint) {
    const border = roleStyle(theme, "border", page);
    for (let y = top; y <= bottom; y++) drawText(c, bx, y, app.glyphs.vbar, border, 1);
    geo.verticals.push({ x: bx, y0, y1: borderEnd, style: border });
    if (side === "right") x = bx + 1;
  }
  // A button per view of that side's panel, bright while its view shows.
  const buttons =
    side === "left"
      ? [
          ...LEFT_VIEWS.map((v) => ({
            glyph: v.glyph(app.glyphs),
            on: app.panels.sidebarShown && app.leftView === v.id,
            id: `btn:${v.id}`,
          })),
        ]
      : RIGHT_VIEWS.map((v) => ({
          glyph: v.glyph(app.glyphs),
          on: app.panels.outlineShown && app.rightView === v.id,
          id: `btn:${v.id}`,
        }));
  buttons.forEach((b, k) => {
    const y = top + k;
    if (y > bottom) return;
    button(app, c, x, { y, h: 1 }, ` ${b.glyph} `, b.on ? "topbar_button_on" : "topbar_button", b.id, geo, bg);
  });
}

/** Where rules meet vertical borders, the box glyph for the lines that meet there. */
export function drawJoints(app: App, c: Canvas, geo: Geometry): void {
  const covers = (y: number, x: number) => geo.rules.some((r) => r.y === y && x >= r.x0 && x < r.x1);
  // Every vertical's arms at a crossing first, then one glyph from them all: two lines meeting the
  // same rule at the same column (a tab's separator over a pane's border) make ╋, not whichever
  // was drawn last.
  const at = new Map<
    string,
    {
      x: number;
      y: number;
      u: boolean;
      d: boolean;
      l: boolean;
      r: boolean;
      style: (typeof geo.verticals)[number]["style"];
    }
  >();
  for (const v of geo.verticals) {
    for (const r of geo.rules) {
      if (r.y < v.y0 || r.y > v.y1) continue;
      const l = covers(r.y, v.x - 1);
      const rt = covers(r.y, v.x + 1);
      if (!l && !rt) continue;
      const k = `${v.x},${r.y}`;
      const j = at.get(k) ?? { x: v.x, y: r.y, u: false, d: false, l, r: rt, style: v.style };
      j.u ||= r.y > v.y0;
      j.d ||= r.y < v.y1;
      at.set(k, j);
    }
  }
  for (const j of at.values()) {
    const g = app.glyphs.joints[`${j.u ? "u" : ""}${j.d ? "d" : ""}${j.l ? "l" : ""}${j.r ? "r" : ""}`];
    if (g) drawText(c, j.x, j.y, g, j.style, 1);
  }
}
