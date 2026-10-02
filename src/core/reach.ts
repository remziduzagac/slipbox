// Other vaults, as this one reaches them (17.8, 17.9, 17.11; docs/idea.md, "Links"):
// `[[vault:name]]` found through the machine's list of vaults, the root holding a path outside this
// one, and the links other vaults make into this one — read from their indexes, so as fresh as
// each vault's last indexing. A vault reached is opened once, with its own config, and its index
// refreshed then (indexing on demand).

import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { loadConfig } from "./config.ts";
import { readJson } from "./fsutil.ts";
import { type Backlink, type Graph, type LinkRef, type NoteEntry, openGraph, type Target, VAULT_LINK, type VaultReach } from "./graph.ts";
import { pathLink } from "./links.ts";
import { cacheDir } from "./paths.ts";
import { type KnownVault, namesOf, readIdentity, readRegistry, vaultConfigFile } from "./registry.ts";
import { findVaultRoot, isInside, recordLocation, rootAt, type VaultLocation, vaultConfigPath } from "./vault.ts";

function real(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/** The shown name of a known vault: its name, else its folder's. */
function shown(v: Pick<KnownVault, "name" | "path">): string {
  return v.name ?? basename(v.path);
}

/**
 * A vault opened on its own (a rename or move of it, 18.x): its config, its index refreshed, other
 * vaults reached from it — so its backlinks include theirs.
 */
export function openVault(root: string): Graph {
  const loc = rootAt(root);
  recordLocation(loc); // seen, like every open (17.6)
  const g = openGraph(loc, loadConfig({ vaultFile: vaultConfigPath(loc) }).config, true, "lazy");
  g.thorough = true;
  g.reach = new Reach(loc);
  return g;
}

/** Whether a known vault is nested in the vault at `at` (real), or holds it. */
function kin(at: string, v: KnownVault): boolean {
  const p = real(v.path);
  return isInside(at, p) || isInside(p, at);
}

export class Reach implements VaultReach {
  /** Other roots' graphs, by real path; null where one couldn't be opened. */
  private readonly graphs = new Map<string, Graph | null>();
  private inboundCache: { stamp: string; map: Map<string, Backlink[]> } | null = null;

  constructor(readonly here: VaultLocation) {}

  private knownCache: { at: number; list: KnownVault[] } | null = null;

  /** The machine's vaults: read again after a second (another slipbox may add one), not once per
   *  link — the renderer resolves every `[[vault:note]]` on the screen. */
  private known(): KnownVault[] {
    const now = Date.now();
    if (!this.knownCache || now - this.knownCache.at > 1000) this.knownCache = { at: now, list: readRegistry() };
    return this.knownCache.list;
  }

  /** The graph of another root, opened on first use with its own config; its index refreshed. */
  graphAt(root: string): Graph | null {
    const key = real(root);
    if (this.graphs.has(key)) return this.graphs.get(key)!;
    let g: Graph | null = null;
    try {
      const loc = rootAt(root);
      const config = loadConfig({ vaultFile: vaultConfigPath(loc) }).config;
      g = openGraph(loc, config, true, "lazy");
      g.thorough = true;
    } catch {
      g = null;
    }
    this.graphs.set(key, g);
    return g;
  }

  /**
   * The vaults nested in `g` and the ones it sits in (17.17): the walk and the folders above know
   * them, so they're recorded — linked by name at once, their links counted as backlinks — without
   * having been opened first. A nested vault with no index yet is indexed now (they're small; an
   * enclosing one isn't: it's used as of its last indexing).
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

  wiki(vault: string, target: string, g: Graph): Target | null {
    const n = vault.toLowerCase();
    const here = real(this.here.root);
    // Unknown, or known only elsewhere (a second clone's own nested vault isn't recorded yet): look
    // at the vaults nested in this one and holding it.
    if (!this.meant(n, here).some((v) => kin(here, v))) this.discover(g);
    const others = this.known().filter((v) => (v.kind === "vault" || v.kind === "home") && real(v.path) !== here);
    let hits = this.meant(n, here);
    let via: Target["via"];
    if (!hits.length) {
      // A name the vault had (17.7): only when the vault itself still says so, under the same id,
      // so a new vault that took an old name can't take its links.
      hits = others.filter((v) => v.id && v.previous_names.some((p) => p.toLowerCase() === n) && existsSync(v.path) && readIdentity(vaultConfigFile(v.path)).id === v.id);
      if (hits.length) via = "previous-name";
    }
    if (!hits.length) return { resolvedKind: "unresolved", path: null, candidates: [], vault, reason: `unknown vault "${vault}"` };
    if (hits.length > 1) return { resolvedKind: "ambiguous", path: null, candidates: hits.map((v) => v.path).sort(), vault, reason: `several vaults are named "${vault}"` };
    const v = hits[0]!;
    if (v.kind === "home") return { resolvedKind: "unresolved", path: null, candidates: [], vault, reason: "the home vault isn't a link target: link a loose file by its path" };
    if (!existsSync(join(v.path, ".slipbox"))) {
      return { resolvedKind: "unresolved", path: null, candidates: [], vault, reason: `vault "${vault}" was last seen at ${v.path} (${v.seen.slice(0, 10)})` };
    }
    const there = this.graphAt(v.path);
    if (!there) return { resolvedKind: "unresolved", path: null, candidates: [], vault, reason: `vault "${vault}" at ${v.path} can't be read` };
    const r = there.resolveLink({ kind: "wiki", target }, "");
    const abs = (p: string) => join(there.root, p);
    const name = shown(v);
    if (r.resolvedKind === "note" || r.resolvedKind === "file") return { ...r, path: abs(r.path!), candidates: r.candidates.map(abs), vault: name, via: via ?? r.via };
    if (r.resolvedKind === "ambiguous") return { ...r, candidates: r.candidates.map(abs), vault: name };
    return { resolvedKind: "unresolved", path: null, candidates: [], vault: name, reason: `no note "${target}" in vault "${name}"` };
  }

  /**
   * The vaults `[[name:…]]` in the vault at `from` means, by their names and aliases. Copies of a
   * vault (a second clone) share its nested vaults' names: of several, the one nested in `from`, or
   * holding it, is meant. A repository's worktrees answer to its name too (17.19): from elsewhere,
   * its main checkout is meant — the stable one, not an agent's task branch.
   */
  private meant(n: string, from: string): KnownVault[] {
    const at = real(from);
    const hits = this.known().filter((v) => (v.kind === "vault" || v.kind === "home") && real(v.path) !== at && namesOf(v).includes(n));
    if (hits.length < 2) return hits;
    const near = hits.filter((v) => kin(at, v));
    if (near.length === 1) return near;
    const mains = (near.length ? near : hits).filter((v) => !v.worktree);
    return mains.length === 1 ? mains : hits;
  }

  vaultOf(abs: string): string | null {
    const found = findVaultRoot(abs);
    if (!found) return null;
    const known = this.known().find((v) => real(v.path) === real(found));
    if (known) return shown(known);
    return readIdentity(vaultConfigFile(found)).name ?? basename(found);
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
          list.push({ from: join(v.path, rel), vault: shown(v), line: l.line, column: l.column, end: l.end ?? { line: l.line, column: l.column }, text: l.text, kind: l.kind, target: l.target, heading: l.heading, block: l.block, alias: l.alias });
          map.set(to, list);
        }
      }
    }
    this.inboundCache = { stamp, map };
    return map;
  }

  /** The note of `g` a link in another vault reaches, if it reaches one. */
  private landsHere(g: Graph, v: KnownVault, rel: string, l: LinkRef): string | null {
    const linking = join(v.path, rel);
    // A file of `g` by its absolute path: its vault path there.
    const inG = (abs: string) => {
      if (!isInside(g.root, abs)) return null;
      // Its path from the vault's root, as a link from there reads it (its own spelling, 1.4).
      const r = g.resolveLink({ kind: "markdown", target: posix.normalize(relative(g.root, abs)) }, "");
      return (r.resolvedKind === "note" || r.resolvedKind === "file") && r.path && !isAbsolute(r.path) ? r.path : null;
    };
    if (l.kind === "wiki" || l.kind === "embed") {
      const m = VAULT_LINK.exec(l.target);
      if (m && g.answersTo(m[1]!)) {
        // Only when the name means this vault there: not a same-named one, not several.
        const meant = this.meant(m[1]!.toLowerCase(), v.path);
        if (meant.length > 1 || (meant.length === 1 && real(meant[0]!.path) !== real(g.root))) return null;
        const r = g.resolveLink({ kind: "wiki", target: m[2]! }, "");
        return r.resolvedKind === "note" && r.path && !isAbsolute(r.path) ? r.path : null;
      }
      // By its path (17.16): `[[../notes/x]]`, `[[~/notes/x]]`, an absolute one.
      const hit = pathLink(l.target, linking, true);
      if (hit) return inG(hit.abs);
      // A vault path into a vault nested in the linking one (17.17): `[[outreach/index]]`.
      if (l.target.includes("/") && isInside(real(v.path), real(g.root))) {
        const base = join(v.path, l.target.replace(/^\/+/, ""));
        for (const abs of /\.[A-Za-z0-9]+$/.test(base) ? [base] : [`${base}.md`, `${base}.markdown`]) {
          const rel = inG(abs);
          if (rel) return rel;
        }
      }
      return null;
    }
    if (l.kind !== "markdown") return null;
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
