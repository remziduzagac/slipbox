// The permanent location and activity bar (VB-T2).
import { VERSION } from "../version.ts";
import { PREVIEW_VERSION } from "../core/release.ts";
import type { App } from "./app.ts";
import { type Canvas, drawText } from "./canvas.ts";
import { type Band, type Geometry, roleStyle, pageBg, button } from "./draw.ts";
import type { Role } from "../core/theme/theme.ts";
import { sanitize } from "../core/foundation/text/sanitize.ts";
import { stringWidth, truncateStart, truncate } from "../core/foundation/text/width.ts";
import { tildePath } from "../core/workspace/vaults/names.ts";
import { whereOf } from "./where.ts";

type Item = { text: string; id: string; role: Role; compact?: string };

export function locationItems(app: App): Item[] {
  const w = whereOf(app);
  const g = app.glyphs;
  const workspace = app.homeFolder ?? (app.loc.mode === "home" ? "~" : w.vault);
  const count = new Set(app.git.entries?.map((entry) => entry.path)).size;
  return [
    { text: `${g.explorerButton} ${sanitize(tildePath(app.explorer.top))}`, id: "top:zoom", role: "topbar" },
    { text: `${g.vault} ${sanitize(workspace)}`, id: "top:vault", role: "topbar" },
    ...(w.branch
      ? [
          {
            text: `${g.branch} ${w.branch}${w.track ? ` ${w.track}` : ""}${w.op ? ` ${w.op}` : ""}`,
            compact: `${g.branch} ${w.branch}${w.op ? ` ${w.op}` : ""}`,
            id: "top:branch",
            role: "status_dim" as Role,
          },
        ]
      : []),
    ...(count ? [{ text: `${g.changed} ${count}`, id: "top:changed", role: "git_modified" as Role }] : []),
  ];
}

/** Location survives narrowing; tracking gives way before branch, then the changed count. */
export function fitLocation(items: Item[], width: number, separator: string, tight = false): Item[] {
  const out = items.map((item) => ({ ...item }));
  const size = () =>
    out.reduce((n, item) => n + stringWidth(item.text) + (tight ? 0 : 2), tight ? 0 : 2) +
    Math.max(0, out.length - 1) * stringWidth(separator);
  const branch = out.find((item) => item.id === "top:branch");
  if (size() > width && branch) branch.text = branch.compact ?? branch.text;
  if (size() > width && branch)
    branch.text = truncate(branch.text, Math.max(4, stringWidth(branch.text) - (size() - width)));
  if (size() > width && branch) out.splice(out.indexOf(branch), 1);
  if (size() > width) {
    const changed = out.findIndex((item) => item.id === "top:changed");
    if (changed >= 0) out.splice(changed, 1);
  }
  for (const item of out) {
    if (size() <= width) break;
    const at = item.text.indexOf(" ");
    const glyph = item.text.slice(0, at + 1);
    const name = item.text.slice(at + 1);
    const target = Math.max(1, stringWidth(name) - (size() - width));
    item.text = glyph + truncateStart(name, target);
  }
  return out;
}

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
