// Drawing a window's header (HDR-D1): the row atop each window between two rules — a split's file name, the
// breadcrumb, the mode's buttons (HDR-D2) and the outline's ▤ — and how the buttons give way in a narrow one (HDR-D4).

import type { App, View } from "./app.ts";
import { type Canvas, drawText } from "./canvas.ts";
import { type Rect, type Geometry, pageBg, roleStyle, button, drawBreadcrumb, crumbLeast } from "./draw.ts";
import { truncate, stringWidth } from "../core/width.ts";
import { type ViewMode, viewMode } from "./lens.ts";

/** The modes' buttons, in order: the mode, its hit area's name, its label (its letter, shortened). */
export const MODE_BUTTONS: readonly { mode: ViewMode; id: "read" | "lens" | "source"; label: string }[] = [
  { mode: "rendered", id: "read", label: "Read" },
  { mode: "live", id: "lens", label: "Lens" },
  { mode: "source", id: "source", label: "Source" },
];

/** The buttons' forms, widest first: every label, every letter, the selected one's letter alone; none. */
export type ModeForm = "full" | "letters" | "selected" | "none";

/** A label, or its letter, as drawn: a space either side. */
const labelOf = (m: (typeof MODE_BUTTONS)[number], form: ModeForm) => ` ${form === "full" ? m.label : m.label[0]} `;

/** Each form's width: every label, every letter, one letter (the widest, whichever is selected). */
const FORM_WIDTH: Record<Exclude<ModeForm, "none">, number> = {
  full: MODE_BUTTONS.reduce((a, m) => a + stringWidth(labelOf(m, "full")), 0),
  letters: MODE_BUTTONS.reduce((a, m) => a + stringWidth(labelOf(m, "letters")), 0),
  selected: Math.max(...MODE_BUTTONS.map((m) => stringWidth(labelOf(m, "selected")))),
};

/**
 * The buttons' form in `room` columns, the breadcrumb wanting `least` of them, its margins aside (HDR-D4): the widest
 * that leaves it those, else the selected letter as long as it fits at all.
 */
export function modeButtons(room: number, least: number): ModeForm {
  // The breadcrumb's columns are those between the name and the buttons less one at each end.
  const keep = least > 0 ? least + 2 : 0;
  if (FORM_WIDTH.full + keep <= room) return "full";
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
  // The layout first (the breadcrumb asks for it; else asked here): laying the window out can change its mode (a file
  // that stopped parsing goes to source mode once typing ends), and the buttons say the mode it's in.
  const crumbs = app.ui.breadcrumb ? app.outlineView.breadcrumb(view) : (app.currentLayout(view), []);
  const least = crumbLeast(crumbs, app.glyphs);
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
  for (const m of MODE_BUTTONS) {
    const selected = m.mode === now;
    if (form === "selected" && !selected) continue;
    const disabled = !selected && !!app.lens.refusal(view, m.mode, true);
    const role = selected ? "topbar_button_on" : disabled ? "topbar_button_disabled" : "topbar_button";
    const id = `mode:${index}:${m.id}`;
    // Hovered only where a click switches: the selected one's changes nothing, a disabled one's says why.
    x += button(app, c, x, { y, h: 1 }, labelOf(m, form), role, id, geo, bg, Infinity, !selected && !disabled);
  }
}
