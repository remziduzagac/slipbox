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
import { findRoot, isInside, rootAt, type VaultLocation, vaultConfigPath } from "./vault.ts";

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
      const loc = rootAt(root, existsSync(join(root, ".slipbox")) ? "vault" : "repo");
      const config = loadConfig({ vaultFile: vaultConfigPath(loc) }).config;
      g = openGraph(loc, config, true, "lazy");
      g.thorough = true;
    } catch {
      g = null;
    }
    this.graphs.set(key, g);
    return g;
  }

  wiki(vault: string, target: string): Target | null {
    const n = vault.toLowerCase();
    const here = real(this.here.root);
    const others = this.known().filter((v) => (v.kind === "vault" || v.kind === "home") && real(v.path) !== here);
    let hits = others.filter((v) => namesOf(v).includes(n));
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
    const g = this.graphAt(v.path);
    if (!g) return { resolvedKind: "unresolved", path: null, candidates: [], vault, reason: `vault "${vault}" at ${v.path} can't be read` };
    const r = g.resolveLink({ kind: "wiki", target }, "");
    const abs = (p: string) => join(g.root, p);
    const name = shown(v);
    if (r.resolvedKind === "note" || r.resolvedKind === "file") return { ...r, path: abs(r.path!), candidates: r.candidates.map(abs), vault: name, via: via ?? r.via };
    if (r.resolvedKind === "ambiguous") return { ...r, candidates: r.candidates.map(abs), vault: name };
    return { resolvedKind: "unresolved", path: null, candidates: [], vault: name, reason: `no note "${target}" in vault "${name}"` };
  }

  vaultOf(abs: string): string | null {
    const found = findRoot(abs);
    if (!found) return null;
    const known = this.known().find((v) => real(v.path) === real(found.root));
    if (known) return shown(known);
    return found.mode === "vault" ? (readIdentity(vaultConfigFile(found.root)).name ?? basename(found.root)) : basename(found.root);
  }

  entryAt(abs: string): NoteEntry | undefined {
    const found = findRoot(abs);
    if (!found) return undefined;
    const g = this.graphAt(found.root);
    return g?.entry(relative(g.root, abs));
  }

  inbound(g: Graph): Map<string, Backlink[]> {
    const here = real(g.root);
    const sources = this.known().filter((v) => (v.kind === "vault" || v.kind === "repo") && real(v.path) !== here && existsSync(v.path));
    const indexes = sources.map((v) => ({ v, file: join(cacheDir(v), "index.json") }));
    const stamp = indexes.map((x) => `${x.file}:${mtime(x.file)}`).join("|");
    if (this.inboundCache?.stamp === stamp) return this.inboundCache.map;
    const map = new Map<string, Backlink[]>();
    for (const { v, file } of indexes) {
      // A vault inside this one, or holding it, links by its own paths: those aren't cross-vault.
      if (isInside(here, real(v.path)) || isInside(real(v.path), here)) continue;
      const index = readJson<{ entries?: Record<string, NoteEntry> } | null>(file, null);
      if (!index?.entries || typeof index.entries !== "object") continue;
      for (const [rel, entry] of Object.entries(index.entries)) {
        for (const l of entry?.links ?? []) {
          const to = this.landsHere(g, v, rel, l);
          if (!to) continue;
          const list = map.get(to) ?? [];
          list.push({ from: join(v.path, rel), vault: shown(v), line: l.line, column: l.column, text: l.text, kind: l.kind, target: l.target, heading: l.heading, block: l.block, alias: l.alias });
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
      const r = g.resolveLink({ kind: "markdown", target: `/${posix.normalize(relative(g.root, abs))}` }, "");
      return (r.resolvedKind === "note" || r.resolvedKind === "file") && r.path && !isAbsolute(r.path) ? r.path : null;
    };
    if (l.kind === "wiki" || l.kind === "embed") {
      const m = VAULT_LINK.exec(l.target);
      if (m && g.answersTo(m[1]!)) {
        const r = g.resolveLink({ kind: "wiki", target: m[2]! }, "");
        return r.resolvedKind === "note" && r.path && !isAbsolute(r.path) ? r.path : null;
      }
      // By its path (17.16): `[[../notes/x]]`, `[[~/notes/x]]`, an absolute one.
      const hit = pathLink(l.target, linking, true);
      return hit ? inG(hit.abs) : null;
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
