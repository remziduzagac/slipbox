// Overlay, wheel and hot-region routing through the original App interactions.
import * as R from "../../../documents/search/replacing.ts";
import { saveAsMouse } from "../../../documents/saving/saveas.ts";
import { dialogMouse } from "../../overlays/dialog.ts";
import type { Geometry } from "../../screen/draw.ts";
import type { App, View } from "../../../app/runtime/app.ts";
import { type LeftView, LEFT_VIEWS } from "../../panels/panels.ts";
import { codeBlocks } from "../../../documents/views/code.ts";
import { extentOf } from "../../../../core/rendering/layout/ir.ts";
import { selectable } from "../../overlays/overlays.ts";
import { MODES } from "../modes.ts";
import { inRect } from "./geometry.ts";

export class MouseRouting {
  constructor(readonly app: App) {}
  overlay(ev: { type: string; x: number; y: number; scroll?: { direction: string } }, g: Geometry): void {
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

  wheel(
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
      case "caption": {
        const [window, row, action] = arg.split(":");
        const view = this.app.floating?.view ?? this.focusWindow(Number(window));
        if (view && ["path", "caption", "image"].includes(action!)) void this.app.run(`picture.copy_${action} ${row}`);
        break;
      }
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
        if (arg === "zoom") void this.app.run("explorer.focus");
        else if (arg === "changed") void this.app.run("git.focus");
        else if (arg === "work") void this.app.run("background.open");
        else if (arg === "version" || arg === "upgrade") void this.app.run("app.about");
        else if (arg === "vault") void this.app.run("folders.open");
        else if (arg === "branch") void this.app.run("git.menu");
        break;
      case "status":
        // The path: its window's history, and Copy path; the arrows around it, back and forward.
        if (arg === "path" && this.app.view) this.app.history.openPathMenu();
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
  focusWindow(w: number): View | null {
    const t = this.app.tab;
    const v = t?.views[w];
    if (!t || !v) return null;
    t.active = w;
    this.app.region = "content";
    return v;
  }
}
