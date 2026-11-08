// The permanent top bar (VB-T2, #104): its sections, each a group of segments. At the left, the branding and an
// upgrade's arrow, both About (where the version is); at the right, Where you are, then the work and the messages.

import { whereSegments } from "./location.ts";
import { fitLocation, type Segment } from "./fit-location.ts";
import type { App } from "../../../app/runtime/app.ts";
import { type Canvas, drawText } from "../../terminal/canvas.ts";
import type { Band } from "../geometry.ts";
import type { Geometry } from "../draw.ts";
import { roleStyle, pageBg } from "../style.ts";
import { button } from "../controls.ts";
import type { Role } from "../../../../core/rendering/theme/theme.ts";
import { sanitize } from "../../../../core/foundation/text/sanitize.ts";
import { stringWidth } from "../../../../core/foundation/text/width.ts";

export function drawTopBar(app: App, c: Canvas, band: Band, geo: Geometry): void {
  const bar = roleStyle(app.theme, "topbar", pageBg(app.theme));
  const group = roleStyle(app.theme, "topbar_group", bar.bg);
  c.fill(0, band.y, c.width, 1, bar.bg);
  const tight = c.width < 26;
  const sep = app.glyphs.groupSeparator;
  /** A section's width: its ends, each segment padded, the separators between them. */
  const width = (segments: Segment[]) =>
    segments.length
      ? segments.reduce((n, s) => n + stringWidth(s.text) + (tight ? 0 : 2), tight ? 0 : 2) +
        (segments.length - 1) * stringWidth(sep)
      : 0;
  const section = (segments: Segment[], x: number) => {
    const cap = (text: string) => {
      x += drawText(c, x, band.y, text, { ...bar, fg: group.bg ?? bar.fg });
    };
    if (!tight) cap(app.glyphs.groupLeft);
    segments.forEach((s, i) => {
      if (i) x += drawText(c, x, band.y, sep, { ...roleStyle(app.theme, "status_dim", group.bg), bg: group.bg });
      const role = roleStyle(app.theme, s.role, group.bg);
      const text = tight ? sanitize(s.text) : ` ${sanitize(s.text)} `;
      const w = drawText(
        c,
        x,
        band.y,
        text,
        app.mouse.hover === s.id ? roleStyle(app.theme, "hover", group.bg) : { ...role, bg: group.bg },
      );
      geo.hot.push({ id: s.id, x, y: band.y, w, h: 1 });
      x += w;
    });
    if (!tight) cap(app.glyphs.groupRight);
    return x;
  };
  // The branding, and an upgrade's arrow right after it, a badge in the theme's green: both About, where the version
  // is, a click away.
  const brand = button(app, c, 0, band, " slipbox ", "topbar_chip", "top:brand", geo, bar.bg);
  const up = app.glyphs.upgrade;
  const badge = app.updates.available
    ? button(app, c, brand, band, `${up === "^" ? up : "↑"} `, "upgrade_available", "top:upgrade", geo, bar.bg)
    : 0;
  const left = brand + badge + 1;
  const outline = !app.panels.rightRailWidth && !geo.hot.some((hit) => hit.id === "btn:outline");
  const outlineWidth = outline ? stringWidth(app.glyphs.outlineButton) + 2 : 0;
  const end = c.width - outlineWidth;
  if (outline)
    button(
      app,
      c,
      end,
      band,
      ` ${app.glyphs.outlineButton} `,
      app.panels.outlineShown ? "topbar_button_on" : "topbar_button",
      "btn:outline",
      geo,
      bar.bg,
    );
  const count = app.background.tasks.size;
  // At the right, the background work and the messages said since their list was last opened, coloured by the worst
  // of them as the status bar colours a message (not underlined, as a problem in the text is).
  const said = app.notifications.unseen();
  const messages: Segment = {
    text: `${app.glyphs.messages} ${said.count}`,
    id: "top:messages",
    role: said.level === "error" ? "error" : said.level === "warn" ? "warn" : said.count ? "topbar" : "status_dim",
  };
  let activity: Segment[] = [
    { text: String(count), id: "top:work", role: (count ? "topbar_button_on" : "status_dim") as Role },
    messages,
  ];
  const location = whereSegments(app);
  const need = () => left + width(location) + width(activity) + 2;
  // Short of room, the work count and the messages shrink to their icons, then go; then Where you are gives way
  // (fitLocation). The branding and its badge stay.
  if (need() > end)
    activity = [
      { ...activity[0]!, text: "#" },
      { ...messages, text: app.glyphs.messages },
    ];
  if (need() > end) activity = [];
  const rx = activity.length ? end - width(activity) : end;
  if (activity.length) section(activity, rx);
  // Where you are, right next to them, in its order: the explorer's place, the workspace, the branch, the changes.
  const gap = activity.length ? 1 : 0;
  const fitted = fitLocation(location, rx - gap - left, sep, tight);
  section(fitted, Math.max(left, rx - gap - width(fitted)));
}
