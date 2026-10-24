// The mouse: a click, a drag and the wheel, wherever they land — the text, a pane, a scrollbar, a tab, a button, an
// overlay — by the geometry the last draw left.

import { stopInsert } from "./editing.ts";
import * as R from "./replacing.ts";
import { branchMenu, gitClick, gitRightClick, signClick } from "./gitmouse.ts";
import { stringWidth } from "../core/width.ts";
import { saveAsMouse } from "./saveas.ts";
import { dialogMouse } from "./dialog.ts";
import { clampPos, type Pos, wordAt } from "./cursor.ts";
import type { Geometry } from "./draw.ts";
import { prettyKey } from "./keys.ts";
import type { App, View } from "./app.ts";
import { editable } from "./app.ts";
import { type LeftView, LEFT_VIEWS } from "./panels.ts";
import { codeBlocks } from "./code.ts";
import { extentOf } from "../core/layout/ir.ts";
import { selectable } from "./overlays.ts";
import { taskMarkAt } from "./views.ts";
import { linkAt } from "./linking.ts";
import { MODES } from "./modes.ts";

/** The mouse: clicks, drags, the wheel. */
export class Mouse {
  constructor(readonly app: App) {}

  /** Id of the clickable region under the mouse, for hover highlighting. */
  hover: string | null = null;
  /** Where the pointer was last reported, a new object each time: the git panel's rows hold while it's on them. */
  at: { x: number; y: number } | null = null;

  /** The pointer, where it was last reported, inside `r`. */
  over(r: { x: number; y: number; w: number; h: number } | null | undefined): boolean {
    return !!this.at && !!r && inRect(r, this.at.x, this.at.y);
  }

  /**
   * A frame drawn: what's under the pointer, where it was last reported, by that frame — rows drawn since may have come
   * under it without its moving; drawn again when that's changed, to show it.
   */
  rehover(): void {
    const g = this.app.geometry;
    const at = this.at;
    if (!g || !at || !this.app.ui.mouse) return;
    const id = g.hot.find((h) => inRect(h, at.x, at.y))?.id ?? null;
    // What the frame drew as under the pointer: the git panel draws by its rows as they are now.
    const drew = g.gitHover !== undefined ? g.gitHover : this.hover;
    this.hover = id;
    if (id !== drew) this.app.host.requestRender();
  }

  private lastClick: { x: number; y: number; at: number; count: number } | null = null;
  private drag:
    | { kind: "select"; view: View; start: Pos; moved: boolean; onText: boolean; ctrl?: boolean }
    | { kind: "tab"; index: number }
    | { kind: "separator"; sep: import("./draw.ts").Separator }
    | { kind: "scrollbar"; bar: import("./draw.ts").ScrollbarGeom }
    | { kind: "picture"; view: View; row: number; file: string; x: number; y: number; ctrl: boolean }
    | null = null;

  /** Everything visible is clickable (docs/manual/keys.md, "Mouse"). */
  handle(ev: {
    type: string;
    x: number;
    y: number;
    button: number;
    scroll?: { direction: string; delta: number };
    /** `shift` held: the wheel over a code block that scrolls sideways scrolls it. */
    shift?: boolean;
    /** `ctrl` held: a click on a link out of the vault goes there at once, no peek (VV-D7). */
    ctrl?: boolean;
  }): void {
    if (ev.type !== "move") this.app.lastInputAt = this.app.now();
    this.at = { x: ev.x, y: ev.y };
    // A wheel spun (12.7): pictures held back from its first tick until it rests.
    if (ev.type === "scroll") this.app.pictures.wheelAt = this.app.now();
    // A big note still parsing (15.1): a click or a scroll would land on its placeholder.
    if (this.app.views.parses.size) return;
    this.handleNow(ev);
    // As after a key: a click can save, load theirs, tick a task — the idle clock and the stale list
    // follow it too.
    if (ev.type !== "move" && ev.type !== "over" && ev.type !== "out") {
      this.app.saving.scheduleAutosave();
      this.app.session.publishDirty();
      this.app.session.publishState();
    }
  }

  private handleNow(ev: {
    type: string;
    x: number;
    y: number;
    button: number;
    scroll?: { direction: string; delta: number };
    shift?: boolean;
    ctrl?: boolean;
  }): void {
    const g = this.app.geometry;
    if (!g) return;
    const hotAt = () => g.hot.find((h) => inRect(h, ev.x, ev.y));
    if (ev.type === "move" || ev.type === "over" || ev.type === "out") {
      this.hover = hotAt()?.id ?? null;
      return;
    }
    if (this.app.overlay) return this.overlay(ev, g);
    if (ev.type === "scroll") return this.wheel(ev, g);
    if (ev.type === "down") {
      // A click ends typing (its undo step closes), and a half-typed sequence (space, then the
      // click) unless it's on the which-key popup's own entries; then does what it does.
      // What the click says is said once: ending typing may say a file doesn't parse, and the click's command the same.
      return this.app.sayingOnce(() => {
        for (const v of this.app.allViews()) if (v.insert) stopInsert(this.app, v);
        const hot = hotAt()?.id ?? null;
        if (this.app.pending.length && !hot?.startsWith("wk:")) this.app.input.clearPending();
        return this.down(ev, g, hot);
      });
    }
    if (ev.type === "drag" && this.drag) return this.dragTo(ev, g);
    if ((ev.type === "up" || ev.type === "drag-end") && this.drag) return this.up();
  }

  private overlay(ev: { type: string; x: number; y: number; scroll?: { direction: string } }, g: Geometry): void {
    const o = this.app.overlay!;
    if (o.kind === "saveas") {
      if (g.saveas)
        saveAsMouse(
          this.app,
          o,
          ev,
          g.saveas,
          ev.type === "down" ? (g.hot.find((h) => inRect(h, ev.x, ev.y))?.id ?? null) : null,
        );
      else if (ev.type === "down") this.app.overlays.close(true);
      return;
    }
    if (o.kind === "dialog") {
      if (g.choices) dialogMouse(this.app, o, ev, g.choices);
      return;
    }
    // The find row's own buttons work while typing in it.
    if (o.kind === "prompt" && o.view && ev.type === "down") {
      const hot = g.hot.find((h) => inRect(h, ev.x, ev.y));
      if (hot?.id.startsWith("findopt:") || hot?.id.startsWith("findrep:")) return this.clickHot(hot.id);
    }
    // A question's window: its buttons answer; a click elsewhere in it does nothing, outside it cancels.
    if (o.kind === "prompt" && !o.view && g.dialog) {
      if (ev.type !== "down") return;
      const hot = g.hot.find((h) => inRect(h, ev.x, ev.y));
      if (hot?.id.startsWith("dlg:")) return this.app.overlays.answerDialog(hot.id === "dlg:ok");
      if (!inRect(g.dialog, ev.x, ev.y)) this.app.overlays.close(true);
      return;
    }
    if (o.kind !== "list" || !g.overlay) {
      if (ev.type === "down") this.app.overlays.close(true);
      return;
    }
    const r = g.overlay;
    if (ev.type === "scroll") {
      if (ev.scroll?.direction !== "up" && ev.scroll?.direction !== "down") return; // sideways: nothing
      // The wheel scrolls the list, three rows a notch, like the note and the side panes; the
      // selection moves only to stay in view.
      const d = (ev.scroll?.direction === "up" ? -1 : 1) * 3;
      const n = o.filtered.length;
      o.scroll = Math.max(0, Math.min(Math.max(0, n - r.rows), o.scroll + d));
      o.wheeled = true;
      const before = o.selected;
      if (o.selected < o.scroll) o.selected = selectable(o, o.scroll, 1);
      else if (o.selected >= o.scroll + r.rows) o.selected = selectable(o, Math.min(n - 1, o.scroll + r.rows - 1), -1);
      const item = o.filtered[o.selected];
      if (item && o.selected !== before) o.move?.(item.item);
      return;
    }
    if (ev.type !== "down") return;
    const idx = ev.y - r.listY + o.scroll;
    if (ev.x >= r.x && ev.x < r.x + r.w && ev.y >= r.listY && ev.y < r.listY + r.rows && idx < o.filtered.length) {
      if (o.filtered[idx]!.item.header) return;
      o.selected = idx;
      return void this.app.overlays.key(o, "enter");
    }
    if (!inRect(r, ev.x, ev.y)) this.app.overlays.close(true);
  }

  private wheel(
    ev: { x: number; y: number; scroll?: { direction: string; delta: number }; shift?: boolean },
    g: Geometry,
  ): void {
    const n = Math.max(1, ev.scroll?.delta ?? 1) * 3;
    const dir = ev.scroll?.direction === "up" ? -1 : 1;
    const sideways = ev.scroll?.direction === "left" || ev.scroll?.direction === "right";
    if (!sideways && g.tabStrip && inRect(g.tabStrip, ev.x, ev.y) && this.app.tabs.length) {
      this.app.activeTab = (this.app.activeTab + dir + this.app.tabs.length) % this.app.tabs.length;
      return;
    }
    // Over the floating window, it scrolls: never the window or the side pane under it.
    const floating = this.app.floating?.view;
    const over = floating ? g.panes.find((p) => p.view === floating && inRect(p, ev.x, ev.y)) : undefined;
    const pane = over ?? g.panes.find((p) => inRect(p, ev.x, ev.y));
    // Sideways (a horizontal wheel or trackpad), when wrapping is off: the view moves, not the cursor.
    const side = ev.scroll?.direction === "left" ? -1 : ev.scroll?.direction === "right" ? 1 : 0;
    // Over a code block that scrolls on its own, sideways — or shift with the wheel, up for left — the block moves, 6
    // columns a notch as the window does, the cursor staying.
    if (pane && (side || ev.shift)) {
      const layout = this.app.currentLayout(pane.view);
      const row = this.app.lens.screenRows(pane.view, layout)[ev.y - pane.y];
      if (row !== undefined && codeBlocks(layout).byRow.has(row)) {
        const by = (side || dir) * n * 2;
        this.app.code.setOffset(pane.view, layout, row, this.app.code.offset(pane.view, layout, row) + by);
        pane.view.codeWheeled = true;
        return;
      }
    }
    if (side) {
      // Side panes first (they lie over the note on narrow screens); drawing clamps the offset.
      const sidePane = over
        ? null
        : g.outlinePane && inRect(g.outlinePane, ev.x, ev.y)
          ? this.app.outline
          : g.sidebarPane && inRect(g.sidebarPane, ev.x, ev.y)
            ? this.app.sidebar
            : null;
      if (sidePane) {
        sidePane.left = Math.max(0, (sidePane.left ?? 0) + side * n * 2);
        return;
      }
      if (pane && !this.app.ui.wrap) {
        const layout = this.app.currentLayout(pane.view);
        pane.view.left = Math.max(
          0,
          Math.min(
            Math.max(0, extentOf(layout) - this.app.views.textColumns(pane.view)),
            pane.view.left + side * n * 2,
          ),
        );
      }
      return;
    }
    // The Problems panel: its list scrolls, the selection moving only to stay in view (drawing keeps it there).
    if (!over && g.problems && inRect(g.problems, ev.x, ev.y)) {
      const p = this.app.problems.panel;
      const s = p.tab === "file" ? p.file : p.all;
      const shown = Math.max(1, g.problemsPage ?? 1);
      const count = p.tab === "file" ? this.app.problems.fileRows().length : this.app.problems.rows().length;
      s.scroll = Math.max(0, Math.min(Math.max(0, count - shown), s.scroll + dir * (p.tab === "file" ? 1 : n)));
      s.selected = Math.max(s.scroll, Math.min(s.selected, s.scroll + shown - 1));
      return;
    }
    // Side panes first: on narrow screens they lie over the note.
    if (!over && g.outlinePane && inRect(g.outlinePane, ev.x, ev.y)) {
      this.app.outline.scroll = Math.max(0, this.app.outline.scroll + dir * n);
      this.app.outline.pinned = true;
    } else if (!over && g.sidebarPane && inRect(g.sidebarPane, ev.x, ev.y)) {
      this.app.sidebar.scroll = Math.max(0, this.app.sidebar.scroll + dir * n);
      this.app.sidebar.pinned = true;
      // Scrolled, the git panel's been used (`GitPanel.touched`): where you've scrolled it, it stays.
      if (this.app.leftView === "git") this.app.gitPanel.touched++;
    } else if (pane) {
      // Over an oversized lens: its inside scrolls first; at its end, the page (4.15).
      const v = pane.view;
      if (v.live) {
        const layout = this.app.currentLayout(v);
        const row = this.app.lens.screenRows(v, layout)[ev.y - pane.y];
        if (row !== undefined && layout.lines[row]?.lens === "source" && this.app.lens.hidden(v, layout).length) {
          const before = v.lensInner ?? 0;
          v.lensInner = Math.max(0, before + dir * n);
          this.app.lens.hidden(v, layout); // clamps it to the lens
          if (v.lensInner !== before) {
            // The cursor comes along as far as it must: never left on a row the lens now hides,
            // where the next edit would change text out of sight.
            const shown = this.app.lens.screenRows(v, layout).filter((r) => layout.lines[r]?.lens === "source");
            if (shown.length && !shown.includes(v.cur.row)) {
              const to = v.cur.row < shown[0]! ? shown[0]! : shown[shown.length - 1]!;
              this.app.moveCursor(
                v,
                { row: to, col: this.app.code.layoutCol(v, layout, to, v.goal) },
                { keepGoal: true },
              );
            }
            return;
          }
        }
      }
      this.app.views.scrollBy(v, dir * n, false);
    }
  }

  /** Click count at this spot: 1, 2 (double) or 3 (triple), within 400 ms. */
  private clicks(ev: { x: number; y: number }): number {
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

  private down(ev: { x: number; y: number; button: number; ctrl?: boolean }, g: Geometry, hot: string | null): void {
    // A click anywhere but the git panel's message box ends typing there (GIT-D8).
    if (hot !== "git:box") this.app.gitPanel.typing = false;
    // Middle-click closes a tab.
    if (ev.button === 1) {
      const tab = g.tabs.find((t) => inRect(t, ev.x, ev.y));
      if (tab) this.app.windows.closeTabAt(tab.index);
      return;
    }
    // A right click: a git panel's row's menu (GIT-D8).
    if (ev.button === 2) {
      gitRightClick(this.app, hot, ev.x, ev.y);
      return;
    }
    if (ev.button !== 0) return;
    const clicks = this.clicks(ev);
    if (clicks === 0) {
      this.drag = null;
      return;
    }
    // The floating editor (3.20): a click outside its box (the which-key popup aside) closes it,
    // writing back, and does nothing else — before the tabs and panes, which would act under it.
    const inPopup = g.popup && inRect(g.popup, ev.x, ev.y);
    if (this.app.floating && g.floating && !inRect(g.floating, ev.x, ev.y) && !inPopup)
      return void this.app.overlays.closeFloating();
    if (hot?.startsWith("prow:")) return this.app.problems.clickRow(Number(hot.slice(5)), clicks);
    // A sign of the problems bar (19.9): its window active, the panel on that problem.
    if (hot?.startsWith("pbar:")) {
      const pane = g.panes.find((p) => inRect(p, ev.x, ev.y));
      const t = this.app.tab;
      if (pane && t && !this.app.floating && t.views.includes(pane.view)) t.active = t.views.indexOf(pane.view);
      const [line, column] = hot.slice(5).split(":").map(Number);
      return this.app.problems.openAt(line!, column!);
    }
    // The Problems panel's rule: dragged, its height.
    const panelRule = g.separators.find((s) => s.kind === "problems" && inRect(s, ev.x, ev.y));
    if (panelRule) {
      this.drag = { kind: "separator", sep: panelRule };
      return;
    }
    // The git panel's own: its rows, their buttons, its message box and buttons (GIT-D8).
    if (hot?.startsWith("git:") && gitClick(this.app, hot, clicks)) return;
    // A change's sign in the gutter (GIT-D12): the change, with Revert and Stage.
    if (hot?.startsWith("gsign:")) {
      const pane = g.panes.find((p) => p.x <= ev.x && ev.x < p.x + p.w && p.y <= ev.y && ev.y < p.y + p.h);
      const t = this.app.tab;
      if (pane && t && !this.app.floating && this.focusWindow(t.views.indexOf(pane.view)))
        signClick(this.app, pane.view, Number(hot.slice(6)), { x: ev.x + 1, y: ev.y });
      return;
    }
    if (hot && !hot.startsWith("tab:")) return this.clickHot(hot);
    if (inPopup) return; // the which-key popup's background
    // The Problems panel: a click anywhere else in it focuses it.
    if (g.problems && inRect({ ...g.problems, y: g.problems.y - 1, h: g.problems.h + 1 }, ev.x, ev.y)) {
      this.app.region = "problems";
      return;
    }
    const tab = g.tabs.find((t) => inRect(t, ev.x, ev.y));
    if (tab) {
      this.app.activeTab = tab.index;
      this.app.region = "content"; // the tab's note has the keys now, not a pane focused before
      this.drag = { kind: "tab", index: tab.index };
      return;
    }
    // A side pane's own scrollbars first: they sit inside the pane, and focus it like any click there.
    const paneBar = g.scrollbars.find((b) => b.pane && inRect(b, ev.x, ev.y));
    if (paneBar) {
      this.app.region = paneBar.pane!;
      this.drag = { kind: "scrollbar", bar: paneBar };
      this.scrollbarTo(paneBar, ev.y, ev.x);
      return;
    }
    // Side panes before the note's borders and scrollbars: on narrow screens they lie over the
    // note, the outline over the explorer. A click anywhere in one (its title, blank rows, below
    // the list, its border) focuses it.
    if (g.outlinePane && inRect(g.outlinePane, ev.x, ev.y)) {
      this.app.region = "outline";
      if (!g.outline || !inRect(g.outline, ev.x, ev.y)) return;
      const idx = ev.y - g.outline.y + this.app.outline.scroll;
      if (this.app.rightView === "info") {
        // A section's heading folds; a row opens (or copies) what it names.
        const ir = this.app.info.rows()[idx];
        if (!ir) return;
        this.app.outline.selected = idx;
        if (ir.heading) this.app.info.action(ir.folded ? "unfold" : "fold");
        else this.app.info.openRow(ir);
        return;
      }
      if (this.app.rightView === "footnotes") {
        // A footnote's fold marker folds; a click elsewhere on a row jumps there.
        const fr = this.app.footnotes.rows()[idx];
        if (!fr) return;
        this.app.outline.selected = idx;
        if (fr.hasChildren && ev.x <= g.outline.x + 2) this.app.footnotes.action(fr.folded ? "unfold" : "fold");
        else {
          this.app.footnotes.jumpTo(fr);
          this.app.outline.filter = "";
          this.app.outline.filtering = false;
        }
        return;
      }
      const row = this.app.outlineView.rows()[idx];
      if (!row) return;
      this.app.outline.selected = idx;
      // The fold marker sits right after the indent.
      const markerX = g.outline.x + 1 + (row.level - 1) * 2;
      if (row.hasChildren && ev.x >= markerX - 1 && ev.x <= markerX + 1 && !this.app.outline.filter)
        this.app.outlineView.action(row.folded ? "unfold" : "fold");
      else {
        this.app.outlineView.action("jump"); // a choice: the note moves there and takes the focus
        this.app.outline.filter = "";
        this.app.outline.filtering = false;
      }
      return;
    }
    if (g.sidebarPane && inRect(g.sidebarPane, ev.x, ev.y)) {
      this.app.region = "sidebar";
      if (!g.sidebar || !inRect(g.sidebar, ev.x, ev.y)) return;
      const idx = ev.y - g.sidebar.y + this.app.sidebar.scroll;
      // The git panel's rows are its own hot regions (gitmouse.ts): elsewhere in it, a click focuses it.
      if (this.app.leftView === "git") return;
      if (this.app.leftView === "history") {
        const h = this.app.history.rows()[idx];
        if (!h || h.heading) return;
        this.app.sidebar.selected = idx;
        // As in the explorer: one click selects, a double-click (or enter) jumps there — the clicked
        // row, of the filtered list; the filter clears.
        if (clicks < 2) return;
        this.app.sidebar.filter = "";
        this.app.sidebar.filtering = false;
        if (h.recent) this.app.open(h.recent);
        else this.app.history.jump(h.index);
        this.app.region = "content";
        if (this.app.panels.narrow || this.app.ui.zen) this.app.sidebar.overlay = false;
        return;
      }
      const row = this.app.explorer.rows()[idx];
      if (!row) return;
      this.app.sidebar.selected = idx;
      // A note: one click selects it, a double-click opens it as a tab (enter too, from the keys).
      // A root (another vault) likewise: a double-click goes there.
      if ((row.kind === "note" || row.kind === "root") && clicks < 2) return;
      if (row.kind === "note" && this.app.sidebar.filter) {
        // Picked from the filter: open it, and the tree comes back.
        this.app.sidebar.filter = "";
        this.app.sidebar.filtering = false;
        this.app.openOrSwitchTab(row.path);
        this.app.region = "content";
        if (this.app.panels.narrow || this.app.ui.zen) this.app.sidebar.overlay = false; // an overlaid pane closes after a pick
        return;
      }
      if (row.kind === "dir" && this.app.sidebar.filter) return; // a filtered list ignores folds: a click there only selects
      // A folder folds or unfolds; a note opens, another vault's folder is gone into (VV-D4).
      this.app.explorer.action("open_tab");
      return;
    }
    const sep = g.separators.find((s) => inRect(s, ev.x, ev.y));
    if (sep) {
      this.drag = { kind: "separator", sep };
      return;
    }
    const bar = g.scrollbars.find((b) => inRect(b, ev.x, ev.y));
    if (bar) {
      this.drag = { kind: "scrollbar", bar };
      this.scrollbarTo(bar, ev.y, ev.x);
      return;
    }
    // The floating editor (3.20): a click in it is its (one outside closed it, above).
    const pane =
      (this.app.floating
        ? g.panes.find((p) => p.view === this.app.floating!.view && inRect(p, ev.x, ev.y))
        : undefined) ?? (this.app.floating ? undefined : g.panes.find((p) => inRect(p, ev.x, ev.y)));
    if (!pane) return;
    const t = this.app.tab!;
    if (!this.app.floating) t.active = t.views.indexOf(pane.view);
    this.app.region = "content";
    // On a picture's drawn cells (PIC-D3): the picture's, before the cursor is placed — released still, it's shown at
    // its own size or fitted again; moved, a selection, as a drag from its rows always was. Never part of a double-click.
    const pic = g.pictures.find((p) => p.view === pane.view && inRect(p, ev.x, ev.y));
    if (pic && clicks === 1) {
      this.lastClick = null;
      this.drag = { kind: "picture", view: pane.view, row: pic.row, file: pic.file, x: ev.x, y: ev.y, ctrl: !!ev.ctrl };
      return;
    }
    this.press(ev, pane, clicks);
  }

  /** A press on a window's text: the cursor there, a word or a row selected, or a drag's start. */
  private press(
    ev: { x: number; y: number; ctrl?: boolean },
    pane: import("./draw.ts").PaneGeom,
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

  private copySelectionQuietly(view: View): void {
    const text = this.app.views.selectionText(view);
    if (!text) return;
    this.app.copy(text, false);
    this.app.message("info", `copied ${text.length} characters`);
  }

  private dragTo(ev: { x: number; y: number }, g: Geometry): void {
    // A press on a picture that moves: a selection from where it was pressed, as before pictures were clicked.
    if (this.drag?.kind === "picture") {
      const { view, x, y, ctrl } = this.drag;
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

  private up(): void {
    const d = this.drag!;
    this.drag = null;
    if (d.kind === "picture") {
      // As any click: a selection, and visual mode, end — whether the picture's still there or not.
      d.view.visual = null;
      d.view.sel = null;
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

  private scrollbarTo(bar: import("./draw.ts").ScrollbarGeom, y: number, x = bar.x): void {
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

  /** What a click on a region of the chrome does. */
  clickHot(id: string): void {
    const [kind, arg] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
    switch (kind) {
      // The explorer's buttons (18.1): as its keys, on its selection.
      case "xnew":
      case "xrow":
        this.app.region = "sidebar";
        this.app.explorer.action(kind === "xnew" ? (arg === "note" ? "new_note" : "new_folder") : arg);
        break;
      // A folder of the breadcrumb over the explorer (VV-D5): the view zoomed to it, out or back in.
      case "xcrumb":
        this.app.region = "sidebar";
        return this.app.explorer.zoomTo(arg);
      case "fn":
        return this.app.footnotes.add();
      // A code cell's button (24.13): `action:line`.
      case "cell": {
        const [action, line] = arg.split(":");
        return this.app.code.cellAction(action!, Number(line));
      }
      // The Problems panel's tabs and close button; the status line's problems open it on this file's.
      case "ptab":
        if (arg === "close") return this.app.problems.close();
        if (arg === "all" && this.app.problems.panel.tab !== "all") return this.app.problems.open("all");
        this.app.problems.panel.tab = arg === "all" ? "all" : "file";
        this.app.region = "problems";
        break;
      case "btn":
        // The left rail's: the explorer, the history, source control.
        if (LEFT_VIEWS.some((v) => v.id === arg)) this.app.panels.openLeftView(arg as LeftView);
        else if (arg === "outline") void this.app.run("outline.toggle");
        else if (arg === "footnotes") void this.app.run("footnotes.toggle");
        else if (arg === "info") void this.app.run("info.toggle");
        else if (arg === "palette") void this.app.run("palette.open");
        break;
      case "tabclose":
        this.app.windows.closeTabAt(Number(arg));
        break;
      case "tabmore":
        // The tabs that don't fit in the strip: pick one from the tab list.
        void this.app.run("tab.list");
        break;
      case "crumb": {
        // crumb:<window>:<row> — that window scrolls to the heading, and takes the focus.
        const [w, row] = arg.split(":").map(Number) as [number, number];
        const v = this.focusWindow(w);
        if (v) this.app.outlineView.revealHeading(v, row);
        break;
      }
      case "findrep": {
        // findrep:<one|all>:<window>
        const [which] = arg.split(":");
        const o = this.app.overlay;
        if (o?.kind !== "prompt" || !o.view || !o.replace || o.replace.confirm) break;
        const replacing = which === "all" ? R.replaceAll(this.app, o, o.view) : R.replaceOne(this.app, o, o.view);
        void replacing.finally(() => this.app.host.requestRender());
        break;
      }
      case "findopt": {
        // findopt:<regex|whole|replace>:<window>
        const [which, w] = arg.split(":");
        const v = this.app.tab?.views[Number(w)];
        if (!v) break;
        const o = this.app.overlay;
        const typing = o?.kind === "prompt" && o.view === v ? o : null;
        if (which === "replace") {
          this.app.tab!.active = Number(w);
          this.app.region = "content";
          void this.app.search.toggleReplaceRow(v).then(() => this.app.host.requestRender());
          break;
        }
        this.app.search.toggleFindOpt(v, which === "regex" ? "regex" : "whole");
        if (typing?.replace) R.refresh(this.app, typing, v);
        else typing?.change?.(typing.text);
        break;
      }
      case "mode": {
        // mode:<window>:<read|lens|source> — the header's buttons (HDR-D2): that window focused (typing ended already,
        // as by every click), then its mode's command run: it switches, says why it can't, or (the selected one) does
        // nothing.
        const [w, which] = arg.split(":");
        const b = MODES.find((m) => m.id === which);
        // A floating window opened since the frame clicked was drawn: the commands act on it, not on this window.
        if (this.app.floating) break;
        const v = b ? this.focusWindow(Number(w)) : null;
        if (!b || !v) break;
        // Its refusal said once, if ending typing said it already (`App.sayingOnce`).
        void this.app.run(`view.mode_${b.id}`);
        break;
      }
      case "crumbmore":
        if (this.focusWindow(Number(arg))) void this.app.run("breadcrumb.path");
        break;
      case "crumbicon":
        if (this.focusWindow(Number(arg))) void this.app.run("outline.pick");
        break;
      // Where you are on the top bar (WSP-D4): the vault, the named folders to go into; the branch, the branches' menu.
      case "top":
        if (arg === "vault") void this.app.run("folders.open");
        else if (arg === "branch") branchMenu(this.app);
        break;
      case "status":
        // The path: its window's history, and Copy path; the arrows around it, back and forward.
        if (arg === "path" && this.app.view) this.app.history.openPathMenu();
        // The vault and its branch (GIT-D8): the branches, pull and push.
        else if (arg === "branch") branchMenu(this.app);
        else if (arg === "back" || arg === "forward") this.app.history.go(arg);
        else if (arg === "message") void this.app.run("messages.open");
        // The file's problems: the Problems panel on This file (1.7) — on All when it has none; open there, closed.
        else if (arg === "problems") {
          const tab = this.app.problems.ofFile().length ? "file" : "all";
          return this.app.problems.panel.shown && this.app.problems.panel.tab === tab
            ? this.app.problems.close()
            : this.app.problems.open(tab);
        }
        break;
      case "wk":
        void this.app.input.handleKey(arg);
        break;
      case "toast":
        this.app.dismissToasts();
        void this.app.run("messages.open");
        break;
    }
  }

  /** The tab's window `w`, focused with the content region, as a click on its header does; null when there's none. */
  private focusWindow(w: number): View | null {
    const t = this.app.tab;
    const v = t?.views[w];
    if (!t || !v) return null;
    t.active = w;
    this.app.region = "content";
    return v;
  }
}

function inRect(r: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}
