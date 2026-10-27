// Other roots, as this one reaches them (17.9, 17.11, 21.6; blueprint/design/links.md § Between folders): the root
// holding a path outside this one, and the links other roots make into this one — read from their
// indexes, so as fresh as each one's last indexing. A root reached is opened once, with its own
// config, and its index refreshed then (indexing on demand). The converter's `[[name:note]]` (17.8)
// finds its folder as a pointer does, by name.

import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { loadConfig } from "./application/config/config.ts";
import { readJson } from "./foundation/platform/fsutil.ts";
import {
  type Backlink,
  Graph,
  type LinkRef,
  type NoteEntry,
  openGraph,
  type Target,
  type VaultReach,
} from "./graph.ts";
import { pathLink, wikiPathCandidates } from "./links.ts";
import { folderIdentity, lookupFolder, type NamedFolder, readFolders } from "./folders.ts";
import { checkoutOf } from "./git.ts";
import { checkoutRemotes, hostedHere } from "./hosting.ts";
import { homeWalkKept, walkHomeNow } from "./home.ts";
import { cacheDir } from "./foundation/platform/paths.ts";
import { tildePath } from "./names.ts";
import { type KnownRoot, readRoots } from "./registry.ts";
import {
  findVaultRoot,
  isHome,
  isInside,
  recordLocation,
  rootAt,
  type VaultLocation,
  configFilesFor,
  vaultAt,
  vaultOf,
} from "./vault.ts";
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
  const loc = vaultAt(root);
  recordLocation(loc); // seen, like every open (17.6)
  const config = loadConfig({ ...configFilesFor(loc) }).config;
  // Home never walked yet (VV-D2): walked now, as far as its cap — a plan across it needs every folder of it.
  if (loc.mode === "home" && !homeWalkKept(loc, config)) walkHomeNow(loc, config);
  const g = openGraph(loc, config, true, "lazy");
  g.thorough = true;
  g.reach = new Reach(loc);
  return g;
}

export interface ReachOptions {
  /** The graphs it opens parse every note before calling a link unresolved (`Graph.thorough`): the CLI's, whose answer
   *  is now. The TUI's don't: a vault parsed whole on the main thread holds the keys. */
  thorough?: boolean;
  /** It records the roots it reaches in the machine's list (17.11). A thread of its own doesn't: the list is read,
   *  changed and written again, and the main thread may be writing it too. */
  record?: boolean;
  /** Told of each root's graph a link reaches, once: when it's opened for one, or — opened from the machine's list
   *  (`known`) — when a link first reaches it. The TUI's, not parsing one whole (`thorough`), has it caught up
   *  elsewhere. */
  opened?: (g: Graph) => void;
  /**
   * The graphs it opens write nothing of their vaults' — their indexes, their redirects, the commit they caught up
   * with — but home's walk, kept as every graph on the main thread keeps it (`Graph.keepsWalk`). The TUI's: its
   * backlinks' thread writes them, off the keys (#10). A backlinks' thread's, reading another vault for a link alone:
   * that vault's own request writes its state, or the main thread does. A nested root's first index (`nested`) is
   * written all the same.
   */
  readOnly?: boolean;
  /** Roots whose state another thread holds (the TUI's own vault, for its backlinks' thread): never indexed here. */
  owned?: string[];
  /**
   * A nested root with no index, found (`discover`): indexed then — the CLI's, and a backlinks' thread's (they're
   * small); opened, for `opened` to have it built on a thread — the TUI's, as a big one indexed here would hold the
   * keys; or left alone — a peeked vault's reach in the TUI, whose own thread builds them.
   */
  nested?: "index" | "open" | "none";
}

export class Reach implements VaultReach {
  /** Other roots' graphs, by real path; null where one couldn't be opened. */
  private readonly graphs = new Map<string, Graph | null>();
  private inboundCache: { stamp: string; map: Map<string, Backlink[]> } | null = null;
  private readonly thorough: boolean;
  private readonly record: boolean;
  private readonly opened: ((g: Graph) => void) | undefined;
  private readonly readOnly: boolean;
  private readonly owned: Set<string>;
  private readonly nested: "index" | "open" | "none";

  constructor(
    readonly here: VaultLocation,
    opts: ReachOptions = {},
  ) {
    this.thorough = opts.thorough ?? true;
    this.record = opts.record ?? true;
    this.opened = opts.opened;
    this.readOnly = opts.readOnly ?? false;
    this.owned = new Set((opts.owned ?? []).map(real));
    this.nested = opts.nested ?? "index";
  }

  private knownCache: { at: number; list: KnownRoot[] } | null = null;
  /**
   * A root `discover` found, recorded in the machine's list (17.11) — or, not recording, or that failing, known to this
   * reach all the same, its index read for the links it makes.
   */
  private remember(loc: VaultLocation, root: string): void {
    if (this.record) {
      try {
        recordLocation(loc);
        return;
      } catch {}
    }
    // A worktree's notes count at its main checkout (17.19), which the list knows if anything does.
    if (!loc.worktree) this.found.push({ key: loc.key, kind: "vault", path: root, seen: new Date().toISOString() });
  }

  /** The roots `discover` found while it doesn't record them: known to it all the same, their indexes read. */
  private readonly found: KnownRoot[] = [];

  /** The machine's roots: read again after a second (another slipbox may add one), not once per link. */
  private known(): KnownRoot[] {
    const now = Date.now();
    if (!this.knownCache || now - this.knownCache.at > 1000) {
      const list = readRoots();
      this.knownCache = { at: now, list: [...list, ...this.found.filter((f) => !list.some((v) => v.key === f.key))] };
    }
    return this.knownCache.list;
  }

  private foldersCache: { at: number; list: NamedFolder[] } | null = null;

  /** The machine's named folders: read again after a second, not once per link. */
  private folders(): NamedFolder[] {
    const now = Date.now();
    if (!this.foldersCache || now - this.foldersCache.at > 1000) this.foldersCache = { at: now, list: readFolders() };
    return this.foldersCache.list;
  }

  private remotes = new Map<string, string[]>();

  /** A linking root's checkout's remotes (what its hosting links name), read once per root. */
  private remotesOf(root: string): string[] {
    let r = this.remotes.get(root);
    if (!r) {
      const c = checkoutOf(root);
      r = c ? checkoutRemotes(c) : [];
      this.remotes.set(root, r);
    }
    return r;
  }

  private names = new Map<string, { at: number; name: string }>();

  /** A root as it's named to the user (21.9): its name (21.6), else its path — home, `~` (VV-D2); looked up again after
   *  a second. */
  private shown(root: string): string {
    const now = Date.now();
    const hit = this.names.get(root);
    if (hit && now - hit.at < 1000) return hit.name;
    const name = isHome(root) ? tildePath(root) : (folderIdentity(root)?.name ?? tildePath(root));
    this.names.set(root, { at: now, name });
    return name;
  }

  /**
   * The graph of another root, opened on first use with its own config; its index refreshed. A root
   * reached is recorded as seen; one taken from the machine's list (`known`: a search of every root, a
   * moved folder's relink) isn't — it's known already, and each would read as just opened — until a link reaches it:
   * recorded then, and `opened` told, as of a root a link opens.
   */
  graphAt(root: string, opts: { known?: boolean } = {}): Graph | null {
    const key = real(root);
    if (this.graphs.has(key)) {
      const g = this.graphs.get(key)!;
      // Taken from the machine's list, reached by a link now: recorded as seen, and told.
      if (g && !opts.known && this.untold.delete(key)) {
        try {
          if (this.record) recordLocation(g.loc);
        } catch {}
        this.opened?.(g);
      }
      return g;
    }
    const g = this.open(root, !!opts.known);
    this.graphs.set(key, g);
    if (g && opts.known) this.untold.add(key);
    else if (g) this.opened?.(g);
    return g;
  }

  /** Roots taken from the machine's list and not reached by a link since: `opened` not told of them yet. */
  private readonly untold = new Set<string>();

  /** A root's graph built: lazily, its index read, as this reach's graphs are. */
  private open(root: string, known: boolean): Graph | null {
    try {
      // Home (VV-D2) by its kept walk; any other vault by its marker.
      const loc = vaultAt(root);
      // Reached: known on this machine, its links counted (17.11) — opened all the same if the list can't say so.
      if (!known && this.record) {
        try {
          recordLocation(loc);
        } catch {}
      }
      const config = loadConfig({ ...configFilesFor(loc) }).config;
      const g = new Graph(loc, config);
      g.writesIndex = !this.readOnly;
      g.writesState = !this.readOnly;
      g.build(true, "lazy");
      g.thorough = this.thorough;
      return g;
    } catch {
      return null;
    }
  }

  /** Another root's graph if it's been opened here, never opening it: undefined, not yet; null, it couldn't be. */
  held(root: string): Graph | null | undefined {
    return this.graphs.get(real(root));
  }

  othersChanged(): void {
    this.knownCache = null;
    // Read again whatever the indexes' mtimes say: a coarse clock gives a rewrite the mtime it had.
    this.inboundCache = null;
  }

  /** The roots whose graph it opened wrote its index, by their keys: those nested, built (`discover`). */
  written(): string[] {
    return [...this.graphs.values()].flatMap((g) => (g?.writtenAt != null ? [g.loc.key] : []));
  }

  /**
   * Another root's graph opened anew, with its settings as they are now; null, it can't be (gone, unreadable), and the
   * one held is kept.
   */
  reopen(root: string): Graph | null {
    const key = real(root);
    // Recorded and told of already: `opened` would ask its catch-up again, the one answered just now.
    const g = this.open(root, true);
    if (g) this.graphs.set(key, g);
    return g;
  }

  /**
   * The roots nested in `g` and the ones it sits in (17.17): the walk and the folders above know
   * them, so they're recorded — their links counted as backlinks — without having been opened first.
   * A nested root with no index yet is indexed now, opened or left alone, as `nested` says (an enclosing one isn't
   * indexed: it's used as of its last indexing). The peek records them on the main thread, and its thread, working out
   * a note's backlinks, indexes them, recording nothing (`backlinks-jobs.ts`).
   */
  private discovered = false;

  discover(g: Graph): void {
    if (this.discovered) return;
    this.discovered = true;
    // Home's vaults (VV-D2) are many, and big: the background index finds and indexes them, as it found them.
    if (g.loc.mode === "home") return;
    const roots: { root: string; nested: boolean }[] = g.skipped
      .filter((s) => s.reason === "nested vault")
      .map((s) => ({ root: join(g.root, s.rel), nested: true }));
    for (let up = findVaultRoot(dirname(g.root)); up; up = findVaultRoot(dirname(up)))
      roots.push({ root: up, nested: false });
    for (const { root, nested } of roots) {
      let loc: VaultLocation;
      try {
        loc = rootAt(root);
      } catch {
        continue;
      }
      this.remember(loc, root);
      if (
        nested &&
        this.nested !== "none" &&
        !this.owned.has(real(root)) &&
        !existsSync(join(cacheDir(loc), "index.json"))
      ) {
        const n = this.graphAt(root);
        // Its first index, written whatever the others this reach opens write.
        if (n && this.nested === "index") {
          n.writesIndex = true;
          n.ensureAll();
        }
      }
    }
    this.knownCache = null;
  }

  /** The converter's `[[name:note]]` (17.8): the note in the folder of that name (21.6), as a pointer
   *  finds it; null when no folder has that name (`[[Meeting: Q3]]` may be an alias, 21.3). */
  wiki(vault: string, target: string, _g: Graph): Target | null {
    const l = lookupFolder(vault);
    if (l.status === "unknown") return null;
    if (l.status === "ambiguous")
      return {
        resolvedKind: "ambiguous",
        path: null,
        candidates: l.folders.map((f) => f.default ?? f.copies[0]!.path).sort(),
        vault,
        reason: l.reason,
      };
    if (l.status === "unavailable")
      return {
        resolvedKind: "unresolved",
        path: null,
        candidates: [],
        vault,
        reason: `folder "${vault}" was last seen at ${l.path}`,
      };
    const there = this.graphAt(l.path);
    if (!there)
      return {
        resolvedKind: "unresolved",
        path: null,
        candidates: [],
        vault,
        reason: `folder "${vault}" at ${l.path} can't be read`,
      };
    const r = there.resolveLegacyWiki({ kind: "wiki", target }, "");
    const abs = (p: string) => join(there.root, p);
    const name = l.folder.name;
    const via: Target["via"] = l.via === "old-name" ? "previous-name" : r.via;
    if (r.resolvedKind === "note" || r.resolvedKind === "file")
      return { ...r, path: abs(r.path!), candidates: r.candidates.map(abs), vault: name, via };
    if (r.resolvedKind === "ambiguous") return { ...r, candidates: r.candidates.map(abs), vault: name };
    return {
      resolvedKind: "unresolved",
      path: null,
      candidates: [],
      vault: name,
      reason: `no note "${target}" in folder "${name}"`,
    };
  }

  vaultOf(abs: string): string | null {
    const found = vaultOf(abs);
    return found ? this.shown(found) : null;
  }

  entryAt(abs: string): NoteEntry | undefined {
    const found = vaultOf(abs);
    if (!found) return undefined;
    const g = this.graphAt(found);
    return g?.entry(relative(g.root, abs));
  }

  /** The other roots this machine knows, each with its saved index's file — not a worktree's (17.19): its
   *  notes are copies of the main checkout's, its links counted there. */
  private indexes(g: Graph): { v: KnownRoot; file: string }[] {
    this.discover(g);
    const here = real(g.root);
    // Home's notes link too (VV-D2): its index is one of them.
    const sources = this.known().filter(
      (v) =>
        (v.kind === "vault" || (v.kind === "home" && isHome(v.path))) &&
        !v.worktree &&
        real(v.path) !== here &&
        existsSync(v.path),
    );
    return sources.map((v) => ({ v, file: join(cacheDir(v), "index.json") }));
  }

  /**
   * The notes of the other roots this machine knows, with their links, as of each one's last indexing:
   * for a plan that finds links by what they name rather than where they land — the pointers by a
   * folder's name, before the name goes with its `.slipbox/` (18.11).
   */
  notesElsewhere(g: Graph): { root: string; abs: string; vault: string; links: LinkRef[] }[] {
    const out: { root: string; abs: string; vault: string; links: LinkRef[] }[] = [];
    for (const { v, file } of this.indexes(g)) {
      const index = readJson<{ entries?: Record<string, NoteEntry> } | null>(file, null);
      if (!index?.entries || typeof index.entries !== "object") continue;
      for (const [rel, entry] of Object.entries(index.entries))
        if (entry?.links?.length)
          out.push({ root: v.path, abs: join(v.path, rel), vault: this.shown(v.path), links: entry.links });
    }
    return out;
  }

  inbound(g: Graph): Map<string, Backlink[]> {
    const indexes = this.indexes(g);
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
          list.push({
            from: join(v.path, rel),
            vault: this.shown(v.path),
            line: l.line,
            column: l.column,
            end: l.end ?? { line: l.line, column: l.column },
            text: l.text,
            kind: l.kind,
            target: l.target,
            heading: l.heading,
            block: l.block,
            alias: l.alias,
          });
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
      // Its path from the vault's root, as a link from there reads it (its own spelling, 1.4) — a URL's
      // path, so a `#` or `%` in the file's name is encoded, not read as a fragment or an escape.
      const target = posix.normalize(relative(g.root, abs)).replace(/[%#]/g, (c) => encodeURIComponent(c));
      const r = g.resolveLink({ kind: "markdown", target }, "");
      return (r.resolvedKind === "note" || r.resolvedKind === "file") && r.path && !isAbsolute(r.path) ? r.path : null;
    };
    // A path from the linking root's top (`[[outreach/index]]`, `/outreach/plan.md`) into a root
    // nested in it (17.17), as its graph reads one: the file as written, else the note.
    // Undefined where no file is there; null where it's the linking root's own (a link within it).
    const fromTop = (path: string, wiki: boolean): string | null | undefined => {
      const abs = join(v.path, path.replace(/^\/+/, ""));
      const bare = !/\.[A-Za-z0-9]+$/.test(abs);
      const candidates = wiki ? wikiPathCandidates(abs) : bare ? [abs, `${abs}.md`, `${abs}.markdown`] : [abs];
      const hit = candidates.find((c) => isFile(c));
      if (!hit) return undefined;
      const own = findVaultRoot(hit);
      return own && real(own) !== real(v.path) ? inG(hit) : null;
    };
    // A wikilink or embed reaches another root by a path out of its own (`[[../A/note]]`, as the
    // graph reads it), or into one nested in it; names stay within their root (21.3).
    if (l.kind === "wiki" || l.kind === "embed") {
      if (!/^\.\.?\//.test(l.target)) return l.target.includes("/") ? (fromTop(l.target, true) ?? null) : null;
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
    // A link to a repository's hosting (D87), read as the linking root reads it — its own checkout's
    // remote, else a named folder's by its remote: the file in that copy; here, a backlink.
    if (/^https?:\/\//i.test(l.target)) {
      const t = hostedHere(l.target, v.path, { remotes: this.remotesOf(v.path), folders: this.folders() });
      const hit = t ? pathLink(join(t.top, t.path), linking, false) : null;
      return hit ? inG(hit.abs) : null;
    }
    const fileUrl = /^file:\/\//i.test(l.target);
    if (/^[a-z][a-z0-9+.-]*:/i.test(l.target) && !fileUrl) return null;
    const path = fileUrl ? l.target : l.target.split("#")[0]!;
    if (!path) return null;
    // `/…` is the linking root's first, then the filesystem's (21.2).
    if (path.startsWith("/") && !path.startsWith("//")) {
      let decoded = path;
      try {
        decoded = decodeURIComponent(path);
      } catch {}
      const top = fromTop(decoded, false);
      if (top !== undefined) return top;
    }
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

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function mtime(f: string): number {
  try {
    return statSync(f).mtimeMs;
  } catch {
    return 0;
  }
}
