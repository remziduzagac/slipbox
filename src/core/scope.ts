// Search by vault (plan 20.16; docs/idea.md, "Search"): ranked by how near a vault is, by links —
// the vault open first, then the vaults linked to or from it under a divider, then every vault this
// machine knows only when widened. Each vault is searched with its own index (a scan where it has
// none); a hit of another vault carries its name and its full path.

import { isAbsolute } from "node:path";
import type { Graph } from "./graph.ts";
import { readRegistry } from "./registry.ts";
import { search, type SearchHit, type SearchResult } from "./search.ts";
import { SearchIndex } from "./search-index.ts";
import { findVaultRoot, isListed, isVaultRoot } from "./vault.ts";

export const SCOPES = ["vault", "linked", "all"] as const;
export type Scope = (typeof SCOPES)[number];

/** A hit, and whose: this vault's (`vault` null) or another's, by its name; `abs` opens it. */
export interface ScopedHit extends SearchHit {
  abs: string;
  vault: string | null;
  /** Its path as shown: here, `docs/plan.md`; elsewhere, `research:algorithms/dijkstra.md`. */
  shown: string;
}

export interface ScopedResult extends Omit<SearchResult, "hits"> {
  hits: ScopedHit[];
  /** The other vaults searched, nearest first. */
  vaults: string[];
}

/**
 * The vaults a scope covers besides this one, nearest first (20.16). `linked`: those this vault's
 * notes link into, and those whose notes link here (as of their index); `all`: those, then every
 * other vault this machine knows (not worktrees: their notes are their main checkout's).
 */
export function scopeRoots(g: Graph, scope: Scope): string[] {
  if (scope === "vault" || isListed(g.loc)) return [];
  const out = new Set<string>();
  const add = (abs: string) => {
    const root = findVaultRoot(abs);
    if (root && root !== g.root) out.add(root);
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
  const rest = readRegistry().filter((v) => v.kind === "vault" && !v.worktree && v.path !== g.root && !out.has(v.path) && isVaultRoot(v.path));
  return [...linked, ...rest.map((v) => v.path)];
}

/**
 * Search this vault, and the others its scope covers (20.16): this vault's hits first, as `search`
 * ranks them; then the others', by score, each vault searched with its own index when it has one.
 * `limit` holds for each: this vault's, and the others' together.
 */
export function searchScoped(g: Graph, idx: SearchIndex | null, input: string, scope: Scope, opts: { limit?: number; texts?: Map<string, string> } = {}): ScopedResult {
  const limit = opts.limit ?? 50;
  const mine = search(g, idx, input, { limit, texts: opts.texts });
  const hits: ScopedHit[] = mine.hits.map((h) => ({ ...h, abs: g.abs(h.path), vault: null, shown: h.path }));
  const { hits: others, vaults } = searchOthers(g, input, scope, limit);
  return { engine: mine.engine, relaxed: mine.relaxed, hits: [...hits, ...others], vaults };
}

/** The other vaults' hits a scope covers (20.16), by score, `limit` at most; and which vaults those were. */
export function searchOthers(g: Graph, input: string, scope: Scope, limit = 50): { hits: ScopedHit[]; vaults: string[] } {
  const roots = scopeRoots(g, scope);
  const others: ScopedHit[] = [];
  for (const root of roots) {
    const og = g.reach?.graphAt(root) ?? null;
    if (!og) continue;
    const oi = og.config.search.engine === "scan" || !SearchIndex.exists(og.loc) ? null : SearchIndex.open(og.loc);
    try {
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
