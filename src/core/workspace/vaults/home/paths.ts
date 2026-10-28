// Home folder containment, nearest roots and left-out-path policy.

import { realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { isLink } from "../symlinks.ts";
import { LINK_REASON, symlinkVerdict } from "../../walk/traversal/symlinks.ts";
import type { WalkFilter } from "../../walk/filtering/filter.ts";

/** Whether `rel` is the folder `dir` or in it (`""`: home's top, holding everything). */
export const under = (rel: string, dir: string): boolean => dir === "" || rel === dir || rel.startsWith(`${dir}/`);

export const isDir = (abs: string) => {
  try {
    return statSync(abs).isDirectory();
  } catch {
    return false;
  }
};

/** Whether `rel` is one of `folders` or in one (home's paths for folders asked for by name). */
export const inFolders = (rel: string, folders: readonly string[]): boolean =>
  folders.some((d) => d !== "" && under(rel, d));

export const depth = (rel: string) => rel.split("/").length;

/**
 * The order home's cap keeps in (VV-D2): the nearest the top first, then by path — so what it leaves out is the
 * deepest, the last by path of those as deep.
 */
export const nearer = (a: string, b: string) => depth(a) - depth(b) || (a < b ? -1 : a > b ? 1 : 0);

/** As many of `items` as `n` allows, those nearest the top (`nearer`), by their paths (`rel`). */
export function nearestTop<T>(items: T[], n: number, rel: (x: T) => string): T[] {
  return items.length <= n ? items : [...items].sort((a, b) => nearer(rel(a), rel(b))).slice(0, Math.max(0, n));
}

/**
 * The note home's cap leaves out first (VV-D2): of `rels`, the deepest out of `folders` (those asked for by name, none
 * of theirs ever left out), the last by path of those as deep; null when every one is in them.
 */
export function deepestOutside(rels: Iterable<string>, folders: readonly string[]): string | null {
  let out: string | null = null;
  for (const rel of rels) if (!inFolders(rel, folders) && (out === null || nearer(rel, out) > 0)) out = rel;
  return out;
}

/**
 * Why home's walk doesn't go into the folder `rel` (home's path for it; VV-D2), or null when it does: something on its
 * way that home's skip list leaves out (`exclusion`'s reason: `Downloads`, `hidden`, `another disk`…), a vault of its
 * own, a link the walk wouldn't go through (VV-D6), or no folder there.
 */
export function leftOutOfHome(root: string, filter: WalkFilter, rel: string): string | null {
  let realRoot = root;
  try {
    realRoot = realpathSync(root);
  } catch {}
  const parts = rel.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const name = parts[i - 1]!;
    const p = parts.slice(0, i).join("/");
    if (!name || name === "." || name === "..") return "not a folder of home";
    const why = filter.exclusion(p, true);
    if (why !== null) return why;
    const abs = join(root, p);
    if (isLink(abs)) {
      const v = symlinkVerdict(abs, realRoot);
      if (!v.kept) return v.reason ?? LINK_REASON.out;
    }
  }
  return isDir(join(root, rel)) ? null : "not a folder";
}

/** Whether home's walk goes into the folder `rel` (home's path for it; VV-D2): `leftOutOfHome` has no reason. */
export function walksInto(root: string, filter: WalkFilter, rel: string): boolean {
  return leftOutOfHome(root, filter, rel) === null;
}
