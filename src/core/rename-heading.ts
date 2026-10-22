// A heading renamed (11.9): its line, and every link to it — by its text or its slug — in this root and the others
// reached, as a plan.

import { isAbsolute, join } from "node:path";
import type { Graph, LinkKind, ResolvedLink } from "./graph.ts";
import { normKey } from "./links.ts";
import { slugify } from "./parse.ts";
import { RenameError, type RenamePlan, Collector, dirtyTrees } from "./rename-plan.ts";
import { type Site, safeDecode } from "./rename-links.ts";

/** Whether a link's `#fragment` names a heading: by its text (any case) or its slug. */
function namesHeading(fragment: string, text: string): boolean {
  return normKey(fragment.trim()) === normKey(text) || normKey(slugify(fragment)) === normKey(slugify(text));
}

/**
 * The heading on line `n` (1-based) of `lines`, its text now `next`: an ATX heading (`## Goals ##`)
 * or a setext one (`Goals` over a `---` or `===` underline), its indent, its explicit id (`{#g}`) and
 * its closing hashes or underline kept. Null when line `n` isn't a heading's.
 */
function headingLine(lines: string[], n: number, next: string): string | null {
  const line = lines[n - 1]?.replace(/\r$/, "");
  if (line === undefined) return null;
  const id = "([ \\t]*\\{#[^\\s{}#]+(?:\\s[^{}]*)?\\})?";
  const atx = new RegExp(`^(\\s{0,3}#{1,6}[ \\t]+)(.*?)${id}([ \\t]+#+[ \\t]*)?$`).exec(line);
  if (atx) return `${atx[1]}${next}${atx[3] ?? ""}${atx[4] ?? ""}`;
  const under = lines[n]?.replace(/\r$/, "");
  if (under === undefined || !/^ {0,3}(=+|-+)[ \t]*$/.test(under) || !line.trim()) return null;
  const setext = new RegExp(`^( {0,3})(.*?)${id}([ \\t]*)$`).exec(line);
  return setext ? `${setext[1]}${next}${setext[3] ?? ""}${setext[4] ?? ""}` : null;
}

/**
 * A link's `#heading` rewritten on a line at its site: in `[[target#Heading|text]]` the heading part,
 * in `[x](path#fragment)` the fragment — kept in its form, the slug (`#new-name`) or the text
 * (`#New%20Name`). The link nearest the site's column; null when it isn't there any more.
 */
function retitle(line: string, site: Site, old: string, next: string): string | null {
  const col = Math.max(0, site.column - 1);
  const hits: { at: number; from: number; to: number; put: string }[] = [];
  if (site.kind === "wiki" || site.kind === "embed") {
    for (let open = line.indexOf("[["); open >= 0; open = line.indexOf("[[", open + 2)) {
      const close = line.indexOf("]]", open + 2);
      if (close < 0) break;
      const inner = line.slice(open + 2, close);
      const hash = inner.indexOf("#");
      const bar = inner.search(/\\?\|/);
      if (hash < 0 || (bar >= 0 && bar < hash) || inner.slice(0, hash).trim() !== site.target) continue;
      const end = bar >= 0 ? bar : inner.length;
      const frag = inner.slice(hash + 1, end);
      if (!namesHeading(frag, old)) continue;
      hits.push({
        at: open > 0 && line[open - 1] === "!" ? open - 1 : open,
        from: open + 3 + hash,
        to: open + 2 + end,
        put: next,
      });
    }
  } else {
    for (const m of line.matchAll(/\]\(\s*(<[^>\n]*>|[^)\s]*)/g)) {
      const raw = m[1]!;
      const angled = raw.startsWith("<");
      const url = angled ? raw.slice(1, -1) : raw;
      if (url !== site.target && safeDecode(url) !== site.target) continue;
      const hash = url.indexOf("#");
      if (hash < 0) continue;
      const frag = url.slice(hash + 1);
      const decoded = safeDecode(frag);
      if (!namesHeading(decoded, old)) continue;
      // Written as the heading's text (`#My%20Heading`), it stays text; else the slug.
      const asText = decoded.toLowerCase() === old.toLowerCase() && decoded !== slugify(old);
      const put = asText ? (angled ? next : next.replace(/ /g, "%20")) : slugify(next);
      const start = m.index + m[0].length - raw.length + (angled ? 1 : 0) + hash + 1;
      const open = line.lastIndexOf("[", m.index);
      hits.push({
        at: open > 0 && line[open - 1] === "!" ? open - 1 : open,
        from: start,
        to: start + frag.length,
        put,
      });
    }
  }
  const hit = hits.sort((a, b) => Math.abs(a.at - col) - Math.abs(b.at - col))[0];
  return hit ? line.slice(0, hit.from) + hit.put + line.slice(hit.to) : null;
}

/**
 * Plan renaming a heading of a note (11.9): its line, and every link to it — `[[note#Heading]]`,
 * `![[note#Heading]]`, `[x](note.md#heading)`, the note's own `[[#Heading]]` and `[x](#heading)` — in
 * this vault and the others reached. Refused when two of its headings share the name (a link can't
 * tell them apart), or another heading has the new one.
 */
export function planHeadingRename(g: Graph, rel: string, heading: string, toText: string): RenamePlan {
  const entry = g.entry(rel);
  if (!entry) throw new RenameError(`no note ${rel} in ${g.root}`);
  const h = entry.headings.find((x) => namesHeading(heading, x.text));
  if (!h) throw new RenameError(`no heading "${heading}" in ${rel}`);
  const next = toText.trim();
  if (!next) throw new RenameError("a heading needs a name");
  if (entry.headings.some((x) => x !== h && slugify(x.text) === slugify(h.text)))
    throw new RenameError(`${rel} has two headings "${h.text}": links can't tell them apart`);
  if (next === h.text) throw new RenameError(`the heading is "${next}" already`);
  if (entry.headings.some((x) => x !== h && slugify(x.text) === slugify(next)))
    throw new RenameError(`${rel} has a heading "${next}" already`);
  const c = new Collector(g);
  const own = join(g.root, rel);
  // The heading itself first: when it can't be rewritten, nothing is — its links renamed alone would break.
  const text = c.file(own, null)?.text;
  if (text === undefined) throw new RenameError(`${rel} can't be read`);
  const retitled = headingLine(text.split("\n"), h.line, next);
  if (retitled === null)
    throw new RenameError(
      `the heading "${h.text}" isn't on line ${h.line} of ${rel} any more (its index is older than the file): nothing renamed`,
    );
  c.line(own, null, h.line, () => retitled, "the heading isn't on its line any more");
  const fragment = (l: { kind: LinkKind; target: string; heading: string | null }) => {
    if (l.kind === "wiki" || l.kind === "embed") return l.heading;
    const i = l.target.indexOf("#");
    return i < 0 ? null : safeDecode(l.target.slice(i + 1));
  };
  const site = (abs: string, l: { kind: LinkKind; target: string; line: number; column: number }) => ({
    abs,
    kind: l.kind,
    target: l.target,
    line: l.line,
    column: l.column,
  });
  for (const b of g.backlinks(rel)) {
    const f = fragment(b);
    if (f === null || !namesHeading(f, h.text)) continue;
    const abs = isAbsolute(b.from) ? b.from : join(g.root, b.from);
    c.line(
      abs,
      b.vault ?? null,
      b.line,
      (line) => retitle(line, site(abs, b), h.text, next),
      "no link to the heading there any more",
    );
  }
  // Its own links to it: by an anchor alone, or by its own path or name (backlinks leave a note's links to itself out).
  const self = (r: Pick<ResolvedLink, "resolvedKind" | "path">) =>
    r.resolvedKind === "anchor" || (r.resolvedKind === "note" && !!r.path && (r.path === rel || r.path === own));
  for (const l of entry.links) {
    const f = fragment(l);
    if (f === null || !namesHeading(f, h.text) || !self(g.resolveLink(l, rel))) continue;
    c.line(
      own,
      null,
      l.line,
      (line) => retitle(line, site(own, l), h.text, next),
      "no link to the heading there any more",
    );
  }
  const files = c.result();
  return {
    kind: "heading",
    from: `${rel}#${h.text}`,
    to: `${rel}#${next}`,
    move: null,
    files,
    warnings: dirtyTrees(files.map((f) => f.abs)),
    skipped: c.skipped,
  };
}
