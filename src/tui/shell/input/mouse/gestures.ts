// Pointer gesture state and selection/drag completion; routing reads the same live gesture.
import { stringWidth } from "../../../../core/foundation/text/width.ts";
import { clampPos, type Pos, wordAt } from "../../../documents/editing/cursor.ts";
import type { Geometry } from "../../screen/draw.ts";
import { prettyKey } from "../keys.ts";
import type { App, View } from "../../../app/runtime/app.ts";
import { editable } from "../../../documents/editing/editable.ts";
import { taskMarkAt } from "../../../documents/views/views.ts";
import { linkAt } from "../../../documents/navigation/linking.ts";

export class MouseGestures {
  constructor(readonly app: App) {}
  lastClick: { x: number; y: number; at: number; count: number } | null = null;

  drag:
    | { kind: "select"; view: View; start: Pos; moved: boolean; onText: boolean; ctrl?: boolean }
    | { kind: "tab"; index: number }
    | { kind: "separator"; sep: import("../../screen/draw.ts").Separator }
    | { kind: "scrollbar"; bar: import("../../screen/draw.ts").ScrollbarGeom }
    | { kind: "picture"; view: View; row: number; file: string; x: number; y: number; ctrl: boolean }
    | null = null;

  /** Click count at this spot: 1, 2 (double) or 3 (triple), within 400 ms. */
  clicks(ev: { x: number; y: number }): number {
    const now = this.app.now();
    const l = this.lastClick;
    const again = l && l.x === ev.x && l.y === ev.y && now - l.at < 400;
    if (again && l.count === 0) {
      this.lastClick = null;
      return 0;
    }
    const count = again ? Math.min(3, l.count + 1) : 1;
    this.lastClick = { x: ev.x, y: ev.y, at: now, count };
    return count;
  }

  /** A press on a window's text: the cursor there, a word or a row selected, or a drag's start. */
  press(
    ev: { x: number; y: number; ctrl?: boolean },
    pane: import("../../screen/draw.ts").PaneGeom,
    clicks: number,
  ): void {
    const view = pane.view;
    const layout = this.app.currentLayout(view);
    const shown = this.app.lens.screenRows(view, layout);
    const atRow = shown[ev.y - pane.y] ?? shown[shown.length - 1] ?? 0;
    // In a code block scrolled sideways, the character drawn under the pointer.
    const pos = clampPos(layout, {
      row: atRow,
      col: this.app.code.layoutCol(view, layout, atRow, Math.max(0, ev.x - pane.textX) + view.left),
    });
    // Really on the text, not on blank space the cursor was clamped from (past a row's end, below
    // the note): only there does a click follow a link or tick a task.
    const clickedRow = shown[ev.y - pane.y];
    const clickedCol = this.app.code.layoutCol(view, layout, atRow, ev.x - pane.textX + view.left);
    const onText =
      clickedRow !== undefined &&
      clickedCol >= 0 &&
      clickedCol < (layout.lines[clickedRow]?.spans.reduce((a, sp) => a + stringWidth(sp.text), 0) ?? 0);
    view.visual = null;
    if (clicks === 2) {
      // Double-click selects the word, triple-click the row; either is copied, like a terminal.
      const [a, b] = wordAt(layout, pos);
      this.app.views.select(view, { row: pos.row, col: a }, false);
      this.app.moveCursor(view, { row: pos.row, col: b }, { extend: true });
      this.copySelectionQuietly(view);
      return;
    }
    if (clicks === 3) {
      this.app.views.select(view, { row: pos.row, col: 0 }, true);
      view.cur = pos;
      view.curAnchor = this.app.views.cursorAnchorFor(layout, pos);
      this.copySelectionQuietly(view);
      return;
    }
    view.sel = null;
    this.app.moveCursor(view, pos);
    // With the lens open, a click that moves it keeps the clicked line under the pointer (set now,
    // for the layout that moves the lens, not the one moveCursor started from).
    if (view.live) view.lensClick = ev.y - pane.y;
    // Where the cursor really is now (the lens may have moved): a drag starts from there.
    this.app.currentLayout(view);
    view.lensClick = undefined;
    this.drag = { kind: "select", view, start: { ...view.cur }, moved: false, onText, ctrl: !!ev.ctrl };
  }

  copySelectionQuietly(view: View): void {
    const text = this.app.views.selectionText(view);
    if (!text) return;
    this.app.copy(text, false);
    this.app.message("info", `copied ${text.length} characters`);
  }

  dragTo(ev: { x: number; y: number }, g: Geometry): void {
    // A press on a picture that moves: a selection from where it was pressed, as before pictures were clicked.
    if (this.drag?.kind === "picture") {
      const { view, x, y, ctrl } = this.drag;
      if (ev.x === x && ev.y === y) return;
      const pane = g.panes.find((p) => p.view === view);
      this.drag = null;
      if (!pane) return;
      this.press({ x, y, ctrl }, pane, 1);
      if (!this.drag) return;
    }
    const d = this.drag!;
    if (d.kind === "tab") {
      const over = g.tabs.find((t) => ev.x >= t.x && ev.x < t.x + t.w);
      // A drag stays within its group: pinned tabs keep left of the others.
      if (over && over.index !== d.index && !!this.app.tabs[over.index]?.pinned === !!this.app.tabs[d.index]?.pinned) {
        const [moved] = this.app.tabs.splice(d.index, 1);
        this.app.tabs.splice(over.index, 0, moved!);
        this.app.activeTab = over.index;
        d.index = over.index;
      }
      return;
    }
    if (d.kind === "separator") {
      const s = d.sep;
      if (s.kind === "problems" && s.area) return this.app.problems.resize(s.area.y + s.area.h - 1 - ev.y);
      if (s.kind === "sidebar")
        this.app.panels.sideW = Math.max(
          12,
          Math.min(ev.x - this.app.panels.leftRailWidth, Math.floor(this.app.panels.usableWidth * 0.5)),
        );
      else if (s.kind === "outline")
        this.app.panels.outW = Math.max(
          12,
          Math.min(
            this.app.width - this.app.panels.rightRailWidth - ev.x - 1,
            Math.floor(this.app.panels.usableWidth * 0.5),
          ),
        );
      else if (s.area && this.app.tab) {
        const r =
          s.kind === "split-side"
            ? (ev.x - s.area.x) / Math.max(1, s.area.w)
            : (ev.y - s.area.y) / Math.max(1, s.area.h);
        this.app.tab.ratio = Math.max(0.15, Math.min(0.85, r));
      }
      return;
    }
    if (d.kind === "scrollbar") return this.scrollbarTo(d.bar, ev.y, ev.x);
    const pane = g.panes.find((p) => p.view === d.view);
    if (!pane) return;
    if (ev.y < pane.y) this.app.views.scrollBy(pane.view, -1, false);
    if (ev.y >= pane.y + pane.h) this.app.views.scrollBy(pane.view, 1, false);
    const layout = this.app.currentLayout(d.view);
    const shown = this.app.lens.screenRows(d.view, layout);
    const atRow = shown[Math.max(0, Math.min(shown.length - 1, ev.y - pane.y))] ?? 0;
    const pos = clampPos(layout, {
      row: atRow,
      col: this.app.code.layoutCol(d.view, layout, atRow, Math.max(0, ev.x - pane.textX) + d.view.left),
    });
    if (!d.view.sel || d.view.sel.anchor !== d.start) this.app.views.select(d.view, d.start, false);
    d.view.cur = pos;
    d.view.goal = this.app.code.screenCol(d.view, layout, pos.row, pos.col);
    // The anchor too, so a re-layout (a message line appearing, a resize) keeps the cursor here.
    d.view.curAnchor = this.app.views.cursorAnchorFor(layout, pos);
    d.moved = true;
  }

  up(): void {
    const d = this.drag!;
    this.drag = null;
    if (d.kind === "picture") {
      // As any click: a selection, and visual mode, end — whether the picture's still there or not.
      d.view.visual = null;
      d.view.sel = null;
      const layout = this.app.currentLayout(d.view);
      const linked = layout.lines[d.row]?.spans.find(
        (s) => s.link !== undefined && layout.links[s.link]?.kind === "markdown",
      );
      if (linked) {
        this.app.moveCursor(d.view, { row: d.row, col: 0 });
        void this.app.run("link.follow");
        return;
      }
      return this.app.pictures.toggle(d.view, d.row, d.file);
    }
    if (d.kind !== "select") return;
    if (d.moved && d.view.sel) {
      const text = this.app.views.selectionText(d.view);
      if (text) {
        this.app.copy(text, false);
        this.app.message(
          "info",
          `copied ${text.length} characters · ${prettyKey(`${this.app.leader} s a`, this.app.leader)} adds it to the scratch`,
        );
      }
      // Where the text is editable, a drag is a visual selection (as vim's mouse makes one): d, c,
      // x, >, < and y act on it, and esc leaves it — an edit never lands beside a highlight.
      if (editable(d.view) && !d.view.insert && !d.view.visual) d.view.visual = d.view.sel.line ? "line" : "char";
      return;
    }
    d.view.sel = null;
    if (!d.onText) return;
    const layout = this.app.currentLayout(d.view);
    const link = linkAt(layout, d.start.row, d.start.col);
    if (link >= 0) {
      // A double-click's second click lands in the note the first opened: it's swallowed, never a
      // click (or a double-click, copying a word) on text the user hasn't seen yet.
      if (this.lastClick) this.lastClick.count = 0;
      // A click on a link out of the vault peeks; with ctrl, goes there at once (VV-D7).
      return void this.app.run(d.ctrl ? "link.go" : "link.follow").then(() => this.app.host.requestRender());
    }
    const task = taskMarkAt(layout, d.start.row, d.start.col);
    if (task) this.app.views.toggleTaskAt(d.view, task);
  }

  scrollbarTo(bar: import("../../screen/draw.ts").ScrollbarGeom, y: number, x = bar.x): void {
    const frac = Math.max(0, Math.min(1, (y - bar.y) / Math.max(1, bar.h - 1)));
    if (bar.pane) {
      // A side pane's view moves, pinned like the wheel's; its selection stays.
      const state = bar.pane === "sidebar" ? this.app.sidebar : this.app.outline;
      if (bar.horizontal) {
        const fx = Math.max(0, Math.min(1, (x - bar.x) / Math.max(1, bar.w - 1)));
        state.left = Math.round(fx * Math.max(0, bar.total - bar.w));
        return;
      }
      state.scroll = Math.round(frac * Math.max(0, bar.total - bar.h));
      state.pinned = true;
      return;
    }
    if (!bar.view) return;
    if (bar.horizontal) {
      const fx = Math.max(0, Math.min(1, (x - bar.x) / Math.max(1, bar.w - 1)));
      // A code block's own (on its last row): it moves, the window stays.
      if (bar.block !== undefined) {
        bar.view.codeWheeled = true;
        return this.app.code.setOffsetOf(bar.view, bar.block, Math.round(fx * Math.max(0, bar.total - bar.w)));
      }
      bar.view.left = Math.round(fx * Math.max(0, bar.total - bar.w));
      return;
    }
    const target = Math.round(frac * Math.max(0, bar.total - bar.view.height));
    this.app.views.scrollBy(bar.view, target - bar.view.top, false);
  }
}
