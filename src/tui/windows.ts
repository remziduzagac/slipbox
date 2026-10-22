// Windows and tabs: a tab's one or two windows split, closed and moved between; tabs closed, pinned and moved.

import type { App, Tab } from "./app.ts";

/** Windows and tabs. */
export class Windows {
  constructor(readonly app: App) {}

  /** `:q`: this window, or its tab; the very last one quits. */
  closeOrQuit(): void | Promise<void> {
    if (this.app.floating) return this.app.overlays.leaveFloating();
    const t = this.app.tab;
    if (!t || (t.views.length <= 1 && this.app.tabs.length <= 1)) return this.app.saving.requestQuit();
    this.close();
  }

  // -------------------------------------------------------------------------------------------
  // Tabs and the split (3.3)

  split(orientation: Tab["orientation"]): void {
    // The floating window closes first: the split is of the window under it, never of the floating
    // one (its buffer isn't a file, and a tab keeping it would lose what's typed there).
    if (this.app.floating && !this.app.overlays.closeFloating()) return;
    const t = this.app.tab;
    const view = this.app.tabView;
    if (!t || !view || view.buf.virtual) return;
    t.orientation = orientation;
    if (t.views.length === 1) {
      t.views.push(this.app.makeView(view.buf, { ...view.topAnchor }, { ...view.curAnchor }));
      t.active = 1;
    }
  }

  /** Focus the split's other window, splitting first when there's one: where "in the split" opens. */
  other(): void {
    if (this.app.floating && !this.app.overlays.closeFloating()) return;
    const t = this.app.tab;
    if (!t) return;
    if (t.views.length === 1) this.split(t.orientation ?? "side");
    else t.active = 1 - t.active;
  }

  close(): void | Promise<void> {
    if (this.app.floating) return this.app.overlays.leaveFloating();
    const t = this.app.tab;
    if (!t) return;
    if (t.views.length > 1) {
      const closed = t.views.splice(t.active, 1)[0]!;
      // The scratch on the right, closed: what was typed in it saved, as when it floats (#43).
      if (closed.buf.abs === this.app.scratch.location().path) {
        this.app.scratch.tidy(closed.buf);
        if (closed.buf.dirty) this.app.saving.save(closed.buf);
      }
      this.app.history.remember(closed);
      t.active = 0;
      return;
    }
    if (this.app.tabs.length > 1) return this.closeTab();
    this.app.message("info", "last window — ctrl+q quits");
  }

  closeTab(): void {
    if (this.app.tabs.length <= 1) return this.app.message("info", "last tab — ctrl+q quits");
    const t = this.app.tabs.splice(this.app.activeTab, 1)[0]!;
    for (const v of t.views) this.app.history.remember(v);
    this.app.activeTab = Math.min(this.app.activeTab, this.app.tabs.length - 1);
  }

  /** Keep only this tab (`:tabonly`) and the pinned ones. The notes' buffers stay, unsaved
   *  changes and all. */
  closeOtherTabs(): void {
    const t = this.app.tab;
    if (!t) return;
    const gone = this.app.tabs.filter((x) => x !== t && !x.pinned);
    if (!gone.length)
      return this.app.message("info", this.app.tabs.length > 1 ? "the other tabs are pinned" : "only one tab");
    for (const other of gone) for (const v of other.views) this.app.history.remember(v);
    this.app.tabs = this.app.tabs.filter((x) => x === t || x.pinned);
    this.app.activeTab = this.app.tabs.indexOf(t);
    this.app.message("info", `closed ${gone.length} other tab${gone.length === 1 ? "" : "s"}`);
  }

  /** Close every tab but the pinned ones; with none left, the "no note open" page, the explorer
   *  focused to open one. */
  closeAllTabs(): void {
    if (!this.app.tabs.length) return;
    const t = this.app.tab;
    for (const x of this.app.tabs) if (!x.pinned) for (const v of x.views) this.app.history.remember(v);
    this.app.tabs = this.app.tabs.filter((x) => x.pinned);
    if (this.app.tabs.length) {
      this.app.activeTab = t?.pinned ? this.app.tabs.indexOf(t) : this.app.tabs.length - 1;
      return this.app.message("info", "closed the tabs that aren't pinned");
    }
    this.app.activeTab = 0;
    this.app.panels.showSidebar(true);
    this.app.region = "sidebar";
  }

  /** Pin or unpin this tab: pinned tabs keep together at the left, in the order pinned. */
  togglePin(): void {
    const t = this.app.tab;
    if (!t) return;
    const rest = this.app.tabs.filter((x) => x !== t);
    t.pinned = !t.pinned;
    const firstUnpinned = rest.findIndex((x) => !x.pinned);
    const at = firstUnpinned < 0 ? rest.length : firstUnpinned; // the pinned group's end
    rest.splice(at, 0, t);
    this.app.tabs = rest;
    this.app.activeTab = at;
    this.app.message("info", t.pinned ? "pinned: links open in new tabs, close others / all keep it" : "unpinned");
  }

  /** Move this tab one place, within its group (pinned tabs stay left of the others). */
  moveTab(dir: -1 | 1): void {
    const i = this.app.activeTab;
    const j = i + dir;
    const t = this.app.tabs[i];
    const other = this.app.tabs[j];
    if (!t || !other || !!other.pinned !== !!t.pinned) return;
    [this.app.tabs[i], this.app.tabs[j]] = [other, t];
    this.app.activeTab = j;
  }

  /** Move focus in a direction: between the two windows, and out to the side panes. */
  focus(dir: "left" | "right" | "up" | "down"): void {
    const t = this.app.tab;
    if (this.app.region === "sidebar") {
      if (dir === "right") this.app.region = "content";
      return;
    }
    if (this.app.region === "outline") {
      if (dir === "left") this.app.region = "content";
      return;
    }
    if (!t) return;
    const side = t.views.length > 1 && this.orientation(t) === "side";
    const stacked = t.views.length > 1 && !side;
    if (dir === "left") {
      if (side && t.active === 1) t.active = 0;
      else if (this.app.panels.sidebarShown) this.app.region = "sidebar";
    } else if (dir === "right") {
      if (side && t.active === 0) t.active = 1;
      else if (this.app.panels.outlineShown) this.app.region = "outline";
    } else if (stacked) t.active = dir === "up" ? 0 : 1;
  }

  /** Move the active window to a side, choosing the split's orientation. */
  move(dir: "left" | "right" | "up" | "down"): void {
    const t = this.app.tab;
    if (!t || t.views.length < 2) return this.app.message("info", "only one window — ctrl+w v splits");
    t.orientation = dir === "left" || dir === "right" ? "side" : "stacked";
    const want = dir === "left" || dir === "up" ? 0 : 1;
    if (t.active !== want) {
      t.views.reverse();
      t.active = want;
    }
  }

  orientation(t: Tab): Tab["orientation"] {
    return t.orientation === "side" && this.app.panels.contentWidth() < 80 ? "stacked" : t.orientation;
  }

  /** Close a tab by index; the tab you're on stays active (shifted if one before it closed). */
  closeTabAt(index: number): void {
    if (index < 0 || index >= this.app.tabs.length) return;
    if (index === this.app.activeTab) return this.closeTab();
    if (this.app.tabs.length <= 1) return;
    const [t] = this.app.tabs.splice(index, 1);
    for (const v of t!.views) this.app.history.remember(v);
    if (index < this.app.activeTab) this.app.activeTab--;
  }
}
