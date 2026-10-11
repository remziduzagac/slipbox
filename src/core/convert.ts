// The converter (plan 20.1; blueprint/design/links.md § The converter): a vault's links made plain
// paths, once, by the resolution rules they were written for. The graph reads wikilinks again (21.3),
// within their root; the converter differs in resolving them as before (`Graph.resolveLegacyWiki`: by
// name, alias, previous name, other vaults and moves), on its own parse of the note (`parseLegacy`). Each
// `[[…]]` becomes a relative markdown link (`![[…]]` an image-syntax one, which embeds a note as
// before), its text kept and its heading a fragment that's checked to exist; each `/…` markdown link
// becomes relative, so it reads the same in tools that don't take `/` as the root (here it's the
// nearest root's, then the filesystem's path, 21.2). A plan like a rename's: previewed, then written
// with every file as it was planned from, and undone the same way.
// A link it can't decide is left as written and said why; one several notes answer to, for a pick.

import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, posix, relative, sep } from "node:path";
import type { Graph, LinkRef, ResolvedLink } from "./graph.ts";
import { blockLine, findHeading, headingFragment, lineFragment } from "./landing.ts";
import { parseLegacy, slugify, visit } from "./parse.ts";
import { readText } from "./fsutil.ts";
import { type Ambiguous, Collector, dirtyTrees, type RenamePlan } from "./rename.ts";
import { parseWikiTarget, type WikiLink } from "./wikilink.ts";
import { isInside } from "./vault.ts";

/** A wikilink as written: `!`, then `[[target#heading|alias]]`. */
const WIKI = /(!?)\[\[([^\]\n]*?)\]\]/g;

/** A path as a markdown link's URL: what would break it (a space, a parenthesis, `#`, `%`…) percent-encoded, the rest as it is. */
export function urlPath(p: string): string {
  return p.replace(/[\s%()<>#?[\]\\]/gu, (c) => encodeURIComponent(c));
}

/**
 * Link text as it was shown, literal: a wikilink's text is never markdown, a link's label is — so what
 * would act there is escaped (a backslash, brackets, `*`, a backtick, `<`, `&`, `~`; `_` unless it's
 * inside a word, where it can't emphasise).
 */
export function linkText(t: string): string {
  let out = "";
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    const word = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
    if ("\\[]*`<&~".includes(ch) || (ch === "_" && !(word(t[i - 1]) && word(t[i + 1])))) out += "\\";
    out += ch;
  }
  return out;
}

/** One replacement on a line: where it starts and ends in the line as read, and what goes there. */
interface Job {
  /** Finds its span in the line's text; null when the link isn't there any more. */
  locate: (line: string) => { from: number; to: number } | null;
  /** What replaces it, from the text found there. */
  make: (found: string) => string;
  /** Said when it can't be made. */
  shown: string;
  line: number;
}

/** The match nearest a column (0-based), among the line's matches of `re` that `keep` accepts. */
function nearest(line: string, re: RegExp, col: number, keep: (m: RegExpMatchArray) => boolean): RegExpMatchArray | null {
  const hits = [...line.matchAll(re)].filter(keep);
  hits.sort((a, b) => Math.abs(a.index! - col) - Math.abs(b.index! - col));
  return hits[0] ?? null;
}

/**
 * Plan converting the links of `rels` (vault-relative notes; every note when absent) to plain
 * paths. `picks` names a target (vault-relative) for an ambiguous wikilink, by its `rel:line:column`.
 */
export function planConvert(g: Graph, rels?: string[], picks: Map<string, string> = new Map()): RenamePlan {
  g.ensureAll();
  const c = new Collector(g);
  const ambiguous: Ambiguous[] = [];
  const notes = rels ?? [...g.notes.keys()].sort();
  for (const rel of notes) {
    const abs = join(g.root, rel);
    let text: string;
    let lines: string[];
    try {
      text = readText(abs).text;
      lines = text.split("\n");
    } catch {
      c.skipped.push({ shown: rel, line: 1, reason: "can't be read" });
      continue;
    }
    const jobs = new Map<number, Job[]>();
    const add = (j: Job) => jobs.set(j.line, [...(jobs.get(j.line) ?? []), j]);
    const skip = (l: ResolvedLink, reason: string) => c.skipped.push({ shown: rel, line: l.line, reason });
    // A reference definition several links share is rewritten once.
    const definitions = new Set<number>();
    // Its wikilinks, read as they were, each resolved by name as it was.
    for (const l of legacyWikiLinks(text)) wikiJob(g, rel, { ...l, ...g.resolveLegacyWiki(l, rel) }, picks, ambiguous, add, skip);
    for (const l of g.linksOf(rel)) {
      if ((l.kind === "markdown" || l.kind === "image") && l.target.startsWith("/") && !l.target.startsWith("//")) rootJob(g, rel, l, lines, definitions, add, skip);
    }
    for (const [line, list] of jobs) {
      c.line(
        abs,
        null,
        line,
        (before) => {
          // Every replacement on the line found in it as it is, then made from the right, so the
          // columns of those to their left hold.
          const spans: { from: number; to: number; text: string }[] = [];
          for (const j of list) {
            const at = j.locate(before);
            // Not there, or where another of the line's links was found (one gone since): left.
            if (!at || spans.some((s) => at.from < s.to && s.from < at.to)) c.skipped.push({ shown: rel, line, reason: `${j.shown}: not where the index has it (the file changed since)` });
            else spans.push({ ...at, text: j.make(before.slice(at.from, at.to)) });
          }
          let after = before;
          for (const s of spans.sort((a, b) => b.from - a.from)) after = after.slice(0, s.from) + s.text + after.slice(s.to);
          return after;
        },
        "the line isn't there any more",
      );
    }
  }
  const files = c.result();
  return {
    kind: "convert",
    from: rels?.join(", ") ?? "every note",
    to: "",
    move: null,
    files,
    warnings: dirtyTrees(files.map((f) => f.abs)),
    skipped: c.skipped,
    ambiguous,
  };
}

/** A note's wikilinks, as the parser read them before plain paths (20.2): where each is, how it's written. */
function legacyWikiLinks(text: string): LinkRef[] {
  const out: LinkRef[] = [];
  visit(parseLegacy(text), (n) => {
    if ((n.type as string) !== "wikiLink") return;
    const w = n as unknown as WikiLink & { position?: { start: { line: number; column: number }; end: { line: number; column: number } } };
    const start = w.position?.start ?? { line: 1, column: 1 };
    const end = w.position?.end ?? start;
    out.push({ kind: w.embed ? "embed" : "wiki", target: w.target, heading: w.heading, block: w.block, alias: w.alias, text: w.alias ?? w.value, line: start.line, column: start.column, end: { line: end.line, column: end.column } });
    return false;
  });
  return out;
}

/** A wikilink's replacement, when it can be made: its target as a relative path, its text kept, its fragment checked. */
function wikiJob(g: Graph, rel: string, l: ResolvedLink, picks: Map<string, string>, ambiguous: Ambiguous[], add: (j: Job) => void, skip: (l: ResolvedLink, reason: string) => void): void {
  const embed = l.kind === "embed";
  const written = `${embed ? "!" : ""}[[${l.target}${l.heading ? `#${l.heading}` : ""}${l.block ? `#^${l.block}` : ""}${l.alias ? `|${l.alias}` : ""}]]`;
  const key = `${rel}:${l.line}:${l.column}`;
  let path: string | null = null;
  switch (l.resolvedKind) {
    case "note":
    case "file":
      path = l.path;
      break;
    case "anchor":
      path = rel;
      break;
    case "ambiguous":
      path = picks.get(key) ?? null;
      if (path && !l.candidates.includes(path)) path = null;
      if (!path) {
        ambiguous.push({ key, shown: rel, line: l.line, written, candidates: l.candidates });
        return;
      }
      break;
    default:
      return skip(l, `${written}: ${l.reason ?? (/\.[A-Za-z0-9]+$/.test(l.target) && !/\.(md|markdown)$/i.test(l.target) ? `no file "${l.target}"` : `no note named "${l.target}"`)} — left as it is`);
  }
  // The fragment: a heading as its slug, checked to be there; a block as `^id`; a line as `L12`.
  let frag = "";
  if (l.block) {
    if (blockLine(g, path!, l.block) === null) return skip(l, `${written}: no block ^${l.block} there — left as it is`);
    frag = `#^${l.block}`;
  } else if (l.heading) {
    if (lineFragment(l.heading)) frag = `#${l.heading}`;
    else if (/\.(md|markdown)$/i.test(path!)) {
      const entry = g.entryAnywhere(path!);
      const hit = entry ? findHeading(entry.headings, entry.anchors ?? [], l.heading, true) : null;
      if (!hit) return skip(l, `${written}: no heading "${l.heading}" there — left as it is`);
      // Its id, or its slug as GitHub numbers repeats; a heading of nothing a slug keeps (`## 🎉`): no fragment reaches it.
      const to = hit.anchor ?? (hit.heading !== null ? headingFragment(entry!.headings, hit.heading) : "");
      if (!to) return skip(l, `${written}: the heading "${l.heading}" has no slug to link to — left as it is`);
      frag = `#${to}`;
    } else frag = `#${urlPath(l.heading)}`; // a PDF's page, or the like: as written
  }
  // The URL: the target's path from the note's folder; a link within the note, its fragment alone.
  const abs = join(g.root, rel);
  const targetAbs = isAbsolute(path!) ? path! : join(g.root, path!);
  const within = l.resolvedKind === "anchor";
  const url = within ? frag : urlPath(relative(dirname(abs), targetAbs).split(sep).join("/")) + frag;
  if (!url) return skip(l, `${written}: nothing to point at — left as it is`);
  // The text: the alias, else the link as it was drawn — `note › Heading`; within the note, the
  // heading alone. A picture's size (`|300`, `|300x200`) stays in Obsidian's markdown form,
  // `![name|300](…)`.
  const size = embed && l.alias && /^\d+(x\d+)?$/.test(l.alias) && !/\.(md|markdown)$/i.test(targetAbs);
  const part = l.heading ?? (l.block ? `^${l.block}` : null);
  const shown = within ? part! : part ? `${l.target} › ${part}` : l.target;
  const label = size ? `${linkText(posix.basename(l.target))}|${l.alias}` : linkText(l.alias ?? shown);
  add({
    line: l.line,
    shown: written,
    // In a table, where the wikilink's divider was written `\|`, a `|` in the label is escaped too.
    make: (found) => `${embed ? "!" : ""}[${found.includes("\\|") ? label.replaceAll("|", "\\|") : label}](${url})`,
    locate: (line) => {
      // The parser's own reading of each wikilink on the line, matched against the index's.
      const m = nearest(line, WIKI, l.column - 1, (x) => {
        const w = parseWikiTarget(x[2]!);
        return (x[1] === "!") === embed && w.target === l.target && w.heading === l.heading && w.block === l.block && w.alias === l.alias;
      });
      return m ? { from: m.index!, to: m.index! + m[0].length } : null;
    },
  });
}

/** A markdown link's URL as written, matched against the index's: raw, or percent-decoded. */
function sameUrl(raw: string, target: string): boolean {
  const url = raw.startsWith("<") ? raw.slice(1, -1) : raw;
  const dec = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  return url === target || dec(url) === dec(target);
}

/** The span of a URL as written — inside `<…>` when it's written so. */
function urlSpan(from: number, raw: string): { from: number; to: number } {
  return raw.startsWith("<") ? { from: from + 1, to: from + raw.length - 1 } : { from, to: from + raw.length };
}

/** An inline link's `](URL`. */
const INLINE_URL = /\]\(\s*(<[^>\n]*>|[^)\s]*)/g;
/** A reference definition: `[label]: URL`. */
const DEFINITION = /^( {0,3}\[[^\]]+\]:[ \t]*)(<[^>\n]*>|\S+)/;

/**
 * A markdown link written from the vault's root (`/docs/x.md`): its URL from the note's folder
 * instead — an inline link's where it is, a reference link's in its definition (once, however many
 * use it) — so tools that read `/` as the filesystem's root reach it too (here `/` is the nearest
 * root's, then the filesystem's path: 21.2). Only when that's what it reached: the file there under
 * the vault's root. One that names the filesystem's own path means the same anywhere; one that
 * reaches nothing is said.
 */
function rootJob(g: Graph, rel: string, l: ResolvedLink, lines: string[], definitions: Set<number>, add: (j: Job) => void, skip: (l: ResolvedLink, reason: string) => void): void {
  const hash = l.target.indexOf("#");
  const path = hash >= 0 ? l.target.slice(0, hash) : l.target;
  const frag = hash >= 0 ? l.target.slice(hash) : "";
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {}
  // What it meant before: the vault's root first — the file there, by the vault's own spelling.
  const was = g.resolveLink({ kind: "markdown", target: l.target.slice(1) }, "");
  // A root nested in this one has its files by their absolute paths (17.17): under the root too.
  const reached = (was.resolvedKind === "note" || was.resolvedKind === "file") && was.path ? (isAbsolute(was.path) ? was.path : join(g.root, was.path)) : null;
  if (!reached || !isInside(g.root, reached)) {
    // Else the filesystem's own path, which means the same after; else nothing at all.
    if (existsSync(decoded)) return;
    return skip(l, `${l.target}: nothing there — left as it is`);
  }
  const abs = join(g.root, rel);
  const relPath = relative(dirname(abs), reached).split(sep).join("/");
  const next = (/%[0-9A-Fa-f]{2}/.test(path) || /[\s()<>#?[\]\\]/.test(relPath) ? urlPath(relPath) : relPath) + frag;
  // An inline link: its `](URL` within the link's own span — the last there, so a link around an
  // image (`[![i](/x.md)](/x.md)`) is the outer one — else, the file changed since, the nearest.
  const inline = (line: string) => {
    const hits = [...line.matchAll(INLINE_URL)].filter((x) => sameUrl(x[1]!, l.target));
    const start = l.column - 1;
    const end = l.end.line === l.line ? l.end.column - 1 : Number.POSITIVE_INFINITY;
    const within = hits.filter((x) => x.index! >= start && x.index! + x[0].length <= end);
    const m = within.at(-1) ?? hits.sort((a, b) => Math.abs(a.index! - start) - Math.abs(b.index! - start))[0];
    return m ? urlSpan(m.index! + m[0].length - m[1]!.length, m[1]!) : null;
  };
  if (inline(lines[l.line - 1] ?? "")) return add({ line: l.line, shown: l.target, make: () => next, locate: inline });
  // A reference link (`[x][r]`): its definition, wherever it is.
  const at = lines.findIndex((t) => {
    const d = DEFINITION.exec(t);
    return !!d && sameUrl(d[2]!, l.target);
  });
  if (at < 0) return skip(l, `${l.target}: not where the index has it (the file changed since)`);
  if (definitions.has(at)) return;
  definitions.add(at);
  add({
    line: at + 1,
    shown: l.target,
    make: () => next,
    locate: (line) => {
      const d = DEFINITION.exec(line);
      return d && sameUrl(d[2]!, l.target) ? urlSpan(d[1]!.length, d[2]!) : null;
    },
  });
}
