// Drawing what floats over the windows: the floating window, dialogs — a question's, and one of choices and
// checkboxes — menus and dropdowns, lists with their footers and keycaps, the which-key popup, and the save-as browser.

import type { App, PromptOverlay, ListOverlay, ListItem } from "./app.ts";
import { type Canvas, drawText } from "./canvas.ts";
import { type SaveAsOverlay, type SaveAsGeometry, placeOf, sizeText, dateText } from "./saveas.ts";
import { type DialogGeometry, type DialogOverlay, cursorHelp, dimmed } from "./dialog.ts";
import { type Geometry, type Rect, roleStyle, keyText, coverHot } from "./draw.ts";
import { truncate, stringWidth, truncateStart, graphemes, graphemeWidth } from "../core/width.ts";
import { smallButton } from "./draw-panels.ts";
import { peekTitle } from "./peek.ts";
import { drawPane } from "./draw-pane.ts";
import { sanitize, sanitizeMap } from "../core/sanitize.ts";
import type { GitState } from "../core/gitops.ts";
import type { Color } from "../core/theme/theme.ts";

/**
 * The Save As window (10.14), framed like the lists, near the top of the content: its title, the folder it's in; places
 * down the left, the folder's folders and files on the right (a file's size and date, dim); the name at the bottom, its
 * buttons beside it; how its keys go on the bottom border. What has the focus has its selection lit; the rest, marked.
 */
export function drawSaveAs(
  app: App,
  c: Canvas,
  o: SaveAsOverlay,
  mainY: number,
  mainH: number,
  geo: Geometry,
): SaveAsGeometry {
  const theme = app.theme;
  const W = c.width;
  const w = Math.max(30, Math.min(110, W - 8));
  const h = Math.max(9, Math.min(mainH - 1, 28));
  const x = Math.floor((W - w) / 2);
  const y = mainY + Math.max(0, Math.min(1, mainH - h));
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  const lit = roleStyle(theme, "overlay_selected", null);
  const g = app.glyphs;
  const b = g.box;
  c.fill(x - 2, y - 1, w + 4, h + 2, bg.bg);
  // The frame: the title on top; under the folder's row, and above the name's, rules meeting the side borders.
  const pw = Math.min(26, Math.max(12, Math.floor(w / 4)));
  const split = x + 1 + pw;
  drawText(c, x, y, `${b.tl}${b.h}`, border);
  const tw = drawText(c, x + 2, y, truncate(` ${o.title} `, w - 6), { ...border, bold: true });
  drawText(c, x + 2 + tw, y, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  const rule = (ry: number, joint: string) =>
    drawText(
      c,
      x,
      ry,
      `${b.ml}${b.h.repeat(split - x - 1)}${joint}${b.h.repeat(Math.max(0, x + w - 2 - split))}${b.mr}`,
      border,
    );
  rule(y + 2, b.tm);
  rule(y + h - 3, b.bm);
  const top = y + 3;
  const rows = h - 6;
  for (let k = 0; k < rows; k++) drawText(c, split, top + k, b.v, border, 1);
  // The folder, its end kept in view.
  const path = app.exporter.shownDir(o.dir);
  drawText(
    c,
    x + 2,
    y + 1,
    stringWidth(path) > w - 4 ? truncateStart(path, w - 4) : path,
    { ...bg, bold: true },
    w - 4,
  );
  // The places.
  if (o.place < o.placeScroll) o.placeScroll = o.place;
  if (o.place >= o.placeScroll + rows) o.placeScroll = o.place - rows + 1;
  const holding = placeOf(o.places, o.dir);
  for (let k = 0; k < rows; k++) {
    const i = o.placeScroll + k;
    const p = o.places[i];
    if (!p) break;
    const here = i === holding;
    const selected = i === o.place && o.focus === "places";
    const st = selected ? lit : here ? { ...bg, bold: true } : bg;
    c.fill(x + 1, top + k, pw, 1, st.bg);
    drawText(c, x + 1, top + k, here ? "•" : " ", here && !selected ? border : st, 1);
    drawText(c, x + 2, top + k, truncate(p.label, pw - 2), st, pw - 2);
  }
  // The folder's entries: folders, then files with their size and date.
  const fx = split + 1;
  const fw = x + w - 1 - fx;
  if (o.selected < o.scroll) o.scroll = o.selected;
  if (o.selected >= o.scroll + rows) o.scroll = o.selected - rows + 1;
  const now = app.now();
  for (let k = 0; k < rows; k++) {
    const i = o.scroll + k;
    const e = o.entries[i];
    if (!e) break;
    const selected = i === o.selected;
    const st = selected && o.focus === "files" ? lit : selected ? { ...bg, bold: true } : bg;
    c.fill(fx, top + k, fw, 1, st.bg);
    const meta = e.dir ? "" : `${sizeText(e.size).padStart(7)}  ${dateText(e.mtime, now)}`;
    const metaW = meta && fw > 40 ? stringWidth(meta) + 2 : 0;
    const icon = e.up ? "  " : e.dir ? `${g.dirClosed} ` : "  ";
    const label = `${selected && o.focus !== "files" ? "›" : " "}${icon}${e.up ? e.name : e.dir ? `${e.name}/` : e.name}`;
    drawText(
      c,
      fx,
      top + k,
      truncate(label, fw - metaW - 1),
      e.dir || selected ? st : { ...dim, bg: st.bg },
      fw - metaW - 1,
    );
    if (metaW) drawText(c, fx + fw - metaW + 1, top + k, meta, { ...dim, bg: st.bg }, metaW - 1);
  }
  const shownEntries = o.entries.filter((e) => !e.up).length;
  if (o.error)
    drawText(
      c,
      fx + 1,
      top + (o.entries.length ? o.entries.length - o.scroll : 0),
      truncate(o.error, fw - 2),
      roleStyle(theme, "warn", bg.bg),
      fw - 2,
    );
  else if (!shownEntries && rows > 1)
    drawText(c, fx + 3, top + o.entries.length - o.scroll, "an empty folder", dim, fw - 4);
  // The name, or a new folder's, and the buttons.
  const ny = y + h - 2;
  const label = o.creating !== null ? "New folder: " : "Name: ";
  const text = o.creating ?? o.name;
  const buttons: [string, string][] =
    o.creating !== null
      ? []
      : [
          [" Export  enter ", "sav:ok"],
          [" Cancel  esc ", "sav:cancel"],
        ];
  const bw = buttons.reduce((n, [t]) => n + stringWidth(t) + 1, 0);
  const lw = drawText(c, x + 2, ny, label, o.focus === "name" || o.creating !== null ? { ...border, bold: true } : dim);
  const room = Math.max(4, w - 4 - lw - bw - 2);
  const tw2 = drawText(c, x + 2 + lw, ny, stringWidth(text) > room ? truncateStart(text, room) : text, bg, room);
  if (o.focus === "name" || o.creating !== null)
    drawText(c, x + 2 + lw + tw2, ny, " ", roleStyle(theme, "cursor", null));
  let bx = x + w - 2 - bw + 1;
  for (const [t, id] of buttons) bx += smallButton(app, c, bx, ny, t, id, geo, bg.bg) + 1;
  // How the keys go, on the bottom border.
  const keys =
    o.creating !== null
      ? " enter makes it · esc doesn't "
      : " tab: places · folder · name   ←: up   ctrl+n: new folder   ~: home ";
  const bottom = `${b.bl}${b.h}`;
  drawText(c, x, y + h - 1, bottom, border);
  const kw = drawText(c, x + 2, y + h - 1, truncate(keys, w - 4), dim, w - 4);
  drawText(c, x + 2 + kw, y + h - 1, b.h.repeat(Math.max(0, w - 3 - kw)) + b.br, border);
  return {
    box: { x: x - 2, y: y - 1, w: w + 4, h: h + 2 },
    places: { x: x + 1, y: top, w: pw, h: rows },
    files: { x: fx, y: top, w: fw, h: rows },
    name: { x: x + 1, y: ny, w: w - 2, h: 1 },
  };
}

/**
 * The floating editor (3.20): a framed window over the others, centred near the top of the content,
 * as tall as its text (at most the content's height); its title says what it edits, its bottom
 * border how it closes. Inside, a window like any, in source mode. The scratch's (#43) is a fixed three quarters of
 * the screen, in the middle of it: room to type in, its size not jumping as entries come; rendered, as a note is.
 */
export function drawFloating(app: App, c: Canvas, mainY: number, mainH: number, geo: Geometry): Rect {
  const f = app.floating!;
  const theme = app.theme;
  const W = c.width;
  const scratch = f.kind === "scratch";
  // A peek (VV-D7): most of the screen, in the middle of it; `z`, all of it, its margin too.
  const peek = f.kind === "peek" ? f.peek : null;
  const full = !!peek?.full;
  // A diff (GIT-D2), a review's and the merge screen's too, as wide as there's room for: its lines are a file's, not
  // text to read at a measure. The merge screen as tall as a peek: its card and result change as it's settled.
  const wide = f.kind === "diff" || f.kind === "review" || f.kind === "merge";
  const w = full
    ? W
    : peek
      ? Math.max(24, W - 4 - Math.max(4, Math.floor(W / 8)))
      : Math.max(24, wide ? W - 8 : Math.min(100, scratch ? Math.floor((W * 3) / 4) : W - 8));
  // A diff (a review's too) is as tall as its rows, not its text's lines: a block's frame, a paragraph laid out again
  // (GIT-D2). Laid out at its pane's width less the scrollbar's column, as the pane will lay it out.
  const drawn = f.kind === "diff" || f.kind === "review" ? f.view.buf.drawn : undefined;
  const lines = drawn
    ? drawn(Math.max(10, w - 3), { glyphs: app.glyphs, wrap: app.ui.wrap, codeScroll: app.code.scrolls() }).lines.length
    : f.view.buf.lineStarts().length;
  const h = full
    ? Math.max(4, mainH)
    : peek || f.kind === "merge"
      ? Math.max(6, mainH - 2 - Math.max(1, Math.floor(mainH / 10)))
      : scratch
        ? Math.max(6, Math.min(mainH - 1, Math.floor((mainH * 3) / 4)))
        : Math.max(6, Math.min(mainH - 1, lines + 5));
  const x = Math.floor((W - w) / 2);
  const y = mainY + (full ? 0 : scratch || peek ? Math.floor((mainH - h) / 2) : Math.max(0, Math.min(1, mainH - h)));
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  const b = app.glyphs.box;
  c.fill(full ? x : x - 2, full ? y : y - 1, full ? w : w + 4, full ? h : h + 2, bg.bg);
  drawText(c, x, y, `${b.tl}${b.h}`, border);
  // A peek's: its path cut from the front, where it is and the file's name kept (VV-D7).
  const title = f.kind === "peek" ? peekTitle(f.peek, f.view.buf.elsewhere?.rel ?? null, w - 8) : f.title;
  const tw = drawText(c, x + 2, y, truncate(` ${title} `, w - 6), { ...border, bold: true });
  drawText(c, x + 2 + tw, y, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  // A note's diff: tab switches between its blocks and its lines (GIT-D2).
  const tab = f.kind === "diff" && f.diff.blocks ? `tab: its ${f.diff.blocks.on ? "lines" : "blocks"} · ` : "";
  const hint =
    f.kind === "hover"
      ? " esc · q closes "
      : f.kind === "diff"
        ? ` ${tab}${f.diff.go ? "enter goes to the line · " : ""}esc · q ${f.diff.back ? "goes back" : "closes"} `
        : f.kind === "commit"
          ? ` ctrl+s ${f.amend ? "amends" : "commits"} · esc · q leaves it `
          : f.kind === "report"
            ? " ctrl+s sends it or adds the screen · esc · q leaves it "
            : f.kind === "scratch"
              ? " esc · q closes, saved "
              : f.kind === "peek"
                ? ` o go there · t keep as a tab · z ${f.peek.full ? "smaller" : "fill"}${f.peek.back.length ? " · ctrl+o back" : ""} · esc closes `
                : f.kind === "review"
                  ? " esc ends the review "
                  : f.kind === "merge"
                    ? ` esc ${f.merge.prompt ? "goes back to the question" : "closes, what's settled kept"} `
                    : ` esc · q closes, writing back · ctrl+s writes `;
  const bottom = `${b.bl}${b.h.repeat(Math.max(0, w - 2 - stringWidth(hint)))}`;
  drawText(c, x, y + h - 1, bottom, border);
  drawText(c, x + stringWidth(bottom), y + h - 1, truncate(hint, w - stringWidth(bottom) - 1) + b.br, dim);
  drawPane(app, c, f.view, { x: x + 1, y: y + 1, w: w - 2, h: h - 2 }, true, false, true, false, geo);
  return full ? { x, y, w, h } : { x: x - 2, y: y - 1, w: w + 4, h: h + 2 };
}

/** Narrower than this, a question goes over the status line instead of floating. */
export const DIALOG_MIN_W = 30;

export function dialogWidth(W: number): number {
  return Math.max(24, Math.min(64, W - 8));
}

/** The question's lines, wrapped to the window (at most six). */
function dialogLines(o: PromptOverlay, w: number): string[] {
  return wrapWords(sanitize(o.label.trim()), w - 4).slice(0, 6);
}

/** Its rows: the frame, the question, the answer's row (not a yes-or-no's), a blank, the buttons. */
export function dialogHeight(o: PromptOverlay, w: number): number {
  return 2 + dialogLines(o, w).length + (o.confirm ? 0 : 1) + 2;
}

/**
 * A question in a floating window near the top of the content, framed like the lists: the
 * question, the answer typed on its own row (`›`, its end kept in view), and its buttons at the
 * bottom right — OK and Cancel (enter, esc), or Yes and No (y, n) — each clickable.
 */
export function drawDialog(app: App, c: Canvas, o: PromptOverlay, mainY: number, mainH: number, geo: Geometry): Rect {
  const theme = app.theme;
  const W = c.width;
  const w = dialogWidth(W);
  const lines = dialogLines(o, w);
  const h = dialogHeight(o, w);
  const x = Math.floor((W - w) / 2);
  const y = mainY + Math.max(0, Math.min(2, mainH - h));
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const b = app.glyphs.box;
  // A margin in the window's own colour, as the lists have: a row above and below, two columns.
  c.fill(x - 2, y - 1, w + 4, h + 2, bg.bg);
  drawText(c, x, y, `${b.tl}${b.h.repeat(w - 2)}${b.tr}`, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  drawText(c, x, y + h - 1, `${b.bl}${b.h.repeat(w - 2)}${b.br}`, border);
  lines.forEach((line, i) => drawText(c, x + 2, y + 1 + i, line, { ...bg, bold: true }, w - 4));
  let row = y + 1 + lines.length;
  if (!o.confirm) {
    const px = drawText(c, x + 2, row, "› ", border);
    const room = w - 4 - px - 1;
    const tw = drawText(c, x + 2 + px, row, stringWidth(o.text) > room ? truncateStart(o.text, room) : o.text, bg);
    drawText(c, x + 2 + px + tw, row, " ", roleStyle(theme, "cursor", null));
    row++;
  }
  row++;
  const buttons: [string, string][] = o.confirm
    ? [
        [" Yes  y ", "dlg:ok"],
        [" No  n ", "dlg:cancel"],
      ]
    : [
        [" OK  enter ", "dlg:ok"],
        [" Cancel  esc ", "dlg:cancel"],
      ];
  let bx = x + w - 2 - buttons.reduce((n, [t]) => n + stringWidth(t), 0) - (buttons.length - 1);
  for (const [text, id] of buttons) bx += smallButton(app, c, bx, row, text, id, geo, bg.bg) + 1;
  return { x: x - 2, y: y - 1, w: w + 4, h: h + 2 };
}

/** The help under a dialog's rule: as many rows as the longest row's help needs (at most three), so the window
 *  doesn't change its height as the cursor moves. */
function choiceHelpRows(o: DialogOverlay, w: number): number {
  const helps = [...o.choices.map((ch) => ch.help), ...o.checkboxes.map((b) => b.help)];
  return Math.min(3, Math.max(0, ...helps.map((h) => wrapWords(sanitize(h), w - 4).length)));
}

/**
 * A dialog of choices (UPG): framed like a question's window, its title in its top border; its text, wrapped; its
 * choices, one a row, the marked one `●` (`(*)` in ASCII's glyphs) and the others `○`; its checkboxes, `☑` or `☐` as
 * a task's, one the marked choice doesn't take dimmed; under a rule, what the row under the cursor does; its keys in
 * its bottom border. The row under the cursor is lit.
 */
export function drawChoiceDialog(app: App, c: Canvas, o: DialogOverlay, mainY: number, mainH: number): DialogGeometry {
  const theme = app.theme;
  const W = c.width;
  const w = dialogWidth(W);
  const text = wrapWords(sanitize(o.text.trim()), w - 4).slice(0, 6);
  const helpRows = choiceHelpRows(o, w);
  const boxes = o.checkboxes.length;
  const h = 2 + text.length + 1 + o.choices.length + (boxes ? 1 + boxes : 0) + (helpRows ? 1 + helpRows : 0);
  const x = Math.floor((W - w) / 2);
  const y = mainY + Math.max(0, Math.min(2, mainH - h));
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  const lit = roleStyle(theme, "overlay_selected", null);
  const g = app.glyphs;
  const b = g.box;
  c.fill(x - 2, y - 1, w + 4, h + 2, bg.bg);
  drawText(c, x, y, `${b.tl}${b.h}`, border);
  const tw = drawText(c, x + 2, y, truncate(` ${sanitize(o.title)} `, w - 6), { ...border, bold: true });
  drawText(c, x + 2 + tw, y, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  text.forEach((line, i) => drawText(c, x + 2, y + 1 + i, line, { ...bg, bold: true }, w - 4));
  const rows: DialogGeometry["rows"] = [];
  const row = (ry: number, n: number, mark: string, label: string, st: typeof bg) => {
    const selected = n === o.cursor;
    const style = selected ? lit : st;
    c.fill(x + 1, ry, w - 2, 1, style.bg);
    drawText(c, x + 2, ry, truncate(`${mark} ${sanitize(label)}`, w - 4), style, w - 4);
    rows.push({ y: ry, x: x + 1, w: w - 2, row: n });
  };
  let ry = y + 1 + text.length + 1;
  o.choices.forEach((ch, i) => {
    row(ry++, i, i === o.chosen ? g.choiceOn : g.choiceOff, ch.label, i === o.chosen ? { ...bg, bold: true } : bg);
  });
  if (boxes) ry++;
  o.checkboxes.forEach((box, i) => {
    row(ry++, o.choices.length + i, box.ticked ? g.checkDone : g.checkTodo, box.label, dimmed(o, box) ? dim : bg);
  });
  if (helpRows) {
    drawText(c, x, ry, `${b.ml}${b.h.repeat(w - 2)}${b.mr}`, border);
    wrapWords(sanitize(cursorHelp(o)), w - 4)
      .slice(0, helpRows)
      .forEach((line, i) => drawText(c, x + 2, ry + 1 + i, line, dim, w - 4));
  }
  const keys = ` enter: do it${boxes ? " · space: tick" : ""} · esc: ${o.escape} `;
  drawText(c, x, y + h - 1, `${b.bl}${b.h}`, border);
  const kw = drawText(c, x + 2, y + h - 1, truncate(keys, w - 4), dim, w - 4);
  drawText(c, x + 2 + kw, y + h - 1, b.h.repeat(Math.max(0, w - 3 - kw)) + b.br, border);
  return { box: { x: x - 2, y: y - 1, w: w + 4, h: h + 2 }, rows };
}

/**
 * A menu hanging from `anchor` (the explorer row's `…`): framed, its title the row's name, as wide
 * as its entries — each a label and, dim at the right, its key — from the anchor's column (moved
 * left to fit), under its row, or over it when there's no room below.
 */
export function drawMenu(
  app: App,
  c: Canvas,
  o: ListOverlay,
  anchor: { x: number; y: number },
  mainY: number,
  maxY: number,
): Rect & { listY: number; rows: number } {
  const theme = app.theme;
  const W = c.width;
  const hintW = (item: ListItem) => (item.hint ? stringWidth(item.hint) + 2 : 0);
  const content = Math.max(stringWidth(o.title) + 4, ...o.items.map((item) => stringWidth(item.label) + hintW(item)));
  const w = Math.min(content + 4, W);
  const h = Math.min(o.filtered.length + 2, Math.max(3, maxY - mainY));
  const x = Math.max(0, Math.min(anchor.x, W - w));
  let y = anchor.y + 1;
  if (y + h > maxY) y = Math.max(mainY, anchor.y - h);
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  const b = app.glyphs.box;
  c.fill(x, y, w, h, bg.bg);
  drawText(c, x, y, `${b.tl}${b.h}`, border);
  const tw = drawText(c, x + 2, y, truncate(` ${sanitize(o.title)} `, w - 4), { ...border, bold: true });
  drawText(c, x + 2 + tw, y, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  drawText(c, x, y + h - 1, `${b.bl}${b.h.repeat(w - 2)}${b.br}`, border);
  const rows = h - 2;
  if (o.selected < o.scroll) o.scroll = o.selected;
  if (o.selected >= o.scroll + rows) o.scroll = o.selected - rows + 1;
  for (let i = 0; i < rows; i++) {
    const idx = o.scroll + i;
    const entry = o.filtered[idx];
    if (!entry) break;
    const item = entry.item;
    const st = idx === o.selected ? roleStyle(theme, "overlay_selected", null) : bg;
    c.fill(x + 1, y + 1 + i, w - 2, 1, st.bg);
    const hw = hintW(item);
    drawText(c, x + 2, y + 1 + i, truncate(sanitize(item.label), Math.max(1, w - 4 - hw)), st);
    if (item.hint) drawText(c, x + w - 2 - stringWidth(item.hint), y + 1 + i, item.hint, { ...dim, bg: st.bg });
  }
  return { x, y, w, h, listY: y + 1, rows };
}

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
  const layoutFor = (n: number) => {
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
    const total = widths.reduce((a, w) => a + w.key + 1 + w.text, 0) + (widths.length - 1) * GAP + 4;
    return { perCol, widths, total };
  };
  let plan = layoutFor(1);
  for (const n of [3, 2]) {
    const p = layoutFor(n);
    if (p.total <= maxW) {
      plan = p;
      break;
    }
  }
  const rows = plan.perCol;
  const room = bottom - top - 2; // the margin above and below
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

export function drawList(
  app: App,
  c: Canvas,
  o: ListOverlay,
  mainY: number,
  mainH: number,
): Rect & { listY: number; rows: number } {
  const theme = app.theme;
  const W = c.width;
  const w = Math.min(100, W - (W > 60 ? 8 : 0));
  // Rows besides the list: the borders, the input, and the footer (a rule, the entry's name, two
  // rows of explanation, its other keys).
  // The footer only when the list keeps at least four rows beside it.
  const footer = !!o.footer && Math.min(mainH - 2, 30) - ((o.filterable ? 3 : 2) + FOOTER_ROWS + 2) >= 4;
  const inner = (o.filterable ? 3 : 2) + (footer ? FOOTER_ROWS + 1 : 0);
  // Never taller than the content area: on a short screen the status line and the rule stay.
  const h = Math.min(mainH, Math.max(inner + 1, Math.min(o.filtered.length + inner + 1, mainH - 2, 30)));
  const x = Math.floor((W - w) / 2);
  const y = mainY + Math.max(0, Math.min(2, mainH - h));
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  // A margin in the window's own colour sets it apart from the content behind it: one row above
  // and below, two columns at the sides (a cell is about twice as tall as it is wide).
  c.fill(x - 2, y - 1, w + 4, h + 2, bg.bg);
  const b = app.glyphs.box;
  drawText(c, x, y, `${b.tl}${b.h}`, border);
  const tw = drawText(c, x + 2, y, truncate(` ${o.title} `, w - 6), { ...border, bold: true });
  drawText(c, x + 2 + tw, y, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  const selectableCount = o.filtered.filter((e) => !e.item.header).length;
  const position = o.filtered.slice(0, o.selected + 1).filter((e) => !e.item.header).length;
  const count = ` ${selectableCount ? position : 0}/${selectableCount} `;
  const bottom = `${b.bl}${b.h.repeat(Math.max(0, w - 2 - stringWidth(count)))}`;
  drawText(c, x, y + h - 1, bottom, border);
  drawText(c, x + stringWidth(bottom), y + h - 1, count + b.br, dim);

  let listY = y + 1;
  if (o.filterable) {
    const px = drawText(c, x + 2, y + 1, "› ", border);
    const iw = drawText(c, x + 2 + px, y + 1, truncate(o.input, w - 8), bg);
    drawText(c, x + 2 + px + iw, y + 1, " ", roleStyle(theme, "cursor", null));
    listY = y + 2;
  }
  if (footer) drawFooter(app, c, o, x, y + h - 2 - FOOTER_ROWS, w);
  const rows = h - (listY - y) - 1 - (footer ? FOOTER_ROWS + 1 : 0);
  if (o.selected < o.scroll) o.scroll = o.selected;
  if (o.selected >= o.scroll + rows) o.scroll = o.selected - rows + 1;
  // When the selected entry is the top row, bring its heading (title and rule, not the blank
  // row before them) into view above it; not while the wheel is scrolling the view.
  if (o.scroll === o.selected && !o.wheeled) {
    // …as long as the selected entry stays in view.
    while (
      o.scroll > 0 &&
      o.selected - (o.scroll - 1) < rows &&
      o.filtered[o.scroll - 1]!.item.header &&
      (o.filtered[o.scroll - 1]!.item.label || o.filtered[o.scroll - 1]!.item.rule)
    )
      o.scroll--;
  }
  // Key columns: each as wide as its widest binding in the section, so keys line up down it.
  const colWAt: number[][] = new Array(o.filtered.length);
  if (o.alignKeysAcrossList) {
    const colW = [0, 0, 0];
    for (const e of o.filtered)
      (e.item.keys ?? []).slice(0, 3).forEach((key, c) => (colW[c] = Math.max(colW[c]!, stringWidth(key))));
    colWAt.fill(colW);
  } else
    for (let i = 0; i < o.filtered.length; ) {
      let j = i;
      while (j < o.filtered.length && o.filtered[j]!.item.header) colWAt[j++] = [0, 0, 0];
      const colW = [0, 0, 0];
      let k = j;
      for (; k < o.filtered.length && !o.filtered[k]!.item.header; k++)
        (o.filtered[k]!.item.keys ?? [])
          .slice(0, 3)
          .forEach((key, c) => (colW[c] = Math.max(colW[c]!, stringWidth(key))));
      for (let m = j; m < k; m++) colWAt[m] = colW;
      i = k;
    }
  const lastEntry = (() => {
    let last = -1;
    for (let i = 0; i < rows; i++) if (o.filtered[o.scroll + i] && !o.filtered[o.scroll + i]!.item.header) last = i;
    return last;
  })();
  const matchSt = roleStyle(theme, "overlay_match", null);
  for (let i = 0; i < rows; i++) {
    const idx = o.scroll + i;
    const entry = o.filtered[idx];
    if (!entry) break;
    const ry = listY + i;
    const { item, positions } = entry;
    if (item.header) {
      // Never a heading with nothing under it on screen.
      if (i > lastEntry) continue;
      if (item.rule) drawText(c, x + 2, ry, b.h.repeat(w - 4), roleStyle(theme, "overlay_dim", null), w - 4);
      else if (item.label)
        drawText(c, x + 2, ry, truncate(item.label.toUpperCase(), w - 4), roleStyle(theme, "overlay_group", null));
      continue;
    }
    const selected = idx === o.selected;
    const st = selected ? roleStyle(theme, "overlay_selected", null) : bg;
    c.fill(x + 1, ry, w - 2, 1, st.bg);
    const indent = (item.indent ?? 0) * 2;
    // Keys at the right: as many as fit beside the label, then an ellipsis.
    const labelW = Math.min(stringWidth(item.label), Math.max(8, Math.floor((w - 6) / 2)));
    const keysRoom = w - 4 - indent - labelW - 2;
    const keysW = item.keys?.length
      ? drawKeys(app, c, x + w - 2, ry, item.keys, keysRoom, selected, st.bg, colWAt[idx]!)
      : 0;
    const hint = item.keys ? "" : (item.hint ?? "");
    const hintW = hint ? stringWidth(hint) + 2 : 0;
    const avail = w - 4 - hintW - (keysW ? keysW + 2 : 0);
    let cx = x + 2 + indent;
    // The filter matched the label as it is: its letters marked where the sanitized label has them.
    const shown = marked(item.label, positions);
    const label = truncate(shown.text, Math.max(4, avail - indent));
    const pos = shown.pos;
    // Its own colour (a diff's line, a change's state), unless selected.
    const own =
      item.role && !selected
        ? {
            ...st,
            fg: roleStyle(theme, item.role, null).fg ?? st.fg,
            bold: roleStyle(theme, item.role, null).bold ?? st.bold,
          }
        : st;
    let ci = 0;
    for (const g of graphemes(label)) {
      const gw = graphemeWidth(g);
      if (gw > 0) c.cell(cx, ry, g, gw, pos.has(ci) ? { ...st, fg: matchSt.fg, bold: true } : own);
      cx += gw;
      ci += g.length;
    }
    if (item.detail && !footer) {
      const room = x + 2 + avail - cx - 2;
      if (room > 4 && item.detailMarks?.length) {
        // A search hit's words, marked in its line.
        const marks = marked(
          item.detail,
          item.detailMarks.flatMap(([a, b]) => Array.from({ length: Math.max(0, b - a) }, (_, k) => a + k)),
        );
        const detail = truncate(marks.text, room);
        let dx = cx + 2;
        let di = 0;
        for (const g of graphemes(detail)) {
          const gw = graphemeWidth(g);
          const on = marks.pos.has(di);
          if (gw > 0) c.cell(dx, ry, g, gw, on ? { ...st, fg: matchSt.fg, bold: true } : { ...dim, bg: st.bg });
          dx += gw;
          di += g.length;
        }
        cx = dx + 2;
      } else if (room > 4) cx += drawText(c, cx + 2, ry, truncate(item.detail, room), { ...dim, bg: st.bg }) + 2;
    }
    if (hint) drawText(c, x + w - 2 - stringWidth(hint), ry, hint, { ...dim, bg: st.bg });
  }
  if (!selectableCount) drawText(c, x + 2, listY, o.input ? "no matches" : "nothing here", dim);
  return { x, y, w, h, listY, rows };
}

const FOOTER_ROWS = 4;

/**
 * Text as it's drawn (sanitized) and a match's positions in it: the positions are the raw text's
 * own (match.ts), and a control or an escape taken out would shift every one after it.
 */
export function marked(raw: string, positions: Iterable<number>): { text: string; pos: Set<number> } {
  const m = sanitizeMap(raw);
  const pos = new Set<number>();
  for (const p of positions) {
    const at = m.at[p];
    if (at !== undefined && at >= 0) pos.add(at);
  }
  return { text: m.text, pos };
}

/** A file's git state as the explorer marks it (5.11). */
export const GIT_MARK: Record<GitState, string> = {
  new: "+",
  modified: "M",
  renamed: "R",
  deleted: "D",
  conflict: "!",
};

/**
 * A list as a dropdown hanging under `anchor` (the breadcrumb's `…`): framed like the other
 * popups, as wide as its rows, entries indented as a tree. Keys, clicks and the wheel are the
 * list's. The margin row above it lies on the rule under the window header, which stays visible.
 */
export function drawDropdown(
  app: App,
  c: Canvas,
  o: ListOverlay,
  anchor: { x: number; y: number },
  maxY: number,
): Rect & { listY: number; rows: number } {
  const theme = app.theme;
  const g = app.glyphs;
  const W = c.width;
  const hintW = (item: ListItem) => (item.hint ? stringWidth(item.hint) + 2 : 0);
  // Three columns a level: `└─` and a space.
  // Sized over every entry, not the matches, so it keeps its width while you type.
  const content = Math.max(
    20,
    ...o.items.map((item) => (item.indent ?? 0) * 3 + stringWidth(item.label) + hintW(item)),
  );
  // At least half the screen (60 to 100 columns), centred; it hangs under the anchor's row.
  const w = Math.max(10, Math.min(Math.max(content + 4, 60, Math.floor(W / 2)), 100, W - 8));
  const x = Math.max(2, Math.floor((W - w) / 2));
  const y = anchor.y + 2;
  // The filter's row, a blank row, room for at least 8 entries, a blank row.
  const inputRows = o.filterable ? 1 : 0;
  const pad = 1;
  const h = Math.max(3 + inputRows, Math.min(Math.max(8, o.filtered.length) + 2 + inputRows + 2 * pad, maxY - y));
  const bg = roleStyle(theme, "overlay", null);
  const border = roleStyle(theme, "overlay_border", null);
  const dim = roleStyle(theme, "overlay_dim", null);
  c.fill(x - 2, y - 1, w + 4, h + 2, bg.bg);
  const b = g.box;
  drawText(c, x, y, `${b.tl}${b.h}`, border);
  const tw = drawText(c, x + 2, y, truncate(` ${o.title} `, w - 6), { ...border, bold: true });
  drawText(c, x + 2 + tw, y, b.h.repeat(Math.max(0, w - 3 - tw)) + b.tr, border);
  for (let k = 1; k < h - 1; k++) {
    drawText(c, x, y + k, b.v, border, 1);
    drawText(c, x + w - 1, y + k, b.v, border, 1);
  }
  drawText(c, x, y + h - 1, `${b.bl}${b.h.repeat(w - 2)}${b.br}`, border);
  const tight = h < Math.max(1, o.filtered.length) + 2 + inputRows + 2 * pad; // no room for the blank rows
  const listY = y + 1 + inputRows + (tight ? 0 : pad);
  if (o.filterable) {
    const px = drawText(c, x + 2, y + 1, "› ", border);
    const iw = drawText(c, x + 2 + px, y + 1, truncate(o.input, w - 6 - px), bg);
    drawText(c, x + 2 + px + iw, y + 1, " ", roleStyle(theme, "cursor", null));
  }
  const rows = h - 2 - inputRows - (tight ? 0 : 2 * pad);
  const matchSt = roleStyle(theme, "overlay_match", null);
  if (o.selected < o.scroll) o.scroll = o.selected;
  if (o.selected >= o.scroll + rows) o.scroll = o.selected - rows + 1;
  for (let i = 0; i < rows; i++) {
    const idx = o.scroll + i;
    const entry = o.filtered[idx];
    if (!entry) break;
    const { item, positions } = entry;
    const ry = listY + i;
    const selected = idx === o.selected;
    const st = selected ? roleStyle(theme, "overlay_selected", null) : bg;
    c.fill(x + 1, ry, w - 2, 1, st.bg);
    const depth = item.indent ?? 0;
    let cx = x + 2 + depth * 3;
    // One heading under the next: each row hangs off the one above with └─.
    if (depth)
      drawText(
        c,
        cx - 3,
        ry,
        `${g.guideLast}${g.guideDash}`,
        { ...roleStyle(theme, "tree_guide", st.bg), bg: st.bg },
        2,
      );
    const hw = hintW(item);
    const shown = marked(item.label, positions);
    const label = truncate(shown.text, Math.max(1, x + w - 2 - hw - cx));
    const pos = shown.pos;
    let ci = 0;
    for (const gr of graphemes(label)) {
      const gw = graphemeWidth(gr);
      if (gw > 0) c.cell(cx, ry, gr, gw, pos.has(ci) ? { ...st, fg: matchSt.fg, bold: true } : st);
      cx += gw;
      ci += gr.length;
    }
    if (item.hint) drawText(c, x + w - 2 - stringWidth(item.hint), ry, item.hint, { ...dim, bg: st.bg });
  }
  if (!o.filtered.length) drawText(c, x + 2, listY, "no matches", dim);
  return { x, y, w, h, listY, rows };
}

/**
 * A list's footer, under a rule: the selected entry's name, its explanation (wrapping to a second
 * row), and its other bindings as keycaps. Always the same height, so the list doesn't jump.
 */
function drawFooter(app: App, c: Canvas, o: ListOverlay, x: number, y: number, w: number): void {
  const theme = app.theme;
  const b = app.glyphs.box;
  drawText(c, x, y, `${b.ml}${b.h.repeat(w - 2)}${b.mr}`, roleStyle(theme, "overlay_border", null));
  const item = o.filtered[o.selected]?.item;
  if (!item || item.header) return;
  const text = roleStyle(theme, "overlay", null);
  const room = w - 4;
  drawText(c, x + 2, y + 1, truncate(item.label, room), { ...text, bold: true });
  const lines = wrapWords(item.detail ?? "", room);
  lines
    .slice(0, 2)
    .forEach((l, i) =>
      drawText(
        c,
        x + 2,
        y + 2 + i,
        i === 1 && lines.length > 2 ? truncate(`${l} ${lines.slice(2).join(" ")}`, room) : l,
        text,
      ),
    );
  if (item.more?.length) {
    const cap = roleStyle(theme, "keycap", text.bg);
    const plain = cap.bg === text.bg;
    let cx = x + 2 + drawText(c, x + 2, y + 4, "also ", roleStyle(theme, "overlay_dim", null));
    for (const [i, k] of item.more.entries()) {
      const label = plain ? (i ? ` · ${k}` : k) : ` ${k} `;
      if (cx + stringWidth(label) > x + w - 2) break;
      cx += drawText(c, cx, y + 4, label, plain ? text : cap) + (plain ? 0 : 1);
    }
  }
}

/** Words into lines of at most `width` columns. */
function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && stringWidth(`${line} ${word}`) > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.map((l) => truncate(l, width));
}

/**
 * Key bindings as keycaps ending at `right`, each binding one cap (a sequence stays inside it),
 * in columns `colW` wide so they line up from row to row. Without a keycap background (NO_COLOR)
 * the columns are separated by " · ". Returns the width used; keys that don't fit are dropped.
 */
function drawKeys(
  app: App,
  c: Canvas,
  right: number,
  y: number,
  keys: string[],
  room: number,
  selected: boolean,
  rowBg: Color | null,
  colW: number[],
): number {
  const theme = app.theme;
  const cap = roleStyle(theme, selected ? "keycap_selected" : "keycap", rowBg);
  const plain = cap.bg === rowBg;
  const pad = plain ? 0 : 2; // the cap's own spaces
  const gap = plain ? 3 : 1;
  const cols = colW.filter((wd) => wd > 0).length;
  const widthOf = (n: number) => colW.slice(0, n).reduce((a, wd) => a + wd + pad, 0) + (n - 1) * gap;
  let n = cols;
  while (n > 0 && widthOf(n) > room) n--;
  if (!n) return 0;
  let x = right - widthOf(n);
  const sepSt = { ...roleStyle(theme, "overlay_dim", rowBg), bg: rowBg };
  for (let i = 0; i < n; i++) {
    const k = keys[i];
    if (k) {
      if (plain && i > 0) drawText(c, x - 2, y, "·", sepSt);
      drawText(c, x, y, plain ? k : ` ${k} `, cap);
    }
    x += colW[i]! + pad + gap;
  }
  return widthOf(n);
}
