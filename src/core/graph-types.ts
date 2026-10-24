// What the graph knows of a note and its links (1.5–1.7): a note's entry, a link as written and as resolved, a
// backlink, a problem; and how a link landed, and how sure that is, for people and for agents.

import { posix } from "node:path";
import type { Landed } from "./links.ts";
import type { AnchorInfo, HeadingInfo } from "./parse.ts";
import type { Graph } from "./graph.ts";

export type LinkKind = "wiki" | "embed" | "markdown" | "image";

export interface LinkRef {
  kind: LinkKind;
  /** wiki: the target name; markdown/image: the URL. */
  target: string;
  heading: string | null;
  block: string | null;
  alias: string | null;
  /** Visible text, for listings. */
  text: string;
  line: number;
  column: number;
  /** Where it ends: its last line, and the column after its last character (1-based, as remark counts). */
  end: Pos;
}

/** A place in a file's text: a line and a column, both from 1 (a column counts UTF-16 units). */
export interface Pos {
  line: number;
  column: number;
}

export interface NoteEntry {
  rel: string;
  title: string;
  headings: HeadingInfo[];
  /** HTML anchors (`<a id>`) a fragment may name (an entry from an older index has none). */
  anchors?: AnchorInfo[];
  links: LinkRef[];
  tags: string[];
  /** Frontmatter `aliases` (and `alias`): names `[[…]]` reaches the note by, like its own (17.7). */
  aliases: string[];
  /** Frontmatter `previous_names`, as renames wrote them before 21.12: the converter reads them (21.3), links never. */
  previous: string[];
  /** Its content hash: a note that vanished and turns up elsewhere with it was moved (17.12). */
  hash: string;
  mtimeMs: number;
  size: number;
  flags: string[];
}

/**
 * A change to the vault's files as the graph hears of it (6.7): whatever made it — the watcher, a
 * save here, a CLI write, a rename — it passes through the graph, and whoever keeps something
 * derived from the files (the search index; later, an outside indexer) listens here.
 */
export type VaultChange =
  | { kind: "changed"; path: string }
  | { kind: "removed"; path: string }
  | { kind: "moved"; from: string; to: string };

/** How a link reached its target when not directly: an alias, a pointer's folder by an old name or another copy (21.7)… */
export type Via = "alias" | "previous-name" | "redirect" | "old-name" | "another-copy" | "hosting";

export interface ResolvedLink extends LinkRef {
  /** note: a vault note; file: an attachment; folder: a folder (21.2); external: a URL; anchor: within this note. */
  resolvedKind: "note" | "file" | "folder" | "external" | "anchor" | "unresolved" | "ambiguous";
  /** Vault-relative; absolute when the target is in another root (17.8, 17.9). */
  path: string | null;
  candidates: string[];
  /** The other vault's name (or folder), when the target is in another root. */
  vault?: string | null;
  via?: Via;
  /** Why it didn't resolve, when there's more to say than "no such note" ("unknown vault"). */
  reason?: string;
  /** A pointer to a branch not checked out here (21.7): the file as it is there, read from git. */
  gitRef?: { root: string; rel: string; branch: string };
  /** How it landed (`links.ts` `Landed`): its path, a pointer, a hosting URL, a name, a tie broken. Every link reaching a file or folder has one. */
  how?: Landed;
  /** A hosting URL (via "hosting") naming another ref than the branch checked out: both. */
  hosted?: { ref: string; branch: string | null };
  /** A file named the old way (`research:x.md`, `[[research:x]]`, 21.11): the pointer that names it. */
  suggest?: string;
}

/** A link that reached one note and reaches another now, after a note came or went. */
export interface Retarget {
  from: string;
  line: number;
  target: string;
  was: string;
  now: string;
}

/**
 * How sure a link's target is (trailscout's terms): `exact` — by its path, a unique name, an alias,
 * a pointer, a hosting URL at the branch here; `inferred` — a tie broken, a path's end, a folder's old
 * name or another copy, a hosting URL at another ref; else `ambiguous`, `broken`.
 */
export function certainty(
  t: Pick<Target, "resolvedKind" | "how" | "via" | "hosted">,
): "exact" | "inferred" | "ambiguous" | "broken" {
  if (t.resolvedKind === "unresolved") return "broken";
  if (t.resolvedKind === "ambiguous") return "ambiguous";
  if (t.via === "hosting") return t.hosted ? "inferred" : "exact";
  if (t.via === "previous-name" || t.via === "redirect" || t.via === "old-name" || t.via === "another-copy")
    return "inferred";
  return !t.how || t.how === "path" || t.how === "name" || t.how === "pointer" || t.how === "hosting"
    ? "exact"
    : "inferred";
}

/** A tie broken by where the link is — the deepest folder shared, the shortest path: a note of the name nearer would take it. */
export function fragile(t: Pick<Target, "how">): boolean {
  return t.how === "deepest-shared" || t.how === "shortest";
}

/** How a link landed, for people, when it wasn't by its own path: "the nearest of 2 named so". */
export function describeLanding(t: Pick<Target, "how" | "via" | "candidates" | "hosted">): string | null {
  const n = t.candidates.length;
  if (t.via === "hosting")
    return t.hosted ? `its URL names ${t.hosted.ref}; this copy is on ${t.hosted.branch ?? "no branch"}` : null;
  if (t.via === "alias") return "by an alias";
  if (t.via === "old-name") return "by its folder's old name";
  if (t.via === "another-copy") return "in another copy of its folder";
  switch (t.how) {
    case "suffix":
      return "by the end of its path";
    case "exact-case":
      return `spelled exactly so, of ${n}`;
    case "same-folder":
      return `in the same folder, of ${n}`;
    case "deepest-shared":
      return `the nearest of ${n} named so`;
    case "shortest":
      return `the shortest path of ${n} named so`;
    default:
      return null;
  }
}

/** What resolving a link found, without the link's own fields. */
export type Target = Omit<ResolvedLink, keyof LinkRef>;

/**
 * Other vaults, as this one reaches them (17.8–17.11; core/reach.ts): `[[vault:note]]`, the root
 * holding a path outside this one, and the links other vaults make into this one.
 */
export interface VaultReach {
  /** `[[vault:target]]` from `g`; null when `vault` names no folder (the link may be something else). */
  wiki(vault: string, target: string, g: Graph): Target | null;
  /** The name (or folder) of the root holding an absolute path outside this vault. */
  vaultOf(abs: string): string | null;
  /** Links from other vaults' indexes into `g`, by the vault-relative path they reach. */
  inbound(g: Graph): Map<string, Backlink[]>;
  /** The entry of a note in another root, by its absolute path. */
  entryAt(abs: string): NoteEntry | undefined;
  /** Another root's graph (an embed of its note resolves its links there, 1.11); null if unreadable. */
  graphAt(root: string, opts?: { known?: boolean }): Graph | null;
  /** Another root's index written meanwhile, a root found and recorded with it: the machine's list read again. */
  othersChanged?(): void;
}

/** A link that reaches nothing, or more than one note (1.7): where it is, how it's written, why. */
export interface LinkProblem {
  from: string;
  line: number;
  column: number;
  end: Pos;
  kind: LinkKind;
  target: string;
  text: string;
  reason: string | null;
  candidates: string[];
  /** A broken link's file, seen to move: where it is now (vault path), the relink's fix. */
  moved?: string | null;
  /** A fragile link's: the target that names its note for sure — its path from the root, or a relative one for a top-level note. */
  fix?: string;
}

/**
 * The target that names a link's note (or file) for sure, written in the note at `fromRel`: its path
 * from the root — but a top-level note's path is its bare name, read as a name again (21.3), so
 * that one is a relative path (`../plan`, `./plan`). Without `.md` when the link had none.
 */
export function disambiguated(l: Pick<ResolvedLink, "target" | "path">, fromRel: string): string {
  let p = l.path!;
  if (!p.includes("/")) {
    p = posix.relative(posix.dirname(fromRel), p);
    if (!p.startsWith("../")) p = `./${p}`;
  }
  return NOTE_EXT_RE.test(l.target) || !NOTE_EXT_RE.test(p) ? p : p.replace(NOTE_EXT_RE, "");
}

export interface Backlink {
  /** Vault-relative; absolute for a link from another vault (17.11). */
  from: string;
  /** The linking vault's name, for a link from another vault. */
  vault?: string | null;
  line: number;
  column: number;
  end: Pos;
  text: string;
  /** How the link is written, so a caller can rewrite it (a rename): its kind and parts. */
  kind: LinkKind;
  target: string;
  heading: string | null;
  block: string | null;
  alias: string | null;
}

export const NOTE_EXT_RE = /\.(md|markdown)$/i;
