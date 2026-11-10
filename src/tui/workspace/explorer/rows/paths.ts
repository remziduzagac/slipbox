// Map explorer row paths and exclusions without changing the vault walk or link policy. Whether a path of the vault
// open is left out is asked of the listings its tree is built of (SD-T7): each folder on its way as the listing of the
// folder holding it judged it, on a disk thread; by its name alone while that listing is read.
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { MARKER } from "../../../../core/workspace/vaults/registry.ts";
import { isInside, isListed } from "../../../../core/workspace/vaults/vault.ts";
import type { FolderListing, ListedEntry } from "../../../../core/workspace/walk/listing.ts";
import { ALWAYS_SKIPPED } from "../../../../core/workspace/walk/filtering/policy.ts";
import { ANOTHER_DISK } from "../../../../core/workspace/walk/walk.ts";
import { listsName } from "../explorer-disk.ts";
import type { ExplorerReadContext, ExplorerRowState, TreeRow, LeftOut } from "../contracts.ts";

/** A listing's entries by name, made once for each listing. */
const byName = new WeakMap<FolderListing, Map<string, ListedEntry>>();

export class ExplorerPaths {
  constructor(
    private readonly app: Pick<ExplorerReadContext, "graph" | "loc" | "ui">,
    /** The explorer's listings, as they are now (a test puts others in). */
    private readonly listings: () => ExplorerRowState["listings"],
  ) {}

  /** What the listing of the folder holding `abs`, a folder of the vault open's own tree, read of it: none while it's
   *  read, or when it lists none such. */
  listedAt(abs: string): ListedEntry | undefined {
    const listing = this.listings().get(dirname(abs), true);
    if (!listing) return undefined;
    let names = byName.get(listing);
    if (!names) byName.set(listing, (names = new Map(listing.entries.map((e) => [e.name, e]))));
    return names.get(basename(abs));
  }

  /** The folders of vaults nested in this one, by their path in it. */
  nestedRels(): string[] {
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
  unwalkedRels(): string[] {
    if (isListed(this.app.loc)) return [];
    return this.app.graph.skipped.filter((s) => s.link?.dir).map((s) => s.rel);
  }

  /**
   * A path of the vault open (its path in it, and absolute) that its walk leaves out: at, or under, what it excludes
   * (VV-D8) — a hidden name in home, and in a vault while the explorer lists them (`files.hidden`), each then a row by
   * its path; else, in a vault, a hidden note reached by a link is in its tree (20.8), as a hidden file reached always
   * is. Why, and the folder (or file) it says it of; or null. Each on its way as its folder's listing judged it.
   */
  leftOut(rel: string, abs: string): LeftOut | null {
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
      const prefix = parts.slice(0, i).join("/");
      const listed = this.listedAt(join(R, prefix));
      // A folder on the way; the path itself as its listing found it (a folder when it isn't there).
      const dir = i < parts.length || (listed?.dir ?? true);
      const why = listed?.excluded !== undefined ? listed.excluded : this.byName(prefix, dir);
      if (why === null || why === "nested vault") continue;
      if (why === "hidden" && !filter.home && (!shown || (i === parts.length && this.app.graph.known(rel)))) continue;
      return { why, at: join(R, ...parts.slice(0, i)) };
    }
    return null;
  }

  /** Why the walk leaves out `rel` by its name alone, while its folder's listing is read: slipbox's and git's own
   *  folders, a hidden name, one `walk.exclude` names — what it holds, or `.gitignore`, said once that listing comes. */
  private byName(rel: string, dir: boolean): string | null {
    const name = rel.slice(rel.lastIndexOf("/") + 1);
    if (ALWAYS_SKIPPED.has(name)) return "always skipped";
    if (name.startsWith(".")) return "hidden";
    return this.app.graph.filter.excludes(rel, dir) ? "walk.exclude" : null;
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

  /** A row's path, absolute. */
  rowAbs(row: Pick<TreeRow, "path">): string {
    return isAbsolute(row.path) ? row.path : join(this.app.loc.root, row.path);
  }

  /** The view at `dir` shows the vault open's own tree from there: its path in it ("" its top); else null. */
  ownView(dir: string): string | null {
    // Elsewhere (VV-D3): every folder listed a level at a time, wherever the view is.
    if (isListed(this.app.loc)) return null;
    if (dir === this.app.loc.root) return "";
    const p = this.rowPath(dir);
    return isAbsolute(p) || this.nestedRels().includes(p) || this.unwalkedRels().includes(p) ? null : p;
  }
}

/** A hidden name listed (`files.hidden`) where nothing holding it is left out: why no walk takes it — `hidden`, or
 *  slipbox's own folder — said of itself; null for any other name. */
export function hiddenOut(name: string, abs: string): LeftOut | null {
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
