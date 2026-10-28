// Explorer zoom, reveal and selection transitions keep their live state in the owning controller.
import { statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { folderUnreadable } from "../../../core/foundation/platform/fsutil.ts";
import { tildePath } from "../../../core/workspace/vaults/names.ts";
import { homeFolder, isInside, isVaultRoot, locationAt } from "../../../core/workspace/vaults/vault.ts";
import type { ExplorerNavigationHost, ExplorerCrumb } from "./contracts.ts";
import { listedDown } from "./rows/paths.ts";

export class ExplorerNavigation {
  constructor(
    private readonly host: ExplorerNavigationHost,
    private readonly hasTree: () => boolean,
  ) {}
  get app() {
    return this.host.app;
  }

  /**
   * Where the selection goes when the explorer's shown again, its rows having changed while it wasn't (a note revealed,
   * the view zoomed out to hold it, its folder gone): a row's path, else the first — not the index it had, which is
   * another row's now. For the vault it was noted in.
   */
  private later: { root: string; path: string | null } | null = null;

  private crumbsMemo: { key: string; list: ExplorerCrumb[] } | null = null;

  /** Select the row at `path` (a row path): now, or once its folder's listing comes (`wanted`); `fallback` meanwhile. */
  selectRow(path: string, fallback?: number): void {
    const at = this.host.rows().findIndex((r) => r.path === path);
    this.host.wanted = null;
    if (at >= 0) this.app.sidebar.selected = at;
    else {
      if (fallback !== undefined) this.app.sidebar.selected = fallback;
      this.host.wanted = { path, at: this.app.sidebar.selected };
    }
  }

  /** Select a path in the explorer, unfolding its folders. */
  select(rel: string): void {
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i++) this.host.expanded.add(parts.slice(0, i).join("/"));
    this.host.invalidateTree();
    // Hidden, its rows aren't under the filter of the view shown: the path looked for in its tree.
    const at = (this.shown() ? this.host.rows() : this.host.treeRows()).findIndex((r) => r.path === rel);
    if (at < 0) return;
    if (this.shown()) this.app.sidebar.selected = at;
    else this.hold(rel);
  }

  /**
   * The explorer is the left panel's view: only then are the panel's selection, scroll and pin its own to set — the
   * git panel's are kept to by their rows (D261); its own, its rows changed meanwhile, are put right when it's shown
   * again (`later`, `shownAgain`).
   */
  private shown(): boolean {
    return this.app.leftView === "explorer";
  }

  /** Its selection to go to `path` (or the first row) when it's shown again; `keep`, unless one's noted already. */
  private hold(path: string | null, keep = false): void {
    if (keep && this.later?.root === this.app.loc.root) return;
    this.later = { root: this.app.loc.root, path };
  }

  /**
   * Shown again, its place restored (`switchLeftView`): the selection put where `later` says, scrolled to — not in
   * another vault, nor under a filter, whose rows are every note matching it, the same whatever the view.
   */
  shownAgain(): void {
    const later = this.later;
    this.later = null;
    if (!later || later.root !== this.app.loc.root || this.app.sidebar.filter) return;
    this.app.sidebar.pinned = false;
    this.app.sidebar.scroll = 0;
    if (later.path === null) this.app.sidebar.selected = 0;
    else this.selectRow(later.path, 0);
  }

  /**
   * The view at `dir` (VV-D5), on purpose — `z`, the breadcrumb, `-`, the folder opened. Zoomed out,
   * the folders down to the one it showed are unfolded and that one selected; the breadcrumb keeps
   * the folders past the view it can zoom back into while the view is on their way.
   */
  zoomTo(dir: string): void {
    const from = this.host.top;
    if (dir === from) return;
    const why = folderUnreadable(dir);
    if (why) return this.app.message("warn", `can't read ${tildePath(dir)}: ${why}`);
    this.host.top = dir;
    if (!isInside(dir, this.host.trail)) this.host.trail = dir;
    const out = isInside(dir, from);
    if (out) for (let d = from; d !== dir; d = dirname(d)) this.host.expanded.add(this.host.rowPath(d));
    this.host.invalidateTree();
    if (!this.shown()) {
      this.hold(out ? this.host.rowPath(from) : null);
      return;
    }
    this.app.sidebar.pinned = false;
    this.app.sidebar.scroll = 0;
    if (out) this.selectRow(this.host.rowPath(from), 0);
    else this.app.sidebar.selected = 0;
  }

  /** `-`: the view a folder up (VV-D5), the folder it showed unfolded in it and selected. */
  zoomOut(): void {
    const up = dirname(this.host.top);
    if (up === this.host.top) return this.app.message("info", "the explorer is zoomed out fully: nothing is above /");
    this.zoomTo(up);
  }

  /** `z`: the view zoomed in on the selected folder or vault — a file's, its folder (VV-D5). */
  zoomIn(): void {
    const row = this.host.rows()[this.app.sidebar.selected];
    if (!row || this.app.sidebar.filter) return this.app.message("info", "zoom in: select a folder");
    const abs = this.host.rowAbs(row);
    const dir = row.kind === "note" ? dirname(abs) : abs;
    if (dir === this.host.top) return this.app.message("info", "zoom in: select a folder in the view");
    this.zoomTo(dir);
  }

  /**
   * Gone to `abs` (VV-D5): a file opened, a vault gone into. Outside the view, the view zooms out to
   * the common parent of the two, only their paths unfolded — what was unfolded in the old view kept —
   * and the breadcrumb leads back to where you went. Never for what the tree doesn't list: a hidden
   * folder's file, slipbox's own (the scratch); a busy folder's is listed (VV-D8). True when the view
   * holds it now.
   */
  zoomToHold(abs: string, dir = dirname(abs)): boolean {
    const T = this.host.top;
    if (isInside(T, abs)) return true;
    let common = T;
    while (!isInside(common, abs) && dirname(common) !== common) common = dirname(common);
    if (!isInside(common, abs)) return false;
    if (!listedDown(common, abs, this.app.ui.hidden_files) || abs === this.app.scratch.location().path) return false;
    // Only the two paths unfolded: what was unfolded in the old view stays, nothing else.
    const kept = [...this.host.expanded].filter((k) => isInside(T, this.host.rowAbs({ path: k })));
    this.host.expanded = new Set(kept);
    for (let d = T; d !== common; d = dirname(d)) this.host.expanded.add(this.host.rowPath(d));
    for (let d = dir; d !== common && isInside(common, d); d = dirname(d)) this.host.expanded.add(this.host.rowPath(d));
    this.host.top = common;
    this.host.trail = dir;
    this.host.invalidateTree();
    if (this.shown()) this.app.sidebar.scroll = 0;
    else this.hold(null, true);
    return true;
  }

  /** The breadcrumb over the explorer (VV-D5): the folders down to the view, then those past it it can zoom back into. */
  crumbs(): { abs: string; label: string; vault: boolean; current: boolean; past: boolean }[] {
    if (!this.hasTree()) this.keepToWhatsThere();
    const key = `${this.host.top}\n${this.host.trail}\n${this.app.loc.root}`;
    if (this.crumbsMemo?.key === key) return this.crumbsMemo.list;
    const home = homeFolder();
    const trail = isInside(this.host.top, this.host.trail) ? this.host.trail : this.host.top;
    // From `~` when the view is in home, else from `/`: the view is always one of its folders.
    const top = isInside(home, this.host.top) ? home : sep;
    const dirs = [top];
    const rel = relative(top, trail);
    if (rel) for (const p of rel.split(sep)) dirs.push(join(dirs.at(-1)!, p));
    const list = dirs.map((abs) => ({
      abs,
      label: abs === sep ? "/" : abs === top ? "~" : basename(abs),
      vault: abs === this.app.loc.root ? this.app.loc.mode === "vault" : isVaultRoot(abs),
      current: abs === this.app.loc.root,
      past: abs !== this.host.top && isInside(this.host.top, abs),
    }));
    this.crumbsMemo = { key, list };
    return list;
  }

  /**
   * `shift+h` (`explorer.toggle_hidden`, `:hidden`): hidden files and folders listed, or not — `files.hidden` changed
   * as the UI settings change one, kept for the vault until its config value changes — said; the selection stays on
   * its row. Hidden again, a view in a hidden folder goes out to the folder holding it.
   */
  toggleHidden(): void {
    const shown = !this.app.ui.hidden_files;
    const mine = this.app.leftView === "explorer" && !this.app.sidebar.filter;
    const at = mine ? this.host.rows()[this.app.sidebar.selected]?.path : undefined;
    this.app.settings.setUi("hidden_files", shown);
    if (!shown) {
      // The highest hidden folder on the view's way that isn't the vault open's own way (a vault in ~/.dotfiles).
      let out: string | null = null;
      for (let d = this.host.top; dirname(d) !== d; d = dirname(d))
        if (basename(d).startsWith(".") && !isInside(d, this.app.loc.root)) out = dirname(d);
      if (out) this.zoomTo(out);
    }
    if (mine) {
      const rows = this.host.rows();
      const again = rows.findIndex((r) => r.path === at);
      this.app.sidebar.selected =
        again >= 0 ? again : Math.min(this.app.sidebar.selected, Math.max(0, rows.length - 1));
    }
    this.app.message("info", shown ? "explorer: hidden files shown" : "explorer: hidden files not shown");
  }

  /** A folder moved (18.3, 18.7): the view and the trail in it go with it, as its folds do. */
  followMove(from: string, to: string): void {
    // Its listings let go of, and the folders it left and came into listed again (T12): none is as it was listed.
    this.host.listings.forget(from);
    this.host.listings.stale(dirname(from));
    this.host.listings.stale(dirname(to));
    const shift = (abs: string) => (abs && isInside(from, abs) ? to + abs.slice(from.length) : abs);
    this.host.top = shift(this.host.top);
    this.host.trail = shift(this.host.trail);
    this.host.invalidateTree();
  }

  /**
   * The view and the trail on folders that are there (VV-D5), asked as the tree is built again: one deleted, or renamed
   * or moved outside slipbox, gives way to its nearest folder still there — the view's said.
   */
  keepToWhatsThere(): void {
    // Gone: not there, or a file now. One that can't be asked (no permission on its way) is left as it is.
    const there = (dir: string) => {
      try {
        return statSync(dir).isDirectory();
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        return code !== "ENOENT" && code !== "ENOTDIR";
      }
    };
    const nearest = (dir: string) => {
      let d = dir;
      while (!there(d) && dirname(d) !== d) d = dirname(d);
      return d;
    };
    if (this.host.trail && !there(this.host.trail)) this.host.trail = nearest(this.host.trail);
    if (!this.host.top || there(this.host.top)) return;
    const gone = this.host.top;
    this.host.top = nearest(gone);
    if (!isInside(this.host.top, this.host.trail)) this.host.trail = this.host.top;
    if (this.shown()) {
      this.app.sidebar.pinned = false;
      this.app.sidebar.scroll = 0;
      this.app.sidebar.selected = 0;
    } else this.hold(null);
    this.app.message("info", `${tildePath(gone)} isn't there any more: the view is on ${tildePath(this.host.top)}`);
  }

  /**
   * The note on screen (or `rel`: in the vault, "." its top, or absolute) shown in the explorer: its
   * folders unfolded, its row selected; `open` a folder's own too. Outside the view it isn't shown —
   * unless it was gone to (`zoom`): the view then zooms out to hold it (VV-D5).
   */
  reveal(rel?: string | null, open = false, zoom = false): void {
    if (this.shown()) this.app.sidebar.pinned = false;
    const v = this.app.view;
    const abs =
      rel === undefined
        ? v && !v.buf.virtual
          ? v.buf.abs
          : null
        : rel
          ? isAbsolute(rel)
            ? rel
            : join(this.app.loc.root, rel === "." ? "" : rel)
          : null;
    if (!abs) return;
    if (!isInside(this.host.top, abs) && !(zoom && this.zoomToHold(abs, open ? abs : dirname(abs)))) return;
    const view = this.host.top;
    for (let d = open ? abs : dirname(abs); d !== view && isInside(view, d); d = dirname(d))
      this.host.expanded.add(this.host.rowPath(d));
    this.host.invalidateTree();
    if (!this.shown()) {
      this.hold(abs === view ? null : this.host.rowPath(abs));
      return;
    }
    if (abs === view) this.app.sidebar.selected = 0;
    else this.selectRow(this.host.rowPath(abs));
  }

  /**
   * A link to a folder followed (21.2): the folder revealed in the explorer, unfolded, the explorer
   * focused — in its own vault when it's outside this one (that vault's, or the folder opened); outside
   * the view, the view zooms out to hold it (VV-D5).
   */
  revealFolder(path: string): void {
    if (isAbsolute(path)) {
      // Its vault: a marker's, home (VV-D2) — the folder gone into by name, its notes there at once — else the plain
      // folder.
      if (!this.app.vaults.switchVault(locationAt(path), null, undefined, { folder: path })) return;
      path = relative(this.app.loc.root, path) || ".";
    }
    this.app.panels.switchLeftView("explorer");
    this.app.sidebar.filter = "";
    this.app.sidebar.filtering = false;
    this.app.panels.showSidebar(true);
    this.reveal(path, true, true);
    this.app.region = "sidebar";
  }
}
