// The outline view: the note's headings (a code file's symbols) as a tree that folds, the section the cursor is in,
// the breadcrumb of headings above it.

import { match } from "../../../shell/overlays/match.ts";
import type { App, View } from "../../../app/runtime/app.ts";

/** The outline view and the breadcrumb. */
export class OutlineView {
  constructor(readonly app: App) {}

  /** Put the cursor on a heading row and scroll the window so that row is its first. */
  revealHeading(view: View, row: number): void {
    this.app.history.push(view);
    this.app.moveCursor(view, { row, col: 0 });
    const layout = this.app.currentLayout(view);
    view.top = this.app.views.clampTop(view, layout, view.cur.row);
    this.app.views.anchorTop(view, layout);
  }

  /** The headings the cursor is in, outermost first: each window's breadcrumb. */
  breadcrumb(
    view = this.app.view,
    layout = view ? this.app.currentLayout(view) : null,
  ): { text: string; line: number }[] {
    if (!view || !layout) return [];
    const hs = layout.headings;
    const chain: { text: string; line: number; level: number }[] = [];
    for (const h of hs) {
      if (h.line > view.cur.row) break;
      while (chain.length && chain[chain.length - 1]!.level >= h.level) chain.pop();
      // Drawn on one row: a setext heading's line break, or the two spaces a footnote mark leaves, fold.
      chain.push({ text: h.text.replace(/\s+/g, " "), line: h.line, level: h.level });
    }
    return chain.map(({ text, line }) => ({ text, line }));
  }

  /**
   * The breadcrumb's whole path as a dropdown under its `…` (or its icon when nothing is
   * collapsed, centred when there is no breadcrumb): picking a heading scrolls the window to it.
   */
  openHeadingPath(): void {
    const t = this.app.tab;
    const view = this.app.view;
    if (!t || !view) return;
    const chain = this.breadcrumb(view);
    if (!chain.length) return this.app.message("info", "no heading above the cursor");
    const w = t.active;
    const at = this.app.geometry?.crumbAnchors[w];
    // The selection starts on the current heading (the last), marked `here`.
    const selected = chain.length - 1;
    this.app.overlays.openList({
      title: "Path",
      items: chain.map((c, k) => ({
        label: c.text,
        indent: k,
        hint: k === chain.length - 1 ? "here" : undefined,
        data: c.line,
      })),
      selected,
      anchor: at,
      accept: (item) => {
        t.active = w;
        this.app.region = "content";
        this.revealHeading(view, item.data as number);
      },
    });
  }

  /** Visible outline rows for the current view: headings, folds applied. */
  rows(): {
    index: number;
    level: number;
    text: string;
    line: number;
    source?: number;
    hidden?: boolean;
    folded: boolean;
    hasChildren: boolean;
  }[] {
    const view = this.app.view;
    if (!view) return [];
    if (this.app.outline.forKey !== view.buf.key) {
      this.app.outline.forKey = view.buf.key;
      this.app.outline.pinned = false;
      this.app.outline.folded = new Set();
      this.app.outline.scroll = 0;
      this.app.outline.left = 0;
    }
    const hs = this.app.html.headings(view, this.app.currentLayout(view));
    const out: ReturnType<App["outlineView"]["rows"]> = [];
    // Filtering (`/`): the headings that match and the ones they sit under, folds ignored.
    const q = this.app.outline.filter ?? "";
    if (q) {
      const keep = new Set<number>();
      hs.forEach((h, i) => {
        if (!match(q, h.text)) return;
        keep.add(i);
        let level = h.level;
        for (let k = i - 1; k >= 0 && level > 1; k--) {
          if (hs[k]!.level < level) {
            keep.add(k);
            level = hs[k]!.level;
          }
        }
      });
      hs.forEach((h, i) => {
        if (keep.has(i))
          out.push({
            index: i,
            level: h.level,
            text: h.text.replace(/\s+/g, " "),
            line: h.line,
            source: h.src,
            hidden: h.hidden,
            folded: false,
            hasChildren: (hs[i + 1]?.level ?? 0) > h.level,
          });
      });
      return out;
    }
    let hideDeeperThan = Number.POSITIVE_INFINITY;
    hs.forEach((h, i) => {
      if (h.level <= hideDeeperThan) hideDeeperThan = Number.POSITIVE_INFINITY;
      else return;
      const hasChildren = (hs[i + 1]?.level ?? 0) > h.level;
      const folded = this.app.outline.folded.has(i);
      // Its text on one row (the layout keeps the heading's own, white space and all, for links).
      out.push({
        index: i,
        level: h.level,
        text: h.text.replace(/\s+/g, " "),
        line: h.line,
        source: h.src,
        hidden: h.hidden,
        folded,
        hasChildren,
      });
      if (folded && hasChildren) hideDeeperThan = h.level;
    });
    return out;
  }

  /** Index into rows() of the section the cursor is in. */
  currentSection(): number {
    const view = this.app.view;
    if (!view) return -1;
    let best = -1;
    this.rows().forEach((r, i) => {
      if (!r.hidden && r.line <= view.cur.row) best = i;
    });
    return best;
  }

  action(action: string): void {
    this.app.outline.pinned = false;
    if (action === "filter") {
      this.app.outline.filtering = true; // resumes a filter already there
      return;
    }
    const rows = this.rows();
    const row = rows[this.app.outline.selected];
    const view = this.app.view;
    switch (action) {
      case "down":
        this.app.outline.selected = Math.min(rows.length - 1, this.app.outline.selected + 1);
        break;
      case "up":
        this.app.outline.selected = Math.max(0, this.app.outline.selected - 1);
        break;
      case "top":
        this.app.outline.selected = 0;
        break;
      case "bottom":
        this.app.outline.selected = rows.length - 1;
        break;
      case "jump":
        if (row && view) {
          this.app.history.push(view);
          if (row.hidden && row.source) this.app.placeAtLine(view, row.source);
          else this.app.moveCursor(view, { row: row.line, col: 0 });
          this.app.region = "content";
          if (this.app.panels.narrow || this.app.ui.zen) this.app.outline.overlay = false;
        }
        break;
      case "fold":
        if (!row) break;
        if (row.hasChildren && !row.folded) this.app.outline.folded.add(row.index);
        else {
          // Already folded, or a leaf: go to the parent heading.
          const before = rows.slice(0, this.app.outline.selected);
          for (let i = before.length - 1; i >= 0; i--) {
            if (before[i]!.level < row.level) {
              this.app.outline.selected = i;
              break;
            }
          }
        }
        break;
      case "unfold":
        if (row) this.app.outline.folded.delete(row.index);
        break;
      case "close":
        this.app.panels.showOutline(false);
        break;
      case "leave":
        this.app.region = "content";
        if (this.app.panels.narrow || this.app.ui.zen) this.app.outline.overlay = false;
        break;
      case "rename":
        if (!row || !view) break;
        if (!view.buf.rel || !this.app.graph.notes.has(view.buf.rel))
          this.app.message("warn", "only a note of this vault has its headings renamed with their links");
        else this.app.renaming.promptHeading(view.buf.rel, row.text);
        break;
      default:
        this.app.message("error", `unknown outline action: ${action}`);
    }
  }
}
