// Explorer item menus and dispatch preserve feature-owned file, vault and navigation policy.
import { dirname, posix, relative, sep } from "node:path";
import { folderUnreadable } from "../../../../core/foundation/platform/fsutil.ts";
import { tildePath } from "../../../../core/workspace/vaults/names.ts";
import { isInside, locationAt } from "../../../../core/workspace/vaults/vault.ts";
import { linkScope } from "../../../../core/workspace/vaults/symlinks.ts";
import { LINK_REASON } from "../../../../core/workspace/walk/walk.ts";
import { prettyKey } from "../../../shell/input/keys.ts";
import type { ExplorerActionHost, ExplorerItem, TreeRow } from "../contracts.ts";
import type { ListItem } from "../../../shell/overlays/list-types.ts";

/** What acts on the selected row's own path: never on a row that only says something of its folder (`listing…`,
 *  `can't read: …`). */
const ON_THE_ROW: ReadonlySet<string> = new Set([
  "open",
  "open_tab",
  "open_split",
  "expand",
  "zoom_in",
  "copy_path",
  "rename",
  "rename_root",
  "move",
  "delete",
  "copy",
  "cut",
  "make_root",
  "unmake_root",
]);

export class ExplorerActions {
  constructor(private readonly host: ExplorerActionHost) {}
  get app() {
    return this.host.app;
  }

  /** What the explorer's selected row names: a note or file, a folder, or a vault nested in this
   *  one (its folder); the rows outside its own tree name nothing to change. */
  item(): ExplorerItem | null {
    if (this.app.leftView !== "explorer") return null;
    const row = this.host.rows()[this.app.sidebar.selected];
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
   * A hidden file of the vault open, listed (`files.hidden`) and opened: reached (20.8), the vault's from now on, as
   * `:e` makes it. Not in home, whose walk never takes one, nor in `.slipbox`, nor under what the walk leaves out
   * otherwise (a git-ignored folder's row opens its file unreached).
   */
  private reachHidden(row: TreeRow): void {
    if (!row.outside || row.kind !== "note") return;
    const abs = this.host.rowAbs(row);
    if (this.host.leftOutAt(abs)?.why !== "hidden") return;
    this.app.graph.reachFile(relative(this.app.loc.root, abs).split(sep).join("/"), { keep: true });
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
      this.host.reveal(rel || ".", true);
      return true;
    }
    const abs = this.host.rowAbs(row);
    // Out of the vault open, by the rule of the place it's in too (VV-D6): never listed unasked.
    const there = row.outside ? locationAt(dirname(abs)) : undefined;
    return this.app.following.gate(
      abs,
      () => {
        this.host.invalidateTree();
        const at = this.host.rows().findIndex((r) => r.path === this.host.rowPath(abs));
        if (at >= 0) this.app.sidebar.selected = at;
        this.action(action);
      },
      there,
    );
  }

  action(action: string): void | Promise<void> {
    this.app.sidebar.pinned = false;
    // Moved by you: a row meant to be selected once listed isn't any more.
    this.host.wanted = null;
    if (this.app.leftView === "history") return this.app.history.action(action);
    if (this.app.leftView === "git") return this.app.gitPanel.action(action);
    if (action === "filter") {
      this.app.sidebar.filtering = true; // resumes a filter already there (a view's restored one)
      return;
    }
    const rows = this.host.rows();
    const row = rows[this.app.sidebar.selected];
    // A row that only says something of its folder (T12: `listing…`): nothing acts on its own path — what doesn't act
    // on the row (moving, folding its folder, restoring, a new note) does as on any row of its folder.
    if (row?.placeholder && ON_THE_ROW.has(action)) return;
    // A link to a folder not followed asks first (VV-D6); a second name for one of the vault's goes to it.
    if (row?.link?.dir && ["open", "expand", "open_tab", "zoom_in"].includes(action) && this.linkFirst(row, action))
      return;
    // A folder, or the vault open's row in a view above it: unfolded (or folded, `toggle`) in place.
    const unfold = (toggle = false) => {
      if (!row || row.placeholder) return;
      if (toggle && this.host.expanded.has(row.path)) this.host.expanded.delete(row.path);
      else if (!this.host.expanded.has(row.path)) {
        // One you may not read, wherever it is: one the vault's walk couldn't read is listed too (VV-D9) — one listed
        // off the main thread as its listing read it (T12).
        const why =
          row.kind === "note"
            ? null
            : row.listed
              ? (row.listed.unreadable ?? null)
              : folderUnreadable(this.host.rowAbs(row));
        if (why) {
          // As its folder's listing read it: that listing read again, and its own, so one you may read now (a chmod
          // since) unfolds next time, its rows there — nothing else in its folder read again.
          if (row.listed) {
            this.host.listings.again(dirname(this.host.rowAbs(row)));
            this.host.listings.again(this.host.rowAbs(row));
            this.host.invalidateTree();
          }
          return this.app.message("warn", `can't read ${tildePath(this.host.rowAbs(row))}: ${why}`);
        }
        this.host.expanded.add(row.path);
      }
      this.host.invalidateTree();
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
        const abs = this.host.rowAbs(row);
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
        this.host.invalidateTree();
        const again = this.host.rows().findIndex((r) => r.path === at);
        if (again >= 0) this.app.sidebar.selected = again;
        const shown = this.host.filesShown();
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
        if (row?.kind === "dir" && this.host.expanded.has(row.path)) break;
        openNote("here");
        break;
      case "expand":
        // A folder unfolds in place, a vault's too (VV-D5) — the one open, another, one nested here; a note opens as a
        // tab.
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
        if (row.kind !== "note" && this.host.expanded.has(row.path)) {
          this.host.expanded.delete(row.path);
          this.host.invalidateTree();
          break;
        }
        const parent = dirname(this.host.rowAbs(row));
        if (parent === this.host.top || !isInside(this.host.top, parent)) break;
        const dir = this.host.rowPath(parent);
        this.host.expanded.delete(dir);
        this.host.invalidateTree();
        this.app.sidebar.selected = Math.max(
          0,
          this.host.treeRows().findIndex((r) => r.path === dir),
        );
        break;
      }
      case "zoom_in":
        return this.host.zoomIn();
      case "zoom_out":
        return this.host.zoomOut();
      case "close":
        this.app.panels.showSidebar(false);
        break;
      case "leave":
        this.app.panels.leave("sidebar");
        break;
      default:
        this.app.message("error", `unknown explorer action: ${action}`);
    }
  }
}
