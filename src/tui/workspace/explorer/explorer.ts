// The explorer (VV-D5): one tree, the vault's files and the folders around it, and the view — the part of it shown,
// zoomed into and out of along its breadcrumb; its rows, its keys, its item menu. What the walk didn't give is read
// from the disk (`explorer-disk.ts`, VV-D8); a row's marks are `marks.ts`' (VV-D9).

import { classify, type FileGroup } from "../../../core/documents/model/filetypes.ts";
import { dirname } from "node:path";
import { match } from "../../shell/overlays/match.ts";
import type { App } from "../../app/runtime/app.ts";
import { Listings } from "./listings.ts";
import { Marks } from "./marks.ts";

import type { ExplorerItem, TreeRow, LeftOut } from "./contracts.ts";
export type { LinkRow, ExplorerItem, TreeRow, LeftOut } from "./contracts.ts";
export { listedDown } from "./rows/paths.ts";
import { ExplorerFileRows } from "./rows/files.ts";
import { ExplorerPaths } from "./rows/paths.ts";
import { ExplorerTree } from "./rows/tree.ts";
import { ExplorerNavigation } from "./navigation.ts";
import { ExplorerActions } from "./actions/items.ts";

/** The explorer owns its live view state, listing lifecycle, row cache and collaborators. */
export class Explorer {
  /** The folders it lists a level at a time, as read off the main thread (T12); read here, at once, in a test's App. */
  listings: Listings;

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

  /**
   * A row to select once it's listed (T12): one the explorer meant to select in a folder still being read — the folder
   * zoomed out from, a note revealed. Selected by `Listings` when the rows come, unless the selection moved since.
   */
  wanted: { path: string; at: number } | null = null;

  private filtered: { query: string; tree: TreeRow[]; rows: TreeRow[] } | null = null;

  private readonly fileRows: ExplorerFileRows;
  private readonly paths: ExplorerPaths;
  private readonly treeBuilder: ExplorerTree;
  private readonly navigation: ExplorerNavigation;
  private readonly commands: ExplorerActions;

  constructor(readonly app: App) {
    this.listings = new Listings(app);
    this.fileRows = new ExplorerFileRows(app);
    this.paths = new ExplorerPaths(app);
    this.treeBuilder = new ExplorerTree(app, this, this.paths, this.fileRows);
    this.navigation = new ExplorerNavigation(this, () => !!this.tree);
    this.commands = new ExplorerActions(this);
  }

  /** Select the row at `path` (a row path): now, or once its folder's listing comes (`wanted`); `fallback` meanwhile. */
  selectRow(path: string, fallback?: number): void {
    return this.navigation.selectRow(path, fallback);
  }

  /** Select a path in the explorer, unfolding its folders. */
  select(rel: string): void {
    return this.navigation.select(rel);
  }

  /**
   * Shown again, its place restored (`switchLeftView`): the selection put where `later` says, scrolled to — not in
   * another vault, nor under a filter, whose rows are every note matching it, the same whatever the view.
   */
  shownAgain(): void {
    return this.navigation.shownAgain();
  }

  /**
   * The view at `dir` (VV-D5), on purpose — `z`, the breadcrumb, `-`, the folder opened. Zoomed out,
   * the folders down to the one it showed are unfolded and that one selected; the breadcrumb keeps
   * the folders past the view it can zoom back into while the view is on their way.
   */
  zoomTo(dir: string): void {
    return this.navigation.zoomTo(dir);
  }

  /** `-`: the view a folder up (VV-D5), the folder it showed unfolded in it and selected. */
  zoomOut(): void {
    return this.navigation.zoomOut();
  }

  /** `z`: the view zoomed in on the selected folder or vault — a file's, its folder (VV-D5). */
  zoomIn(): void {
    return this.navigation.zoomIn();
  }

  /**
   * Gone to `abs` (VV-D5): a file opened, a vault gone into. Outside the view, the view zooms out to
   * the common parent of the two, only their paths unfolded — what was unfolded in the old view kept —
   * and the breadcrumb leads back to where you went. Never for what the tree doesn't list: a hidden
   * folder's file, slipbox's own (the scratch); a busy folder's is listed (VV-D8). True when the view
   * holds it now.
   */
  zoomToHold(abs: string, dir = dirname(abs)): boolean {
    return this.navigation.zoomToHold(abs, dir);
  }

  /** The breadcrumb over the explorer (VV-D5): the folders down to the view, then those past it it can zoom back into. */
  crumbs(): { abs: string; label: string; vault: boolean; current: boolean; past: boolean }[] {
    return this.navigation.crumbs();
  }

  /**
   * `shift+h` (`explorer.toggle_hidden`, `:hidden`): hidden files and folders listed, or not — `files.hidden` changed
   * as the UI settings change one, kept for the vault until its config value changes — said; the selection stays on
   * its row. Hidden again, a view in a hidden folder goes out to the folder holding it.
   */
  toggleHidden(): void {
    return this.navigation.toggleHidden();
  }

  /** A folder moved (18.3, 18.7): the view and the trail in it go with it, as its folds do. */
  followMove(from: string, to: string): void {
    return this.navigation.followMove(from, to);
  }

  /**
   * The note on screen (or `rel`: in the vault, "." its top, or absolute) shown in the explorer: its
   * folders unfolded, its row selected; `open` a folder's own too. Outside the view it isn't shown —
   * unless it was gone to (`zoom`): the view then zooms out to hold it (VV-D5).
   */
  reveal(rel?: string | null, open = false, zoom = false): void {
    return this.navigation.reveal(rel, open, zoom);
  }

  /**
   * A link to a folder followed (21.2): the folder revealed in the explorer, unfolded, the explorer
   * focused — in its own vault when it's outside this one (that vault's, or the folder opened); outside
   * the view, the view zooms out to hold it (VV-D5).
   */
  revealFolder(path: string): void {
    return this.navigation.revealFolder(path);
  }

  /** What the explorer's selected row names: a note or file, a folder, or a vault nested in this
   *  one (its folder); the rows outside its own tree name nothing to change. */
  item(): ExplorerItem | null {
    return this.commands.item();
  }

  /**
   * The selected row's menu (its `…` button, `.`): what can be done to it, each with its key in the
   * explorer, which picks it here too. It hangs from the button (by key without one: the row).
   */
  openItemMenu(): void {
    return this.commands.openItemMenu();
  }

  /** An explorer action on a note, file, folder or nested vault: its keys' and its menu's. */
  itemAction(action: string, item: ExplorerItem): void | Promise<void> {
    return this.commands.itemAction(action, item);
  }

  /** Whether the explorer has the keys (its tree shown and focused). */
  focused(): boolean {
    return this.commands.focused();
  }

  /** What `space n …` acts on (18.13): the explorer's selected note or file when it has focus, else
   *  this note; null (and said) without one. */
  noteTarget(): ExplorerItem | null {
    return this.commands.noteTarget();
  }

  /** What `space d …` acts on (18.13): the explorer's selected folder (or vault, or a file's folder)
   *  when it has focus, else this note's folder; null (and said) at the vault's root. */
  folderTarget(): ExplorerItem | null {
    return this.commands.folderTarget();
  }

  action(action: string): void | Promise<void> {
    return this.commands.action(action);
  }

  /**
   * A path's row in the explorer, and a folder's key in `expanded`: its path in the vault open, for what
   * the vault's own tree holds (a nested vault's folder among them); else absolute — the vault open's
   * top, what's above or beside it, what's in a vault nested in it.
   */
  rowPath(abs: string): string {
    return this.paths.rowPath(abs);
  }

  /** Why the vault open's walk leaves out `abs` (VV-D8), when it's in its own tree: the view's folder, or a file Info
   *  shows that no row lists (under a hidden folder, D249); else null. */
  leftOutAt(abs: string): LeftOut | null {
    return this.paths.leftOutAt(abs);
  }

  /** A row's path, absolute. */
  rowAbs(row: Pick<TreeRow, "path">): string {
    return this.paths.rowAbs(row);
  }

  /**
   * The files beyond notes the explorer and the switcher list (16.5): by `files.show` — or all
   * text files while the explorer's toggle is on — then `files.include` patterns always, and
   * `files.exclude` never. Binary files are never listed.
   */
  shownFiles(): { path: string; group: FileGroup }[] {
    return this.fileRows.shownFiles();
  }

  /**
   * What `files.show` lists here: `auto` — notes and data files in a notes root (one with `.slipbox/`),
   * every text file anywhere else (a repository, where code lives; a plain folder).
   */
  filesShown(): "notes" | "renderable" | "all" {
    return this.fileRows.filesShown();
  }

  treeRows(): TreeRow[] {
    if (this.tree) return this.tree;
    this.listings.newTree();
    this.navigation.keepToWhatsThere();
    const rows = this.treeBuilder.build(this.top);
    this.listings.endTree();
    this.tree = rows;
    return rows;
  }

  /** The explorer's rows: the tree, or while filtering the matching notes under their folders
   *  (all unfolded), in tree order. */
  rows(): TreeRow[] {
    const q = this.app.sidebar.filter ?? "";
    if (!q) return this.treeRows();
    if (this.filtered?.query === q && this.filtered.tree === this.treeRows()) return this.filtered.rows;
    const rows: TreeRow[] = [];
    const seen = new Set<string>();
    for (const row of this.fileRows.allNotesInTreeOrder()) {
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

  invalidateTree(): void {
    this.tree = null;
  }
}
