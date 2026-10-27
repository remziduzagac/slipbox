// Drawing a window's header (HDR-D1): the row atop each window between two rules — a split's file name, the
// breadcrumb, the mode's buttons (HDR-D2) and the outline's ▤ — and how the buttons give way in a narrow one (HDR-D4).

import type { App, View } from "./app/runtime/app.ts";
import { type Canvas, drawText } from "./shell/terminal/canvas.ts";
import { type Rect, type Geometry, pageBg, roleStyle, button, drawBreadcrumb, crumbLeast } from "./draw.ts";
import { truncate, stringWidth } from "../core/foundation/text/width.ts";
import { MODES, viewMode } from "./shell/input/modes.ts";

/** The buttons' forms, widest first: every label, every letter, the selected one's letter alone; none. */
export type ModeForm = "letters" | "selected" | "none";

/** A label, or its letter, as drawn: a space either side. */
const labelOf = (m: (typeof MODES)[number]) => ` ${m.label[0]} `;

/** Each form's width: every label, every letter, one letter (the widest, whichever is selected). */
const FORM_WIDTH: Record<Exclude<ModeForm, "none">, number> = {
  letters: MODES.reduce((a, m) => a + stringWidth(labelOf(m)), 0),
  selected: Math.max(...MODES.map((m) => stringWidth(labelOf(m)))),
};

/**
 * The buttons' form in `room` columns, the breadcrumb wanting `least` of them, its margins aside (HDR-D4): the widest
 * that leaves it those, else the selected letter as long as it fits at all.
 */
export function modeButtons(room: number, least: number): ModeForm {
  // The breadcrumb's columns are those between the name and the buttons less one at each end.
  const keep = least > 0 ? least + 2 : 0;
  if (FORM_WIDTH.letters + keep <= room) return "letters";
  return room >= FORM_WIDTH.selected ? "selected" : "none";
}

/**
 * A window's header on the row under `rect`'s top (on its top row when the frame's rule is above it): a rule above
 * unless that, the band, a rule under. Returns the band's row.
 */
export function drawWindowHeader(
  app: App,
  c: Canvas,
  view: View,
  rect: Rect,
  o: { titled: boolean; ruleAbove: boolean; topRight: boolean; active: boolean },
  geo: Geometry,
): number {
  const theme = app.theme;
  const page = pageBg(theme);
  const rule = (y: number) => {
    drawText(c, rect.x, y, app.glyphs.hbar.repeat(rect.w), roleStyle(theme, "border", page), rect.w);
    geo.rules.push({ y, x0: rect.x, x1: rect.x + rect.w });
  };
  const y = o.ruleAbove ? rect.y : rect.y + 1;
  if (!o.ruleAbove) rule(rect.y);
  const bg = roleStyle(theme, "breadcrumb_band", page).bg;
  c.fill(rect.x, y, rect.w, 1, bg);
  let x = rect.x;
  if (o.titled) {
    const name = ` ${truncate(app.displayName(view.buf), Math.floor(rect.w / 2))} `;
    x += drawText(c, x, y, name, { ...roleStyle(theme, o.active ? "strong" : "dim", bg), bg }, rect.w);
  }
  let end = rect.x + rect.w;
  if (o.topRight && !app.panels.rightRailWidth) {
    // The outline's button, at the far right (on the rail instead, when it shows).
    const label = ` ${app.glyphs.outlineButton} `;
    end -= stringWidth(label);
    const role = app.panels.outlineShown ? "topbar_button_on" : "topbar_button";
    button(app, c, end, { y, h: 1 }, label, role, "btn:outline", geo, bg);
  }
  // The layout first: laying the window out can change its mode (a file that stopped parsing goes to source mode once
  // typing ends), and the buttons say the mode it's in.
  const layout = app.currentLayout(view);
  const crumbs = app.ui.breadcrumb ? app.outlineView.breadcrumb(view, layout) : [];
  // The breadcrumb's least room is its own, not its headings' nor the mode's (HDR-D7, HDR-D8): the buttons keep their
  // form as the cursor moves and the mode changes; only the window's width, and the breadcrumb shown or hidden, change
  // it.
  const least = app.ui.breadcrumb ? crumbLeast(app.glyphs) : 0;
  const form = modeButtons(end - x, least);
  const start = form === "none" ? end : end - FORM_WIDTH[form];
  drawModeButtons(app, c, view, start, y, form, bg, geo);
  if (crumbs.length) drawBreadcrumb(app, c, view, crumbs, x + 1, start - 1, y, bg, geo);
  rule(y + 1);
  return y;
}

/**
 * The mode's buttons from `x` (HDR-D2): the selected one bright, the others dim, a mode the window can't switch to
 * disabled. The selected and the disabled are never drawn hovered, a click changing nothing or saying why.
 */
function drawModeButtons(
  app: App,
  c: Canvas,
  view: View,
  x: number,
  y: number,
  form: ModeForm,
  bg: ReturnType<typeof roleStyle>["bg"],
  geo: Geometry,
): void {
  if (form === "none") return;
  const now = viewMode(view);
  const index = app.tab!.views.indexOf(view);
  for (const m of MODES) {
    const selected = m.mode === "rendered" ? !view.source : m.mode === now;
    if (form === "selected" && m.mode !== (view.source ? "source" : "rendered")) continue;
    const disabled = !selected && !app.lens.canSwitch(view, m.mode);
    const role = selected
      ? m.mode === "source"
        ? "view_source"
        : m.mode === "live"
          ? "view_lens"
          : "view_read"
      : disabled
        ? "topbar_button_disabled"
        : "topbar_button";
    const id = `mode:${index}:${m.id}`;
    // Hovered only where a click switches: the selected one's changes nothing, a disabled one's says why.
    x += button(app, c, x, { y, h: 1 }, labelOf(m), role, id, geo, bg, Infinity, !selected && !disabled);
  }
}
