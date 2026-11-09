// A file opened by its path: the prompt (`space f e`, `note.open_path`) and the switcher given a path (one starting
// `/`, `~/`, `./` or `../`). What's typed is read as `:e` reads it — `~` home, a relative path from the vault's top —
// and its folder listed as it's typed: the entries whose names hold what's begun after its last `/`. `tab` completes
// the selected entry into the path, `enter` goes into a folder or opens a file through `:e` (`note.open`: into another
// vault, asked first, D270), `ctrl+w` goes back a folder. A folder is read as the explorer reads one outside the vault:
// off the main thread (T12), so one on a disk that answers slowly never holds up the keys.

import { join, resolve } from "node:path";
import { unreadableWords } from "../../../core/foundation/platform/fsutil.ts";
import { tildePath, untildePath } from "../../../core/foundation/platform/paths.ts";
import { type FolderListing, type ListedEntry, listFolder } from "../../../core/workspace/walk/listing.ts";
import { listThreads } from "../../../core/workspace/walk/walk-thread.ts";
import type { App } from "../../app/runtime/app.ts";
import type { ListItem, ListOverlay } from "./list-types.ts";
import { rank } from "./match.ts";
import { refilter } from "./overlays.ts";

/** A path in the switcher: what starts `/`, `~/`, `./` or `../`. */
export function isPath(input: string): boolean {
  return /^(\/|~\/|\.\.?\/)/.test(input);
}

/** A path row's entry: where it is, whether it's a folder, and the path it completes what's typed to. */
export class PathPick {
  constructor(
    readonly abs: string,
    readonly dir: boolean,
    readonly typed: string,
  ) {}
}

/** The path row a list item is, or null. */
export function pathPick(item: ListItem | undefined): PathPick | null {
  return item?.data instanceof PathPick ? item.data : null;
}

/**
 * What's typed, split at its last `/`: the folder it names, whole (`~` home, a relative one from `base`), that folder
 * as typed, and the name begun in it.
 */
export function typedPath(input: string, base: string, home: string): { dir: string; typedDir: string; name: string } {
  const cut = input.lastIndexOf("/") + 1;
  const typedDir = input.slice(0, cut);
  return { dir: resolve(base, untildePath(typedDir || ".", home)), typedDir, name: input.slice(cut) };
}

/**
 * A folder's rows for the name begun in it: with none, every entry, its folders first, each by name; with one, the
 * entries holding it as every list matches (the best first). A hidden name only when `hidden` (`files.hidden`) or the
 * name begun starts with a dot. A file's row has its place, for a list of places' preview (the switcher's).
 */
export function entryRows(listing: FolderListing, typedDir: string, name: string, hidden: boolean): ListItem[] {
  const shown = listing.entries.filter(
    (e) => (e.dir || e.file) && (hidden || name.startsWith(".") || !e.name.startsWith(".")),
  );
  const byName = (a: ListedEntry, b: ListedEntry) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const ordered = name.trim()
    ? rank(name, shown, (e) => e.name, Number.POSITIVE_INFINITY).map((r) => r.item)
    : [...shown.filter((e) => e.dir).sort(byName), ...shown.filter((e) => !e.dir).sort(byName)];
  return ordered.map((e): ListItem => {
    const abs = join(listing.dir, e.name);
    const pick = new PathPick(abs, e.dir, `${typedDir}${e.name}${e.dir ? "/" : ""}`);
    return e.dir ? { label: `${e.name}/`, data: pick } : { label: e.name, place: { abs, line: 0 }, data: pick };
  });
}

/** A line the list says, never picked: a folder being read, or why it can't be. */
function said(text: string): ListItem {
  return { label: text, header: true, informational: true, data: null };
}

/**
 * The paths of one list while it's open: the folders typed into, each read once and kept, and its keys. `when` says
 * whether what's typed is a path (the switcher's is only sometimes).
 */
export class PathCompletion {
  private readonly kept = new Map<string, FolderListing | null>();
  /** The list it serves, once open: a folder read meanwhile fills it, while it's open and a path is typed. */
  private list: ListOverlay | null = null;

  constructor(
    private readonly app: App,
    private readonly when: (input: string) => boolean = () => true,
  ) {}

  /** The list just opened: the one a folder read refills. */
  attach(o: App["overlay"]): void {
    this.list = o?.kind === "list" ? o : null;
  }

  /** The rows for what's typed: its folder's entries for the name begun; a line while it's read, or why it can't be. */
  rows(input: string): ListItem[] {
    const a = this.app;
    if (input === "~") return [{ label: "~/", data: new PathPick(a.home, true, "~/") }];
    const t = typedPath(input, a.loc.root, a.home);
    const listing = this.listing(t.dir);
    const where = tildePath(t.dir, a.home);
    if (!listing) return [said(`reading ${where}…`)];
    if (listing.error) return [said(`${where}: ${unreadableWords(listing.error)}`)];
    return entryRows(listing, t.typedDir, t.name, a.ui.hidden_files);
  }

  /** `dir` as read for this list: null while it's read on a listing thread (the TUI's; a test's App reads it here). */
  private listing(dir: string): FolderListing | null {
    const a = this.app;
    const had = this.kept.get(dir);
    if (had !== undefined) return had;
    if (!a.explorer.listings.offThread) {
      const now = listFolder(dir, a.config.walk, true);
      this.kept.set(dir, now);
      return now;
    }
    this.kept.set(dir, null);
    listThreads()
      .list(dir, a.config.walk, true)
      .then(
        (listing) => this.came(dir, listing),
        (err: Error) => this.came(dir, { dir, error: err.message, entries: [], notes: false, scope: null }),
      );
    return null;
  }

  /** A folder read: kept, and the list filled again if it's still open on a path. */
  private came(dir: string, listing: FolderListing): void {
    this.kept.set(dir, listing);
    const o = this.list;
    if (!o || this.app.overlay !== o || !this.when(o.input) || this.app.quitting) return;
    const at = o.selected;
    refilter(o);
    if (pathPick(o.filtered[at]?.item)) o.selected = at;
    this.app.host.requestRender();
  }

  /** What's typed, now `text`: the rows for it. */
  private type(o: ListOverlay, text: string): void {
    o.input = text;
    refilter(o);
  }

  /**
   * A key, while what's typed is a path: `tab` completes it to the selected entry, `enter` on a folder goes into it,
   * `ctrl+w` (`ctrl+backspace`) goes back a folder. True when it took the key.
   */
  key(key: string, item: ListItem | undefined): boolean {
    const o = this.list;
    if (!o || !this.when(o.input)) return false;
    const pick = pathPick(item);
    if (key === "tab") {
      if (pick) this.type(o, pick.typed);
      return true;
    }
    if (key === "enter" && pick?.dir) {
      this.type(o, pick.typed);
      return true;
    }
    if (key === "ctrl+w" || key === "ctrl+backspace") {
      this.type(o, o.input.replace(/[^/]*\/?$/, ""));
      return true;
    }
    return false;
  }

  /** Enter with no entry to pick (none matches, or the folder is still being read): the path as typed, opened. */
  submit(): boolean {
    const o = this.list;
    if (!o || !this.when(o.input) || o.filtered.some((e) => !e.item.header)) return false;
    this.app.overlay = null;
    const abs = resolve(this.app.loc.root, untildePath(o.input, this.app.home));
    void this.app.run(`note.open ${abs}`).then(() => this.app.host.requestRender());
    return true;
  }

  /** A row picked: a file opened as `:e` opens it; a folder (`alt+enter`'s Here) gone into, the list open again. */
  async open(pick: PathPick): Promise<void> {
    const o = this.list;
    if (pick.dir && o) {
      this.app.overlay = o;
      return this.type(o, pick.typed);
    }
    await this.app.run(`note.open ${pick.abs}`);
  }
}

/** `space f e` (`note.open_path`): a path asked for, completed as it's typed, the file opened as `:e` opens it. */
export function openPathPrompt(a: App): void {
  const paths = new PathCompletion(a);
  a.overlays.openList({
    title: "Open by path — tab completes, ~ is home",
    items: [],
    source: (input) => paths.rows(input),
    key: (key, item) => paths.key(key, item),
    submit: () => paths.submit(),
    accept: (item) => {
      const pick = pathPick(item);
      if (pick) return paths.open(pick);
    },
  });
  paths.attach(a.overlay);
}
