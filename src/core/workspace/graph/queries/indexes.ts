// Derived tag, problem and backlink answers. Graph owns caches and invalidates them at the original points.
import { normKey, type LinkIndex, type Resolution } from "../../links/links.ts";
import { posix, join } from "node:path";
import { NOTE_EXT_RE } from "../graph-types.ts";
import { isAbsolute } from "node:path";
import { tagKey } from "../../../documents/markdown/tags.ts";
import { fragile, describeLanding, disambiguated } from "../graph-types.ts";
import type { Backlink, LinkProblem, LinkRef, NoteEntry, ResolvedLink, Target } from "../graph-types.ts";

export function collectTags(notes: ReadonlyMap<string, NoteEntry>): Map<string, { tag: string; notes: string[] }> {
  const index = new Map<string, { tag: string; notes: string[] }>();
  for (const [rel, e] of [...notes].sort(([a], [b]) => a.localeCompare(b))) {
    const mine = new Set<string>();
    for (const tag of e.tags) {
      const parts = tag.split("/");
      for (let i = 1; i <= parts.length; i++) {
        const name = parts.slice(0, i).join("/");
        const key = tagKey(name);
        if (mine.has(key)) continue;
        mine.add(key);
        const t = index.get(key) ?? { tag: name, notes: [] };
        t.notes.push(rel);
        index.set(key, t);
      }
    }
  }
  return new Map([...index].sort(([a], [b]) => a.localeCompare(b)));
}

interface ProblemContext {
  readonly notes: ReadonlyMap<string, NoteEntry>;
  linksOf(rel: string): ResolvedLink[];
  backlinks(rel: string): Backlink[];
  movedTarget(link: Pick<LinkRef, "kind" | "target">, from: string): string | null;
}
export function collectProblems(context: ProblemContext): {
  broken: LinkProblem[];
  ambiguous: LinkProblem[];
  fragile: LinkProblem[];
  orphans: string[];
} {
  const broken: LinkProblem[] = [];
  const ambiguous: LinkProblem[] = [];
  const fragileLinks: LinkProblem[] = [];
  for (const rel of [...context.notes.keys()].sort()) {
    for (const l of context.linksOf(rel)) {
      // Won by where it's written (the nearest, the shortest): a note of the name nearer would take it.
      if ((l.resolvedKind === "note" || l.resolvedKind === "file") && fragile(l) && l.path && !isAbsolute(l.path)) {
        fragileLinks.push({
          from: rel,
          line: l.line,
          column: l.column,
          end: l.end,
          kind: l.kind,
          target: l.target,
          text: l.text,
          reason: describeLanding(l),
          candidates: l.candidates,
          fix: disambiguated(l, rel),
        });
        continue;
      }
      if (l.resolvedKind !== "unresolved" && l.resolvedKind !== "ambiguous") continue;
      // A broken path whose file was seen to move (17.12, git's renames 20.21): where it went, for the fix.
      const moved = l.resolvedKind === "unresolved" ? context.movedTarget(l, rel) : null;
      const p: LinkProblem = {
        from: rel,
        line: l.line,
        column: l.column,
        end: l.end,
        kind: l.kind,
        target: l.target,
        text: l.text,
        reason: l.reason ?? (moved ? `moved to ${moved} — relink fixes it` : null),
        candidates: l.candidates,
        moved,
      };
      (l.resolvedKind === "unresolved" ? broken : ambiguous).push(p);
    }
  }
  const orphans = [...context.notes.keys()].sort().filter((rel) => !context.backlinks(rel).some((b) => b.from !== rel));
  return { broken, ambiguous, fragile: fragileLinks, orphans };
}

interface BacklinkContext {
  readonly notes: ReadonlyMap<string, NoteEntry>;
  linkingFiles(): string[];
  fileLinksOf(rel: string): LinkRef[];
  resolveLink(link: Pick<LinkRef, "kind" | "target">, from: string): Target;
}
export function collectBacklinks(
  context: BacklinkContext,
  inbound: () => Iterable<[string, Backlink[]]>,
): Map<string, Backlink[]> {
  const map = new Map<string, Backlink[]>();
  // Notes' links, data files' (16.15) and code comments' (16.10); to a note or to a file (a
  // config, a script, 16.3).
  const sources: [string, LinkRef[]][] = [
    ...[...context.notes].map(([from, note]) => [from, note.links] as [string, LinkRef[]]),
    ...context.linkingFiles().map((f) => [f, context.fileLinksOf(f)] as [string, LinkRef[]]),
  ];
  for (const [from, links] of sources) {
    for (const l of links) {
      // An image's link counts too: the notes that show a picture are its backlinks (and a
      // rename or move of it fixes them, 18.3).
      // A folder's links too, by its path (21.2): a move of the folder rewrites them.
      const r = context.resolveLink(l, from);
      if (
        (r.resolvedKind !== "note" && r.resolvedKind !== "file" && r.resolvedKind !== "folder") ||
        !r.path ||
        r.path === from ||
        isAbsolute(r.path)
      )
        continue;
      const list = map.get(r.path) ?? [];
      list.push({
        from,
        line: l.line,
        column: l.column,
        end: l.end,
        text: l.text,
        kind: l.kind,
        target: l.target,
        heading: l.heading,
        block: l.block,
        alias: l.alias,
      });
      map.set(r.path, list);
    }
  }
  // And other vaults' links into this one, as of their last indexing (17.11).
  for (const [rel, list] of inbound()) map.set(rel, [...(map.get(rel) ?? []), ...list]);
  return map;
}

interface NamesakeContext {
  readonly notes: ReadonlyMap<string, NoteEntry>;
  readonly index: Pick<LinkIndex, "resolveWiki">;
  readonly thorough: boolean;
  readonly pendingCount: number;
  ensureAll(): void;
  resolveLink(link: Pick<LinkRef, "kind" | "target">, from: string): Target;
}
export function namesakeLinks(
  context: NamesakeContext,
  rel: string,
  aliases: () => ReadonlyMap<string, string[]>,
): { from: string; link: LinkRef; was: string }[] | null {
  if (!NOTE_EXT_RE.test(rel)) return null;
  const name = posix.basename(rel).replace(NOTE_EXT_RE, "");
  const key = normKey(name);
  const named = context.index.resolveWiki(name, null).candidates.filter((c) => c !== rel).length;
  if (!named && !aliases().has(key)) return null;
  // One process, one answer (the CLI's): a link in a note not parsed yet is watched too.
  if (context.thorough && context.pendingCount) context.ensureAll();
  const out: { from: string; link: LinkRef; was: string }[] = [];
  for (const [from, e] of context.notes) {
    for (const l of e.links) {
      if (
        (l.kind !== "wiki" && l.kind !== "embed") ||
        normKey(posix.basename(l.target).replace(NOTE_EXT_RE, "")) !== key
      )
        continue;
      const r = context.resolveLink(l, from);
      if ((r.resolvedKind === "note" || r.resolvedKind === "file") && r.path) out.push({ from, link: l, was: r.path });
    }
  }
  return out.length ? out : null;
}

interface NoteLookup {
  readonly root: string;
  readonly notes: ReadonlyMap<string, NoteEntry>;
  readonly index: Pick<LinkIndex, "resolveWiki">;
}

export function findNote(context: NoteLookup, input: string, cwd = process.cwd()): Resolution {
  const cleaned = input.replace(/^\[\[|\]\]$/g, "");
  const full = join(cwd, cleaned);
  const asAbs = full.startsWith(`${context.root}/`) ? full.slice(context.root.length + 1) : null;
  for (const cand of [cleaned, asAbs]) {
    if (cand && context.notes.has(cand)) return { status: "resolved", path: cand, candidates: [cand] };
  }
  if (input.startsWith("/") && input.startsWith(context.root + "/")) {
    const rel = input.slice(context.root.length + 1);
    if (context.notes.has(rel)) return { status: "resolved", path: rel, candidates: [rel] };
  }
  return context.index.resolveWiki(cleaned, null);
}
