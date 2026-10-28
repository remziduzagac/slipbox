// The mouse: a click, a drag and the wheel, wherever they land — the text, a pane, a scrollbar, a tab, a button, an
// overlay — by the geometry the last draw left.

import { stopInsert } from "../../documents/editing/editing.ts";
import { gitClick, gitRightClick, signClick } from "../../workspace/git/views/panel/gitmouse.ts";
import type { Geometry } from "../screen/draw.ts";
import type { App } from "../../app/runtime/app.ts";
import { MouseGestures } from "./mouse/gestures.ts";
import { MouseRouting } from "./mouse/routing.ts";
import { inRect } from "./mouse/geometry.ts";

/** The mouse: clicks, drags, the wheel. */
export class Mouse {
  private readonly gestures: MouseGestures;
  private readonly routing: MouseRouting;
  constructor(readonly app: App) {
    this.gestures = new MouseGestures(app);
    this.routing = new MouseRouting(app);
  }

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

  leaveVault(): void {
    this.gestures.drag = null;
    this.gestures.lastClick = null;
    this.hover = null;
  }

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
    if (this.app.overlay) return this.routing.overlay(ev, g);
    if (ev.type === "scroll") return this.routing.wheel(ev, g);
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
    if (ev.type === "drag" && this.gestures.drag) return this.gestures.dragTo(ev, g);
    if ((ev.type === "up" || ev.type === "drag-end") && this.gestures.drag) return this.gestures.up();
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
    const clicks = this.gestures.clicks(ev);
    if (clicks === 0) {
      this.gestures.drag = null;
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
      this.gestures.drag = { kind: "separator", sep: panelRule };
      return;
    }
    // The git panel's own: its rows, their buttons, its message box and buttons (GIT-D8).
    if (hot?.startsWith("git:") && gitClick(this.app, hot, clicks)) return;
    // A change's sign in the gutter (GIT-D12): the change, with Revert and Stage.
    if (hot?.startsWith("gsign:")) {
      const pane = g.panes.find((p) => p.x <= ev.x && ev.x < p.x + p.w && p.y <= ev.y && ev.y < p.y + p.h);
      const t = this.app.tab;
      if (pane && t && !this.app.floating && this.routing.focusWindow(t.views.indexOf(pane.view)))
        signClick(this.app, pane.view, Number(hot.slice(6)), { x: ev.x + 1, y: ev.y });
      return;
    }
    if (hot && !hot.startsWith("tab:")) return this.routing.clickHot(hot);
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
      this.gestures.drag = { kind: "tab", index: tab.index };
      return;
    }
    // A side pane's own scrollbars first: they sit inside the pane, and focus it like any click there.
    const paneBar = g.scrollbars.find((b) => b.pane && inRect(b, ev.x, ev.y));
    if (paneBar) {
      this.app.region = paneBar.pane!;
      this.gestures.drag = { kind: "scrollbar", bar: paneBar };
      this.gestures.scrollbarTo(paneBar, ev.y, ev.x);
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
      this.gestures.drag = { kind: "separator", sep };
      return;
    }
    const bar = g.scrollbars.find((b) => inRect(b, ev.x, ev.y));
    if (bar) {
      this.gestures.drag = { kind: "scrollbar", bar };
      this.gestures.scrollbarTo(bar, ev.y, ev.x);
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
      this.gestures.lastClick = null;
      this.gestures.drag = {
        kind: "picture",
        view: pane.view,
        row: pic.row,
        file: pic.file,
        x: ev.x,
        y: ev.y,
        ctrl: !!ev.ctrl,
      };
      return;
    }
    this.gestures.press(ev, pane, clicks);
  }
  clickHot(id: string): void {
    this.routing.clickHot(id);
  }
}
