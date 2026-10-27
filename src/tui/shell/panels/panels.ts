// The side panels: their widths and rails, which view each shows (the left: explorer, history, source control; the
// right: info, outline, footnotes), resize mode, the filters typed into them, and where focus may be.

import { PanelFocus } from "./focus.ts";
import type { PanelRow } from "../../workspace/git/views/panel/gitpanel.ts";
import { match } from "../overlays/match.ts";
import { RESIZE_ACTIONS, keyChar } from "../input/keys.ts";
import type { App, SidePaneState } from "../../app/runtime/app.ts";
import type { Glyphs } from "../../../core/rendering/theme/glyphs.ts";
import type { InfoRow } from "../../documents/tools/info/info.ts";
import type { FootnoteRow } from "../../documents/tools/footnotes/footnotes.ts";
import type { HistoryRow } from "../../workspace/history/history.ts";
import type { TreeRow } from "../../workspace/explorer/explorer.ts";
import { PANEL_ROWS } from "../../documents/diagnostics/problems.ts";

export type { Region } from "./focus.ts";

/** The side panels: widths, rails, views, filters, resize mode. */
export class Panels {
  private readonly focus: PanelFocus;

  constructor(readonly app: App) {
    this.focus = new PanelFocus(app, () => this.narrow);
  }

  /** Resize mode: h j k l / arrows resize until esc (ctrl+alt+w, space w r). */
  resizeMode = false;
  /** Live side pane widths; start from config, changed in resize mode, kept in the session. */
  sideW!: number;
  outW!: number;
  /** Where each left view was when another took the panel: restored when it comes back. */
  leftPositions = new Map<LeftView, Pick<SidePaneState, "selected" | "scroll" | "left" | "pinned" | "filter">>();
  private rightPositions = new Map<
    RightView,
    Pick<SidePaneState, "selected" | "scroll" | "left" | "pinned" | "filter">
  >();

  /** The left rail's columns (one button wide, then its border), when it shows: never in zen. */
  get leftRailWidth(): number {
    return this.app.config.ui.left_rail && !this.app.ui.zen ? this.railCols : 0;
  }

  /** A rail's columns: a tinted column, one button wide; without colour to tint it, a border too. */
  get railCols(): number {
    return this.app.theme.roles.rail.bg ? RAIL_WIDTH - 1 : RAIL_WIDTH;
  }

  /** The right rail's columns (its border, then one button wide): with a note, never in zen. */
  get rightRailWidth(): number {
    return this.app.config.ui.right_rail && !this.app.ui.zen && this.app.tabs.length ? this.railCols : 0;
  }

  /** The terminal's width less the rails': what the panes and the note share. */
  get usableWidth(): number {
    return this.app.width - this.leftRailWidth - this.rightRailWidth;
  }

  contentWidth(): number {
    return (
      this.usableWidth -
      (this.sidebarBeside ? this.sidebarWidth() + 1 : 0) -
      (this.outlineBeside ? this.outlineWidth() + 1 : 0)
    );
  }

  // -------------------------------------------------------------------------------------------
  // Side panes: explorer (3.7) and outline

  /** Narrow: side panes open over the note. Never wider than two 12-column panes and the note. */
  get narrow(): boolean {
    return this.usableWidth < Math.max(this.app.config.ui.narrow_width, 2 * 13 + MIN_CONTENT);
  }

  get sidebarShown(): boolean {
    return this.focus.sidebarShown;
  }

  get sidebarBeside(): boolean {
    return this.sidebarShown && !this.narrow && !this.app.ui.zen;
  }

  get outlineShown(): boolean {
    return this.focus.outlineShown;
  }

  get outlineBeside(): boolean {
    return this.outlineShown && !this.narrow && !this.app.ui.zen;
  }

  /**
   * Side pane widths: at least 12, at most half the terminal, and never so wide together that the
   * note gets under MIN_CONTENT columns (whatever the config, resize mode or a drag asked for).
   */
  sidebarWidth(): number {
    const room = this.usableWidth - MIN_CONTENT - 1 - (this.outlineBeside ? 13 : 0);
    return Math.max(12, Math.min(this.sideW, Math.floor(this.usableWidth * 0.5), room));
  }

  outlineWidth(): number {
    const room = this.usableWidth - MIN_CONTENT - 1 - (this.sidebarBeside ? this.sidebarWidth() + 1 : 0);
    return Math.max(12, Math.min(this.outW, Math.floor(this.usableWidth * 0.5), room));
  }

  /**
   * One resize step (resize mode). What resizes follows focus: the explorer or outline width
   * when one is focused, otherwise the active window's share of the split. "Narrower" and
   * "wider" apply to the focused thing.
   */
  resizeAction(action: string): void {
    const step = 2;
    if (!(action in RESIZE_ACTIONS)) return this.app.message("error", `unknown resize action: ${action}`);
    if (action === "leave") {
      this.resizeMode = false;
      return;
    }
    if (action === "equalize") {
      const t = this.app.tab;
      if (t) t.ratio = 0.5;
      this.sideW = this.app.config.ui.sidebar_width;
      this.outW = this.app.config.ui.outline_width;
      this.app.problems.panel.height = null;
      return;
    }
    const grow = action === "wider" || action === "taller" ? 1 : -1;
    const horizontal = action === "wider" || action === "narrower";
    // The Problems panel, focused: taller and shorter, from its height as drawn.
    if (this.app.region === "problems" && this.app.problems.panel.shown) {
      if (horizontal) return this.app.message("info", "the Problems panel spans the screen: j / k resize it");
      const drawn = this.app.geometry?.problems?.h;
      return this.app.problems.resize((drawn ?? this.app.problems.panel.height ?? PANEL_ROWS) + grow);
    }
    if (this.app.region === "sidebar" && horizontal) {
      // From the drawn width, which the room left can hold below the stored one: every step shows.
      this.sideW = Math.max(12, Math.min(this.sidebarWidth() + grow * step, Math.floor(this.app.width * 0.5)));
      return;
    }
    if (this.app.region === "outline" && horizontal) {
      this.outW = Math.max(12, Math.min(this.outlineWidth() + grow * step, Math.floor(this.app.width * 0.5)));
      return;
    }
    const t = this.app.tab;
    if (!t || t.views.length < 2)
      return this.app.message(
        "info",
        "one window — resize mode sizes a split, or the explorer and outline when focused",
      );
    const side = this.app.windows.orientation(t) === "side";
    if (side !== horizontal)
      return this.app.message("info", side ? "side-by-side split: h / l resize it" : "stacked split: j / k resize it");
    const total = side ? this.contentWidth() : this.app.height;
    // Growing the first window raises the ratio; growing the second lowers it.
    const delta = ((grow * step) / Math.max(10, total)) * (t.active === 0 ? 1 : -1);
    t.ratio = Math.max(0.15, Math.min(0.85, t.ratio + delta));
  }

  showSidebar(on: boolean): void {
    this.focus.showSidebar(on);
  }

  /**
   * A right rail button, or its command (3.17): show the right panel on `view` and focus it; if
   * it's already showing that view, hide it (`cycle`: focus it first when it's open but not focused).
   * A view shown the first time starts on the cursor's place: its section, its footnote.
   */
  openRightView(view: RightView, mode: "toggle" | "cycle" = "toggle"): void {
    const showing = this.outlineShown && this.app.rightView === view;
    if (showing && mode === "cycle" && this.app.region !== "outline") {
      this.app.region = "outline";
      this.app.outline.pinned = false;
      return;
    }
    if (showing) return this.showOutline(false);
    const restored = this.switchRightView(view);
    this.app.outline.filtering = false;
    this.showOutline(true);
    this.app.region = "outline";
    if (restored) return;
    this.app.outline.filter = "";
    this.app.outline.pinned = false;
    this.app.outline.selected = Math.max(
      0,
      view === "outline"
        ? this.app.outlineView.currentSection()
        : view === "footnotes"
          ? this.app.footnotes.current()
          : 0,
    );
  }

  /** Put `view` in the right panel: each view keeps its own place, as the left panel's do. */
  switchRightView(view: RightView): boolean {
    if (this.app.rightView === view) return false;
    const o = this.app.outline;
    this.rightPositions.set(this.app.rightView, {
      selected: o.selected,
      scroll: o.scroll,
      left: o.left,
      pinned: o.pinned,
      filter: o.filter,
    });
    this.app.rightView = view;
    o.filtering = false;
    const saved = this.rightPositions.get(view);
    Object.assign(o, saved ?? { selected: 0, scroll: 0, left: 0, pinned: false, filter: "" });
    return !!saved;
  }

  showOutline(on: boolean): void {
    this.focus.showOutline(on);
  }

  /**
   * A rail button, or its command: show the left panel on `view` and focus it; if it's already
   * showing that view, hide it (`cycle`: focus it first when it's open but not focused).
   */
  openLeftView(view: LeftView, mode: "toggle" | "cycle" = "toggle"): void {
    const showing = this.sidebarShown && this.app.leftView === view;
    if (showing && mode === "cycle" && this.app.region !== "sidebar") {
      this.app.region = "sidebar";
      this.app.sidebar.pinned = false;
      return;
    }
    if (showing) return this.showSidebar(false);
    const restored = this.switchLeftView(view);
    this.app.sidebar.filtering = false;
    this.showSidebar(true);
    this.app.region = "sidebar";
    // The git panel shown again: git asked again about what it shows (VV-D10).
    if (view === "git") this.app.gitPanel.shown();
    if (restored) return;
    // Its first showing (or reopened on the same view): the current note, or the current place.
    this.app.sidebar.filter = "";
    this.app.sidebar.pinned = false;
    if (view === "explorer") this.app.explorer.reveal();
    else if (view === "git") {
      const rows = this.app.gitPanel.rows();
      this.app.gitPanel.place(
        Math.max(
          0,
          rows.findIndex((r) => r.kind !== "heading" && r.kind !== "note"),
        ),
        rows,
      );
    } else
      this.app.sidebar.selected = Math.max(
        0,
        this.app.history.rows().findIndex((r) => r.here),
      );
  }

  /**
   * Put `view` in the left panel: the view leaving keeps its position (selection, scroll, sideways
   * offset, filter text), and `view` gets back the one it had. False when it has none to restore
   * (its first showing, or already the panel's view).
   */
  switchLeftView(view: LeftView): boolean {
    if (this.app.leftView === view) return false;
    const s = this.app.sidebar;
    this.leftPositions.set(this.app.leftView, {
      selected: s.selected,
      scroll: s.scroll,
      left: s.left,
      pinned: s.pinned,
      filter: s.filter,
    });
    this.app.leftView = view;
    s.filtering = false;
    const saved = this.leftPositions.get(view);
    Object.assign(s, saved ?? { selected: 0, scroll: 0, left: 0, pinned: false, filter: "" });
    // The explorer's rows changed while it wasn't shown: its selection put where it goes now, not at its old index.
    if (view === "explorer") this.app.explorer.shownAgain();
    return !!saved;
  }

  /** Keys while the outline's filter has them: type, move, jump, clear. */
  outlineFilterKey(key: string): void {
    const o = this.app.outline;
    // The footnotes and Info views filter the same way (3.17, 3.19).
    const notes = this.app.rightView === "footnotes";
    const info = this.app.rightView === "info";
    const rows: { text: string; line?: number }[] = notes
      ? this.app.footnotes.rows()
      : info
        ? this.app.info.rows()
        : this.app.outlineView.rows();
    const typed = keyChar(key);
    const done = () => {
      o.filter = "";
      o.filtering = false;
    };
    switch (key) {
      case "escape":
      case "ctrl+c":
      case "ctrl+g":
        return done();
      case "enter": {
        const row = rows[o.selected];
        const view = this.app.view;
        done();
        if (!row || !view) return;
        if (notes) return this.app.footnotes.jumpTo(row as FootnoteRow);
        if (info) return this.app.info.openRow(row as InfoRow);
        this.app.history.push(view);
        this.app.moveCursor(view, { row: row.line!, col: 0 });
        this.app.region = "content";
        if (this.narrow || this.app.ui.zen) o.overlay = false;
        return;
      }
      case "down":
      case "ctrl+n":
      case "ctrl+j":
      case "tab":
        o.selected = Math.min(rows.length - 1, o.selected + 1);
        return;
      case "up":
      case "ctrl+p":
      case "ctrl+k":
      case "shift+tab":
        o.selected = Math.max(0, o.selected - 1);
        return;
      case "backspace":
        o.filter = [...(o.filter ?? "")].slice(0, -1).join("");
        break;
      case "ctrl+w":
      case "ctrl+backspace":
        o.filter = (o.filter ?? "").replace(/\S*\s*$/, "");
        break;
      case "ctrl+u":
        o.filter = "";
        break;
      default:
        if (typed === null) return;
        o.filter = (o.filter ?? "") + typed;
    }
    this.outlineRefiltered();
  }

  /** The right pane's filter changed (typed, pasted): the selection goes to the row that matches best. */
  outlineRefiltered(): void {
    const o = this.app.outline;
    // The heading that matches best (never a parent only kept for context).
    o.scroll = 0;
    o.pinned = false;
    const q = o.filter ?? "";
    const next: { text: string; heading?: boolean }[] =
      this.app.rightView === "footnotes"
        ? this.app.footnotes.rows()
        : this.app.rightView === "info"
          ? this.app.info.rows()
          : this.app.outlineView.rows();
    let best = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    if (q) {
      next.forEach((r, i) => {
        const m = match(q, r.text);
        if (m && m.score > bestScore) {
          bestScore = m.score;
          best = i;
        }
      });
    }
    o.selected = best;
  }

  /** Keys while the left panel's filter has them: type, move, open, clear. */
  filterKey(key: string): void | Promise<void> {
    // Using the git panel, as its own keys do (`GitPanel.touched`): its selection moved by the filter's keys too.
    if (this.app.leftView === "git") this.app.gitPanel.touched++;
    const s = this.app.sidebar;
    const rows: unknown[] =
      this.app.leftView === "explorer"
        ? this.app.explorer.rows()
        : this.app.leftView === "git"
          ? this.app.gitPanel.rows()
          : this.app.history.rows();
    const typed = keyChar(key);
    // Moved by the user: in the git panel, theirs, followed as its repositories are sorted.
    const pick = (i: number) =>
      this.app.leftView === "git" ? this.app.gitPanel.select(i, rows as PanelRow[], true) : void (s.selected = i);
    // From the row drawn selected: in the git panel, rows may have come above it since (D261).
    const at = () => (this.app.leftView === "git" ? this.app.gitPanel.selectedIn(rows as PanelRow[]) : s.selected);
    const done = () => {
      s.filter = "";
      s.filtering = false;
    };
    switch (key) {
      case "escape":
      case "ctrl+c":
      case "ctrl+g":
        done();
        if (this.app.leftView === "explorer") this.app.explorer.reveal();
        return;
      case "enter": {
        // In the git panel, the row drawn selected: gone since, nothing — the filter still typed.
        const row =
          rows[this.app.leftView === "git" ? this.app.gitPanel.steady.selected(rows as PanelRow[]) : s.selected];
        if (!row) return;
        if (this.app.leftView === "git") {
          // The rows stay filtered, the keys the panel's again: enter does what it does on the row (esc clears it).
          s.filtering = false;
          return this.app.gitPanel.action("open");
        }
        if (this.app.leftView === "history") {
          // A note read elsewhere ("recent here") opens here; a place in this window's history is gone back to.
          const h = row as HistoryRow;
          if (h.heading) return;
          done();
          if (h.recent) this.app.open(h.recent);
          else this.app.history.jump(h.index);
          this.app.region = "content";
          if (this.narrow || this.app.ui.zen) this.app.sidebar.overlay = false;
          return;
        }
        const tree = row as TreeRow;
        if (tree.kind === "dir") return;
        if (tree.kind === "root") {
          done();
          return this.app.vaults.enterRoot(tree);
        }
        done();
        this.app.openOrSwitchTab(tree.path);
        this.app.region = "content";
        if (this.narrow || this.app.ui.zen) this.app.sidebar.overlay = false;
        return;
      }
      case "down":
      case "ctrl+n":
      case "ctrl+j":
      case "tab":
        return pick(Math.min(rows.length - 1, at() + 1));
      case "up":
      case "ctrl+p":
      case "ctrl+k":
      case "shift+tab":
        return pick(Math.max(0, at() - 1));
      case "backspace":
        s.filter = [...(s.filter ?? "")].slice(0, -1).join("");
        break;
      case "ctrl+w":
      case "ctrl+backspace":
        s.filter = (s.filter ?? "").replace(/\S*\s*$/, "");
        break;
      case "ctrl+u":
        s.filter = "";
        break;
      default:
        if (typed === null) return;
        s.filter = (s.filter ?? "") + typed;
    }
    this.sidebarRefiltered();
  }

  /** The left pane's filter changed (typed, pasted): the selection goes to the first match — the first note, in the explorer. */
  sidebarRefiltered(): void {
    if (this.app.leftView === "git") this.app.gitPanel.touched++;
    const s = this.app.sidebar;
    s.scroll = 0;
    s.pinned = false;
    const next: unknown[] =
      this.app.leftView === "explorer"
        ? this.app.explorer.rows()
        : this.app.leftView === "git"
          ? this.app.gitPanel.rows()
          : this.app.history.rows();
    s.selected = Math.max(
      0,
      this.app.leftView === "explorer"
        ? next.findIndex((r) => (r as TreeRow).kind === "note")
        : this.app.leftView === "git"
          ? next.findIndex((r) => (r as PanelRow).kind !== "heading" && (r as PanelRow).kind !== "note")
          : next.findIndex((r) => !(r as HistoryRow).heading),
    );
    // The git panel's first match stays the first as its repositories are sorted.
    if (this.app.leftView === "git") this.app.gitPanel.place(s.selected, next as PanelRow[]);
  }

  /** Focus never stays on a hidden pane (after zen, a config reload, a resize): back to the note. */
  fixRegion(): void {
    this.focus.fixRegion();
  }
}

/** What the left panel shows: the file tree, the window's history, or source control (26.2). */
export type LeftView = "explorer" | "history" | "git";
/** What the right panel shows, always of the file on screen: its Info, its outline, its footnotes
 *  (more to come: comments). */
export type RightView = "info" | "outline" | "footnotes";

/**
 * The panels' views, in rail order. Each side's panel shows one view at a time; its rail has a
 * button per view (bright while that view shows), and the view's own drawing and keys decide what
 * it does. A new view is an entry here, then its rows, drawing and keys.
 */
interface PanelView<Id extends string> {
  id: Id;
  title: string;
  /** The rail button's glyph. */
  glyph: (g: Glyphs) => string;
}

export const LEFT_VIEWS: PanelView<LeftView>[] = [
  { id: "explorer", title: "Explorer", glyph: (g) => g.explorerButton },
  { id: "history", title: "History", glyph: (g) => g.historyButton },
  { id: "git", title: "Source control", glyph: (g) => g.gitButton },
];

export const RIGHT_VIEWS: PanelView<RightView>[] = [
  { id: "info", title: "Info", glyph: (g) => g.infoButton },
  { id: "outline", title: "Outline", glyph: (g) => g.outlineButton },
  { id: "footnotes", title: "Footnotes", glyph: (g) => g.footnotesButton },
];
/** The note keeps at least this many columns beside the side panes. */
const MIN_CONTENT = 24;
/** The rail: its border, then a button (a glyph with a space either side). */
const RAIL_WIDTH = 4;
