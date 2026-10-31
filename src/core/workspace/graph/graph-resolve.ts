// How a link resolves (20.2, 21.2, 21.3): a path, from the linking note or the root, into another root when it climbs
// out (17.9); a wikilink within its root — a note's name or path, an alias, an attachment by its name; a pointer into
// a named folder (21.7); a hosting URL of this repository. And the evidence of a move (17.12, 20.2): where a broken
// path's file went, for the relink — never a way to resolve one. A graph's own (`Graph.resolveLink` asks it).

import { existsSync } from "node:fs";
import { isAbsolute, join, posix, relative, sep } from "node:path";
import { formatPointer, isPointer } from "../links/pointer.ts";
import { lookupFolder, pointerName } from "../vaults/folders.ts";
import {
  extensionless,
  type MdLinkTarget,
  pathLink,
  pickCandidate,
  resolveAttachment,
  resolveMarkdownUrl,
} from "../links/links.ts";
import { classify } from "../../documents/model/filetypes.ts";
import type { LinkRef, Target } from "./graph-types.ts";
import type { Graph } from "./graph.ts";
import { LinkLookup } from "./graph-lookup.ts";

/** `[[vault:name]]`: a vault's name, a colon, the rest (17.8). */
export const VAULT_LINK = /^([\p{L}\p{N}][\p{L}\p{N}._-]*):(.+)$/u;

/** A graph's link admission and precedence; candidate lookup belongs to its one LinkLookup. */
export class LinkResolver {
  private readonly lookup: LinkLookup;

  constructor(private readonly g: Graph) {
    this.lookup = new LinkLookup(g);
  }

  /** What notes declare changed: the names are read again when next asked. */
  forgetNames(): void {
    this.lookup.forgetNames();
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
      (/^\.\.?\//.test(target) ? this.lookup.byFilesystemPath(target, fromRel, true) : null) ??
      this.lookup.intoNested(target.replace(/^\/+/, ""), true);
    if (byPath) return byPath;
    if (classify(target, this.g.config.walk.extensions).group !== "note" && /\.[A-Za-z0-9]+$/.test(target)) {
      const att = resolveAttachment(target, fromRel, this.g.root);
      if (att) return { resolvedKind: "file", path: att, candidates: [], how: "path" };
      // Obsidian finds attachments anywhere in the vault by name.
      const hits = this.lookup.byFileName(target);
      // Two of a name, as two notes are: the nearest, then the shortest; a real tie ambiguous.
      const r = pickCandidate(hits, target.normalize("NFC"), fromRel);
      if (r.status === "resolved")
        return { resolvedKind: "file", path: r.path, candidates: r.candidates, ...(r.how ? { how: r.how } : {}) };
      if (r.status === "ambiguous") return { resolvedKind: "ambiguous", path: null, candidates: r.candidates };
    }
    const aliased = this.lookup.byAlias(target, fromRel);
    if (aliased) return aliased;
    return this.g.oldForm(target) ?? { resolvedKind: "unresolved", path: null, candidates: [] };
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
      this.lookup.byFilesystemPath(link.target, fromRel, true) ??
      this.lookup.intoNested(link.target.replace(/^\/+/, ""), true);
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
      const hits = this.lookup.byFileName(link.target);
      if (hits.length === 1) return { resolvedKind: "file", path: hits[0]!, candidates: hits };
      if (hits.length > 1) return { resolvedKind: "ambiguous", path: null, candidates: hits.sort() };
    }
    const named = this.lookup.byOtherName(link.target, fromRel);
    if (named) return named;
    const moved = this.lookup.movedWiki(link.target);
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
      return (
        this.lookup.byFilesystemPath(path, fromRel, false) ?? { resolvedKind: "unresolved", path: null, candidates: [] }
      );
    }
    // A pointer into a named folder (21.7): wherever this machine has it.
    if (isPointer(link.target)) return this.lookup.byPointer(link.target, fromRel);
    // A folder named the old way (`research:x.md`): no link, but its pointer said (21.11).
    if (!/^(?:https?|mailto|file|ftp|data|tel):/i.test(link.target)) {
      const old = this.g.oldForm(link.target);
      if (old) return old;
    }
    // This repository's hosting (a README's `https://github.com/me/repo/blob/main/x.md`): the file here.
    if (/^https?:\/\//i.test(link.target)) {
      const hosted = this.lookup.byHosting(link.target, fromRel);
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
      const nested = this.lookup.intoNested(m.target, false);
      if (nested) return nested;
    }
    // A path that reaches nothing is broken, whatever moved (20.2): a move is evidence for a fix
    // (`movedTo`, the relink), never a way to resolve.
    if (m.kind === "missing") {
      // A path out of this root (17.9), or the filesystem's own `/…` (20.2): the file wherever it
      // is, in whichever root holds it.
      const byPath = this.lookup.byFilesystemPath(link.target.split("#")[0]!, fromRel, false);
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

  /** The names notes declare in their frontmatter, from the entries parsed so far. */
  otherNames() {
    return this.lookup.otherNames();
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
}
