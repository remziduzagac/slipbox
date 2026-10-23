// The explorer (VV-D5): one tree, the vault's files and the folders around it, and the view — the part of it shown,
// zoomed into and out of along its breadcrumb; its rows, its keys, its item menu. What the walk didn't give is read
// from the disk (`explorer-disk.ts`, VV-D8); a row's marks are `marks.ts`' (VV-D9).

import ignore from "ignore";
import { classify, type FileGroup } from "../core/filetypes.ts";
import { type Dirent, readdirSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, posix, relative, sep } from "node:path";
import { folderUnreadable } from "../core/fsutil.ts";
import { MARKER } from "../core/registry.ts";
import { tildePath } from "../core/names.ts";
import { hasMarker, homeFolder, isInside, isListed, isVaultRoot, locationAt } from "../core/vault.ts";
import { isLink, linkScope, linkStateAt, linkTarget } from "../core/symlinks.ts";
import { type FolderListing, type ListedEntry, vaultName } from "../core/listing.ts";
import { ANOTHER_DISK, busyFolderAt, LINK_REASON } from "../core/walk.ts";
import { match } from "./match.ts";
import { prettyKey } from "./keys.ts";
import type { App, ListItem } from "./app.ts";
import { type DiskEntry, fromDisk, listsName } from "./explorer-disk.ts";
import { Listings } from "./listings.ts";
import { Marks } from "./marks.ts";

/** The explorer: its tree, its view and breadcrumb, its keys. */
export class Explorer {
  /** The folders it lists a level at a time, as read off the main thread (T12); read here, at once, in a test's App. */
  listings: Listings;

  constructor(readonly app: App) {
    this.listings = new Listings(app);
  }

  /** Its rows' marks (VV-D9). */
  get marks(): Marks {
    return (this.marksOf ??= new Marks(this.app));
  }
  private marksOf: Marks | null = null;

  expanded = new Set<string>();
  /**
   * The explorer's view (VV-D5): the folder whose tree it shows, absolute — the folder opened, or the
   * vault's top. It zooms out by itself when you go somewhere outside it, in only when asked; above
   * the vault open, a folder is listed a level at a time (never walked).
   */
  top = "";
  /**
   * The breadcrumb's deepest folder (absolute): the view, or a folder in it the breadcrumb can zoom
   * back into — the view zoomed out from, or where you went when it zoomed out by itself.
   */
  trail = "";
  private tree: TreeRow[] | null = null;

  /** What the explorer's selected row names: a note or file, a folder, or a vault nested in this
   *  one (its folder); the rows outside its own tree name nothing to change. */
  item(): ExplorerItem | null {
    if (this.app.leftView !== "explorer") return null;
    const row = this.rows()[this.app.sidebar.selected];
    if (!row) return null;
    // Above the vault, beside it, in another (VV-D5), the vault itself: not this one's to rename, move or delete here;
    // nor a link the walk didn't go through (VV-D6).
    if (row.outside || row.root?.here || row.link?.reason) return null;
    if (row.kind === "root")
      return row.root?.kind === "vault" && this.app.loc.mode !== "folder"
        ? { rel: row.path, dir: true, vault: true }
        : null;
    return { rel: row.path, dir: row.kind === "dir" };
  }

  /**
   * A row to select once it's listed (T12): one the explorer meant to select in a folder still being read — the folder
   * zoomed out from, a note revealed. Selected by `Listings` when the rows come, unless the selection moved since.
   */
  wanted: { path: string; at: number } | null = null;

  /** Select the row at `path` (a row path): now, or once its folder's listing comes (`wanted`); `fallback` meanwhile. */
  selectRow(path: string, fallback?: number): void {
    const at = this.rows().findIndex((r) => r.path === path);
    this.wanted = null;
    if (at >= 0) this.app.sidebar.selected = at;
    else {
      if (fallback !== undefined) this.app.sidebar.selected = fallback;
      this.wanted = { path, at: this.app.sidebar.selected };
    }
  }

  /** Select a path in the explorer, unfolding its folders. */
  select(rel: string): void {
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i++) this.expanded.add(parts.slice(0, i).join("/"));
    this.invalidateTree();
    const at = this.rows().findIndex((r) => r.path === rel);
    if (at >= 0) this.app.sidebar.selected = at;
  }

  /**
   * The selected row's menu (its `…` button, `.`): what can be done to it, each with its key in the
   * explorer, which picks it here too. It hangs from the button (by key without one: the row).
   */
  openItemMenu(): void {
    const item = this.item();
    if (!item) return this.app.message("info", "menu: select a note, file or folder first");
    const actions: [string, string][] = [];
    if (item.dir) actions.push(["zoom_in", "Zoom in here"]);
    if (item.dir && !item.vault) actions.push(["new_note", "New note here"], ["new_folder", "New folder here"]);
    actions.push(["rename", item.vault ? "Rename the folder" : "Rename"]);
    if (item.vault) actions.push(["rename_root", "Name it"]);
    actions.push(["move", "Move to…"], ["copy", "Copy"], ["cut", "Cut"], ["copy_path", "Copy path"]);
    if (item.dir)
      actions.push(
        item.vault ? ["unmake_root", "Make it part of the vault holding it"] : ["make_root", "Give it .slipbox/"],
      );
    if (this.app.files.clip)
      actions.push([
        "paste",
        this.app.files.clip.mode === "cut"
          ? `Paste ${posix.basename(this.app.files.clip.rel)} here (move)`
          : `Paste a copy of ${posix.basename(this.app.files.clip.rel)} here`,
      ]);
    actions.push(["delete", item.vault ? "Delete the vault" : "Delete"]);
    const items: ListItem[] = actions.map(([action, label]) => {
      const key = this.app.explorerKeys.keysFor(action)[0];
      const shifted = key ? /^shift\+(.)$/.exec(key) : null;
      const hotkey = shifted ? shifted[1]!.toUpperCase() : key && [...key].length === 1 ? key : undefined;
      return {
        label,
        hint: hotkey ?? (key ? prettyKey(key, this.app.leader) : undefined),
        ...(hotkey ? { hotkey } : {}),
        data: action,
      };
    });
    const g = this.app.geometry;
    const button = g?.hot.find((h) => h.id === "xrow:menu");
    const anchor = button
      ? { x: button.x, y: button.y }
      : g?.sidebar
        ? { x: g.sidebar.x + 2, y: g.sidebar.y + this.app.sidebar.selected - this.app.sidebar.scroll }
        : undefined;
    this.app.overlays.openList({
      title: `${posix.basename(item.rel)}${item.dir ? "/" : ""}`,
      items,
      filterable: false,
      anchor,
      menu: true,
      accept: (it) => {
        this.app.region = "sidebar";
        this.itemAction(it.data as string, item);
      },
    });
  }

  /** An explorer action on a note, file, folder or nested vault: its keys' and its menu's. */
  itemAction(action: string, item: ExplorerItem): void | Promise<void> {
    const folder = item.dir ? item.rel : posix.dirname(item.rel) === "." ? "" : posix.dirname(item.rel);
    switch (action) {
      // On the selected row, as their keys are (`z`, `shift+y`): the menu leaves the selection where it was.
      case "zoom_in":
      case "copy_path":
        return this.action(action);
      case "rename":
        return this.app.files.renameItem(item);
      case "rename_root":
        return this.app.vaults.renameItem(item);
      case "move":
        return this.app.files.moveItem(item);
      case "delete":
        return this.app.files.deleteItem(item);
      case "copy":
      case "cut":
        return this.app.files.clipItem(action, item);
      case "paste":
        return this.app.files.pasteItem();
      case "new_note":
        return this.app.files.promptNewNote(folder);
      case "new_folder":
        return this.app.files.promptNewFolder(folder);
      case "make_root":
        return item.dir && !item.vault
          ? this.app.vaults.makeItem(item)
          : this.app.message(
              "info",
              item.vault
                ? `${item.rel} is a vault already — shift+v makes it part of the vault holding it`
                : "give a folder .slipbox/: select a folder first",
            );
      case "unmake_root":
        return item.vault
          ? this.app.vaults.unmakeItem(item)
          : this.app.message(
              "info",
              "to make a vault part of this one, select a nested vault (its folder has its own icon)",
            );
    }
  }

  /** Whether the explorer has the keys (its tree shown and focused). */
  focused(): boolean {
    return this.app.region === "sidebar" && this.app.panels.sidebarShown && this.app.leftView === "explorer";
  }

  /** What `space n …` acts on (18.13): the explorer's selected note or file when it has focus, else
   *  this note; null (and said) without one. */
  noteTarget(): ExplorerItem | null {
    if (this.focused()) {
      const item = this.item();
      if (item && !item.dir) return item;
      this.app.message("info", "space n acts on a note: select one (space d on a folder)");
      return null;
    }
    const rel = this.app.view?.buf.rel ?? null;
    if (rel === null) this.app.message("info", "open a note of this vault, or select one in the explorer");
    return rel === null ? null : { rel, dir: false };
  }

  /** What `space d …` acts on (18.13): the explorer's selected folder (or vault, or a file's folder)
   *  when it has focus, else this note's folder; null (and said) at the vault's root. */
  folderTarget(): ExplorerItem | null {
    const item = this.focused()
      ? this.item()
      : this.app.view?.buf.rel
        ? { rel: this.app.view.buf.rel, dir: false }
        : null;
    if (item?.dir) return item;
    const folder = item ? posix.dirname(item.rel) : ".";
    if (folder !== ".") return { rel: folder, dir: true };
    this.app.message(
      "info",
      item
        ? `${item.rel} is at the vault's top: select a folder in the explorer`
        : "select a folder in the explorer, or open a note in one",
    );
    return null;
  }

  /**
   * The files beyond notes the explorer and the switcher list (16.5): by `files.show` — or all
   * text files while the explorer's toggle is on — then `files.include` patterns always, and
   * `files.exclude` never. Binary files are never listed.
   */
  shownFiles(): { path: string; group: FileGroup }[] {
    const lists = this.listsFiles();
    const out: { path: string; group: FileGroup }[] = [];
    for (const path of this.app.graph.filePaths()) {
      const { group } = classify(path, this.app.config.walk.extensions);
      if (lists(path, group)) out.push({ path, group });
    }
    return out;
  }

  /** Whether the explorer lists a file of the vault, by its path in it and its kind: `shownFiles`' rule. */
  private listsFiles(): (path: string, group: FileGroup) => boolean {
    const f = this.app.config.files;
    const mode = this.app.sidebar.allFiles ? "all" : this.filesShown();
    const incl = f.include.length ? ignore().add(f.include) : null;
    const excl = f.exclude.length ? ignore().add(f.exclude) : null;
    return (path, group) => {
      if (group === "note") return true;
      if (group === "binary" || excl?.ignores(path)) return false;
      return !!incl?.ignores(path) || mode === "all" || (mode === "renderable" && group === "data");
    };
  }

  /** A vault's name beside its folder's, when it has another one (17.13); none for a worktree, every one of which has
   *  its repository's: its branch tells them apart (17.19), among the row's marks (VV-D9, `marks.ts`). */
  private rootName(abs: string): string | undefined {
    return vaultName(abs);
  }

  /**
   * What `files.show` lists here: `auto` — notes and data files in a notes root (one with `.slipbox/`),
   * every text file anywhere else (a repository, where code lives; a plain folder).
   */
  filesShown(): "notes" | "renderable" | "all" {
    const show = this.app.config.files.show;
    if (show !== "auto") return show;
    return this.app.loc.mode === "vault" && hasMarker(this.app.loc.root) ? "renderable" : "all";
  }

  /**
   * The tree's folders that are roots of their own (17.13): vaults and repositories nested in this
   * one; in a loose folder, every folder in it — each a root, or a loose folder to go into.
   */
  private rootRows(): Map<string, NonNullable<TreeRow["root"]>> {
    const out = new Map<string, NonNullable<TreeRow["root"]>>();
    const named = (abs: string) => this.rootName(abs);
    if (!isListed(this.app.loc)) {
      for (const s of this.app.graph.skipped) {
        if (s.reason !== "nested vault") continue;
        const abs = join(this.app.loc.root, s.rel);
        out.set(s.rel, { kind: "vault", abs, name: named(abs) });
      }
      return out;
    }
    let entries: Dirent[] = [];
    try {
      entries = readdirSync(this.app.loc.root, { withFileTypes: true });
    } catch {}
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      const abs = join(this.app.loc.root, e.name);
      if (busyFolderAt(abs, this.app.config.walk)) continue;
      out.set(e.name, isVaultRoot(abs) ? { kind: "vault", abs, name: named(abs) } : { kind: "folder", abs });
    }
    return out;
  }

  /** The folders of vaults nested in this one, by their path in it (cheaper than `rootRows`: no names read). */
  private nestedRels(): string[] {
    if (isListed(this.app.loc)) return [];
    return this.app.graph.skipped.filter((s) => s.reason === "nested vault").map((s) => s.rel);
  }

  /**
   * A path's row in the explorer, and a folder's key in `expanded`: its path in the vault open, for what
   * the vault's own tree holds (a nested vault's folder among them); else absolute — the vault open's
   * top, what's above or beside it, what's in a vault nested in it.
   */
  rowPath(abs: string): string {
    const R = this.app.loc.root;
    // Elsewhere (VV-D3) has no tree of its own: every row by its whole path.
    if (abs === R || !isInside(R, abs) || isListed(this.app.loc)) return abs;
    const rel = relative(R, abs).split(sep).join("/");
    // What the walk leaves out (VV-D8: a busy folder, `.gitignore`'s, home's skip list) isn't in the vault's own
    // tree: listed a level at a time, by its path, as a folder outside the vault is.
    if (this.leftOut(rel, abs)) return abs;
    return [...this.nestedRels(), ...this.unwalkedRels()].some((n) => rel.startsWith(`${n}/`)) ? abs : rel;
  }

  /** The links to folders the walk didn't go through (VV-D6), by their path in the vault: looked at, listed a level at
   *  a time. */
  private unwalkedRels(): string[] {
    if (isListed(this.app.loc)) return [];
    return this.app.graph.skipped.filter((s) => s.link?.dir).map((s) => s.rel);
  }

  /**
   * A path of the vault open (its path in it, and absolute) that its walk leaves out: at, or under, what it excludes
   * (VV-D8) — a hidden name in home, and in a vault while the explorer lists them (`files.hidden`), each then a row by
   * its path; else, in a vault, a hidden note reached by a link is in its tree (20.8), as a hidden file reached always
   * is. Why, and the folder (or file) it says it of; or null.
   */
  private leftOut(rel: string, abs: string): LeftOut | null {
    const filter = this.app.graph.filter;
    const shown = this.app.ui.hidden_files;
    const R = this.app.loc.root;
    const parts = rel.split("/");
    // On another disk (home's, VV-D2): known from the mount table, never looked at.
    if (filter.onMount(rel)) {
      const at = parts.findIndex((_, i) => filter.mountAt(parts.slice(0, i + 1).join("/")));
      return { why: ANOTHER_DISK, at: at < 0 ? abs : join(R, ...parts.slice(0, at + 1)) };
    }
    for (let i = 1; i <= parts.length; i++) {
      let dir = true;
      if (i === parts.length)
        try {
          dir = statSync(abs).isDirectory();
        } catch {}
      const why = filter.exclusion(parts.slice(0, i).join("/"), dir);
      if (why === null || why === "nested vault") continue;
      if (why === "hidden" && !filter.home && (!shown || (i === parts.length && this.app.graph.known(rel)))) continue;
      return { why, at: join(R, ...parts.slice(0, i)) };
    }
    return null;
  }

  /** Why the vault open's walk leaves out `abs` (VV-D8), when it's in its own tree: the view's folder, or a file Info
   *  shows that no row lists (under a hidden folder, D249); else null. */
  leftOutAt(abs: string): LeftOut | null {
    const R = this.app.loc.root;
    if (abs === R || !isInside(R, abs) || isListed(this.app.loc)) return null;
    const rel = relative(R, abs).split(sep).join("/");
    // In a vault nested in it, or through a link the walk didn't take: that vault's, or not the walk's at all.
    if ([...this.nestedRels(), ...this.unwalkedRels()].some((n) => rel === n || rel.startsWith(`${n}/`))) return null;
    return this.leftOut(rel, abs);
  }

  /**
   * A hidden file of the vault open, listed (`files.hidden`) and opened: reached (20.8), the vault's from now on, as
   * `:e` makes it. Not in home, whose walk never takes one, nor in `.slipbox`, nor under what the walk leaves out
   * otherwise (a git-ignored folder's row opens its file unreached).
   */
  private reachHidden(row: TreeRow): void {
    if (!row.outside || row.kind !== "note") return;
    const abs = this.rowAbs(row);
    if (this.leftOutAt(abs)?.why !== "hidden") return;
    this.app.graph.reachFile(relative(this.app.loc.root, abs).split(sep).join("/"), { keep: true });
  }

  /** A row's path, absolute. */
  rowAbs(row: Pick<TreeRow, "path">): string {
    return isAbsolute(row.path) ? row.path : join(this.app.loc.root, row.path);
  }

  /** The view at `dir` shows the vault open's own tree from there: its path in it ("" its top); else null. */
  private ownView(dir: string): string | null {
    // Elsewhere (VV-D3): every folder listed a level at a time, wherever the view is.
    if (isListed(this.app.loc)) return null;
    if (dir === this.app.loc.root) return "";
    const p = this.rowPath(dir);
    return isAbsolute(p) || this.nestedRels().includes(p) || this.unwalkedRels().includes(p) ? null : p;
  }

  treeRows(): TreeRow[] {
    if (this.tree) return this.tree;
    this.listings.newTree();
    this.keepToWhatsThere();
    const T = this.top;
    const rows: TreeRow[] = [];
    // The view (VV-D5): the vault's own tree from it, or, anywhere else, its folder listed a level at a time.
    const own = this.ownView(T);
    if (own === null) this.outsideRows(T, 0, rows, this.leftOutAt(T));
    else rows.push(...this.rootTree(own));
    this.listings.endTree();
    this.tree = rows;
    return rows;
  }

  /**
   * A folder outside the vault open's own tree — above it, beside it, in another vault, one its walk
   * leaves out — listed a level at a time (never walked): its folders — the vault open marked and
   * highlighted, its tree under it while unfolded; other vaults by their icon and name — then its files,
   * as `files.show` would list them in their vault. `leftOut`: in what the vault open's walk leaves out (VV-D8), why and
   * where — its folders carry it, down to a vault of their own. From its listing (`Listings`, T12): read off the main
   * thread, a row saying so while it's read, or why it couldn't be.
   */
  private outsideRows(dir: string, depth: number, out: TreeRow[], leftOut: LeftOut | null = null): void {
    const listing = this.listings.get(dir);
    if (!listing || listing.error !== null) {
      const said = listing ? `can't read: ${listing.error}` : this.listings.pending(dir) ? "listing…" : null;
      if (said)
        out.push({ kind: "note", path: `${dir}/\0${said}`, name: said, depth, outside: true, placeholder: true });
      return;
    }
    const R = this.app.loc.root;
    const byName = (a: ListedEntry, b: ListedEntry) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    // Hidden names only while `files.hidden` is on, `.git` never; the busy folders are (VV-D8). Neither is indexed.
    const shown = listing.entries.filter((e) => listsName(e.name, this.app.ui.hidden_files));
    for (const e of shown.filter((e) => e.dir).sort(byName)) {
      const abs = join(dir, e.name);
      const why = leftOut ?? hiddenOut(e.name, abs);
      if (abs === R && !isListed(this.app.loc)) {
        out.push({
          kind: "root",
          path: R,
          name: e.name,
          depth,
          root: {
            kind: this.app.loc.mode === "folder" ? "folder" : "vault",
            abs: R,
            name: this.rootName(R),
            here: true,
          },
        });
        if (this.expanded.has(R)) for (const r of this.rootTree()) out.push({ ...r, depth: r.depth + depth + 1 });
        continue;
      }
      const vault = !!e.vault;
      if (e.vault)
        out.push({
          kind: "root",
          path: abs,
          name: e.name,
          depth,
          root: { kind: "vault", abs, ...(e.vault.name ? { name: e.vault.name } : {}) },
          outside: true,
          listed: e,
        });
      else
        out.push({
          kind: "dir",
          path: abs,
          name: e.name,
          depth,
          outside: true,
          ...(why ? { leftOut: why.why, leftOutAt: why.at } : {}),
          ...this.linkOf(e, listing, true),
          listed: e,
        });
      if (this.expanded.has(abs)) this.outsideRows(abs, depth + 1, out, vault ? null : why);
    }
    // Its files as their vault lists them: auto, every text file but in a notes vault.
    const show = this.app.sidebar.allFiles ? "all" : this.app.config.files.show;
    const mode = show === "auto" ? (listing.notes ? "renderable" : "all") : show;
    for (const e of shown.filter((e) => e.file).sort(byName)) {
      const abs = join(dir, e.name);
      const { group } = classify(abs, this.app.config.walk.extensions);
      if (group === "binary" || (group !== "note" && (mode === "notes" || (mode === "renderable" && group !== "data"))))
        continue;
      // A hidden file where nothing holding it is left out: its own `⊘`, as a hidden folder has.
      const hidden = leftOut ? null : hiddenOut(e.name, abs);
      out.push({
        kind: "note",
        path: abs,
        name: e.name,
        depth,
        outside: true,
        ...(group !== "note" ? { group } : {}),
        ...(hidden ? { leftOut: hidden.why, leftOutAt: hidden.at } : {}),
        ...this.linkOf(e, listing, false),
        listed: e,
      });
    }
  }

  /**
   * A row listed a level at a time that is a link (VV-D6): where it leads, and whether it's followed, by the rule of the
   * place it's in — in Elsewhere every link asks; a vault's or home's, one leading out of it. Unfolded, one not followed
   * asks first (`linkFirst`), wherever it is. As its listing read it: the answers kept are all that's read here.
   */
  private linkOf(e: ListedEntry, listing: FolderListing, dir: boolean): Pick<TreeRow, "link"> {
    if (!e.link) return {};
    const { target, key } = e.link;
    const state = linkStateAt(key, isListed(this.app.loc) ? null : listing.scope, target);
    const asks = state !== "followed" && state !== "within";
    return { link: { target, dir, ...(asks ? { reason: LINK_REASON.out } : {}) } };
  }

  /**
   * The view at `dir` (VV-D5), on purpose — `z`, the breadcrumb, `-`, the folder opened. Zoomed out,
   * the folders down to the one it showed are unfolded and that one selected; the breadcrumb keeps
   * the folders past the view it can zoom back into while the view is on their way.
   */
  zoomTo(dir: string): void {
    const from = this.top;
    if (dir === from) return;
    const why = folderUnreadable(dir);
    if (why) return this.app.message("warn", `can't read ${tildePath(dir)}: ${why}`);
    this.top = dir;
    if (!isInside(dir, this.trail)) this.trail = dir;
    const out = isInside(dir, from);
    if (out) for (let d = from; d !== dir; d = dirname(d)) this.expanded.add(this.rowPath(d));
    this.invalidateTree();
    this.app.sidebar.pinned = false;
    this.app.sidebar.scroll = 0;
    if (out) this.selectRow(this.rowPath(from), 0);
    else this.app.sidebar.selected = 0;
  }

  /** `-`: the view a folder up (VV-D5), the folder it showed unfolded in it and selected. */
  zoomOut(): void {
    const up = dirname(this.top);
    if (up === this.top) return this.app.message("info", "the view shows everything: nothing is above /");
    this.zoomTo(up);
  }

  /** `z`: the view zoomed in on the selected folder or vault — a file's, its folder (VV-D5). */
  zoomIn(): void {
    const row = this.rows()[this.app.sidebar.selected];
    if (!row || this.app.sidebar.filter) return this.app.message("info", "zoom in: select a folder");
    const abs = this.rowAbs(row);
    const dir = row.kind === "note" ? dirname(abs) : abs;
    if (dir === this.top) return this.app.message("info", "zoom in: select a folder in the view");
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
    const T = this.top;
    if (isInside(T, abs)) return true;
    let common = T;
    while (!isInside(common, abs) && dirname(common) !== common) common = dirname(common);
    if (!isInside(common, abs)) return false;
    if (!listedDown(common, abs, this.app.ui.hidden_files) || abs === this.app.scratch.location().path) return false;
    // Only the two paths unfolded: what was unfolded in the old view stays, nothing else.
    const kept = [...this.expanded].filter((k) => isInside(T, this.rowAbs({ path: k })));
    this.expanded = new Set(kept);
    for (let d = T; d !== common; d = dirname(d)) this.expanded.add(this.rowPath(d));
    for (let d = dir; d !== common && isInside(common, d); d = dirname(d)) this.expanded.add(this.rowPath(d));
    this.top = common;
    this.trail = dir;
    this.invalidateTree();
    this.app.sidebar.scroll = 0;
    return true;
  }

  /** The breadcrumb over the explorer (VV-D5): the folders down to the view, then those past it it can zoom back into. */
  crumbs(): { abs: string; label: string; vault: boolean; current: boolean; past: boolean }[] {
    if (!this.tree) this.keepToWhatsThere();
    const key = `${this.top}\n${this.trail}\n${this.app.loc.root}`;
    if (this.crumbsMemo?.key === key) return this.crumbsMemo.list;
    const home = homeFolder();
    const trail = isInside(this.top, this.trail) ? this.trail : this.top;
    // From `~` when the view is in home, else from `/`: the view is always one of its folders.
    const top = isInside(home, this.top) ? home : sep;
    const dirs = [top];
    const rel = relative(top, trail);
    if (rel) for (const p of rel.split(sep)) dirs.push(join(dirs.at(-1)!, p));
    const list = dirs.map((abs) => ({
      abs,
      label: abs === sep ? "/" : abs === top ? "~" : basename(abs),
      vault: abs === this.app.loc.root ? this.app.loc.mode === "vault" : isVaultRoot(abs),
      current: abs === this.app.loc.root,
      past: abs !== this.top && isInside(this.top, abs),
    }));
    this.crumbsMemo = { key, list };
    return list;
  }

  private crumbsMemo: { key: string; list: ReturnType<App["explorer"]["crumbs"]> } | null = null;

  /**
   * `shift+h` (`explorer.toggle_hidden`, `:hidden`): hidden files and folders listed, or not — `files.hidden` changed
   * as the UI settings change one, kept for the vault until its config value changes — said; the selection stays on
   * its row. Hidden again, a view in a hidden folder goes out to the folder holding it.
   */
  toggleHidden(): void {
    const shown = !this.app.ui.hidden_files;
    const mine = this.app.leftView === "explorer" && !this.app.sidebar.filter;
    const at = mine ? this.rows()[this.app.sidebar.selected]?.path : undefined;
    this.app.settings.setUi("hidden_files", shown);
    if (!shown) {
      // The highest hidden folder on the view's way that isn't the vault open's own way (a vault in ~/.dotfiles).
      let out: string | null = null;
      for (let d = this.top; dirname(d) !== d; d = dirname(d))
        if (basename(d).startsWith(".") && !isInside(d, this.app.loc.root)) out = dirname(d);
      if (out) this.zoomTo(out);
    }
    if (mine) {
      const rows = this.rows();
      const again = rows.findIndex((r) => r.path === at);
      this.app.sidebar.selected =
        again >= 0 ? again : Math.min(this.app.sidebar.selected, Math.max(0, rows.length - 1));
    }
    this.app.message("info", shown ? "explorer: hidden files shown" : "explorer: hidden files not shown");
  }

  /** The vault's own tree, from `sub` ("" its top): its folders, notes and files, and the vaults in it (17.13) —
   *  one unfolded listed a level at a time under its row — and what the walk didn't give, from the disk (VV-D8). */
  private rootTree(sub = ""): TreeRow[] {
    const rows: TreeRow[] = [];
    const graph = this.app.graph;
    const groups = new Map(this.shownFiles().map((f) => [f.path, f.group]));
    // The walk's folders too, so one with nothing listed in it (just made, or holding only files
    // the explorer leaves out) is still there to open and to create in.
    const folders = new Set(graph.dirs.filter((d) => d));
    const roots = this.rootRows();
    // What the walk didn't give, in the folders shown (VV-D8): what it leaves out — a row by its path, listed a level
    // at a time — and what it hasn't reached — the vault's, as if walked (home's folders before its walk).
    const disk = isListed(this.app.loc)
      ? new Map<string, DiskEntry>()
      : fromDisk(
          this.app,
          sub,
          this.expanded,
          { dirs: folders, vaults: roots, file: (p) => graph.notes.has(p) || groups.has(p) },
          this.listsFiles(),
        );
    const leftOut = new Map<string, DiskEntry>();
    const unwalked = new Set<string>();
    for (const [p, d] of disk)
      if (d.leftOut !== null) leftOut.set(p, d);
      else {
        unwalked.add(p);
        if (d.dir) folders.add(p);
        else if (d.group !== "note") groups.set(p, d.group!);
      }
    // A note of a folder left out, reached by a link (20.8) or made in a hidden one: listed in that folder's rows, by its
    // path; and a hidden folder the walk knows of (a note made there), only by its row there.
    const inLeftOut = (p: string) => {
      for (let i = p.indexOf("/"); i > 0; i = p.indexOf("/", i + 1)) if (leftOut.has(p.slice(0, i))) return true;
      return false;
    };
    for (const f of [...folders]) if (leftOut.has(f) || inLeftOut(f)) folders.delete(f);
    const notes = [...graph.notes.keys(), ...[...unwalked].filter((p) => !folders.has(p) && !groups.has(p))];
    const isDir = (p: string) => folders.has(p) || roots.has(p) || !!leftOut.get(p)?.dir || !!links.get(p)?.dir;
    // The links the walk didn't go through (VV-D6): a second name for a folder of the vault, one not followed, one
    // whose target isn't answering — rows of their own, saying where they lead.
    const links = new Map(
      graph.skipped.flatMap((x) => (x.link ? [[x.rel, { ...x.link, reason: x.reason }] as const] : [])),
    );
    const under = (p: string) => !sub || p.startsWith(`${sub}/`);
    const d0 = sub ? sub.split("/").length : 0;
    const paths = [...notes, ...groups.keys()]
      .filter((p) => !inLeftOut(p))
      .concat([...folders, ...roots.keys(), ...leftOut.keys(), ...links.keys()])
      .filter(under)
      .sort((a, b) => {
        const da = a.split("/");
        const db = b.split("/");
        for (let i = 0; i < Math.min(da.length, db.length); i++) {
          const lastA = i === da.length - 1 && !isDir(a);
          const lastB = i === db.length - 1 && !isDir(b);
          if (da[i] !== db[i]) {
            if (lastA !== lastB) return lastA ? 1 : -1; // directories first
            return da[i]!.localeCompare(db[i]!, undefined, { sensitivity: "base" });
          }
        }
        return da.length - db.length;
      });
    const seen = new Set<string>();
    for (const p of paths) {
      const parts = p.split("/");
      let visible = true;
      // A folder: its own row (its parents first), when they're unfolded.
      const own = folders.has(p) ? parts.length : parts.length - 1;
      for (let i = d0; i < own; i++) {
        const dir = parts.slice(0, i + 1).join("/");
        if (!seen.has(dir) && visible) {
          seen.add(dir);
          const fresh = unwalked.has(dir) ? { unwalked: true } : {};
          // A folder you follow a link into (VV-D6): walked as the vault's, its row saying where it leads.
          const link = isLink(join(this.app.loc.root, dir))
            ? { link: { target: linkTarget(join(this.app.loc.root, dir)), dir: true } }
            : {};
          rows.push({ kind: "dir", path: dir, name: parts[i]!, depth: i - d0, ...fresh, ...link });
        }
        if (!this.expanded.has(dir)) {
          visible = false;
          break;
        }
      }
      if (!visible) continue;
      const name = parts[parts.length - 1]!;
      const depth = parts.length - 1 - d0;
      const out = leftOut.get(p);
      if (out) {
        rows.push(this.leftOutRow(out, name, depth));
        // Unfolded in place: listed a level at a time, as a folder outside the vault's own tree. Another disk (VV-D2)
        // carries its reason down, never looked into for a marker: never home's, whatever it holds.
        const abs = join(this.app.loc.root, p);
        if (out.dir && this.expanded.has(abs))
          this.outsideRows(
            abs,
            depth + 1,
            rows,
            out.leftOut === ANOTHER_DISK || !isVaultRoot(abs) ? { why: out.leftOut!, at: abs } : null,
          );
      } else if (roots.has(p)) {
        const root = roots.get(p)!;
        rows.push({ kind: "root", path: p, name, depth, root });
        // Unfolded in place (VV-D5): its folder listed a level at a time, its rows another vault's.
        if (this.expanded.has(p)) this.outsideRows(root.abs, parts.length - d0, rows);
      } else if (links.has(p)) {
        // A link the walk didn't go through (VV-D6); unfolded — looked at — listed a level at a time, never walked.
        const link = links.get(p)!;
        rows.push({ kind: link.dir ? "dir" : "note", path: p, name, depth, link });
        if (link.dir && this.expanded.has(p)) this.outsideRows(join(this.app.loc.root, p), depth + 1, rows);
      } else if (!folders.has(p))
        rows.push({
          kind: "note",
          path: p,
          name,
          depth,
          ...(groups.has(p) ? { group: groups.get(p) } : {}),
          ...(unwalked.has(p) ? { unwalked: true } : {}),
          // A file a link leads to — within the vault, or out and followed (VV-D6): saying where.
          ...(isLink(join(this.app.loc.root, p))
            ? { link: { target: linkTarget(join(this.app.loc.root, p)), dir: false } }
            : {}),
        });
    }
    return rows;
  }

  /** A folder or file the vault's walk leaves out (VV-D8): a row by its path, not this vault's to change; a vault in
   *  it (a busy folder holding `.git`), a vault's row. */
  private leftOutRow(d: DiskEntry, name: string, depth: number): TreeRow {
    const abs = join(this.app.loc.root, d.rel);
    const why = { outside: true, leftOut: d.leftOut!, leftOutAt: abs } as const;
    // Another disk (VV-D2): never looked into for a marker — what it is shows once you unfold it.
    if (d.dir && d.leftOut !== ANOTHER_DISK && isVaultRoot(abs))
      return { kind: "root", path: abs, name, depth, root: { kind: "vault", abs, name: this.rootName(abs) }, ...why };
    if (d.dir) return { kind: "dir", path: abs, name, depth, ...why };
    return { kind: "note", path: abs, name, depth, ...(d.group !== "note" ? { group: d.group } : {}), ...why };
  }

  invalidateTree(): void {
    this.tree = null;
  }

  /** A folder moved (18.3, 18.7): the view and the trail in it go with it, as its folds do. */
  followMove(from: string, to: string): void {
    // Its listings let go of, and the folders it left and came into listed again (T12): none is as it was listed.
    this.listings.forget(from);
    this.listings.stale(dirname(from));
    this.listings.stale(dirname(to));
    const shift = (abs: string) => (abs && isInside(from, abs) ? to + abs.slice(from.length) : abs);
    this.top = shift(this.top);
    this.trail = shift(this.trail);
    this.invalidateTree();
  }

  /**
   * The view and the trail on folders that are there (VV-D5), asked as the tree is built again: one deleted, or renamed
   * or moved outside slipbox, gives way to its nearest folder still there — the view's said.
   */
  private keepToWhatsThere(): void {
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
    if (this.trail && !there(this.trail)) this.trail = nearest(this.trail);
    if (!this.top || there(this.top)) return;
    const gone = this.top;
    this.top = nearest(gone);
    if (!isInside(this.top, this.trail)) this.trail = this.top;
    this.app.sidebar.pinned = false;
    this.app.sidebar.scroll = 0;
    this.app.sidebar.selected = 0;
    this.app.message("info", `${tildePath(gone)} isn't there any more: the view is on ${tildePath(this.top)}`);
  }

  /**
   * A link to a folder, opened (VV-D6): one not followed asks — follow it, just look, no — then does what `action`
   * asked; a second name for a folder of the vault shows that folder. True when it took the action over.
   */
  private linkFirst(row: TreeRow, action: string): boolean {
    const link = row.link!;
    if (link.reason === LINK_REASON.within && link.target) {
      // Its target by the vault's real path (where the link's is), shown by its path in the vault.
      const rel = relative(linkScope(this.app.loc) ?? this.app.loc.root, link.target)
        .split(sep)
        .join("/");
      this.app.message("info", `${row.name} is a second name for ${rel || "the vault's top"}`);
      this.reveal(rel || ".", true);
      return true;
    }
    const abs = this.rowAbs(row);
    // Out of the vault open, by the rule of the place it's in too (VV-D6): never listed unasked.
    const there = row.outside ? locationAt(dirname(abs)) : undefined;
    return this.app.following.gate(
      abs,
      () => {
        this.invalidateTree();
        const at = this.rows().findIndex((r) => r.path === this.rowPath(abs));
        if (at >= 0) this.app.sidebar.selected = at;
        this.action(action);
      },
      there,
    );
  }

  /** The explorer's rows: the tree, or while filtering the matching notes under their folders
   *  (all unfolded), in tree order. */
  rows(): TreeRow[] {
    const q = this.app.sidebar.filter ?? "";
    if (!q) return this.treeRows();
    if (this.filtered?.query === q && this.filtered.tree === this.treeRows()) return this.filtered.rows;
    const rows: TreeRow[] = [];
    const seen = new Set<string>();
    for (const row of this.allNotesInTreeOrder()) {
      if (!match(q, row)) continue;
      const parts = row.split("/");
      for (let i = 0; i < parts.length - 1; i++) {
        const dir = parts.slice(0, i + 1).join("/");
        if (seen.has(dir)) continue;
        seen.add(dir);
        rows.push({ kind: "dir", path: dir, name: parts[i]!, depth: i });
      }
      const group = this.app.graph.notes.has(row) ? undefined : classify(row, this.app.config.walk.extensions).group;
      rows.push({
        kind: "note",
        path: row,
        name: parts[parts.length - 1]!,
        depth: parts.length - 1,
        ...(group ? { group } : {}),
      });
    }
    this.filtered = { query: q, tree: this.treeRows(), rows };
    return rows;
  }

  private filtered: { query: string; tree: TreeRow[]; rows: TreeRow[] } | null = null;

  /** Every note's path, directories first at each level, as the tree orders them. */
  private allNotesInTreeOrder(): string[] {
    return [...this.app.graph.notes.keys(), ...this.shownFiles().map((f) => f.path)].sort((a, b) => {
      const da = a.split("/");
      const db = b.split("/");
      for (let i = 0; i < Math.min(da.length, db.length); i++) {
        const lastA = i === da.length - 1;
        const lastB = i === db.length - 1;
        if (da[i] !== db[i]) {
          if (lastA !== lastB) return lastA ? 1 : -1;
          return da[i]!.localeCompare(db[i]!, undefined, { sensitivity: "base" });
        }
      }
      return da.length - db.length;
    });
  }

  /**
   * The note on screen (or `rel`: in the vault, "." its top, or absolute) shown in the explorer: its
   * folders unfolded, its row selected; `open` a folder's own too. Outside the view it isn't shown —
   * unless it was gone to (`zoom`): the view then zooms out to hold it (VV-D5).
   */
  reveal(rel?: string | null, open = false, zoom = false): void {
    this.app.sidebar.pinned = false;
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
    if (!isInside(this.top, abs) && !(zoom && this.zoomToHold(abs, open ? abs : dirname(abs)))) return;
    const view = this.top;
    for (let d = open ? abs : dirname(abs); d !== view && isInside(view, d); d = dirname(d))
      this.expanded.add(this.rowPath(d));
    this.invalidateTree();
    if (abs === view) this.app.sidebar.selected = 0;
    else this.selectRow(this.rowPath(abs));
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

  action(action: string): void | Promise<void> {
    this.app.sidebar.pinned = false;
    // Moved by you: a row meant to be selected once listed isn't any more.
    this.wanted = null;
    if (this.app.leftView === "history") return this.app.history.action(action);
    if (this.app.leftView === "git") return this.app.gitPanel.action(action);
    if (action === "filter") {
      this.app.sidebar.filtering = true; // resumes a filter already there (a view's restored one)
      return;
    }
    const rows = this.rows();
    const row = rows[this.app.sidebar.selected];
    // A row that only says something of its folder (T12: `listing…`): moved past, or its folder folded, nothing else.
    if (row?.placeholder && !PLACEHOLDER_ACTIONS.has(action)) return;
    // A link to a folder not followed asks first (VV-D6); a second name for one of the vault's goes to it.
    if (row?.link?.dir && ["open", "expand", "open_tab", "zoom_in"].includes(action) && this.linkFirst(row, action))
      return;
    // A folder, or the vault open's row in a view above it: unfolded (or folded, `toggle`) in place.
    const unfold = (toggle = false) => {
      if (!row || row.placeholder) return;
      if (toggle && this.expanded.has(row.path)) this.expanded.delete(row.path);
      else if (!this.expanded.has(row.path)) {
        // One you may not read, wherever it is: one the vault's walk couldn't read is listed too (VV-D9) — one listed off
        // the main thread as its listing read it (T12).
        const why =
          row.kind === "note"
            ? null
            : row.listed
              ? (row.listed.unreadable ?? null)
              : folderUnreadable(this.rowAbs(row));
        if (why) return this.app.message("warn", `can't read ${tildePath(this.rowAbs(row))}: ${why}`);
        this.expanded.add(row.path);
      }
      this.invalidateTree();
    };
    const openNote = (where: "here" | "tab" | "split") => {
      if (!row || row.placeholder) return;
      if (row.kind === "dir" || row.root?.here) return unfold();
      // Another vault's folder, chosen: into it, its tabs (VV-D4); a file of one, opened, goes into it too.
      if (row.kind === "root") return this.app.vaults.enterRoot(row);
      this.reachHidden(row);
      if (where === "tab") this.app.openOrSwitchTab(row.path);
      else if (where === "split") {
        this.app.windows.other();
        this.app.open(row.path);
      } else this.app.open(row.path);
      this.app.region = "content";
      if (this.app.panels.narrow || this.app.ui.zen) this.app.sidebar.overlay = false;
    };
    switch (action) {
      case "down":
        this.app.sidebar.selected = Math.min(rows.length - 1, this.app.sidebar.selected + 1);
        break;
      case "up":
        this.app.sidebar.selected = Math.max(0, this.app.sidebar.selected - 1);
        break;
      case "top":
        this.app.sidebar.selected = 0;
        break;
      case "new_note":
        return this.app.files.promptNewNote(this.app.files.newItemBase());
      case "new_folder":
        return this.app.files.promptNewFolder(this.app.files.newItemBase());
      case "rename":
      case "rename_root":
      case "move":
      case "delete":
      case "copy":
      case "cut":
      case "make_root":
      case "unmake_root": {
        // On the selected note, file, folder or vault (18.x).
        const item = this.item();
        if (!item) return this.app.message("info", `${action.replace("_", " ")}: select a note, file or folder first`);
        return this.itemAction(action, item);
      }
      case "paste":
        return this.app.files.pasteItem();
      case "copy_path": {
        // Any row's whole path, one above or beside the vault too: what a terminal or another program takes.
        if (!row) return this.app.message("info", "copy path: select a note, file or folder first");
        const abs = this.rowAbs(row);
        return void this.app.copy(abs, true, tildePath(abs));
      }
      case "menu":
        return this.openItemMenu();
      case "restore":
        return this.app.files.restoreLast();
      case "undo_rename":
        return this.app.renaming.undo();
      case "all_files": {
        // Every text file, or back to what files.show lists; the selection stays on its row.
        const at = row?.path;
        this.app.sidebar.allFiles = !this.app.sidebar.allFiles;
        this.invalidateTree();
        const again = this.rows().findIndex((r) => r.path === at);
        if (again >= 0) this.app.sidebar.selected = again;
        const shown = this.filesShown();
        this.app.message(
          "info",
          this.app.sidebar.allFiles
            ? "explorer: every text file"
            : `explorer: ${shown === "notes" ? "notes" : shown === "all" ? "every text file" : "notes and data files"} (files.show)`,
        );
        break;
      }
      case "toggle_hidden":
        // A command (`explorer.toggle_hidden`, `:hidden`), a UI setting as the others are.
        return void this.app.run("explorer.toggle_hidden");
      case "bottom":
        this.app.sidebar.selected = rows.length - 1;
        break;
      case "open":
        if (row?.kind === "dir" && this.expanded.has(row.path)) break;
        openNote("here");
        break;
      case "expand":
        // A folder unfolds in place, a vault's too (VV-D5) — the one open, another, one nested here; a note opens as a tab.
        if (row?.kind === "dir" || row?.kind === "root") unfold();
        else openNote("tab");
        break;
      case "open_tab":
        // A folder folds or unfolds, the vault open's row too; another vault's goes into it (VV-D4).
        if (row?.kind === "dir" || row?.root?.here) unfold(true);
        else openNote("tab");
        break;
      case "open_split":
        openNote("split");
        break;
      case "collapse": {
        // A filtered list shows every match whatever is folded: folding would act on rows not shown.
        if (!row || this.app.sidebar.filter) break;
        // An unfolded folder or vault folds, the selection staying on it; anything else folds the folder
        // holding it, selected — when that's a row of the view.
        if (row.kind !== "note" && this.expanded.has(row.path)) {
          this.expanded.delete(row.path);
          this.invalidateTree();
          break;
        }
        const parent = dirname(this.rowAbs(row));
        if (parent === this.top || !isInside(this.top, parent)) break;
        const dir = this.rowPath(parent);
        this.expanded.delete(dir);
        this.invalidateTree();
        this.app.sidebar.selected = Math.max(
          0,
          this.treeRows().findIndex((r) => r.path === dir),
        );
        break;
      }
      case "zoom_in":
        return this.zoomIn();
      case "zoom_out":
        return this.zoomOut();
      case "close":
        this.app.panels.showSidebar(false);
        break;
      case "leave":
        this.app.region = "content";
        if (this.app.panels.narrow || this.app.ui.zen) this.app.sidebar.overlay = false;
        break;
      default:
        this.app.message("error", `unknown explorer action: ${action}`);
    }
  }
}

/** A link's row opened (VV-D6): what it leads to, once you say so. */
export interface LinkRow {
  /** Where it leads, by its real path; null when it leads nowhere. */
  target: string | null;
  dir: boolean;
  /** Why the walk didn't go through it (`LINK_REASON`), or — listed a level at a time in Elsewhere — that it asks. */
  reason?: string;
}

/** What an explorer operation acts on (18.x): a note or file, a folder, or a nested vault's folder. */
export interface ExplorerItem {
  rel: string;
  dir: boolean;
  vault?: boolean;
}

export interface TreeRow {
  /** "note": a row the explorer opens — a note, or a data or text file (`group` says which).
   *  "root": a folder that is a vault — the one open, another, one nested in it — or, in a folder only
   *  listed (`~`), a folder of it: `l` unfolds it in place, `enter` goes into it (17.13, VV-D4). */
  kind: "dir" | "note" | "root";
  /** Its path in the vault open, for what the vault's own tree holds; else absolute (`outside`, the vault open's). */
  path: string;
  name: string;
  depth: number;
  /** A file beyond notes: its group (16.x). */
  group?: FileGroup;
  /** A root row: what it is, where it is, and the vault's name when it isn't the folder's; `here`:
   *  the vault open, in a view above it (VV-D5) — highlighted, its tree under it. */
  root?: { kind: "vault" | "folder"; abs: string; name?: string; here?: boolean };
  /** A row outside the vault open's own tree — above it, beside it, in another vault, in what its walk
   *  leaves out: its path absolute, listed a level at a time. Opening its file goes into the file's vault,
   *  as a link does (VV-D4). */
  outside?: boolean;
  /** What the vault open's walk leaves out (VV-D8), listed from the disk: why (`busy folder`, `.gitignore`,
   *  `walk.exclude`, `Downloads`…). Never indexed. A folder in it carries it too; a file, only `outside`. A hidden name
   *  listed (`files.hidden`) anywhere else has it too: `hidden`. */
  leftOut?: string;
  /** Where `leftOut` was decided, absolute: the folder (or file) the walk leaves out — this row's, or the one holding
   *  it. Its name says a busy folder's reason (VV-D9: `generated (node_modules)`). */
  leftOutAt?: string;
  /** The vault open's, listed from the disk where its walk hasn't been (yet): a folder it couldn't read, home's
   *  before its walk, a folder or file come since. */
  unwalked?: boolean;
  /** A symlink (VV-D6): where it leads, and why the walk didn't go through it, when it didn't. */
  link?: LinkRow;
  /** A row listed a level at a time: what its folder's listing read of it, off the main thread (T12) — its marks'. */
  listed?: ListedEntry;
  /** A row that only says something of its folder — still being listed (`listing…`), or why it couldn't be: never
   *  opened, nothing to mark. */
  placeholder?: true;
}

/** What a row that only says something of its folder (`listing…`, `can't read: …`) answers: moving, and folding it. */
const PLACEHOLDER_ACTIONS: ReadonlySet<string> = new Set([
  "down",
  "up",
  "top",
  "bottom",
  "collapse",
  "filter",
  "all_files",
  "toggle_hidden",
  "zoom_out",
  "close",
  "leave",
]);

/** What the vault open's walk leaves out (VV-D8), carried down what's listed in it: why, and where it was decided. */
export interface LeftOut {
  why: string;
  at: string;
}

/** A hidden name listed (`files.hidden`) where nothing holding it is left out: why no walk takes it — `hidden`, or
 *  slipbox's own folder — said of itself; null for any other name. */
function hiddenOut(name: string, abs: string): LeftOut | null {
  if (!name.startsWith(".")) return null;
  return { why: name === MARKER ? "always skipped" : "hidden", at: abs };
}

/** Whether the explorer lists every folder from `from` down to `to`, inside it: none of them hidden, unless
 *  `showHidden` (`files.hidden`) — `.git` never — a busy folder is listed (VV-D8). */
export function listedDown(from: string, to: string, showHidden = false): boolean {
  return relative(from, to)
    .split(sep)
    .every((p) => listsName(p, showHidden));
}
