// How a link resolves (20.2, 21.2, 21.3): a path, from the linking note or the root, into another root when it climbs
// out (17.9); a wikilink within its root — a note's name or path, an alias, an attachment by its name; a pointer into
// a named folder (21.7); a hosting URL of this repository. And the evidence of a move (17.12, 20.2): where a broken
// path's file went, for the relink — never a way to resolve one. A graph's own (`Graph.resolveLink` asks it).

import { existsSync, statSync } from "node:fs";
import { isAbsolute, join, posix, relative, sep } from "node:path";
import { formatPointer, isPointer, parsePointer, resolvePointer } from "./pointer.ts";
import { checkoutRemotes, hostedHere } from "./hosting.ts";
import { lookupFolder, pointerName } from "./folders.ts";
import {
  extensionless,
  type MdLinkTarget,
  normKey,
  pathLink,
  pickCandidate,
  resolveAttachment,
  resolveMarkdownUrl,
  wikiPathCandidates,
} from "./links.ts";
import { checkoutOf } from "./git.ts";
import { isMarkdownExport } from "./export/mark.ts";
import { classify } from "./filetypes.ts";
import type { LinkRef, Target } from "./graph-types.ts";
import type { Graph } from "./graph.ts";

/** `[[vault:name]]`: a vault's name, a colon, the rest (17.8). */
export const VAULT_LINK = /^([\p{L}\p{N}][\p{L}\p{N}._-]*):(.+)$/u;

/** Aliases and previous names → notes. */
type Names = { aliases: Map<string, string[]>; previous: Map<string, string[]> };

/** A graph's links resolved: what it reads of the graph, it reads through `g`; what it keeps, the names notes
 *  declare and what it found out once, it keeps for it. */
export class LinkResolver {
  /** Whether a note is a Markdown export (its mark), as of its entry's time: what its pictures' folder is (DF-D25). */
  private readonly exportMarks = new Map<string, { mtimeMs: number; marked: boolean }>();
  /** Aliases and previous names → notes, from the entries parsed so far (null: rebuild). */
  private nameCache: Names | null = null;

  constructor(private readonly g: Graph) {}

  /** What notes declare changed: the names are read again when next asked. */
  forgetNames(): void {
    this.nameCache = null;
  }

  /**
   * A wikilink, read within its root (21.3): a note's name or path, an alias from front matter, an
   * attachment by its name (as Obsidian finds one); a path into a root nested in this one is a path.
   * Two notes (or attachments) of one name: the nearest, then the shortest; a real tie is ambiguous. No
   * root, no names. Previous names, `[[vault:note]]` and remembered moves aren't read (20.22's kept).
   */
  resolveWiki(target: string, fromRel: string): Target {
    if (!target) return { resolvedKind: "anchor", path: fromRel, candidates: [] };
    if (this.g.loc.mode === "folder")
      return {
        resolvedKind: "unresolved",
        path: null,
        candidates: [],
        reason: "names need a vault, and this folder is in none: .git, .slipbox/, .obsidian/ or .zk/ makes one",
      };
    const r = this.g.index.resolveWiki(target, fromRel);
    if (r.status === "resolved")
      return { resolvedKind: "note", path: r.path, candidates: r.candidates, ...(r.how ? { how: r.how } : {}) };
    if (r.status === "ambiguous") return { resolvedKind: "ambiguous", path: null, candidates: r.candidates };
    // A path: out of the root (`../`), or into a root nested in it.
    const byPath =
      (/^\.\.?\//.test(target) ? this.byFilesystemPath(target, fromRel, true) : null) ??
      this.intoNested(target.replace(/^\/+/, ""), true);
    if (byPath) return byPath;
    if (classify(target, this.g.config.walk.extensions).group !== "note" && /\.[A-Za-z0-9]+$/.test(target)) {
      const att = resolveAttachment(target, fromRel, this.g.root);
      if (att) return { resolvedKind: "file", path: att, candidates: [], how: "path" };
      // Obsidian finds attachments anywhere in the vault by name.
      const hits = this.byFileName(target);
      // Two of a name, as two notes are: the nearest, then the shortest; a real tie ambiguous.
      const r = pickCandidate(hits, target.normalize("NFC"), fromRel);
      if (r.status === "resolved")
        return { resolvedKind: "file", path: r.path, candidates: r.candidates, ...(r.how ? { how: r.how } : {}) };
      if (r.status === "ambiguous") return { resolvedKind: "ambiguous", path: null, candidates: r.candidates };
    }
    const aliased = this.byAlias(target, fromRel);
    if (aliased) return aliased;
    return this.g.oldForm(target) ?? { resolvedKind: "unresolved", path: null, candidates: [] };
  }

  /**
   * The attachments a wikilink's name finds anywhere in the root, as Obsidian finds them: by the file's name, or a
   * path's end aligned on segments. A Markdown export's pictures are left out, unless the name itself goes through
   * their folder: their copies would answer for the pictures they were copied from (DF-D18, DF-D25).
   */
  private byFileName(target: string): string[] {
    const named = this.g.assets.get(target.split("/").pop()!.normalize("NFC").toLowerCase()) ?? [];
    const suffix = target.normalize("NFC").toLowerCase();
    const depth = suffix.split("/").length;
    return named.filter((p) => {
      const lower = p.toLowerCase();
      if (lower !== suffix && !lower.endsWith(`/${suffix}`)) return false;
      // The segment the name starts at: at or before the export's folder, it goes through it.
      const folder = this.exportPicturesFolder(p);
      return folder < 0 || p.split("/").length - depth <= folder;
    });
  }

  /**
   * Which segment of a root-relative path is a folder holding a Markdown export's pictures, or -1: one named so
   * (`report.export.assets/`), or any `<name>.assets/` beside a note `<name>.md` marked as an export (`-o book.md`
   * makes `book.assets/`) (DF-D25).
   */
  private exportPicturesFolder(rel: string): number {
    const parts = rel.split("/");
    let at = -1;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]!;
      if (!/\.assets$/i.test(seg)) continue;
      const stem = [...parts.slice(0, i), seg.slice(0, -".assets".length)].join("/");
      if (/\.export$/i.test(stem) || this.marked(`${stem}.md`) || this.marked(`${stem}.markdown`)) at = i;
    }
    return at;
  }

  /** Whether the note at `rel` is a Markdown export, by its mark; read once for each time its file changes. */
  private marked(rel: string): boolean {
    const e = this.g.notes.get(rel);
    if (!e) return false;
    const known = this.exportMarks.get(rel);
    if (known?.mtimeMs === e.mtimeMs) return known.marked;
    const marked = isMarkdownExport(join(this.g.root, rel));
    this.exportMarks.set(rel, { mtimeMs: e.mtimeMs, marked });
    return marked;
  }

  /**
   * A file named the old way (20.x's `vault:path`: `research:x.md`, `[[research:x]]`, 21.11) where a
   * folder this machine knows has that name: not a link — said, with the pointer that is one.
   * Null when the part before `:` names no folder (`Meeting: Q3` is a note's name).
   */
  oldForm(target: string): Target | null {
    const m = /^([^:/\s#]+):(?!\/\/)([^#]+)/.exec(target);
    if (!m) return null;
    const [, name, rest] = m as unknown as [string, string, string];
    const l = lookupFolder(name);
    if (l.status === "unknown") return null;
    let suggest: string | undefined;
    if (l.status === "found") {
      // Its file: a path in the folder (`x.md`, extensionless too), else a note's name there.
      const hit = pathLink(join(l.path, rest), join(l.path, "_"), false, undefined, false);
      let rel = hit ? relative(l.path, hit.abs) : null;
      if (!rel) {
        const r = this.g.reach?.graphAt(l.path)?.resolveLink({ kind: "wiki", target: rest }, "");
        rel =
          (r?.resolvedKind === "note" || r?.resolvedKind === "file") && r.path
            ? isAbsolute(r.path)
              ? relative(l.path, r.path)
              : r.path
            : null;
      }
      if (rel)
        suggest = formatPointer({
          name: pointerName(l.folder),
          branch: null,
          path: rel.split(sep).join("/"),
          fragment: null,
        });
    }
    const reason = `${name}:${rest} names a folder the old way — not a link${suggest ? `; ${suggest} is (space c a writes it)` : ""}`;
    return { resolvedKind: "unresolved", path: null, candidates: [], reason, ...(suggest ? { suggest } : {}) };
  }

  /** A note by an alias its front matter gives (21.3): never by a previous name. */
  private byAlias(target: string, fromRel: string): Target | null {
    if (target.includes("/")) return null;
    const stem = target.replace(/\.(md|markdown)$/i, "");
    const aliased = this.otherNames().aliases.get(normKey(stem));
    if (!aliased?.length) return null;
    const r = pickCandidate(aliased, stem, fromRel);
    if (r.status === "resolved")
      return {
        resolvedKind: "note",
        path: r.path,
        candidates: r.candidates,
        via: "alias",
        ...(r.how ? { how: r.how } : {}),
      };
    return { resolvedKind: "ambiguous", path: null, candidates: r.candidates, via: "alias" };
  }

  /**
   * How a wikilink resolved before links were paths (1.4, 17.7, 17.8, 17.12): the note's name or path
   * in this vault; `[[vault:name]]`; an attachment, by its name; a note's alias; its previous name; a
   * move remembered. The converter's legacy reader (20.1, 20.22): nothing else resolves a link by a name.
   */
  resolveLegacyWiki(link: Pick<LinkRef, "kind" | "target">, fromRel: string): Target {
    if (!link.target) return { resolvedKind: "anchor", path: fromRel, candidates: [] };
    const r = this.g.index.resolveWiki(link.target, fromRel);
    if (r.status === "resolved") return { resolvedKind: "note", path: r.path, candidates: r.candidates };
    if (r.status === "ambiguous") return { resolvedKind: "ambiguous", path: null, candidates: r.candidates };
    const byPath =
      this.byFilesystemPath(link.target, fromRel, true) ?? this.intoNested(link.target.replace(/^\/+/, ""), true);
    if (byPath) return byPath;
    const inter = VAULT_LINK.exec(link.target);
    if (inter) {
      // This vault by its own name reaches its own notes; another's is looked up.
      if (this.g.answersTo(inter[1]!)) return this.g.resolveLegacyWiki({ kind: link.kind, target: inter[2]! }, fromRel);
      const other = this.g.reach?.wiki(inter[1]!, inter[2]!, this.g);
      if (other) return other;
      // No folder of that name: a name with a colon (an alias, a previous name) comes first.
    }
    if (classify(link.target, this.g.config.walk.extensions).group !== "note" && /\.[A-Za-z0-9]+$/.test(link.target)) {
      const att = resolveAttachment(link.target, fromRel, this.g.root);
      if (att) return { resolvedKind: "file", path: att, candidates: [] };
      // Obsidian finds attachments anywhere in the vault by name.
      const hits = this.byFileName(link.target);
      if (hits.length === 1) return { resolvedKind: "file", path: hits[0]!, candidates: hits };
      if (hits.length > 1) return { resolvedKind: "ambiguous", path: null, candidates: hits.sort() };
    }
    const named = this.byOtherName(link.target, fromRel);
    if (named) return named;
    const moved = this.movedWiki(link.target);
    if (moved) return moved;
    if (inter && this.g.reach)
      return {
        resolvedKind: "unresolved",
        path: null,
        candidates: [],
        vault: inter[1]!,
        reason: `unknown folder "${inter[1]}"`,
      };
    return { resolvedKind: "unresolved", path: null, candidates: [] };
  }

  /** A link's path, from the note at `fromRel` (20.2). */
  resolvePath(link: Pick<LinkRef, "kind" | "target">, fromRel: string): Target {
    // A `file://` URL or a `~/` path names a file, not a web page (17.16).
    if (/^file:\/\//i.test(link.target) || link.target.startsWith("~/")) {
      const path = /^file:/i.test(link.target) ? link.target : link.target.split("#")[0]!;
      return this.byFilesystemPath(path, fromRel, false) ?? { resolvedKind: "unresolved", path: null, candidates: [] };
    }
    // A pointer into a named folder (21.7): wherever this machine has it.
    if (isPointer(link.target)) return this.byPointer(link.target, fromRel);
    // A folder named the old way (`research:x.md`): no link, but its pointer said (21.11).
    if (!/^(?:https?|mailto|file|ftp|data|tel):/i.test(link.target)) {
      const old = this.g.oldForm(link.target);
      if (old) return old;
    }
    // This repository's hosting (a README's `https://github.com/me/repo/blob/main/x.md`): the file here.
    if (/^https?:\/\//i.test(link.target)) {
      const hosted = this.byHosting(link.target, fromRel);
      if (hosted) return hosted;
    }
    // `/` from the nearest root, every file's (21.2): this graph's root — a plain folder opened has
    // none, and there it's the filesystem's path alone.
    const m: MdLinkTarget = resolveMarkdownUrl(
      link.target,
      fromRel,
      this.g.root,
      this.g.index,
      this.g.loc.mode !== "folder",
    );
    if (
      (m.kind === "file" || m.kind === "folder" || m.kind === "missing") &&
      !m.target.startsWith("../") &&
      !m.target.startsWith("/")
    ) {
      // Into a vault nested in this one: its note, there (17.17).
      const nested = this.intoNested(m.target, false);
      if (nested) return nested;
    }
    // A path that reaches nothing is broken, whatever moved (20.2): a move is evidence for a fix
    // (`movedTo`, the relink), never a way to resolve.
    if (m.kind === "missing") {
      // A path out of this root (17.9), or the filesystem's own `/…` (20.2): the file wherever it
      // is, in whichever root holds it.
      const byPath = this.byFilesystemPath(link.target.split("#")[0]!, fromRel, false);
      if (byPath) return byPath;
    }
    switch (m.kind) {
      case "external":
        return { resolvedKind: "external", path: m.target, candidates: [] };
      case "anchor":
        return { resolvedKind: "anchor", path: fromRel, candidates: [] };
      // By its path (D86): all a path link has.
      case "note":
        return { resolvedKind: "note", path: m.target, candidates: [], how: "path" };
      case "file":
        return { resolvedKind: "file", path: m.target, candidates: [], how: "path" };
      case "folder":
        return { resolvedKind: "folder", path: m.target, candidates: [], how: "path" };
      default:
        return { resolvedKind: "unresolved", path: null, candidates: [] };
    }
  }

  /**
   * A target written as a filesystem path (17.16): relative out of the root, `~/`, absolute, a
   * `file://` URL. Inside this vault, its note or file like any other link's (a backlink too);
   * elsewhere, the file by its absolute path, in whichever root holds it.
   */
  private byFilesystemPath(target: string, fromRel: string, wiki: boolean): Target | null {
    // From the linking note; with none (a lookup), from the vault's root. In a linked worktree, a
    // relative path out of its checkout is taken from the main checkout (17.19): `../y/plan.md`
    // means the sibling repository beside the main one, wherever the worktree is kept.
    const wt = this.g.loc.worktree;
    const hit = pathLink(
      target,
      join(this.g.root, fromRel || "_"),
      wiki,
      wt?.main ? { from: wt.checkout, to: wt.main } : undefined,
      true,
    );
    if (!hit) return null;
    const rel = relative(this.g.root, hit.abs);
    const inside = !rel.startsWith("..") && !isAbsolute(rel);
    if (hit.folder)
      return {
        resolvedKind: "folder",
        path: inside ? rel || "." : hit.abs,
        candidates: [],
        how: "path",
        ...(inside ? {} : { vault: this.g.reach?.vaultOf(hit.abs) ?? null }),
      };
    if (inside) {
      if (this.g.notes.has(rel)) return { resolvedKind: "note", path: rel, candidates: [rel], how: "path" };
      if (this.g.known(rel)) return { resolvedKind: "file", path: rel, candidates: [rel], how: "path" };
    }
    return {
      resolvedKind: classify(hit.abs, this.g.config.walk.extensions).group === "note" ? "note" : "file",
      path: hit.abs,
      candidates: [],
      how: "path",
      vault: this.g.reach?.vaultOf(hit.abs) ?? null,
    };
  }

  /**
   * A `slipbox://` pointer (21.7): its folder's copy here (21.6), the file in it as a path link finds
   * one (no extension, a folder); in this root, its note or file like any link's (a backlink too).
   * A branch not checked out here: the file as git has it there, read-only. Else why not.
   */
  private byPointer(target: string, fromRel: string): Target {
    const p = parsePointer(target);
    if (!p) return { resolvedKind: "unresolved", path: null, candidates: [] };
    const t = resolvePointer(p);
    if (t.status === "ambiguous")
      return { resolvedKind: "ambiguous", path: null, candidates: t.candidates, reason: t.reason };
    if (t.status === "unresolved") return { resolvedKind: "unresolved", path: null, candidates: [], reason: t.reason };
    if (t.status === "branch") {
      const kind = classify(t.rel, this.g.config.walk.extensions).group === "note" ? "note" : "file";
      return {
        resolvedKind: kind,
        path: join(t.root, t.rel),
        candidates: [],
        how: "pointer",
        vault: t.folder.name,
        gitRef: { root: t.root, rel: t.rel, branch: t.branch },
      };
    }
    const hit = pathLink(t.abs, join(this.g.root, fromRel || "_"), false, undefined, true);
    const via = t.via ? { via: t.via } : {};
    if (!hit)
      return {
        resolvedKind: "unresolved",
        path: null,
        candidates: [],
        reason: `no ${p.path || "folder"} in ${p.name}${p.branch ? `@${p.branch}` : ""}`,
        ...via,
      };
    const rel = relative(this.g.root, hit.abs);
    const inside = !rel.startsWith("..") && !isAbsolute(rel);
    // By its folder's name (D86); by an old one, or in another copy, said too.
    const landed = { how: "pointer" as const, ...via };
    if (hit.folder)
      return {
        resolvedKind: "folder",
        path: inside ? rel || "." : hit.abs,
        candidates: [],
        ...(inside ? {} : { vault: t.folder.name }),
        ...landed,
      };
    if (inside && this.g.notes.has(rel)) return { resolvedKind: "note", path: rel, candidates: [rel], ...landed };
    if (inside && this.g.known(rel)) return { resolvedKind: "file", path: rel, candidates: [rel], ...landed };
    return {
      resolvedKind: classify(hit.abs, this.g.config.walk.extensions).group === "note" ? "note" : "file",
      path: hit.abs,
      candidates: [],
      vault: t.folder.name,
      ...landed,
    };
  }

  private remotesCache: string[] | null = null;

  /** This checkout's remotes (`host/path`, lower case): what a hosting URL to it names. */
  private ownRemotes(): string[] {
    if (this.remotesCache) return this.remotesCache;
    const c = checkoutOf(this.g.root);
    this.remotesCache = c ? checkoutRemotes(c) : [];
    return this.remotesCache;
  }

  /**
   * A link to a repository's hosting (`hosting.ts`): this checkout's own remote, or a named folder's
   * (21.6) — the file in this copy, a note, file or folder like any link's (a backlink too). Another
   * ref than the branch checked out is kept, to be said. Null when it isn't one, or names none here.
   */
  private byHosting(url: string, fromRel: string): Target | null {
    const t = hostedHere(url, this.g.root, { remotes: this.ownRemotes() });
    if (!t) return null;
    const other = t.other ? { hosted: t.other } : {};
    const hit = pathLink(join(t.top, t.path), join(this.g.root, fromRel || "_"), false, undefined, true);
    if (!hit)
      return {
        resolvedKind: "unresolved",
        path: null,
        candidates: [],
        reason: `no ${t.path || "folder"} in this copy of ${t.hosted.remote}`,
        via: "hosting",
        ...other,
      };
    const rel = relative(this.g.root, hit.abs);
    const inside = !rel.startsWith("..") && !isAbsolute(rel);
    // By this repository's remote (D86, D87).
    const at = (kind: "note" | "file" | "folder", p: string): Target => ({
      resolvedKind: kind,
      path: p,
      candidates: [],
      how: "hosting",
      via: "hosting",
      ...other,
    });
    if (hit.folder) return at("folder", inside ? rel || "." : hit.abs);
    if (inside && this.g.notes.has(rel)) return at("note", rel);
    if (inside && this.g.known(rel)) return at("file", rel);
    return at(classify(hit.abs, this.g.config.walk.extensions).group === "note" ? "note" : "file", hit.abs);
  }

  /**
   * A vault path that leads into a vault nested in this one (17.17): `[t](outreach/index.md)`,
   * `[[outreach/index]]` — the note there, by its absolute path, as a path out of the root is.
   */
  private intoNested(rel: string, wiki: boolean): Target | null {
    const p = posix.normalize(rel);
    if (!this.g.nestedRoots().some((r) => p.startsWith(`${r}/`))) return null;
    const abs = join(this.g.root, p);
    const candidates = wiki ? wikiPathCandidates(abs) : [abs];
    const hit = candidates.find((c) => {
      try {
        return statSync(c).isFile();
      } catch {
        return false;
      }
    });
    if (!hit) return null;
    return {
      resolvedKind: classify(hit, this.g.config.walk.extensions).group === "note" ? "note" : "file",
      path: hit,
      candidates: [],
      how: "path",
      vault: this.g.reach?.vaultOf(hit) ?? null,
    };
  }

  /** The names notes declare in their frontmatter, from the entries parsed so far. */
  otherNames(): Names {
    if (this.g.thorough && this.g.pendingCount) this.g.ensureAll();
    if (!this.nameCache) {
      const aliases = new Map<string, string[]>();
      const previous = new Map<string, string[]>();
      const add = (map: Map<string, string[]>, name: string, rel: string) => {
        const k = normKey(name.trim());
        if (!k) return;
        const list = map.get(k) ?? [];
        if (!list.includes(rel)) list.push(rel);
        map.set(k, list);
      };
      for (const [rel, e] of this.g.notes) {
        for (const a of e.aliases ?? []) add(aliases, a, rel);
        for (const p of e.previous ?? []) add(previous, p, rel);
      }
      this.nameCache = { aliases, previous };
    }
    return this.nameCache;
  }

  /**
   * A name no note has as its file name (17.7): a note's alias, resolved like a name (several go
   * through the same disambiguation); else a previous name, when exactly one note claims it.
   */
  private byOtherName(target: string, fromRel: string): Target | null {
    if (target.includes("/")) return null;
    const stem = target.replace(/\.(md|markdown)$/i, "");
    const names = this.otherNames();
    const aliased = names.aliases.get(normKey(stem));
    if (aliased?.length) {
      const r = pickCandidate(aliased, stem, fromRel);
      if (r.status === "resolved")
        return { resolvedKind: "note", path: r.path, candidates: r.candidates, via: "alias" };
      return { resolvedKind: "ambiguous", path: null, candidates: r.candidates, via: "alias" };
    }
    const prev = names.previous.get(normKey(stem));
    if (prev?.length === 1) return { resolvedKind: "note", path: prev[0]!, candidates: prev, via: "previous-name" };
    if (prev && prev.length > 1)
      return { resolvedKind: "ambiguous", path: null, candidates: [...prev].sort(), via: "previous-name" };
    return null;
  }

  /** Where a path went (17.12), when that's a note or file of the vault now. */
  movedTo(rel: string): string | null {
    const to = this.g.redirects?.follow(rel);
    return to && (this.g.notes.has(to) || this.g.known(to)) ? to : null;
  }

  /**
   * Where a broken path link's file went, when a move of it was seen (17.12): evidence for a fix —
   * the relink, a problem saying so — never a way to resolve it (20.2). Null when it isn't broken,
   * isn't a vault path, or no move of it is known.
   */
  movedTarget(link: Pick<LinkRef, "kind" | "target">, fromRel: string): string | null {
    const wiki = link.kind === "wiki" || link.kind === "embed";
    const rel = wiki ? this.brokenWikiPath(link, fromRel) : this.brokenPath(link, fromRel);
    if (rel === null) return null;
    // Written without its extension (21.2): the note's move counts — a wikilink's whatever its name's dots.
    return (
      this.g.movedTo(rel) ??
      (extensionless(rel) || (wiki && !/\.(md|markdown)$/i.test(rel)) ? this.g.movedTo(`${rel}.md`) : null)
    );
  }

  /**
   * A broken wikilink's path in this root, as `brokenPath` for a markdown link's: one written as a
   * path (`[[docs/plan]]` from the root, `[[../plan]]` from the note) — a name alone stays a name,
   * which no move resolves (20.2). Null in a plain folder, which reads no wikilink.
   */
  private brokenWikiPath(link: Pick<LinkRef, "kind" | "target">, fromRel: string): string | null {
    const t = link.target.trim();
    if (this.g.loc.mode === "folder" || !t.includes("/") || /^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith("~/"))
      return null;
    if (this.g.resolveLink(link, fromRel).resolvedKind !== "unresolved") return null;
    const rel = /^\.\.?\//.test(t)
      ? posix.normalize(posix.join(posix.dirname(fromRel), t))
      : posix.normalize(t.replace(/^\/+/, ""));
    return rel === ".." || rel.startsWith("../") ? null : rel;
  }

  /**
   * The note a broken path link names, not written yet (vault-relative): what following it offers to
   * make, and a problem calls information rather than a warning (as a wikilink's was). Null when it
   * isn't broken, isn't a note's path in this vault, or its note was seen to move (`movedTarget`).
   */
  missingNote(link: Pick<LinkRef, "kind" | "target">, fromRel: string): string | null {
    const rel = this.brokenPath(link, fromRel);
    if (rel === null || rel.endsWith("/") || this.g.movedTo(rel)) return null;
    // Written without an extension (21.2): the note it reads as, `plan.md`.
    const note = extensionless(rel) ? `${rel}.md` : rel;
    return /\.(md|markdown)$/i.test(note) && !this.g.movedTo(note) ? note : null;
  }

  /** A broken link's path in this vault (vault-relative, decoded): null for one that resolves, or isn't a vault path. */
  private brokenPath(link: Pick<LinkRef, "kind" | "target">, fromRel: string): string | null {
    if (link.kind !== "markdown" && link.kind !== "image") return null;
    if (this.g.resolveLink(link, fromRel).resolvedKind !== "unresolved") return null;
    const path = link.target.split("#")[0]!;
    if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("~/")) return null;
    // `/…` from the root (21.2); with none (a plain folder), the filesystem's: not a path in it.
    if (path.startsWith("/") && this.g.loc.mode === "folder") return null;
    let decoded = path;
    try {
      decoded = decodeURIComponent(path);
    } catch {}
    // A `/…` naming no folder of the root is a filesystem path that isn't there (an unplugged
    // drive's), not a place in the root.
    if (
      decoded.startsWith("/") &&
      decoded.slice(1).includes("/") &&
      !existsSync(join(this.g.root, decoded.slice(1).split("/")[0]!))
    )
      return null;
    const rel = decoded.startsWith("/")
      ? posix.normalize(decoded.slice(1))
      : posix.normalize(posix.join(posix.dirname(fromRel), decoded));
    return rel === ".." || rel.startsWith("../") ? null : rel;
  }

  /** `[[dir/old]]` or `[[old]]` whose note moved: by its old path, else its old name when unique. */
  private movedWiki(target: string): Target | null {
    if (!this.g.redirects) return null;
    const t = target.trim().replace(/^\/+/, "");
    const withExt = /\.(md|markdown)$/i.test(t) ? [t] : [`${t}.md`, `${t}.markdown`];
    const byPath = t.includes("/") ? withExt.map((p) => this.g.movedTo(p)).find((p) => p) : null;
    if (byPath) return { resolvedKind: "note", path: byPath, candidates: [byPath], via: "redirect" };
    if (t.includes("/")) return null;
    const to = [
      ...new Set(
        this.g.redirects
          .named(t)
          .map((p) => this.g.movedTo(p))
          .filter((p): p is string => !!p),
      ),
    ];
    if (to.length === 1) return { resolvedKind: "note", path: to[0]!, candidates: to, via: "redirect" };
    if (to.length > 1) return { resolvedKind: "ambiguous", path: null, candidates: to.sort(), via: "redirect" };
    return null;
  }
}
