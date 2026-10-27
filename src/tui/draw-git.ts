// Drawing the git panel (GIT-D8, GIT-D9, VV-D10): at its top the repository and its branch, against its base and its
// upstream, the message box and the buttons; its rows under them — each section's heading with its buttons, a row's
// own under the pointer and on the row selected, a branch's figures at its end, a repository's state — and at its foot
// the keys of what's selected, or of what the pointer is on.

import type { App } from "./app/runtime/app.ts";
import { type Canvas, drawText } from "./shell/terminal/canvas.ts";
import { type Geometry, type Rect, roleStyle } from "./shell/screen/draw.ts";
import type { Color, Role } from "../core/rendering/theme/theme.ts";
import { splitAtWidth, stringWidth, truncate, truncateStart } from "../core/foundation/text/width.ts";
import { sanitize } from "../core/foundation/text/sanitize.ts";
import { headOf } from "../core/workspace/git/git.ts";
import { trackText } from "../core/workspace/git/branches/gitremote.ts";
import { filterRow, followSelection } from "./shell/panels/draw-panels.ts";
import { paneScrollbar } from "./documents/views/draw-pane.ts";
import type { PanelRow } from "./gitpanel.ts";
import { GIT_MARK } from "./shell/overlays/draw-overlays.ts";
import { rowActions } from "./gitmouse.ts";
import { hotRow } from "./gitsteady.ts";

/**
 * A file's state letter's colour (26.2): git's status letters, and the explorer's marks (`GIT_MARK`) in the explorer's
 * colours; a deleted file, which the explorer never lists, red, as a diff has it.
 */
const LETTER_ROLE: Record<string, Role> = {
  M: "git_modified",
  R: "git_modified",
  C: "git_modified",
  T: "git_modified",
  A: "git_new",
  "+": "git_new",
  "?": "git_new",
  D: "diff_del",
  U: "git_conflict",
  "!": "git_conflict",
};

/** The pointer's row, from a hover's id (`git:row:3`, `git:act:3:stage`); null off the panel's rows. */
const hoveredRow = (hover: string | null): number | null => hotRow(hover)?.index ?? null;

/** Text in rows of `width` columns at most, cut where it must be (a message's lines in the box). */
function wrapped(text: string, width: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (stringWidth(rest) > width) {
    const [head, tail] = splitAtWidth(rest, width);
    if (!head) break;
    out.push(head);
    rest = tail;
  }
  out.push(rest);
  return out;
}

/** The git panel, under its title: returns the rect its rows occupy. */
export function drawGitPanel(app: App, c: Canvas, pane: Rect, bg: Color | null, geo: Geometry): Rect {
  const theme = app.theme;
  const p = app.gitPanel;
  const s = app.sidebar;
  const focused = app.region === "sidebar";
  const dim = { ...roleStyle(theme, "dim", bg), bg };
  let rect = pane;
  const top = (h: number) => {
    rect = { ...rect, y: rect.y + h, h: rect.h - h };
  };
  const co = app.git.checkout;
  // The repository and its branch, clicked: the branches (as the top bar's); its base and its upstream under it.
  if (co && rect.h >= 10) {
    const branch = app.git.branch();
    const head = `${sanitize(app.git.repoName())}${branch ? ` · ${sanitize(branch)}` : ""}`;
    const id = "git:head";
    const w = drawText(
      c,
      rect.x + 1,
      rect.y,
      truncate(head, rect.w - 2),
      app.mouse.hover === id ? roleStyle(theme, "hover", bg) : { ...roleStyle(theme, "sidebar", bg), bg, bold: true },
    );
    geo.hot.push({ id, x: rect.x + 1, y: rect.y, w, h: 1 });
    top(1);
    const line = standing(app);
    if (line && rect.h >= 12) {
      drawText(c, rect.x + 1, rect.y, truncate(line, rect.w - 2), dim);
      top(1);
    }
  }
  // The message box (GIT-D8): typed in, ctrl+enter commits — where the panel has room for its rows too.
  if (co && rect.h >= 16) top(drawBox(app, c, rect, bg, geo));
  // The buttons, as many rows as they take.
  if (co && rect.h >= 8) top(drawButtons(app, c, rect, bg, geo) + 1);
  // The filter, then the rows; the footer under them.
  rect = filterRow(app, c, rect, s, focused, bg, geo);
  const footer = rect.h >= 8;
  const list = footer ? { ...rect, h: rect.h - 2 } : rect;
  const rows = p.drawnRows();
  geo.gitRows = list;
  followSelection(s, rows.length, list.h);
  // Never on a line that only says something: the first row that's a row, when there's one.
  if (rows[s.selected]?.kind === "note") {
    const next = rows.findIndex((r) => r.kind !== "note");
    if (next >= 0) p.place(next, rows);
  }
  // The row under a resting pointer back on its line (D261); what the pointer's on, as these rows have it.
  p.steady.settle(rows, list);
  const hover = p.steady.hotNow(app.mouse.hover, rows);
  geo.gitHover = hover;
  const hovered = hoveredRow(hover);
  for (let i = 0; i < list.h; i++) {
    const idx = s.scroll + i;
    const row = rows[idx];
    if (!row) break;
    drawRow(app, c, row, idx, { x: list.x, y: list.y + i, w: list.w - 1 }, bg, geo, {
      selected: idx === s.selected && focused,
      hovered: idx === hovered,
      hover,
    });
  }
  // Scrolled past the list's end (a resting pointer's row kept on its line, D261): the blank there counts.
  paneScrollbar(app, c, list, Math.max(rows.length, s.scroll + list.h), s.scroll, "sidebar", focused, bg, geo);
  if (footer) drawFooter(app, c, { x: rect.x, y: rect.y + rect.h - 2, w: rect.w, h: 2 }, rows[s.selected], bg, geo);
  p.steady.done(rows, list);
  return list;
}

/** Where the branch stands: ahead of its base, and against its upstream — or that it has none (`not pushed`). */
function standing(app: App): string {
  const co = app.git.checkout!;
  const branch = headOf(co).branch;
  if (!branch) return "HEAD detached";
  const g = app.glyphs;
  const parts: string[] = [];
  const a = app.gitPanel.standing();
  if (a) parts.push(`${g.gitAhead}${a.ahead}${a.behind ? ` ${g.gitBehind}${a.behind}` : ""} on ${sanitize(a.base)}`);
  const t = app.git.track;
  if (t?.branch === branch) {
    if (!t.upstream) parts.push("not pushed");
    else if (t.gone) parts.push(`${sanitize(t.upstream)} is gone`);
    else {
      const track = trackText(t, g.gitAhead, g.gitBehind);
      parts.push(track ? `${track} ${sanitize(t.upstream)}` : `in step with ${sanitize(t.upstream)}`);
    }
  }
  return parts.join(" · ");
}

/** The message box: its frame titled "Message", the text wrapped (its last rows shown), the cursor while typed in. */
function drawBox(app: App, c: Canvas, r: Rect, bg: Color | null, geo: Geometry): number {
  const theme = app.theme;
  const p = app.gitPanel;
  const b = app.glyphs.box;
  const w = r.w - 2;
  if (w < 12) return 0;
  const x = r.x + 1;
  const inner = w - 4;
  const lines = p.message ? p.message.split("\n").flatMap((l) => wrapped(sanitize(l), inner)) : [];
  const last = lines.at(-1) ?? "";
  // While typed in, a full last row leaves the cursor a row of its own.
  if (p.typing && stringWidth(last) >= inner) lines.push("");
  const shown = Math.max(1, Math.min(3, lines.length));
  const rows = lines.slice(-shown);
  const border = { ...roleStyle(theme, p.typing ? "pane_title_active" : "border", bg), bg };
  drawText(c, x, r.y, `${b.tl}${b.h}`, border);
  const tw = drawText(c, x + 2, r.y, " Message ", border);
  drawText(c, x + 2 + tw, r.y, `${b.h.repeat(Math.max(0, w - 3 - tw))}${b.tr}`, border);
  const text = { ...roleStyle(theme, "text", bg), bg };
  for (let i = 0; i < shown; i++) {
    const y = r.y + 1 + i;
    drawText(c, x, y, b.v, border);
    drawText(c, x + w - 1, y, b.v, border);
    if (!lines.length && !p.typing) {
      drawText(c, x + 2, y, truncate("ctrl+enter commits", inner), {
        ...roleStyle(theme, "dim", bg),
        bg,
        italic: true,
      });
      continue;
    }
    const tx = x + 2 + drawText(c, x + 2, y, rows[i] ?? "", text, inner);
    if (p.typing && i === shown - 1) drawText(c, tx, y, " ", roleStyle(theme, "cursor", bg));
  }
  drawText(c, x, r.y + 1 + shown, `${b.bl}${b.h.repeat(Math.max(0, w - 2))}${b.br}`, border);
  geo.hot.push({ id: "git:box", x, y: r.y, w, h: shown + 2 });
  return shown + 2;
}

/** The buttons (GIT-D8), flowing over as many rows as they take; the one under the pointer says its key in the footer. */
function drawButtons(app: App, c: Canvas, r: Rect, bg: Color | null, geo: Geometry): number {
  const theme = app.theme;
  let x = r.x + 1;
  let y = r.y;
  for (const btn of app.gitPanel.buttons()) {
    const text = `[${btn.label}]`;
    const w = stringWidth(text);
    if (x > r.x + 1 && x + w > r.x + r.w - 1) {
      x = r.x + 1;
      y++;
    }
    if (y >= r.y + r.h) break;
    const id = `git:btn:${btn.id}`;
    const st =
      app.mouse.hover === id ? roleStyle(theme, "hover", bg) : { ...roleStyle(theme, "topbar_button", bg), bg };
    const drawn = drawText(c, x, y, text, st, r.x + r.w - 1 - x);
    geo.hot.push({ id, x, y, w: drawn, h: 1 });
    x += w + 1;
  }
  return y - r.y + 1;
}

/** One row: its text in its kind's way, its buttons at its end (a heading's always; a row's on the pointer). */
function drawRow(
  app: App,
  c: Canvas,
  row: PanelRow,
  idx: number,
  r: { x: number; y: number; w: number },
  bg: Color | null,
  geo: Geometry,
  how: { selected: boolean; hovered: boolean; hover: string | null },
): void {
  const theme = app.theme;
  const g = app.glyphs;
  const st = roleStyle(theme, how.selected ? "sidebar_selected" : "sidebar", bg);
  const rowBg = how.selected ? st.bg : bg;
  if (how.selected) c.fill(r.x, r.y, r.w, 1, st.bg);
  const dim = { ...roleStyle(theme, "dim", rowBg), bg: rowBg };
  const button = (id: string) =>
    how.hover === id ? roleStyle(theme, "hover", rowBg) : { ...roleStyle(theme, "topbar_button", rowBg), bg: rowBg };
  // Its buttons first, at its end, so the text stops short of them (and they're found first under the pointer).
  const acts = row.kind === "heading" || how.hovered || how.selected ? rowActions(app, row) : [];
  let end = r.x + r.w;
  for (const a of [...acts].reverse()) {
    const id = `git:act:${idx}:${a.action}`;
    const text = ` ${a.glyph} `;
    const w = stringWidth(text);
    if (end - w < r.x + 10) break;
    end -= w;
    drawText(c, end, r.y, text, button(id));
    geo.hot.push({ id, x: end, y: r.y, w, h: 1 });
  }
  let x = r.x + 1;
  const put = (text: string, style: ReturnType<typeof roleStyle>) => {
    if (x >= end) return;
    x += drawText(c, x, r.y, truncate(text, end - x), style, end - x);
  };
  /**
   * What a row says at its end, right-aligned before its buttons: a branch's figures, a repository's state — the first
   * of `choices` that leaves its name `least` columns (a shorter way of saying it after a longer).
   */
  const tail = (choices: { text: string; role: Role }[][], least = 16) => {
    const width = (parts: { text: string }[]) => parts.reduce((n, p, i) => n + (i ? 1 : 0) + stringWidth(p.text), 0);
    const parts = choices.find((ps) => end - width(ps) - 1 >= x + least) ?? [];
    const w = width(parts);
    if (!w) return;
    let tx = end - w - 1;
    end = tx - 1;
    parts.forEach((p, i) => {
      if (i) tx += 1;
      tx += drawText(c, tx, r.y, p.text, { ...roleStyle(theme, p.role, rowBg), bg: rowBg });
    });
  };
  const letter = (l: string) =>
    put(l, { ...roleStyle(theme, LETTER_ROLE[l] ?? "git_modified", rowBg), bg: rowBg, bold: true });
  const body = (): void => {
    switch (row.kind) {
      case "note":
        return put(row.text, dim);
      case "heading": {
        const folded = app.gitPanel.folded.has(row.section) && !app.gitPanel.filter();
        if (row.section === "older") x += 2;
        return put(`${folded ? g.foldClosed : g.foldOpen} ${row.label}`, { ...dim, bold: true });
      }
      case "file":
      case "change":
        x += 2;
        if (row.kind === "file") {
          letter(row.label.slice(0, 1));
          put(row.label.slice(1), st);
        } else {
          const role: Role =
            row.change.kind === "add" ? "git_new" : row.change.kind === "delete" ? "diff_del" : "git_modified";
          put(row.label, { ...roleStyle(theme, role, rowBg), bg: rowBg });
        }
        if (row.hint) {
          x += 1;
          put(row.hint, dim);
        }
        return;
      case "ahead":
        x += 2;
        letter(GIT_MARK[row.file.state]);
        x += 1;
        return put(sanitize(row.rel ?? row.file.path), st);
      case "thisfile":
        x += 2;
        return put(row.label, st);
      case "branch": {
        const b = row.branch;
        const stats = app.gitPanel.branches.statsOf(b);
        // Its figures (GIT-D9): ahead of its base (and behind), on which; a worktree's uncommitted files; something to
        // review — a worktree's work, not merged — or merged. Short of room: the base's name goes, then the behind.
        const marks: { text: string; role: Role }[] = [];
        if (b.worktree?.gone) marks.push({ text: "folder gone", role: "warn" });
        if (stats?.dirty) marks.push({ text: `${g.git.edited}${stats.dirty}`, role: "git_modified" });
        if (stats?.base && b.worktree && !b.here && (stats.dirty || (stats.ahead && !stats.merged)))
          marks.push({ text: g.git.review, role: "warn" });
        if (stats?.base && stats.merged && !b.here) marks.push({ text: g.git.merged, role: "git_new" });
        if (b.here) marks.push({ text: "here", role: "dim" });
        const ahead = stats?.base && (stats.ahead || !stats.merged) ? `${g.gitAhead}${stats.ahead}` : "";
        const behind = ahead && stats!.behind ? ` ${g.gitBehind}${stats!.behind}` : "";
        const on = (text: string): { text: string; role: Role }[] => (text ? [{ text, role: "dim" }] : []);
        // Its name kept whole where it can be: the figures shortened first.
        tail(
          [
            [...on(ahead && `${ahead}${behind} on ${sanitize(stats!.base!)}`), ...marks],
            [...on(ahead && `${ahead} on ${sanitize(stats!.base!)}`), ...marks],
            [...on(`${ahead}${behind}`), ...marks],
            [...on(ahead), ...marks],
            marks,
          ],
          Math.min(28, stringWidth(sanitize(b.name)) + 6),
        );
        x += 2;
        if (row.open) put(`${g.foldOpen} `, dim);
        const mark = b.here ? g.git.here : b.worktree ? g.git.worktree : " ";
        put(`${mark} `, { ...roleStyle(theme, b.here ? "sidebar_active" : "sidebar_root", rowBg), bg: rowBg });
        return put(sanitize(b.name), b.here ? { ...st, bold: true } : st);
      }
      case "bline":
        x += 6;
        return put(row.text, row.gone ? { ...roleStyle(theme, "warn", rowBg), bg: rowBg } : dim);
      case "bsub":
        x += 6;
        return put(row.label, { ...dim, bold: true });
      case "bbuttons": {
        x += 6;
        for (const b of row.buttons) {
          const id = `git:bb:${idx}:${b.action}`;
          const text = `[${b.label}]`;
          if (x + stringWidth(text) > end) break;
          const w = drawText(c, x, r.y, text, button(id));
          geo.hot.push({ id, x, y: r.y, w, h: 1 });
          x += w + 1;
        }
        return;
      }
      case "bfile":
        x += 8;
        letter(row.letter);
        x += 1;
        return put(sanitize(row.path), st);
      case "repo": {
        const sum = app.gitPanel.repos.summary(row.repo);
        tail([
          sum
            ? [
                { text: sum.text, role: sum.text === "clean" ? ("dim" as Role) : ("git_modified" as Role) },
                ...(sum.review ? [{ text: g.git.review, role: "warn" as Role }] : []),
              ]
            : [{ text: "asking git…", role: "dim" }],
        ]);
        put(`${row.open ? g.foldOpen : g.foldClosed} `, dim);
        return put(sanitize(row.repo.name), { ...st, bold: true });
      }
      case "rcheckout": {
        const l = app.gitPanel.repos.checkoutLabel(row.repo, row.checkout);
        const known = app.gitPanel.repos.known(row.checkout);
        if (known?.entries.length) tail([[{ text: `${g.git.edited}${known.entries.length}`, role: "git_modified" }]]);
        x += 4;
        put(`${l.mark} `, { ...roleStyle(theme, "sidebar_root", rowBg), bg: rowBg });
        put(l.branch, st);
        x += 1;
        return put(truncateStart(l.where, Math.max(4, end - x)), dim);
      }
      case "rfile": {
        x += 6;
        const e = row.entry;
        letter(e.x === "?" ? "?" : e.x !== " " ? e.x : e.y);
        x += 1;
        return put(sanitize(e.path), st);
      }
    }
  };
  body();
  // The row itself, under its buttons: found after them under the pointer.
  geo.hot.push({ id: `git:row:${idx}`, x: r.x, y: r.y, w: r.w, h: 1 });
}

/** The footer: a rule, then what the pointer is on (a button, a row's own) with its key, else the selected row's keys. */
function drawFooter(app: App, c: Canvas, r: Rect, row: PanelRow | undefined, bg: Color | null, geo: Geometry): void {
  const theme = app.theme;
  drawText(c, r.x, r.y, app.glyphs.hbar.repeat(r.w), { ...roleStyle(theme, "border", bg), bg }, r.w);
  geo.rules.push({ y: r.y, x0: r.x, x1: r.x + r.w });
  const keySt = { ...roleStyle(theme, "sidebar_dir", bg), bg, bold: true };
  const dim = { ...roleStyle(theme, "dim", bg), bg };
  let x = r.x + 1;
  const end = r.x + r.w - 1;
  const p = app.gitPanel;
  const pointed = p.typing
    ? { key: "ctrl+enter", desc: "commits · enter: the editor · esc: done" }
    : p.pointedAt(geo.gitHover ?? null);
  const pairs: [string, string][] = pointed ? [[pointed.key ?? "", pointed.desc]] : p.footer(row);
  for (const [key, what] of pairs) {
    const need = (key ? stringWidth(key) + 1 : 0) + stringWidth(what);
    if (x > r.x + 1 && x + need > end) break;
    if (key) x += drawText(c, x, r.y + 1, `${key} `, keySt, Math.max(0, end - x));
    x += drawText(c, x, r.y + 1, truncate(what, Math.max(0, end - x)), dim, Math.max(0, end - x)) + 2;
  }
}
