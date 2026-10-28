// Map explorer row paths and exclusions without changing the vault walk or link policy.
import { statSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { MARKER } from "../../../../core/workspace/vaults/registry.ts";
import { isInside, isListed } from "../../../../core/workspace/vaults/vault.ts";
import { vaultName } from "../../../../core/workspace/walk/listing.ts";
import { ANOTHER_DISK } from "../../../../core/workspace/walk/walk.ts";
import { listsName } from "../explorer-disk.ts";
import type { ExplorerReadContext, TreeRow, LeftOut } from "../contracts.ts";

export class ExplorerPaths {
  constructor(private readonly app: Pick<ExplorerReadContext, "graph" | "loc" | "ui">) {}

  /** A vault's name beside its folder's, when it has another one (17.13); none for a worktree, every one of which has
   *  its repository's: its branch tells them apart (17.19), among the row's marks (VV-D9, `marks.ts`). */
  rootName(abs: string): string | undefined {
    return vaultName(abs);
  }

  /** The folders of vaults nested in this one, by their path in it (cheaper than `rootRows`: no names read). */
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
   * is. Why, and the folder (or file) it says it of; or null.
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
