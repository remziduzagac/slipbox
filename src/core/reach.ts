// Other roots, as this one reaches them (17.9, 17.11, 21.6; docs/idea.md, "Between folders"): the root
// holding a path outside this one, and the links other roots make into this one — read from their
// indexes, so as fresh as each one's last indexing. A root reached is opened once, with its own
// config, and its index refreshed then (indexing on demand). The converter's `[[name:note]]` (17.8)
// finds its folder as a pointer does, by name.

import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { loadConfig } from "./config.ts";
import { readJson } from "./fsutil.ts";
import { type Backlink, type Graph, type LinkRef, type NoteEntry, openGraph, type Target, type VaultReach } from "./graph.ts";
import { pathLink } from "./links.ts";
import { folderIdentity, lookupFolder } from "./folders.ts";
import { cacheDir } from "./paths.ts";
import { tildePath } from "./names.ts";
import { type KnownRoot, readRoots } from "./registry.ts";
import { findVaultRoot, isInside, recordLocation, rootAt, type VaultLocation, configFilesFor } from "./vault.ts";
import { isPointer, parsePointer, resolvePointer } from "./pointer.ts";

function real(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}


/**
 * A root opened on its own (a rename or move in it, 18.x): its config, its index refreshed, other
 * roots reached from it — so its backlinks include theirs.
 */
export function openVault(root: string): Graph {
  const loc = rootAt(root);
  recordLocation(loc); // seen, like every open (17.6)
  const g = openGraph(loc, loadConfig({ ...configFilesFor(loc) }).config, true, "lazy");
  g.thorough = true;
  g.reach = new Reach(loc);
  return g;
}

export class Reach implements VaultReach {
  /** Other roots' graphs, by real path; null where one couldn't be opened. */
  private readonly graphs = new Map<string, Graph | null>();
  private inboundCache: { stamp: string; map: Map<string, Backlink[]> } | null = null;

  constructor(readonly here: VaultLocation) {}

  private knownCache: { at: number; list: KnownRoot[] } | null = null;

  /** The machine's roots: read again after a second (another slipbox may add one), not once per link. */
  private known(): KnownRoot[] {
    const now = Date.now();
    if (!this.knownCache || now - this.knownCache.at > 1000) this.knownCache = { at: now, list: readRoots() };
    return this.knownCache.list;
  }

  private names = new Map<string, { at: number; name: string }>();

  /** A root as it's named to the user (21.9): its name (21.6), else its path; looked up again after a second. */
  private shown(root: string): string {
    const now = Date.now();
    const hit = this.names.get(root);
    if (hit && now - hit.at < 1000) return hit.name;
    const name = folderIdentity(root)?.name ?? tildePath(root);
    this.names.set(root, { at: now, name });
    return name;
  }

  /** The graph of another root, opened on first use with its own config; its index refreshed. */
  graphAt(root: string): Graph | null {
    const key = real(root);
    if (this.graphs.has(key)) return this.graphs.get(key)!;
    let g: Graph | null = null;
    try {
      const loc = rootAt(root);
      recordLocation(loc); // reached: known on this machine, its links counted as backlinks (17.11)
      const config = loadConfig({ ...configFilesFor(loc) }).config;
      g = openGraph(loc, config, true, "lazy");
      g.thorough = true;
    } catch {
      g = null;
    }
    this.graphs.set(key, g);
    return g;
  }

  /**
   * The roots nested in `g` and the ones it sits in (17.17): the walk and the folders above know
   * them, so they're recorded — their links counted as backlinks — without having been opened first.
   * A nested root with no index yet is indexed now (they're small; an enclosing one isn't: it's used
   * as of its last indexing).
   */
  private discovered = false;

  discover(g: Graph): void {
    if (this.discovered) return;
    this.discovered = true;
    const roots: { root: string; nested: boolean }[] = g.skipped.filter((s) => s.reason === "nested vault").map((s) => ({ root: join(g.root, s.rel), nested: true }));
    for (let up = findVaultRoot(dirname(g.root)); up; up = findVaultRoot(dirname(up))) roots.push({ root: up, nested: false });
    for (const { root, nested } of roots) {
      let loc: VaultLocation;
      try {
        loc = rootAt(root);
      } catch {
        continue;
      }
      recordLocation(loc);
      if (nested && !existsSync(join(cacheDir(loc), "index.json"))) this.graphAt(root)?.ensureAll();
    }
    this.knownCache = null;
  }

  /** The converter's `[[name:note]]` (17.8): the note in the folder of that name (21.6), as a pointer
   *  finds it; null when no folder has that name (`[[Meeting: Q3]]` may be an alias, 21.3). */
  wiki(vault: string, target: string, _g: Graph): Target | null {
    const l = lookupFolder(vault);
    if (l.status === "unknown") return null;
    if (l.status === "ambiguous") return { resolvedKind: "ambiguous", path: null, candidates: l.folders.map((f) => f.default ?? f.copies[0]!.path).sort(), vault, reason: l.reason };
    if (l.status === "unavailable") return { resolvedKind: "unresolved", path: null, candidates: [], vault, reason: `folder "${vault}" was last seen at ${l.path}` };
    const there = this.graphAt(l.path);
    if (!there) return { resolvedKind: "unresolved", path: null, candidates: [], vault, reason: `folder "${vault}" at ${l.path} can't be read` };
    const r = there.resolveLegacyWiki({ kind: "wiki", target }, "");
    const abs = (p: string) => join(there.root, p);
    const name = l.folder.name;
    const via: Target["via"] = l.via === "old-name" ? "previous-name" : r.via;
    if (r.resolvedKind === "note" || r.resolvedKind === "file") return { ...r, path: abs(r.path!), candidates: r.candidates.map(abs), vault: name, via };
    if (r.resolvedKind === "ambiguous") return { ...r, candidates: r.candidates.map(abs), vault: name };
    return { resolvedKind: "unresolved", path: null, candidates: [], vault: name, reason: `no note "${target}" in folder "${name}"` };
  }

  vaultOf(abs: string): string | null {
    const found = findVaultRoot(abs);
    return found ? this.shown(found) : null;
  }

  entryAt(abs: string): NoteEntry | undefined {
    const found = findVaultRoot(abs);
    if (!found) return undefined;
    const g = this.graphAt(found);
    return g?.entry(relative(g.root, abs));
  }

  inbound(g: Graph): Map<string, Backlink[]> {
    this.discover(g);
    const here = real(g.root);
    // Not a worktree's (17.19): its notes are copies of the main checkout's, its links counted there.
    const sources = this.known().filter((v) => v.kind === "vault" && !v.worktree && real(v.path) !== here && existsSync(v.path));
    const indexes = sources.map((v) => ({ v, file: join(cacheDir(v), "index.json") }));
    const stamp = indexes.map((x) => `${x.file}:${mtime(x.file)}`).join("|");
    if (this.inboundCache?.stamp === stamp) return this.inboundCache.map;
    const map = new Map<string, Backlink[]>();
    for (const { v, file } of indexes) {
      const index = readJson<{ entries?: Record<string, NoteEntry> } | null>(file, null);
      if (!index?.entries || typeof index.entries !== "object") continue;
      for (const [rel, entry] of Object.entries(index.entries)) {
        for (const l of entry?.links ?? []) {
          const to = this.landsHere(g, v, rel, l);
          if (!to) continue;
          const list = map.get(to) ?? [];
          // Another vault's index may be older than this one's: no ends then, the start stands in.
          list.push({ from: join(v.path, rel), vault: this.shown(v.path), line: l.line, column: l.column, end: l.end ?? { line: l.line, column: l.column }, text: l.text, kind: l.kind, target: l.target, heading: l.heading, block: l.block, alias: l.alias });
          map.set(to, list);
        }
      }
    }
    this.inboundCache = { stamp, map };
    return map;
  }

  /** The note of `g` a link in another vault reaches, if it reaches one. */
  private landsHere(g: Graph, v: KnownRoot, rel: string, l: LinkRef): string | null {
    const linking = join(v.path, rel);
    // A file of `g` by its absolute path: its vault path there.
    const inG = (abs: string) => {
      if (!isInside(g.root, abs)) return null;
      // Its path from the vault's root, as a link from there reads it (its own spelling, 1.4).
      const r = g.resolveLink({ kind: "markdown", target: posix.normalize(relative(g.root, abs)) }, "");
      return (r.resolvedKind === "note" || r.resolvedKind === "file") && r.path && !isAbsolute(r.path) ? r.path : null;
    };
    // A wikilink or embed reaches another root by a path out of its own (`[[../A/note]]`, as the
    // graph reads it); names stay within their root (21.3).
    if (l.kind === "wiki" || l.kind === "embed") {
      if (!/^\.\.?\//.test(l.target)) return null;
      const hit = pathLink(l.target, linking, true);
      return hit ? inG(hit.abs) : null;
    }
    // A picture's link counts as a link's does (its notes are its backlinks).
    if (l.kind !== "markdown" && l.kind !== "image") return null;
    // A pointer (21.7): where this machine has its folder — here, a backlink.
    if (isPointer(l.target)) {
      const p = parsePointer(l.target);
      const t = p ? resolvePointer(p) : null;
      const hit = t?.status === "found" ? pathLink(t.abs, linking, false) : null;
      return hit ? inG(hit.abs) : null;
    }
    const fileUrl = /^file:\/\//i.test(l.target);
    if (/^[a-z][a-z0-9+.-]*:/i.test(l.target) && !fileUrl) return null;
    const path = fileUrl ? l.target : l.target.split("#")[0]!;
    if (!path) return null;
    const hit = pathLink(path, linking, false);
    if (hit) return inG(hit.abs);
    // `/x.md` is the other vault's own root; any other relative path, from the linking note.
    if (path.startsWith("/") || fileUrl || path.startsWith("~/")) return null;
    let decoded = path;
    try {
      decoded = decodeURIComponent(path);
    } catch {}
    return inG(resolve(dirname(linking), decoded));
  }
}

function mtime(f: string): number {
  try {
    return statSync(f).mtimeMs;
  } catch {
    return 0;
  }
}
