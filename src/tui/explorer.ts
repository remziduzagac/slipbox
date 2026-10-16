// The explorer (VV-D5): one tree, the vault's files and the folders around it, and the view — the part of it shown,
// zoomed into and out of along its breadcrumb; its rows, its keys, its item menu. What the walk didn't give is read
// from the disk (`explorer-disk.ts`, VV-D8); a row's marks are `marks.ts`' (VV-D9).

import ignore from "ignore";
import { classify, type FileGroup } from "../core/filetypes.ts";
import { type Dirent, readdirSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, posix, relative, sep } from "node:path";
import { checkoutOf } from "../core/git.ts";
import { gitViewAction } from "./gitview.ts";
import { readIdentity, vaultConfigFile } from "../core/registry.ts";
import { tildePath } from "../core/names.ts";
import { findVaultRoot, hasMarker, homeFolder, isInside, isListed, isVaultRoot, locationAt } from "../core/vault.ts";
import { match } from "./match.ts";
import { prettyKey } from "./keys.ts";
import type { App, ListItem } from "./app.ts";
import { folderUnreadable } from "./app.ts";
import { type DiskEntry, fromDisk } from "./explorer-disk.ts";
import { Marks } from "./marks.ts";

/** The explorer: its tree, its view and breadcrumb, its keys. */
export class Explorer {
  constructor(readonly app: App) {}

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
    // Above the vault, beside it, in another (VV-D5), the vault itself: not this one's to rename, move or delete here.
    if (row.outside || row.root?.here) return null;
    if (row.kind === "root")
      return row.root?.kind === "vault" && this.app.loc.mode !== "folder"
        ? { rel: row.path, dir: true, vault: true }
        : null;
    return { rel: row.path, dir: row.kind === "dir" };
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
    if (item.dir && !item.vault) actions.push(["new_note", "New note here"], ["new_folder", "New folder here"]);
    actions.push(["rename", item.vault ? "Rename the folder" : "Rename"]);
    if (item.vault) actions.push(["rename_root", "Name it"]);
    actions.push(["move", "Move to…"], ["copy", "Copy"], ["cut", "Cut"]);
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
  itemAction(action: string, item: ExplorerItem): void {
    const folder = item.dir ? item.rel : posix.dirname(item.rel) === "." ? "" : posix.dirname(item.rel);
    switch (action) {
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
    if (checkoutOf(abs)?.worktree) return undefined;
    const n = readIdentity(vaultConfigFile(abs)).name;
    return n && n !== basename(abs) ? n : undefined;
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
      if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules") continue;
      const abs = join(this.app.loc.root, e.name);
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
    if (abs === R || !isInside(R, abs)) return abs;
    // A folder only listed (`~`, `/`): its own rows are its folders, by their names.
    if (isListed(this.app.loc)) return dirname(abs) === R ? basename(abs) : abs;
    const rel = relative(R, abs).split(sep).join("/");
    // What the walk leaves out (VV-D8: a busy folder, `.gitignore`'s, home's skip list) isn't in the vault's own
    // tree: listed a level at a time, by its path, as a folder outside the vault is.
    if (this.leftOut(rel, abs)) return abs;
    return this.nestedRels().some((n) => rel.startsWith(`${n}/`)) ? abs : rel;
  }

  /**
   * A path of the vault open (its path in it, and absolute) that its walk leaves out: at, or under, what it excludes
   * (VV-D8) — a hidden folder only in home, whose tree lists none; in a vault, a hidden note reached by a link is in
   * its tree (20.8).
   */
  private leftOut(rel: string, abs: string): boolean {
    const filter = this.app.graph.filter;
    const parts = rel.split("/");
    for (let i = 1; i <= parts.length; i++) {
      let dir = true;
      if (i === parts.length)
        try {
          dir = statSync(abs).isDirectory();
        } catch {}
      const why = filter.exclusion(parts.slice(0, i).join("/"), dir);
      if (why !== null && why !== "nested vault" && (filter.home || why !== "hidden")) return true;
    }
    return false;
  }

  /** A row's path, absolute. */
  rowAbs(row: Pick<TreeRow, "path">): string {
    return isAbsolute(row.path) ? row.path : join(this.app.loc.root, row.path);
  }

  /** The view at `dir` shows the vault open's own tree from there: its path in it ("" its top); else null. */
  private ownView(dir: string): string | null {
    if (dir === this.app.loc.root) return "";
    if (isListed(this.app.loc)) return null;
    const p = this.rowPath(dir);
    return isAbsolute(p) || this.nestedRels().includes(p) ? null : p;
  }

  treeRows(): TreeRow[] {
    if (this.tree) return this.tree;
    const T = this.top;
    const rows: TreeRow[] = [];
    // The view (VV-D5): the vault's own tree from it, or, anywhere else, its folder listed a level at a time.
    const own = this.ownView(T);
    if (own === null) this.outsideRows(T, 0, rows);
    else rows.push(...this.rootTree(own));
    this.tree = rows;
    return rows;
  }

  /**
   * A folder outside the vault open's own tree — above it, beside it, in another vault, one its walk
   * leaves out — listed a level at a time (never walked): its folders — the vault open marked and
   * highlighted, its tree under it while unfolded; other vaults by their icon and name — then its files,
   * as `files.show` would list them in their vault.
   */
  private outsideRows(dir: string, depth: number, out: TreeRow[]): void {
    let entries: Dirent[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const R = this.app.loc.root;
    const byName = (a: Dirent, b: Dirent) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    const isDir = (e: Dirent) => {
      if (e.isDirectory()) return true;
      if (!e.isSymbolicLink()) return false;
      try {
        return statSync(join(dir, e.name)).isDirectory();
      } catch {
        return false;
      }
    };
    // Hidden names aren't listed; the busy folders are (VV-D8), never indexed.
    const shown = entries.filter((e) => !e.name.startsWith("."));
    for (const e of shown.filter(isDir).sort(byName)) {
      const abs = join(dir, e.name);
      if (abs === R) {
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
      if (isVaultRoot(abs))
        out.push({
          kind: "root",
          path: abs,
          name: e.name,
          depth,
          root: { kind: "vault", abs, name: this.rootName(abs) },
          outside: true,
        });
      else out.push({ kind: "dir", path: abs, name: e.name, depth, outside: true });
      if (this.expanded.has(abs)) this.outsideRows(abs, depth + 1, out);
    }
    // Its files as their vault lists them: auto, every text file but in a notes vault.
    const show = this.app.sidebar.allFiles ? "all" : this.app.config.files.show;
    const own = findVaultRoot(dir);
    const mode = show === "auto" ? (own && hasMarker(own) ? "renderable" : "all") : show;
    for (const e of shown.filter((e) => !isDir(e) && (e.isFile() || e.isSymbolicLink())).sort(byName)) {
      const abs = join(dir, e.name);
      const { group } = classify(abs, this.app.config.walk.extensions);
      if (group === "binary" || (group !== "note" && (mode === "notes" || (mode === "renderable" && group !== "data"))))
        continue;
      out.push({ kind: "note", path: abs, name: e.name, depth, outside: true, ...(group !== "note" ? { group } : {}) });
    }
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
    this.app.sidebar.selected = out
      ? Math.max(
          0,
          this.rows().findIndex((r) => r.path === this.rowPath(from)),
        )
      : 0;
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
    if (!listedDown(common, abs) || abs === this.app.scratch.location().path) return false;
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
    const key = `${this.top}\n${this.trail}\n${this.app.loc.root}`;
    if (this.crumbsMemo?.key === key) return this.crumbsMemo.list;
    const home = homeFolder();
    const trail = isInside(this.top, this.trail) ? this.trail : this.top;
    const top = isInside(home, trail) ? home : sep;
    const dirs = [top];
    const rel = relative(top, trail);
    if (rel) for (const p of rel.split(sep)) dirs.push(join(dirs.at(-1)!, p));
    const list = dirs.map((abs) => ({
      abs,
      label: abs === home ? "~" : abs === sep ? "/" : basename(abs),
      vault: abs === this.app.loc.root ? this.app.loc.mode === "vault" : isVaultRoot(abs),
      current: abs === this.app.loc.root,
      past: abs !== this.top && isInside(this.top, abs),
    }));
    this.crumbsMemo = { key, list };
    return list;
  }

  private crumbsMemo: { key: string; list: ReturnType<App["explorer"]["crumbs"]> } | null = null;

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
    // A note of a folder left out, reached by a link (20.8): listed in that folder's rows, by its path.
    const inLeftOut = (p: string) => {
      for (let i = p.indexOf("/"); i > 0; i = p.indexOf("/", i + 1)) if (leftOut.has(p.slice(0, i))) return true;
      return false;
    };
    const notes = [...graph.notes.keys(), ...[...unwalked].filter((p) => !folders.has(p) && !groups.has(p))];
    const isDir = (p: string) => folders.has(p) || roots.has(p) || !!leftOut.get(p)?.dir;
    const under = (p: string) => !sub || p.startsWith(`${sub}/`);
    const d0 = sub ? sub.split("/").length : 0;
    const paths = [...notes, ...groups.keys()]
      .filter((p) => !graph.reached.has(p) || !inLeftOut(p))
      .concat([...folders, ...roots.keys(), ...leftOut.keys()])
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
          rows.push({ kind: "dir", path: dir, name: parts[i]!, depth: i - d0, ...fresh });
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
        // Unfolded in place: listed a level at a time, as a folder outside the vault's own tree.
        const abs = join(this.app.loc.root, p);
        if (out.dir && this.expanded.has(abs)) this.outsideRows(abs, depth + 1, rows);
      } else if (roots.has(p)) {
        const root = roots.get(p)!;
        rows.push({ kind: "root", path: p, name, depth, root });
        // Unfolded in place (VV-D5): its folder listed a level at a time, its rows another vault's.
        if (this.expanded.has(p)) this.outsideRows(root.abs, parts.length - d0, rows);
      } else if (!folders.has(p))
        rows.push({
          kind: "note",
          path: p,
          name,
          depth,
          ...(groups.has(p) ? { group: groups.get(p) } : {}),
          ...(unwalked.has(p) ? { unwalked: true } : {}),
        });
    }
    return rows;
  }

  /** A folder or file the vault's walk leaves out (VV-D8): a row by its path, not this vault's to change; a vault in
   *  it (a busy folder holding `.git`), a vault's row. */
  private leftOutRow(d: DiskEntry, name: string, depth: number): TreeRow {
    const abs = join(this.app.loc.root, d.rel);
    const why = { outside: true, leftOut: d.leftOut! } as const;
    if (d.dir && isVaultRoot(abs))
      return { kind: "root", path: abs, name, depth, root: { kind: "vault", abs, name: this.rootName(abs) }, ...why };
    if (d.dir) return { kind: "dir", path: abs, name, depth, ...why };
    return { kind: "note", path: abs, name, depth, ...(d.group !== "note" ? { group: d.group } : {}), ...why };
  }

  invalidateTree(): void {
    this.tree = null;
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
    const idx = abs === view ? 0 : this.treeRows().findIndex((r) => r.path === this.rowPath(abs));
    if (idx >= 0) this.app.sidebar.selected = idx;
  }

  /**
   * A link to a folder followed (21.2): the folder revealed in the explorer, unfolded, the explorer
   * focused — in its own vault when it's outside this one (that vault's, or the folder opened); outside
   * the view, the view zooms out to hold it (VV-D5).
   */
  revealFolder(path: string): void {
    if (isAbsolute(path)) {
      // Its vault: a marker's, home (VV-D2), else the plain folder.
      if (!this.app.vaults.switchVault(locationAt(path), null)) return;
      path = relative(this.app.loc.root, path) || ".";
    }
    this.app.panels.switchLeftView("explorer");
    this.app.sidebar.filter = "";
    this.app.sidebar.filtering = false;
    this.app.panels.showSidebar(true);
    this.reveal(path, true, true);
    this.app.region = "sidebar";
  }

  action(action: string): void {
    this.app.sidebar.pinned = false;
    if (this.app.leftView === "history") return this.app.history.action(action);
    if (this.app.leftView === "git") return gitViewAction(this.app, action);
    if (action === "filter") {
      this.app.sidebar.filtering = true; // resumes a filter already there (a view's restored one)
      return;
    }
    const rows = this.rows();
    const row = rows[this.app.sidebar.selected];
    // A folder, or the vault open's row in a view above it: unfolded (or folded, `toggle`) in place.
    const unfold = (toggle = false) => {
      if (!row) return;
      if (toggle && this.expanded.has(row.path)) this.expanded.delete(row.path);
      else if (!this.expanded.has(row.path)) {
        // One you may not read, wherever it is: one the vault's walk couldn't read is listed too (VV-D9).
        const why = row.kind !== "note" ? folderUnreadable(this.rowAbs(row)) : null;
        if (why) return this.app.message("warn", `can't read ${tildePath(this.rowAbs(row))}: ${why}`);
        this.expanded.add(row.path);
      }
      this.invalidateTree();
    };
    const openNote = (where: "here" | "tab" | "split") => {
      if (!row) return;
      if (row.kind === "dir" || row.root?.here) return unfold();
      // Another vault's folder, chosen: into it, its tabs (VV-D4); a file of one, opened, goes into it too.
      if (row.kind === "root") return this.app.vaults.enterRoot(row);
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
   *  `walk.exclude`, `Downloads`…). Never indexed. */
  leftOut?: string;
  /** The vault open's, listed from the disk where its walk hasn't been (yet): a folder it couldn't read, home's
   *  before its walk, a folder or file come since. */
  unwalked?: boolean;
}

/** Whether the explorer lists every folder from `from` down to `to`, inside it: none of them hidden — a busy folder
 *  is listed (VV-D8). */
export function listedDown(from: string, to: string): boolean {
  return !relative(from, to)
    .split(sep)
    .some((p) => p.startsWith("."));
}
