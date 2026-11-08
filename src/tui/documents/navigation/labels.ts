// Jump labels (EG-D3; `cursor.jump`: `s` while reading, `g w` there and in SOURCE view): what each window of the tab
// shows gets a label — every word of two letters or more and each CJK character (EG-D24), and every link where it's
// drawn — of one or two letters from a home-row alphabet, the nearest to the cursor the shortest, drawn over the
// target's first cells. The keys after it are the labels' (input.ts, right after a character awaited): each narrows
// them, a whole label moves the cursor there and focuses its window, and `esc`, a key no label goes on with, a mouse
// press or a wheel leaves everything as it was. On a link, `enter` then follows it, as `enter` does.

import { stringWidth } from "../../../core/foundation/text/width.ts";
import { type Layout, scrolledInSight } from "../../../core/rendering/layout/ir.ts";
import type { App, View } from "../../app/runtime/app.ts";
import { pageBg, roleStyle } from "../../shell/screen/style.ts";
import { type Canvas, drawText } from "../../shell/terminal/canvas.ts";
import { cells, longWordStarts, type Pos } from "../editing/cursor.ts";

/** The letters labels are made of: the home row first, then the row above it and the one below. */
export const ALPHABET = "asdfghjklqwertyuiopzxcvbnm";

/**
 * `n` labels, shortest first, none the start of another: one letter each while the alphabet is enough; else as many
 * single letters as leave the remaining letters room to start two-letter labels for the rest. At most the alphabet's
 * square: what's past that goes without.
 */
export function labelsFor(n: number, alphabet = ALPHABET): string[] {
  const letters = [...alphabet];
  const a = letters.length;
  if (n <= a) return letters.slice(0, Math.max(0, n));
  const singles = Math.max(0, Math.floor((a * a - n) / (a - 1)));
  const out = letters.slice(0, singles);
  for (const first of letters.slice(singles))
    for (const second of letters) {
      if (out.length >= n) return out;
      out.push(first + second);
    }
  return out;
}

/** A place a label goes: its window, its row and column in that window's layout, the link starting there, if one does,
 *  and where it is on screen. */
export interface Target {
  view: View;
  pos: Pos;
  link?: number;
  x: number;
  y: number;
}

/**
 * Targets in reading order, sorted nearest `from` (the cursor on screen) first: by their distance on screen, a row
 * counting as two columns (a cell is about twice as tall as it is wide); ties stay in reading order.
 */
export function nearestFirst(targets: Target[], from: { x: number; y: number }): Target[] {
  return targets
    .map((t, i) => ({ t, i, d: (2 * (t.y - from.y)) ** 2 + (t.x - from.x) ** 2 }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((e) => e.t);
}

/** The screen column layout column `col` of `row` is drawn at, `textX` the window's column 0; null when it's out of
 *  sight in a code block scrolled sideways. */
function screenX(app: App, view: View, layout: Layout, row: number, col: number, textX: number): number | null {
  const s = layout.lines[row]?.scroll;
  if (s && !scrolledInSight(s, col, app.code.offset(view, layout, row))) return null;
  return textX + app.code.screenCol(view, layout, row, col) - view.left;
}

/** The labels: the targets labelled, and the letters typed so far. */
interface Shown {
  targets: (Target & { label: string })[];
  typed: string;
}

/** Jump labels (`app.labels`): the targets labelled while they show, the keys typed to them, and their drawing. */
export class JumpLabels {
  constructor(readonly app: App) {}

  /** The labels showing; null while none do. */
  shown: Shown | null = null;

  /** The targets one window shows on screen, as it was last drawn: none for a window not drawn. */
  targetsIn(view: View): Target[] {
    const app = this.app;
    const pane = app.geometry?.panes.find((p) => p.view === view);
    if (!pane) return [];
    const layout = app.currentLayout(view);
    const right = pane.x + pane.w - 1 - app.views.signsRight(view);
    const links = new Map<number, Map<number, number>>();
    layout.links.forEach((k, i) => {
      if (k.line < 0) return;
      const row = links.get(k.line) ?? new Map<number, number>();
      if (!row.has(k.col)) row.set(k.col, i);
      links.set(k.line, row);
    });
    const out: Target[] = [];
    app.lens
      .screenRows(view, layout)
      .slice(0, pane.h)
      .forEach((row, i) => {
        const line = layout.lines[row];
        // Never a frame row: the lens's rules, a code cell's header and borders.
        if (!line || line.decor) return;
        const here = links.get(row);
        const cols = [...new Set([...longWordStarts(line), ...(here?.keys() ?? [])])].sort((a, b) => a - b);
        for (const col of cols) {
          const x = screenX(app, view, layout, row, col, pane.textX);
          if (x === null || x < pane.textX || x >= right) continue;
          out.push({ view, pos: { row, col }, ...(here?.has(col) ? { link: here.get(col)! } : {}), x, y: pane.y + i });
        }
      });
    return out;
  }

  /**
   * `cursor.jump`: every target of the tab's windows labelled — the floating window's alone while it's open, and the
   * cursor's window's alone in visual mode, where a label extends the selection. None on screen: said so.
   */
  start(): void {
    const app = this.app;
    const view = app.view;
    if (!view) return app.message("info", "no note open");
    const views = app.floating || view.visual ? [view] : (app.tab?.views ?? [view]);
    const here = (t: Target) => t.view === view && t.pos.row === view.cur.row && t.pos.col === view.cur.col;
    const targets = nearestFirst(
      views.flatMap((v) => this.targetsIn(v)).filter((t) => !here(t)),
      this.placeOf(view, view.cur) ?? { x: 0, y: 0 },
    );
    if (!targets.length) return app.message("info", "nothing on screen to jump to");
    const labels = labelsFor(targets.length);
    this.shown = { typed: "", targets: labels.map((label, i) => ({ ...targets[i]!, label })) };
  }

  /** A key while the labels show: a letter narrows them, a whole label goes there; any other key cancels. */
  key(key: string): void {
    const s = this.shown;
    if (!s) return;
    const typed = s.typed + key;
    const left = [...key].length === 1 ? s.targets.filter((t) => t.label.startsWith(typed)) : [];
    if (!left.length) {
      this.shown = null;
      return;
    }
    const hit = left.find((t) => t.label === typed);
    if (!hit) {
      s.typed = typed;
      return;
    }
    this.shown = null;
    this.go(hit);
  }

  /** Where a place of a window is on screen, as it was last drawn; null when it isn't there. */
  private placeOf(view: View, pos: Pos): { x: number; y: number } | null {
    const pane = this.app.geometry?.panes.find((p) => p.view === view);
    if (!pane) return null;
    const layout = this.app.currentLayout(view);
    const i = this.app.lens.screenRows(view, layout).indexOf(pos.row);
    const x = i < 0 ? null : screenX(this.app, view, layout, pos.row, pos.col, pane.textX);
    return x === null ? null : { x, y: pane.y + i };
  }

  /** The cursor onto a target, its window focused. */
  private go(t: Target): void {
    const app = this.app;
    const tab = app.tab;
    const index = tab && !app.floating ? tab.views.indexOf(t.view) : -1;
    if (tab && index >= 0) tab.active = index;
    app.region = "content";
    app.moveCursor(t.view, t.pos);
  }

  /**
   * The labels over one window's targets, as it's drawn: the letters still to type of the labels those typed start,
   * over the target's first cells — as many as the letters take, a wide character whole — in `jump_label`.
   */
  draw(c: Canvas, view: View, layout: Layout, shown: number[], y0: number, textX: number, textW: number): void {
    const s = this.shown;
    if (!s) return;
    const at = new Map(shown.map((row, i) => [row, i]));
    const style = roleStyle(this.app.theme, "jump_label", pageBg(this.app.theme));
    for (const t of s.targets) {
      const i = at.get(t.pos.row);
      if (t.view !== view || i === undefined || !t.label.startsWith(s.typed)) continue;
      const x = screenX(this.app, view, layout, t.pos.row, t.pos.col, textX);
      if (x === null || x < textX || x >= textX + textW) continue;
      const rest = t.label.slice(s.typed.length);
      const want = stringWidth(rest);
      let covered = 0;
      for (const cell of cells(layout.lines[t.pos.row]))
        if (cell.x >= t.pos.col && covered < want) covered = cell.x + cell.w - t.pos.col;
      drawText(c, x, y0 + i, rest + " ".repeat(Math.max(0, covered - want)), style, textX + textW - x);
    }
  }
}
