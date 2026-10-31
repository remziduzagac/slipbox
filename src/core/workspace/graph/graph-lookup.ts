// Candidate lookup for one graph's resolver: live graph reads and its existing name, export-mark and remote caches.
import { statSync } from "node:fs";
import { isAbsolute, join, posix, relative } from "node:path";
import { parsePointer, resolvePointer } from "../links/pointer.ts";
import { checkoutRemotes, hostedHere } from "../links/hosting.ts";
import { normKey, pathLink, pickCandidate, wikiPathCandidates } from "../links/links.ts";
import { checkoutOf } from "../git/git.ts";
import { isMarkdownExport } from "../../rendering/export/mark.ts";
import { classify } from "../../documents/model/filetypes.ts";
import type { Target } from "./graph-types.ts";
import type { Graph } from "./graph.ts";

/** Aliases and previous names → notes. */
type Names = { aliases: Map<string, string[]>; previous: Map<string, string[]> };

/** Candidate queries and caches owned by one LinkResolver, without admission or dispatch policy. */
export class LinkLookup {
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
   * The attachments a wikilink's name finds anywhere in the root, as Obsidian finds them: by the file's name, or a
   * path's end aligned on segments. A Markdown export's pictures are left out, unless the name itself goes through
   * their folder: their copies would answer for the pictures they were copied from (DF-D18, DF-D25).
   */
  byFileName(target: string): string[] {
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

  /** A note by an alias its front matter gives (21.3): never by a previous name. */
  byAlias(target: string, fromRel: string): Target | null {
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
   * A target written as a filesystem path (17.16): relative out of the root, `~/`, absolute, a
   * `file://` URL. Inside this vault, its note or file like any other link's (a backlink too);
   * elsewhere, the file by its absolute path, in whichever root holds it.
   */
  byFilesystemPath(target: string, fromRel: string, wiki: boolean): Target | null {
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
  byPointer(target: string, fromRel: string): Target {
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
  byHosting(url: string, fromRel: string): Target | null {
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
  intoNested(rel: string, wiki: boolean): Target | null {
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
  byOtherName(target: string, fromRel: string): Target | null {
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

  /** `[[dir/old]]` or `[[old]]` whose note moved: by its old path, else its old name when unique. */
  movedWiki(target: string): Target | null {
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
