// Search by root (plan 20.16, 21.10; blueprint/design/roots.md § Search scope): ranked by how near a root is, by
// links — the root open first (`here`), then the roots linked to or from it under a divider, then every
// root this machine knows only when widened. Each is searched with its own index, caught up first (a
// scan where it has none, or one still being built); a hit of another root carries its name and its
// full path.

import { isAbsolute } from "node:path";
import { checkoutOf } from "./git.ts";
import type { Graph } from "./graph.ts";
import { readRoots } from "./registry.ts";
import { catchUp, search, type SearchHit, type SearchResult } from "./search.ts";
import { SearchIndex } from "./search-index.ts";
import { isHome, isListed, isVaultRoot, vaultOf } from "./vault.ts";

export const SCOPES = ["here", "linked", "all"] as const;
export type Scope = (typeof SCOPES)[number];

/** A hit, and whose: this root's (`vault` null) or another's, by its name; `abs` opens it. */
export interface ScopedHit extends SearchHit {
  abs: string;
  vault: string | null;
  /** Its path as shown (21.9): here, `docs/plan.md`; elsewhere, from home or absolute. */
  shown: string;
}

export interface ScopedResult extends Omit<SearchResult, "hits"> {
  hits: ScopedHit[];
  /** The other roots searched, nearest first. */
  vaults: string[];
}

/**
 * The roots a scope covers besides this one, nearest first (20.16). `linked`: those this root's
 * notes link into, and those whose notes link here (as of their index); `all`: those, then every
 * other root this machine knows. Never a worktree, even one a note links into by `@branch`: its
 * notes are its main checkout's.
 */
export function scopeRoots(g: Graph, scope: Scope): string[] {
  if (scope === "here" || isListed(g.loc)) return [];
  const out = new Set<string>();
  const add = (abs: string) => {
    // Its vault: a marker's, or home (VV-D2).
    const root = vaultOf(abs);
    if (root && root !== g.root && !checkoutOf(root)?.worktree) out.add(root);
  };
  for (const rel of g.notes.keys()) {
    for (const l of g.entry(rel)?.links ?? []) {
      if (l.kind !== "markdown" && l.kind !== "image") continue;
      const r = g.resolveLink(l, rel);
      if (r.path && isAbsolute(r.path)) add(r.path);
    }
  }
  for (const list of g.reach?.inbound(g).values() ?? []) for (const b of list) add(b.from);
  const linked = [...out];
  if (scope === "linked") return linked;
  const rest = readRoots().filter(
    (v) =>
      (v.kind === "home" ? isHome(v.path) : v.kind === "vault" && isVaultRoot(v.path)) &&
      !v.worktree &&
      v.path !== g.root &&
      !out.has(v.path),
  );
  return [...linked, ...rest.map((v) => v.path)];
}

/**
 * Search this root, and the others its scope covers (20.16): this root's hits first, as `search`
 * ranks them; then the others', by score, each searched with its own index when it has one.
 * `limit` holds for each: this root's, and the others' together.
 */
export function searchScoped(
  g: Graph,
  idx: SearchIndex | null,
  input: string,
  scope: Scope,
  opts: { limit?: number; texts?: Map<string, string> } = {},
): ScopedResult {
  const limit = opts.limit ?? 50;
  const mine = search(g, idx, input, { limit, texts: opts.texts });
  const hits: ScopedHit[] = mine.hits.map((h) => ({ ...h, abs: g.abs(h.path), vault: null, shown: h.path }));
  const { hits: others, vaults } = searchOthers(g, input, scope, limit);
  return { engine: mine.engine, relaxed: mine.relaxed, hits: [...hits, ...others], vaults };
}

/** The other vaults' hits a scope covers (20.16), by score, `limit` at most; and which vaults those were. */
export function searchOthers(
  g: Graph,
  input: string,
  scope: Scope,
  limit = 50,
): { hits: ScopedHit[]; vaults: string[] } {
  const roots = scopeRoots(g, scope);
  const known = new Set(readRoots().map((v) => v.path));
  const others: ScopedHit[] = [];
  for (const root of roots) {
    const og = g.reach?.graphAt(root, { known: known.has(root) }) ?? null;
    if (!og) continue;
    let oi = og.config.search.engine === "scan" || !SearchIndex.exists(og.loc) ? null : SearchIndex.open(og.loc);
    try {
      // As this root's own (cli.ts): still being built, the files scanned; else caught up first.
      if (oi && og.config.search.engine === "auto" && !oi.complete) {
        oi.close();
        oi = null;
      }
      if (oi) catchUp(og, oi);
      const name = g.reach?.vaultOf(root) ?? null;
      for (const h of search(og, oi, input, { limit }).hits) {
        const abs = og.abs(h.path);
        others.push({ ...h, abs, vault: name, shown: g.shownPath(abs) });
      }
    } finally {
      oi?.close();
    }
  }
  others.sort((a, b) => b.score - a.score);
  return { hits: others.slice(0, limit), vaults: roots };
}
