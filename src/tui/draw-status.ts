// Drawing the status line and the messages: the mode, the path, what's happening in the background, the cursor's
// place; the bottom line's prompt; the floating message boxes.

import type { App, View, PromptOverlay } from "./app.ts";
import { type Canvas, drawText } from "./canvas.ts";
import { type Band, type Geometry, pageBg, roleStyle, mid, keyText, CHANGE_MARKER_MS } from "./draw.ts";
import { keyChar } from "./keys.ts";
import { stringWidth, truncate, truncateStart, splitAtWidth } from "../core/width.ts";
import { srcAt } from "../core/layout/ir.ts";
import { countWords } from "../core/words.ts";
import { sanitize } from "../core/sanitize.ts";
import type { Role, Color } from "../core/theme/theme.ts";
import { SEVERITIES, worst } from "../core/diagnostics.ts";
import { severityGlyph, SEVERITY_ROLE } from "./draw-pane.ts";
import { MODES, type ViewMode, viewMode } from "./modes.ts";
import { fitWhere, whereOf } from "./where.ts";

/** The chip for a window's mode: the button its header has selected, by its label (HDR-D2). */
const CHIP = Object.fromEntries(MODES.map((m) => [m.mode, ` ${m.label.toUpperCase()} `])) as Record<ViewMode, string>;

export function drawStatus(app: App, c: Canvas, band: Band, geo: Geometry): void {
  const theme = app.theme;
  const page = pageBg(theme);
  const st = roleStyle(theme, "status", page);
  c.fill(0, band.y, c.width, band.h, st.bg);
  const y = mid(band);
  const view = app.view;
  const vim = app.vim;
  const chip = app.pending.length
    ? ` ${app.pending.map((k) => keyText(app, k)).join(" ")} `
    : vim.op || vim.count || vim.awaitChar
      ? // An operator (or a count, or r, f, t waiting for a character): what's been typed so far, as
        // in vim's showcmd — `dT`, not `dshift+t`.
        ` ${vim.op ? `${vim.op.count > 1 ? vim.op.count : ""}${vim.op.op}${vim.count}${vim.op.object ?? ""}${vim.op.keys.map((k) => keyChar(k) ?? k).join("")}` : vim.awaitChar ? (vim.awaitKey ?? "r") : vim.count} `
      : app.panels.resizeMode
        ? " RESIZE "
        : view?.visual === "char"
          ? " VISUAL "
          : view?.visual === "line"
            ? " V-LINE "
            : app.region === "sidebar"
              ? app.leftView === "git"
                ? " GIT "
                : " FILES "
              : app.region === "problems"
                ? " PROBLEMS "
                : app.region === "outline"
                  ? app.rightView === "footnotes"
                    ? " FOOTNOTES "
                    : app.rightView === "info"
                      ? " INFO "
                      : " OUTLINE "
                  : view?.insert
                    ? " INSERT "
                    : CHIP[view ? viewMode(view) : "rendered"];
  const chipSt = roleStyle(theme, "status_accent", page);
  c.fill(0, band.y, stringWidth(chip), band.h, chipSt.bg ?? null);
  let x = drawText(c, 0, y, chip, chipSt);
  // The explorer's row under the cursor not indexed (`⊘`, VV-D9): why, while the cursor is on it.
  const why = app.explorer.marks.selectedWhy();
  const whyText = why ? `${app.glyphs.markNotIndexed} not indexed: ${sanitize(why)}  ` : "";
  const dim = { ...roleStyle(theme, "status_dim", st.bg), bg: st.bg };
  if (!view) {
    if (whyText) drawText(c, x + 1, y, truncate(whyText.trimEnd(), Math.max(0, c.width - x - 2)), dim);
    return;
  }
  const buf = view.buf;
  const layout = app.currentLayout(view);
  // Where the view is among the rows shown (an oversized lens hides some; they don't count).
  const hidden = view.live ? app.lens.hidden(view, layout) : [];
  const hiddenIn = (a: number, b: number) =>
    hidden.reduce((n, [h0, h1]) => n + Math.max(0, Math.min(h1, b) - Math.max(h0, a)), 0); // ranges are [start, end)
  const shownTotal = layout.lines.length - hiddenIn(0, layout.lines.length);
  const shownTop = view.top - hiddenIn(0, view.top);
  const pct =
    shownTotal <= view.height ? "all" : `${Math.round((shownTop / Math.max(1, shownTotal - view.height)) * 100)}%`;
  const cursorRow = layout.lines[view.cur.row];
  const src = cursorRow ? srcAt(cursorRow, view.cur.col) : 1;
  // The column in the row's own text: the lens's counters before it, or a code cell's border and padding, aren't text.
  const col = Math.max(0, view.cur.col - (cursorRow?.text?.[0] ?? 0)) + 1;
  // The right side: the position always; the tab count, the link under the cursor and why the explorer's row isn't
  // indexed only while the path keeps a readable width (the link goes first, then the reason is cut, then the tab
  // count).
  const pos = `L${src}:${col} ${pct}`;
  // Words: the note's, or the selection's in visual mode; dropped first when room is short.
  const n = view.visual ? countWords(app.views.selectionText(view)) : buf.words();
  const words = `${n.toLocaleString("en")} word${n === 1 ? "" : "s"}${view.visual ? " selected" : ""}  `;
  const tabs = app.tabs.length > 1 ? `tab ${app.activeTab + 1}/${app.tabs.length}  ` : "";
  const li = app.linking.linkUnderCursor(view);
  const link = li >= 0 ? layout.links[li] : null;
  // How it landed, when a tie decided it (the nearest of 2 named so): a weak link shows as one.
  const landed = link && link.kind !== "tag" && link.status === "resolved" ? app.linking.linkLanded(view, link) : null;
  const linkText = link
    ? link.kind === "tag"
      ? `→ #${link.target}  `
      : `→ ${link.kind === "wiki" || link.kind === "embed" ? `[[${link.target}${link.heading ? `#${link.heading}` : ""}]]` : link.target} (${link.status}${landed ? `, ${landed}` : ""})  `
    : "";
  const markerW = stringWidth(pathMarker(app, view));
  const room = c.width - stringWidth(chip) - 2 - Math.min(16, stringWidth(app.displayName(view.buf))) - markerW;
  const fits = (s: string) => stringWidth(s) + 1 <= room;
  let right = `${linkText}${whyText}${words}${tabs}${pos}`;
  if (!fits(right)) right = `${linkText}${whyText}${tabs}${pos}`;
  if (!fits(right)) right = `${whyText}${tabs}${pos}`;
  // The row's reason cut to the room left, while that says something.
  if (!fits(right) && whyText) {
    const left = room - 1 - stringWidth(`${tabs}${pos}`);
    right = left >= 16 ? `${truncate(whyText.trimEnd(), left - 2)}  ${tabs}${pos}` : `${tabs}${pos}`;
  }
  if (!fits(right)) right = `${tabs}${pos}`;
  if (!fits(right)) right = pos;

  const rightW = stringWidth(right) + 1;
  x += drawText(c, x, y, " ", st);
  // Where the file is (21.9): the vault, by name or path, and its branch (20.14), only while the top bar doesn't say it
  // (WSP-D5), and while the path keeps a readable width (it goes before the path does) — at most 40 columns.
  const rootRoom = Math.min(40, c.width - x - rightW - 4 - 24);
  const fit = rootRoom >= 8 && !geo.whereOnTop ? fitWhere({ ...whereOf(app), glyph: "" }, rootRoom) : null;
  const vault = fit ? fit.vault + fit.branch : "";
  if (vault) {
    // In a repository, clicked: the branches, pull and push (GIT-D8).
    const id = app.git.checkout ? "status:branch" : null;
    const w = drawText(
      c,
      x,
      y,
      vault,
      id && app.mouse.hover === id
        ? roleStyle(theme, "hover", st.bg)
        : { ...roleStyle(theme, "status_dim", st.bg), bg: st.bg },
    );
    if (id) geo.hot.push({ id, x, y: band.y, w, h: band.h });
    x += w + drawText(c, x + w, y, "  ", { ...roleStyle(theme, "status_dim", st.bg), bg: st.bg });
  }
  const pathId = "status:path";
  // The path shrinks to leave room for its marker (reloaded / deleted) and the right-hand side;
  // the watch marker after it is dropped when it doesn't fit.
  const full = app.displayName(buf);
  // Short of room, the marker says it in symbols (• ⚠), so the path keeps a readable width and the
  // position on the right is never pushed out.
  const long = pathMarker(app, view);
  const marker = c.width - x - rightW - 2 - stringWidth(long) >= 16 ? long : pathMarker(app, view, true);
  // Around the path, as an address bar's: back and forward for this window, bright when there's
  // somewhere to go; hovered, where (over the frame's rule). They go only with the path.
  const g = app.glyphs;
  const navW = stringWidth(g.navBack) + stringWidth(g.navForward) + 2;
  const pathW = Math.max(4, c.width - x - rightW - 2 - stringWidth(marker) - navW);
  const arrow = (dir: "back" | "forward", glyph: string) => {
    const id = `status:${dir}`;
    const to = app.history.step(dir);
    const style =
      app.mouse.hover === id && to
        ? roleStyle(theme, "hover", st.bg)
        : to
          ? { ...st, bold: true }
          : { ...roleStyle(theme, "status_dim", st.bg), bg: st.bg };
    const w = drawText(c, x, y, glyph, style);
    geo.hot.push({ id, x, y: band.y, w, h: band.h });
    if (app.mouse.hover === id && band.y > 0) {
      const tip = truncate(
        ` ${sanitize(to ? `${dir}: ${to}` : `nowhere ${dir === "back" ? "back" : "forward"}`)} `,
        c.width - x,
      );
      drawText(c, x, band.y - 1, tip, roleStyle(theme, "overlay", null));
    }
    x += w;
  };
  arrow("back", g.navBack);
  x += drawText(c, x, y, " ", st);
  // Cut from the front: the note's own name is the part worth keeping. Clicked: the window's history.
  const pw = drawText(
    c,
    x,
    y,
    truncateStart(full, pathW),
    app.mouse.hover === pathId ? roleStyle(theme, "hover", st.bg) : { ...st, bold: true },
  );
  geo.hot.push({ id: pathId, x, y: band.y, w: pw, h: band.h });
  x += pw;
  x += drawText(c, x, y, " ", st);
  arrow("forward", g.navForward);
  const markerRole: Role = buf.deleted ? "error" : buf.conflictKept || buf.dirty ? "warn" : "info";
  if (marker) x += drawText(c, x, y, marker, roleStyle(theme, markerRole, st.bg), Math.max(0, c.width - rightW - x));
  // Whether external changes to this file will show up.
  const w = app.watcher;
  const watch = w?.degraded
    ? { text: "⚠ not watching", role: "warn" as Role }
    : w
      ? {
          text: `● watching${w.polledDirs.length ? ` (${w.polledDirs.length} polled)` : ""}`,
          role: "check_done" as Role,
        }
      : { text: "○ not watching", role: "status_dim" as Role };
  const rx = c.width - rightW;
  // The file's problems (19.8), from every source: how many of each (what they say is the Problems panel's).
  const problems = app.problems.ofView(view);
  // None here: the Problems panel's button, dim — clicked, the root's (1.7).
  if (!problems.length && rx - x - 3 - stringWidth(watch.text) > 8) {
    const id = "status:problems";
    x += drawText(c, x, y, "  ", st);
    const w = drawText(
      c,
      x,
      y,
      `${app.glyphs.problemsButton} 0`,
      app.mouse.hover === id
        ? roleStyle(theme, "hover", st.bg)
        : { ...roleStyle(theme, "status_dim", st.bg), bg: st.bg },
    );
    geo.hot.push({ id, x, y: band.y, w, h: band.h });
    x += w;
  }
  if (problems.length) {
    const text = `  ${SEVERITIES.map((sev) => [sev, problems.filter((p) => p.severity === sev).length] as const)
      .filter(([, n]) => n)
      .map(([sev, n]) => `${severityGlyph(app.glyphs, sev)} ${n}`)
      .join("  ")}`;
    const room = rx - x - 3 - stringWidth(watch.text);
    // Clicked, the Problems panel on this file's (1.7).
    const id = "status:problems";
    if (room > 8) {
      const role: Role = app.mouse.hover === id ? "hover" : SEVERITY_ROLE[worst(problems)];
      const w = drawText(c, x, y, truncate(sanitize(text), room), {
        ...roleStyle(theme, role, st.bg),
        bg: app.mouse.hover === id ? roleStyle(theme, "hover", st.bg).bg : st.bg,
      });
      geo.hot.push({ id, x: x + 2, y: band.y, w: Math.max(0, w - 2), h: band.h });
      x += w;
    }
  }
  if (x + stringWidth(watch.text) + 3 < rx)
    x += drawText(c, x, y, `  ${watch.text}`, { ...roleStyle(theme, watch.role, st.bg), bg: st.bg });
  if (rx > x) drawText(c, rx, y, right, dim);
}

/** The marker after the status line's path (its length is what the right side must leave room for);
 *  `short`: in symbols only, for a narrow screen. */
function pathMarker(app: App, view: View, short = false): string {
  const buf = view.buf;
  // A report is never saved anywhere (RPT-D1): typed in, it's no more "unsaved" than it was.
  if (app.floating?.kind === "report" && app.floating.view === view) return "";
  const changed = buf.changedAt && app.now() - buf.changedAt < CHANGE_MARKER_MS;
  if (short) return buf.deleted ? " ✖" : buf.conflictKept ? " • ⚠" : buf.dirty ? " •" : changed ? " ↻" : "";
  return buf.deleted
    ? " ✖ deleted on disk"
    : buf.conflictKept
      ? " • unsaved ⚠ differs from disk"
      : buf.dirty
        ? " • unsaved"
        : changed
          ? " ↻ reloaded"
          : "";
}

/** A question with no room to float, or a message with no top bar to sit in, over the status
 *  line (zen: the last row). */
export function drawBottomLine(app: App, c: Canvas, y: number, geo: Geometry, o: PromptOverlay | null): void {
  const theme = app.theme;
  const bg = app.ui.zen ? pageBg(theme) : roleStyle(theme, "status", pageBg(theme)).bg;
  c.fill(0, y, c.width, 1, bg);
  if (o) {
    const x =
      drawText(c, 1, y, o.confirm ? `${o.label.trim()} y / n` : o.label, { ...roleStyle(theme, "info", bg), bg }) + 1;
    const w = drawText(c, x, y, truncate(o.text, c.width - x - 2), { ...roleStyle(theme, "text", bg), bg });
    drawText(c, x + w, y, " ", roleStyle(theme, "cursor", bg));
    return;
  }
  if (!app.transient) return;
  drawMessage(app, c, 1, c.width - 1, y, bg, geo);
}

/** Narrower than this, messages go over the status line instead of floating. */
export const TOAST_MIN_W = 30;

/**
 * The messages still showing, as boxes at the top right of the content, newest first, stacked
 * down: each framed in its level's colour (error, warning, info), its glyph first, wrapped to three
 * rows at most. A click on one opens the messages list (every message is there, whole).
 */
export function drawToasts(app: App, c: Canvas, top: number, bottom: number, geo: Geometry): void {
  const theme = app.theme;
  const g = app.glyphs;
  const b = g.box;
  const bg = roleStyle(theme, "overlay", null);
  const maxW = Math.max(16, Math.min(56, Math.floor(c.width * 0.45)));
  const right = c.width - 2; // clear of the scrollbar and the rail
  // Hanging from the rule under the chrome at the top of the window under them (breadcrumb, find
  // and replace rows, whose counts and toggles sit at the right): the rule just above its text.
  const under = geo.panes.filter((p) => p.x + p.w > right - maxW && p.x < right);
  let y = Math.max(top, (under.length ? Math.min(...under.map((p) => p.y)) : top + 1) - 1);
  app.toasts.forEach((m, i) => {
    const role: Role = m.level === "error" ? "error" : m.level === "warn" ? "warn" : "info";
    // An info message that starts with its own symbol (`↻ … reloaded`) needs no second one.
    const mark =
      m.level === "error"
        ? g.msgError
        : m.level === "warn"
          ? g.msgWarn
          : /^[\p{L}\p{N}"'`(]/u.test(m.text)
            ? g.msgInfo
            : "";
    const inner = maxW - 4;
    // Wrapped at spaces where it can be, to three rows; what's past them ends in …
    const rows: string[] = [];
    let rest = (mark ? `${mark} ${m.text}` : m.text).replace(/\s+/g, " ").trim();
    while (rest && rows.length < 3) {
      let [head, tail] = splitAtWidth(rest, inner);
      const cut = tail && !tail.startsWith(" ") ? head.lastIndexOf(" ") : -1;
      if (cut > inner / 2) [head, tail] = [head.slice(0, cut), head.slice(cut) + tail];
      rows.push(head.trimEnd());
      rest = tail.trimStart();
    }
    if (rest) rows[rows.length - 1] = truncate(`${rows[rows.length - 1]} ${rest}`, inner);
    const w = Math.max(...rows.map((r) => stringWidth(r))) + 4;
    const h = rows.length + 2;
    if (y + h > bottom) return;
    const x = right - w;
    const frame = { ...roleStyle(theme, role, bg.bg), bg: bg.bg };
    const id = `toast:${i}`;
    const text =
      app.mouse.hover === id ? roleStyle(theme, "hover", bg.bg) : { ...roleStyle(theme, "overlay", null), bg: bg.bg };
    c.fill(x, y, w, h, bg.bg);
    drawText(c, x, y, `${b.tl}${b.h.repeat(w - 2)}${b.tr}`, frame);
    rows.forEach((r, k) => {
      drawText(c, x, y + 1 + k, b.v, frame, 1);
      const markW = k === 0 && mark ? drawText(c, x + 2, y + 1, mark, { ...frame, bold: true }) : 0;
      drawText(c, x + 2 + markW, y + 1 + k, markW ? r.slice(mark.length) : r, text, inner);
      drawText(c, x + w - 1, y + 1 + k, b.v, frame, 1);
    });
    drawText(c, x, y + h - 1, `${b.bl}${b.h.repeat(w - 2)}${b.br}`, frame);
    geo.hot.push({ id, x, y, w, h });
    y += h;
  });
}

/** The latest message between `x0` and `x1`, right-aligned, its level as colour and a glyph;
 *  a click opens the messages. (A screen too small for the floating boxes: the status line.) */
function drawMessage(app: App, c: Canvas, x0: number, x1: number, y: number, bg: Color | null, geo: Geometry): number {
  const m = app.transient;
  if (!m || x1 - x0 < 6) return x1;
  const theme = app.theme;
  const g = app.glyphs;
  const role: Role = m.level === "error" ? "error" : m.level === "warn" ? "warn" : "info";
  // An info message that starts with its own symbol (`↻ … reloaded`) needs no second one.
  const mark =
    m.level === "error"
      ? g.msgError
      : m.level === "warn"
        ? g.msgWarn
        : /^[\p{L}\p{N}"'`(]/u.test(m.text)
          ? g.msgInfo
          : "";
  const text = truncate(mark ? `${mark} ${m.text}` : m.text, x1 - x0);
  const w = stringWidth(text);
  const id = "status:message";
  const st = app.mouse.hover === id ? roleStyle(theme, "hover", bg) : { ...roleStyle(theme, role, bg), bg };
  drawText(c, x1 - w, y, text, st);
  geo.hot.push({ id, x: x1 - w, y, w, h: 1 });
  return x1 - w;
}
