// The permanent location and activity bar (VB-T2).

import { locationItems } from "./location.ts";
import { fitLocation, type LocationItem as Item } from "./fit-location.ts";
import { VERSION } from "../../../../version.ts";
import { PREVIEW_VERSION } from "../../../../core/application/distribution/release.ts";
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
  const block = (items: Item[], x: number) => {
    const cap = (text: string) => {
      x += drawText(c, x, band.y, text, { ...bar, fg: group.bg ?? bar.fg });
    };
    if (!tight) cap(app.glyphs.groupLeft);
    items.forEach((item, i) => {
      if (i) x += drawText(c, x, band.y, sep, { ...roleStyle(app.theme, "status_dim", group.bg), bg: group.bg });
      const role = roleStyle(app.theme, item.role, group.bg);
      const text = tight ? sanitize(item.text) : ` ${sanitize(item.text)} `;
      const width = drawText(
        c,
        x,
        band.y,
        text,
        app.mouse.hover === item.id ? roleStyle(app.theme, "hover", group.bg) : { ...role, bg: group.bg },
      );
      geo.hot.push({ id: item.id, x, y: band.y, w: width, h: 1 });
      x += width;
    });
    if (!tight) cap(app.glyphs.groupRight);
    return x;
  };
  const left = button(app, c, 0, band, " slipbox ", "topbar_chip", "btn:palette", geo, bar.bg) + 1;
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
  const work = app.background.tasks.size;
  const newer = app.updates.available;
  const version = app.updates.env?.version ?? VERSION;
  const shortVersion = PREVIEW_VERSION.test(version) ? `${version.split("-preview.")[0]}-P` : version;
  const up = app.glyphs.upgrade;
  let right: Item[] = [
    { text: String(work), id: "top:work", role: work ? "topbar_button_on" : "status_dim" },
    { text: sanitize(shortVersion), id: "top:version", role: "topbar" },
    ...(newer ? [{ text: up === "^" ? up : "↑", id: "top:upgrade", role: "upgrade_available" as Role }] : []),
  ];
  const rightSize = () => right.reduce((n, item) => n + stringWidth(item.text) + 5, 0);
  const items = locationItems(app);
  const full = items.reduce((n, item) => n + stringWidth(item.text) + 3, 2);
  if (left + full + rightSize() > end)
    right = right.map((item) => ({
      ...item,
      text: item.id === "top:work" ? "#" : item.id === "top:version" ? "v" : up,
    }));
  if (left + full + rightSize() > end) right = [];
  let rx = end - rightSize();
  for (const item of right) rx = block([item], rx) + 1;
  const room = end - rightSize() - left;
  const fitted = fitLocation(items, room, sep, tight);
  const size =
    fitted.reduce((n, item) => n + stringWidth(item.text) + (tight ? 0 : 2), tight ? 0 : 2) +
    Math.max(0, fitted.length - 1);
  block(fitted, Math.max(left, Math.min(Math.floor((c.width - size) / 2), end - rightSize() - size)));
}
