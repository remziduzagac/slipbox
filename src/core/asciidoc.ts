// AsciiDoc as a note format (plan 16.17): a line reader into the mdast tree every note is
// (`readers.ts`), so AsciiDoc notes render, index, link and edit like markdown ones.
//
// AsciiDoc's structure is its lines — section titles, delimited blocks, list markers, attribute
// entries — so it reads line by line, with no dependency and nothing to load: the common syntax
// of notes and docs, not the whole language (no conditionals, no substitutions beyond the
// attributes a note sets, no includes expanded — an include is a link to the file).

import type { BlockContent, Heading, List, ListItem, Paragraph, PhrasingContent, Root, RootContent, Table, TableCell, TableRow } from "mdast";
import type { DataComment, DataField } from "./data.ts";
import type { LayoutHeading } from "./layout/ir.ts";
import { ORIGIN, type ParsedNote, slugify } from "./parse.ts";
import type { NoteReader, SourceLink } from "./readers.ts";

type Pos = { start: { line: number; column: number }; end: { line: number; column: number } };

const pos = (from: number, to: number, lines: string[]): Pos => ({ start: { line: from + 1, column: 1 }, end: { line: to + 1, column: (lines[to] ?? "").length + 1 } });

/** Delimited blocks: a line of four or more of one of these (`--` alone is an open block). */
const DELIMITER = /^(-{4,}|\.{4,}|_{4,}|={4,}|\*{4,}|\+{4,}|\/{4,}|--)\s*$/;
const SECTION = /^(={1,6}|#{1,6})\s+(\S.*?)\s*$/;
const ATTRIBUTE = /^:(!?[\w][\w-]*!?):(?:\s+(.*))?$/;
const LIST_ITEM = /^\s*(\*{1,5}|-|\.{1,5}|\d{1,9}\.)\s+(.*)$/;
const ADMONITION = /^(NOTE|TIP|IMPORTANT|WARNING|CAUTION):\s+(.*)$/;
const BLOCK_ATTRS = /^\[([^\]]*)\]\s*$/;
const DESCRIPTION = /^(\S.*?)(:{2,4}|;;)(?:\s+(.*))?$/;
const TABLE = /^\|={3,}\s*$/;

/** A section's automatic id, as Asciidoctor makes it: `_` + the title lowercased, runs of other
 *  characters as `_`. What `<<id>>` names when no `[[id]]` was set. */
function autoId(title: string): string {
  return `_${title.toLowerCase().replace(/<[^>]*>/g, "").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "")}`;
}

/** A link target as a link URL: `x.adoc#id` and `#id` with the id turned into its section's title
 *  (headings are found by text or slug), a URL as it is. */
function target(raw: string, ids: Map<string, string>): string {
  const hash = raw.indexOf("#");
  if (hash < 0) {
    // `<<id>>` alone is an anchor in this document; `<<other.adoc>>` a file.
    if (/\.[A-Za-z0-9]{1,10}$/.test(raw)) return raw;
    return `#${ids.get(raw) ?? raw}`;
  }
  const file = raw.slice(0, hash);
  const id = raw.slice(hash + 1);
  return `${file}#${file ? id : (ids.get(id) ?? id)}`;
}

/** The inline markup of one line: strong, emphasis, monospace, links, xrefs, images, breaks. */
function inline(text: string, line: number, ids: Map<string, string>, col = 0): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  // Each node where it starts on its line (the index lists links by line and column).
  const at = (i: number, len: number) => ({ start: { line: line + 1, column: col + i + 1 }, end: { line: line + 1, column: col + i + len + 1 } });
  let position = at(0, text.length);
  const re =
    /(?<url>(?:link:)?(?:https?|mailto|ftp):[^\s[\]<>]+?)\[(?<urltext>[^\]]*)\]|(?<link>link|xref|image):(?<ltarget>[^\s[\]]+)\[(?<ltext>[^\]]*)\]|<<(?<xref>[^,>]+)(?:,\s*(?<xtext>[^>]*))?>>|(?<bare>\bhttps?:\/\/[^\s[\]<>]+[^\s[\]<>.,;:!?)])|(?<!\w)\*\*(?<b2>.+?)\*\*|(?<![\w*])\*(?<b>[^\s*](?:.*?[^\s*])?)\*(?![\w*])|(?<!\w)__(?<i2>.+?)__|(?<![\w_])_(?<i>[^\s_](?:.*?[^\s_])?)_(?![\w_])|`(?<code>[^`]+)`|(?<![\w#])#(?<mark>[^\s#](?:.*?[^\s#])?)#(?![\w#])/g;
  let last = 0;
  const plain = (s: string, i: number) => {
    if (s) out.push({ type: "text", value: s, position: at(i, s.length) });
  };
  for (const m of text.matchAll(re)) {
    plain(text.slice(last, m.index), last);
    last = m.index + m[0].length;
    position = at(m.index, m[0].length);
    const g = m.groups!;
    const kids = (s: string) => inline(s, line, ids, col + m.index + m[0].indexOf(s));
    if (g.url !== undefined) {
      const url = g.url.replace(/^link:/, "");
      out.push({ type: "link", url, children: g.urltext ? kids(g.urltext) : [{ type: "text", value: url }], position });
    } else if (g.link !== undefined) {
      if (g.link === "image") out.push({ type: "image", url: g.ltarget!, alt: g.ltext || null, position });
      else {
        const url = g.link === "xref" ? target(g.ltarget!, ids) : g.ltarget!;
        out.push({ type: "link", url, children: g.ltext ? kids(g.ltext) : [{ type: "text", value: g.ltarget! }], position });
      }
    } else if (g.xref !== undefined) {
      const url = target(g.xref.trim(), ids);
      const label = g.xtext?.trim() || ids.get(g.xref.trim()) || g.xref.trim();
      out.push({ type: "link", url, children: [{ type: "text", value: label }], position });
    } else if (g.bare !== undefined) out.push({ type: "link", url: g.bare, children: [{ type: "text", value: g.bare }], position });
    else if (g.b2 !== undefined || g.b !== undefined) out.push({ type: "strong", children: kids(g.b2 ?? g.b!), position });
    else if (g.i2 !== undefined || g.i !== undefined) out.push({ type: "emphasis", children: kids(g.i2 ?? g.i!), position });
    else if (g.code !== undefined) out.push({ type: "inlineCode", value: g.code.replace(/^\+(.*)\+$/, "$1"), position });
    else if (g.mark !== undefined) out.push(...kids(g.mark));
  }
  plain(text.slice(last), last);
  return out;
}

/** A paragraph's lines as phrasing: each line's inline markup, joined by soft breaks; a line
 *  ending in ` +` is a hard break. */
function phrasing(lines: string[], from: number, to: number, ids: Map<string, string>, firstCol = 0): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  for (let i = from; i <= to; i++) {
    let text = lines[i]!.replace(/\r$/, "");
    const hard = / \+$/.test(text);
    if (hard) text = text.slice(0, -2);
    if (i > from) out.push({ type: "text", value: "\n" });
    const body = i === from ? text : text.trimStart();
    out.push(...inline(body, i, ids, i === from ? firstCol : text.length - body.length));
    if (hard && i < to) out.push({ type: "break" });
  }
  return out;
}

interface Ctx {
  lines: string[];
  ids: Map<string, string>;
  title: string | null;
  tags: string[];
}

/** Whether line `i` starts a block of its own (and so ends a paragraph or a list item's text). */
function startsBlock(l: string): boolean {
  return !l.trim() || DELIMITER.test(l) || SECTION.test(l) || ATTRIBUTE.test(l) || LIST_ITEM.test(l) || BLOCK_ATTRS.test(l) || TABLE.test(l) || /^\/\//.test(l) || l === "+" || /^(?:'{3,}|<{3})\s*$/.test(l);
}

/** Blocks from line `from` up to (not including) `to`. */
function blocks(c: Ctx, from: number, to: number, top: boolean): RootContent[] {
  const { lines, ids } = c;
  const out: RootContent[] = [];
  let attrs: string | null = null; // a `[source,python]` line, for the block after it
  let title: string | null = null; // a `.Title` line, likewise
  let i = from;
  // The attribute entries of a run: rows sharing one key column.
  const attrRun: DataField[] = [];
  const flushAttrs = () => {
    const w = Math.max(0, ...attrRun.map((f) => f.key.length));
    for (const f of attrRun) out.push({ ...f, keyWidth: w } as unknown as RootContent);
    attrRun.length = 0;
  };
  while (i < to) {
    const raw = lines[i]!.replace(/\r$/, "");
    if (!ATTRIBUTE.test(raw)) flushAttrs();
    if (!raw.trim()) {
      i++;
      continue;
    }
    // A comment line, or a comment block.
    if (raw.startsWith("//") && !/^\/{4,}\s*$/.test(raw)) {
      let j = i;
      while (j + 1 < to && /^\/\/(?!\/\/)/.test(lines[j + 1]!)) j++;
      out.push({ type: "dataComment", text: lines.slice(i, j + 1).map((l) => l.replace(/^\/\/\s?/, "")).join("\n"), position: pos(i, j, lines) } as DataComment as unknown as RootContent);
      i = j + 1;
      continue;
    }
    const attr = ATTRIBUTE.exec(raw);
    if (attr) {
      const key = attr[1]!;
      const value = attr[2] ?? "";
      if (key === "tags" || key === "keywords") c.tags.push(...value.split(/[,\s]+/).filter(Boolean));
      attrRun.push({ type: "dataField", key, value, kind: "string", comment: null, keyWidth: 0, keyLine: i + 1, position: pos(i, i, lines) });
      i++;
      continue;
    }
    if (BLOCK_ATTRS.test(raw) && !/^\[\[/.test(raw)) {
      attrs = BLOCK_ATTRS.exec(raw)![1]!;
      i++;
      continue;
    }
    if (/^\[\[[^\]]+\]\]\s*$/.test(raw) || raw === "+") {
      i++; // an anchor on its own line (its section registered it), a list continuation
      continue;
    }
    if (/^\.[^\s.]/.test(raw)) {
      title = raw.slice(1);
      i++;
      continue;
    }
    // A block's title, drawn in bold above it, where the block has no place of its own for it.
    const titled = () => {
      if (title) out.push({ type: "paragraph", children: [{ type: "strong", children: inline(title, i - 1, ids, 1) }], position: pos(i - 1, i - 1, lines) });
      title = null;
    };
    // An include is a link to the file (never expanded: the note shows what it says).
    const inc = /^include::([^[\s]+)\[[^\]]*\]\s*$/.exec(raw);
    if (inc) {
      const p = pos(i, i, lines);
      out.push({ type: "paragraph", children: [{ type: "text", value: "include ", position: p }, { type: "link", url: inc[1]!, children: [{ type: "text", value: inc[1]! }], position: { start: { line: i + 1, column: 10 }, end: { line: i + 1, column: 10 + inc[1]!.length } } }], position: p });
      attrs = title = null;
      i++;
      continue;
    }
    const sec = SECTION.exec(raw);
    if (sec) {
      const depth = Math.min(6, sec[1]!.length) as Heading["depth"];
      const text = sec[2]!.replace(/\s+=+\s*$/, "");
      if (depth === 1 && !c.title) c.title = text;
      out.push({ type: "heading", depth, children: inline(text, i, ids), position: pos(i, i, lines) });
      attrs = title = null;
      i++;
      continue;
    }
    if (/^(?:'{3,}|<{3})\s*$/.test(raw)) {
      out.push({ type: "thematicBreak", position: pos(i, i, lines) });
      i++;
      continue;
    }
    // A delimited block: to its closing line (the same delimiter), or the end.
    const delim = DELIMITER.exec(raw);
    if (delim) {
      const d = delim[1]!;
      let j = i + 1;
      while (j < to && lines[j]!.replace(/\r$/, "").trimEnd() !== d) j++;
      const end = Math.min(j, to - 1);
      const inner = lines.slice(i + 1, j);
      const kind = attrs?.split(",")[0]?.trim().toLowerCase() ?? "";
      const p = pos(i, end, lines);
      const ch = d[0];
      if (ch === "/" || ch === "." || ch === "+" || (ch === "-" && d.length > 2)) titled();
      if (ch === "/") out.push({ type: "dataComment", text: inner.join("\n"), position: p } as DataComment as unknown as RootContent);
      else if (ch === "-" && d.length > 2) {
        const lang = kind === "source" ? (attrs!.split(",")[1]?.trim() || null) : null;
        out.push({ type: "code", lang, value: inner.join("\n"), position: p });
      } else if (ch === "." || ch === "+") out.push({ type: "code", lang: ch === "+" ? "html" : null, value: inner.join("\n"), position: p });
      else {
        // Quote, example, sidebar, open: blocks inside; an admonition style makes it a callout.
        const children = blocks(c, i + 1, j, false) as BlockContent[];
        const callout = /^(note|tip|important|warning|caution)$/.test(kind) ? kind : null;
        if (callout) out.push(calloutOf(callout, title, children, p, i));
        else if (ch === "-" && !title) out.push(...(children as RootContent[]));
        else {
          if (title) children.unshift({ type: "paragraph", children: [{ type: "strong", children: [{ type: "text", value: title }] }] });
          out.push({ type: "blockquote", children, position: p });
        }
      }
      attrs = title = null;
      i = j + 1;
      continue;
    }
    if (TABLE.test(raw)) {
      titled();
      let j = i + 1;
      while (j < to && !TABLE.test(lines[j]!)) j++;
      out.push(table(lines, i, Math.min(j, to - 1), attrs, ids));
      attrs = title = null;
      i = j + 1;
      continue;
    }
    if (LIST_ITEM.test(raw)) {
      titled();
      const [list, next] = listAt(c, i, to);
      out.push(list);
      attrs = title = null;
      i = next;
      continue;
    }
    // A paragraph: to a blank line or the start of a block.
    let j = i;
    while (j + 1 < to && !startsBlock(lines[j + 1]!)) j++;
    const p = pos(i, j, lines);
    if (/^\s/.test(raw) && !attrs) {
      out.push({ type: "code", lang: null, value: lines.slice(i, j + 1).join("\n"), position: p }); // a literal paragraph
    } else {
      const adm = ADMONITION.exec(raw);
      const style = attrs?.split(",")[0]?.trim().toLowerCase();
      if (adm || (style && /^(note|tip|important|warning|caution)$/.test(style))) {
        const body = adm ? phrasing([...lines.slice(0, i), " ".repeat(adm[1]!.length + 2) + adm[2]!, ...lines.slice(i + 1)], i, j, ids, adm[1]!.length + 2) : phrasing(lines, i, j, ids);
        out.push(calloutOf(adm ? adm[1]!.toLowerCase() : style!, title, [{ type: "paragraph", children: body, position: p }], p, i));
      } else if (style === "quote" || style === "verse") {
        out.push({ type: "blockquote", children: [{ type: "paragraph", children: phrasing(lines, i, j, ids), position: p }], position: p });
      } else {
        const para: Paragraph = { type: "paragraph", children: phrasing(lines, i, j, ids), position: p };
        if (title) para.children.unshift({ type: "strong", children: [{ type: "text", value: title }] }, { type: "break" });
        out.push(para);
      }
    }
    attrs = title = null;
    i = j + 1;
  }
  flushAttrs();
  if (top) for (const n of out) (n as unknown as Record<symbol, object>)[ORIGIN] = {};
  return out;
}

/** A callout, as the renderer reads one: a quote led by `[!kind]`. */
function calloutOf(kind: string, title: string | null, children: BlockContent[], p: Pos, line: number): RootContent {
  const lead: PhrasingContent = { type: "text", value: `[!${kind}]${title ? ` ${title}` : ""}\n`, position: { start: { line: line + 1, column: 1 }, end: { line: line + 1, column: 1 } } };
  const first = children[0];
  if (first?.type === "paragraph") return { type: "blockquote", children: [{ ...first, children: [lead, ...first.children] }, ...children.slice(1)], position: p };
  return { type: "blockquote", children: [{ type: "paragraph", children: [lead] }, ...children], position: p };
}

/** A list from line `from`: its items (nested by marker depth), each item's text running on to
 *  the next marker, a blank line or a block. */
function listAt(c: Ctx, from: number, to: number): [List, number] {
  const { lines, ids } = c;
  const first = LIST_ITEM.exec(lines[from]!)!;
  const marker = first[1]!;
  const ordered = marker.startsWith(".") || /^\d/.test(marker);
  const sameKind = (m: string) => (/^\d/.test(m) ? /^\d/.test(marker) : m === marker);
  const items: ListItem[] = [];
  let i = from;
  while (i < to) {
    const m = LIST_ITEM.exec(lines[i]!);
    if (!m || !sameKind(m[1]!)) break;
    const itemStart = i;
    let text = m[2]!;
    let checked: boolean | null = null;
    const box = /^\[([ xX*])\]\s+(.*)$/.exec(text);
    if (box) {
      checked = box[1] !== " ";
      text = box[2]!;
    }
    let j = i;
    while (j + 1 < to && !startsBlock(lines[j + 1]!)) j++;
    const textCol = lines[i]!.length - text.length;
    const itemLines = [...lines.slice(0, i), " ".repeat(textCol) + text, ...lines.slice(i + 1)];
    const children: BlockContent[] = [{ type: "paragraph", children: phrasing(itemLines, i, j, ids, textCol).map((n, k) => (k === 0 && n.type === "text" ? { ...n, value: n.value.trimStart() } : n)), position: pos(i, j, lines) }];
    i = j + 1;
    // Deeper items (or a list of another kind) right under it: its sublist.
    const next = i < to ? LIST_ITEM.exec(lines[i]!) : null;
    if (next && !sameKind(next[1]!) && next[1]!.length > (marker.startsWith("*") || marker.startsWith(".") ? marker.length : 0)) {
      const [sub, after] = listAt(c, i, to);
      children.push(sub);
      i = after;
    }
    items.push({ type: "listItem", spread: false, checked, children, position: pos(itemStart, i - 1, lines) });
    // A blank line between items keeps the list going.
    let k = i;
    while (k < to && !lines[k]!.trim()) k++;
    const again = k < to ? LIST_ITEM.exec(lines[k]!) : null;
    if (!again || !sameKind(again[1]!)) break;
    i = k;
  }
  const start = /^\d/.test(marker) ? Number.parseInt(marker, 10) : 1;
  return [{ type: "list", ordered, start: ordered ? start : null, spread: false, children: items, position: pos(from, i - 1, lines) }, i];
}

/** A `|===` table: cells split at `|`, rows by the first row's width (or `cols`). */
function table(lines: string[], from: number, to: number, attrs: string | null, ids: Map<string, string>): Table {
  const cells: { text: string; line: number }[] = [];
  let width = 0;
  for (let i = from + 1; i < to; i++) {
    const l = lines[i]!.replace(/\r$/, "");
    if (!l.trim()) continue;
    const parts = l.split(/(?<!\\)\|/).slice(1);
    if (!parts.length) {
      if (cells.length) cells[cells.length - 1]!.text += ` ${l.trim()}`; // a cell running on
      continue;
    }
    if (!width) width = parts.length;
    for (const p of parts) cells.push({ text: p.trim().replace(/\\\|/g, "|"), line: i });
  }
  const cols = /cols="?(\d+)/.exec(attrs ?? "")?.[1];
  const colsList = /cols="([^"]+)"/.exec(attrs ?? "")?.[1]?.split(",").length;
  const n = Math.max(1, Number(cols) || colsList || width);
  const rows: TableRow[] = [];
  for (let k = 0; k < cells.length; k += n) {
    const row = cells.slice(k, k + n);
    const line = row[0]!.line;
    const children: TableCell[] = row.map((cell) => ({ type: "tableCell", children: inline(cell.text, cell.line, ids) }));
    while (children.length < n) children.push({ type: "tableCell", children: [] });
    rows.push({ type: "tableRow", children, position: pos(line, row[row.length - 1]!.line, lines) });
  }
  return { type: "table", align: Array(n).fill(null), children: rows, position: pos(from, to, lines) };
}

/** Section ids: `[[id]]` or `[#id]` above a title, else its automatic one — to its title. */
function sectionIds(lines: string[]): Map<string, string> {
  const ids = new Map<string, string>();
  let pending: string | null = null;
  let block: string | null = null;
  for (const raw of lines) {
    const l = raw.replace(/\r$/, "");
    const d = DELIMITER.exec(l)?.[1];
    if (d && d !== "--") {
      block = block === d ? null : (block ?? d);
      continue;
    }
    if (block) continue;
    const anchor = /^\[\[([^\],\]]+)(?:,[^\]]*)?\]\]\s*$|^\[#([\w-]+)[^\]]*\]\s*$/.exec(l);
    if (anchor) {
      pending = anchor[1] ?? anchor[2]!;
      continue;
    }
    const s = SECTION.exec(l);
    if (s) {
      const title = s[2]!.replace(/\s+=+\s*$/, "");
      ids.set(pending ?? autoId(title), title);
      if (pending) ids.set(autoId(title), title);
    }
    if (l.trim()) pending = null;
  }
  return ids;
}

/** An AsciiDoc note's text as the shared tree. */
export function parseAsciidoc(source: string): ParsedNote {
  const lines = source.split("\n");
  const c: Ctx = { lines, ids: sectionIds(lines), title: null, tags: [] };
  const children = blocks(c, 0, lines.length, true);
  const tree: Root = { type: "root", children, position: { start: { line: 1, column: 1 }, end: { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 } } };
  const data: Record<string, unknown> = {};
  if (c.title) data.title = c.title;
  if (c.tags.length) data.tags = [...new Set(c.tags)];
  return { tree, frontmatter: Object.keys(data).length ? { raw: "", format: "yaml", data, error: null } : null, source };
}

/** Section titles without a parse (source mode), outside delimited blocks. */
function scanAsciidocHeadings(source: string): Omit<LayoutHeading, "line">[] {
  const out: Omit<LayoutHeading, "line">[] = [];
  let block: string | null = null;
  source.split("\n").forEach((raw, i) => {
    const l = raw.replace(/\r$/, "");
    const d = DELIMITER.exec(l)?.[1];
    if (d && d !== "--") {
      block = block === d ? null : (block ?? d);
      return;
    }
    if (block) return;
    const s = SECTION.exec(l);
    if (!s) return;
    const text = s[2]!.replace(/\s+=+\s*$/, "").replace(/[*_`#]/g, "").trim();
    out.push({ level: Math.min(6, s[1]!.length), text, slug: slugify(text), src: i + 1 });
  });
  return out;
}

/** The link around a column of a line: `url[text]`, `link:`/`xref:` macros, `<<xref>>`, a bare URL. */
function asciidocLinkAt(text: string, col: number): SourceLink | null {
  // The macros with their spans; the one holding the column, read as the render reads it.
  const re = /(?:link:)?(?:https?|mailto|ftp):[^\s[\]<>]+?\[[^\]]*\]|(?:link|xref):[^\s[\]]+\[[^\]]*\]|<<[^>]+>>|\bhttps?:\/\/[^\s[\]<>]+[^\s[\]<>.,;:!?)]/g;
  for (const m of text.matchAll(re)) {
    if (col < m.index || col >= m.index + m[0].length) continue;
    const link = inline(m[0], 0, new Map()).find((n) => n.type === "link");
    if (link?.type === "link") return { kind: "markdown", target: link.url, heading: null, text: link.children.map((ch) => ("value" in ch ? ch.value : "")).join("") };
  }
  return null;
}

export const asciidocReader: NoteReader = {
  format: "asciidoc",
  parse: (source) => parseAsciidoc(source),
  scanHeadings: scanAsciidocHeadings,
  linkAt: asciidocLinkAt,
  language: "text",
};
