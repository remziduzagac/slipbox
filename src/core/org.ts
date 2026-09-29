// Org as a note format (plan 16.16): uniorg's parse, turned into the mdast tree every note is
// (`readers.ts`), so Org notes render, index, link and edit like markdown ones.
//
// What maps to what: headlines are headings (their TODO keyword, priority and tags kept on the
// node for the renderer, out of the heading's text and slug); sections are flattened, so the
// lens finds each block at the top level; `#+KEY: value` lines are key–value rows, as a data
// file's; a checkbox item is a task; `[[file:x.org::*Heading][text]]` is a link to that heading,
// `[[Heading]]` one within the note, and URLs are URLs.

import type { BlockContent, Heading, List, ListItem, PhrasingContent, Root, RootContent, Table, TableCell, TableRow } from "mdast";
import { parse } from "uniorg-parse/lib/parser.js";
import type { DataComment, DataField } from "./data.ts";
import type { LayoutHeading } from "./layout/ir.ts";
import { ORIGIN, type ParseCache, type ParsedNote, slugify } from "./parse.ts";
import type { NoteReader, SourceLink } from "./readers.ts";

/** What a headline carries besides its text, drawn around it. */
export interface OrgHeadline {
  todo: string | null;
  /** Whether the keyword is a done one (DONE, CANCELLED…: after the `|` in Org's default set). */
  done: boolean;
  priority: string | null;
  tags: string[];
}

const DONE = new Set(["DONE", "CANCELLED", "CANCELED", "CANCEL"]);

// biome-ignore lint: uniorg's nodes, read loosely
type O = any;

type Pos = { start: { line: number; column: number; offset?: number }; end: { line: number; column: number; offset?: number } };

/** An Org link's target as a link URL: `file:x.org::*H` → `x.org#H`, `*H`/`H` → `#H`, a URL as it
 *  is; null for what has no place to go here (`id:`, `elisp:`…). */
export function orgLinkUrl(raw: string): string | null {
  const file = /^file:([^:]*)(?:::\*?(.*))?$/.exec(raw);
  if (file) return `${file[1]}${file[2] ? `#${file[2]}` : ""}`;
  if (/^(?:https?|mailto|ftp):/i.test(raw)) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  // A path written bare (`./x.org`, `x.png`) is a file link too.
  if (/^(?:\.{0,2}\/)|\.[A-Za-z0-9]{1,10}(?:::|$)/.test(raw)) {
    const m = /^([^:]*)(?:::\*?(.*))?$/.exec(raw)!;
    return `${m[1]}${m[2] ? `#${m[2]}` : ""}`;
  }
  return `#${raw.replace(/^\*/, "")}`; // a heading of this note (Org's fuzzy link)
}

function inline(nodes: O[] | undefined, source: string): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  for (const n of nodes ?? []) {
    const position = n.position as Pos | undefined;
    const kids = () => inline(n.children, source);
    switch (n.type) {
      case "text":
        out.push({ type: "text", value: n.value, position });
        break;
      case "bold":
        out.push({ type: "strong", children: kids(), position });
        break;
      case "italic":
      case "underline":
        out.push({ type: "emphasis", children: kids(), position });
        break;
      case "strike-through":
        out.push({ type: "delete", children: kids(), position });
        break;
      case "code":
      case "verbatim":
      case "latex-fragment":
        out.push({ type: "inlineCode", value: n.value, position });
        break;
      case "link": {
        const url = orgLinkUrl(n.rawLink ?? "");
        const children = n.children?.length ? kids() : [{ type: "text" as const, value: n.rawLink ?? "" }];
        if (url === null) out.push(...children);
        else out.push({ type: "link", url, children, position });
        break;
      }
      case "footnote-reference":
        out.push({ type: "footnoteReference", identifier: n.label ?? "", label: n.label ?? "", position });
        break;
      case "line-break":
        out.push({ type: "break", position });
        break;
      case "entity":
        out.push({ type: "text", value: n.utf8 ?? n.name ?? "", position });
        break;
      case "timestamp":
        out.push({ type: "text", value: n.rawValue ?? "", position });
        break;
      default:
        if (n.children) out.push(...kids());
        else if (typeof n.value === "string") out.push({ type: "text", value: n.value, position });
        else if (position?.start.offset !== undefined && position.end.offset !== undefined) out.push({ type: "text", value: source.slice(position.start.offset, position.end.offset), position });
    }
  }
  return out;
}

/** Keyword lines (`#+TITLE: …`) in a run: rows sharing one key column. */
function keywordRows(run: O[]): DataField[] {
  const width = Math.max(...run.map((k) => k.key.length));
  return run.map((k) => {
    const position = k.position as Pos;
    return { type: "dataField", key: k.key.toLowerCase(), value: k.value, kind: "string", comment: null, keyWidth: width, keyLine: position.start.line, position };
  });
}

function blocks(nodes: O[] | undefined, source: string, out: RootContent[], meta: { title: string | null; tags: string[] }): void {
  const list = nodes ?? [];
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    const position = n.position as Pos | undefined;
    switch (n.type) {
      case "section":
        blocks(n.children, source, out, meta);
        break;
      case "headline": {
        const org: OrgHeadline = { todo: n.todoKeyword ?? null, done: DONE.has(n.todoKeyword ?? ""), priority: n.priority ?? null, tags: n.tags ?? [] };
        meta.tags.push(...org.tags);
        out.push({ type: "heading", depth: Math.min(6, n.level) as Heading["depth"], children: inline(n.children, source), position, data: { org } } as Heading);
        break;
      }
      case "keyword": {
        // A run of keyword lines at once; the title and file tags are the note's.
        const run: O[] = [];
        while (list[i]?.type === "keyword") run.push(list[i++]);
        i--;
        for (const k of run) {
          const key = String(k.key).toUpperCase();
          if (key === "TITLE" && !meta.title) meta.title = k.value;
          if (key === "FILETAGS") meta.tags.push(...String(k.value).split(/[:\s]+/).filter(Boolean));
        }
        out.push(...(keywordRows(run) as unknown as RootContent[]));
        break;
      }
      case "paragraph":
        out.push({ type: "paragraph", children: inline(n.children, source), position });
        break;
      case "plain-list":
        out.push(plainList(n, source, meta));
        break;
      case "src-block":
        out.push({ type: "code", lang: n.language || null, value: String(n.value ?? "").replace(/\n$/, ""), position });
        break;
      case "example-block":
      case "fixed-width":
      case "export-block":
      case "latex-environment":
      case "comment-block":
        out.push({ type: "code", lang: n.type === "export-block" ? (n.backend ?? null) : null, value: String(n.value ?? "").replace(/\n$/, ""), position });
        break;
      case "quote-block":
      case "verse-block": {
        const inner: RootContent[] = [];
        blocks(n.children, source, inner, meta);
        out.push({ type: "blockquote", children: inner as BlockContent[], position });
        break;
      }
      case "center-block":
      case "special-block":
        blocks(n.children, source, out, meta);
        break;
      case "table":
        out.push(table(n, source));
        break;
      case "horizontal-rule":
        out.push({ type: "thematicBreak", position });
        break;
      case "footnote-definition": {
        const inner: RootContent[] = [];
        blocks(n.children, source, inner, meta);
        out.push({ type: "footnoteDefinition", identifier: n.label ?? "", label: n.label ?? "", children: inner as BlockContent[], position });
        break;
      }
      case "property-drawer": {
        // Properties read as the keywords do: key–value rows.
        const props = (n.children ?? []).filter((p: O) => p.type === "node-property");
        const width = Math.max(1, ...props.map((p: O) => String(p.key).length));
        for (const p of props) {
          const pp = p.position as Pos;
          out.push({ type: "dataField", key: String(p.key).toLowerCase(), value: String(p.value ?? ""), kind: "string", comment: null, keyWidth: width, keyLine: pp.start.line, position: pp } as unknown as RootContent);
        }
        break;
      }
      case "comment":
      case "drawer":
      case "planning":
      case "clock":
      case "diary-sexp": {
        // Kept in sight, dimmed, as a data file's comments are.
        if (position?.start.offset === undefined || position.end.offset === undefined) break;
        const text = source.slice(position.start.offset, position.end.offset).replace(/\n+$/, "");
        const c: DataComment = { type: "dataComment", text, position };
        out.push(c as unknown as RootContent);
        break;
      }
      default: {
        if (position?.start.offset === undefined || position.end.offset === undefined) break;
        const value = source.slice(position.start.offset, position.end.offset).replace(/\n+$/, "");
        if (value.trim()) out.push({ type: "paragraph", children: [{ type: "text", value }], position });
      }
    }
  }
}

function plainList(n: O, source: string, meta: { title: string | null; tags: string[] }): List {
  const items: ListItem[] = (n.children ?? [])
    .filter((c: O) => c.type === "list-item")
    .map((it: O) => {
      const inner: RootContent[] = [];
      blocks(it.children, source, inner, meta);
      // A description item (`- term :: text`): the term in bold before the text.
      if (it.tag?.length) {
        const term: PhrasingContent[] = [{ type: "strong", children: inline(it.tag, source) }, { type: "text", value: " — " }];
        const first = inner[0];
        if (first?.type === "paragraph") first.children.unshift(...term);
        else inner.unshift({ type: "paragraph", children: term });
      }
      const checked = it.checkbox === "on" ? true : it.checkbox === "off" || it.checkbox === "trans" ? false : null;
      return { type: "listItem", spread: false, checked, children: inner as BlockContent[], position: it.position };
    });
  const ordered = n.listType === "ordered";
  const start = ordered ? Number.parseInt(String(n.children?.[0]?.bullet ?? "1"), 10) || 1 : null;
  return { type: "list", ordered, start, spread: false, children: items, position: n.position };
}

function table(n: O, source: string): Table {
  const rows: TableRow[] = (n.children ?? [])
    .filter((r: O) => r.type === "table-row" && r.rowType === "standard")
    .map((r: O) => ({ type: "tableRow", children: (r.children ?? []).map((c: O): TableCell => ({ type: "tableCell", children: inline(c.children, source), position: c.position })), position: r.position }));
  const cols = Math.max(0, ...rows.map((r) => r.children.length));
  for (const r of rows) while (r.children.length < cols) r.children.push({ type: "tableCell", children: [] });
  return { type: "table", align: Array(cols).fill(null), children: rows, position: n.position };
}

/** A chunk ends before a headline only after at least this many lines: fewer, larger parses. */
const CHUNK_LINES = 40;

/**
 * Where an Org note can be parsed in pieces: before a headline (outside a `#+begin_…` block), as
 * Org's structure is its headlines'. Each piece parses alone as it would in the whole note.
 */
function chunkStarts(lines: string[]): number[] {
  const starts = [0];
  let block = false;
  lines.forEach((l, i) => {
    if (/^\s*#\+begin_/i.test(l)) block = true;
    else if (/^\s*#\+end_/i.test(l)) block = false;
    else if (!block && i - starts[starts.length - 1]! >= CHUNK_LINES && /^\*+\s/.test(l)) starts.push(i);
  });
  return starts;
}

/** Nodes moved `delta` lines down (a chunk reused where it now is); the render's `ORIGIN` kept. */
function shifted(nodes: RootContent[], delta: number): RootContent[] {
  const copy = (n: O): O => {
    const out: O = { ...n };
    if (n.position) out.position = { start: { line: n.position.start.line + delta, column: n.position.start.column }, end: { line: n.position.end.line + delta, column: n.position.end.column } };
    if (typeof n.keyLine === "number") out.keyLine = n.keyLine + delta;
    if (n.children) out.children = n.children.map(copy);
    return out;
  };
  return nodes.map(copy);
}

/** Positions carry lines and columns only: an offset would go stale when chunks are reused. */
function dropOffsets(nodes: O[]): void {
  for (const n of nodes) {
    if (n.position) {
      delete n.position.start.offset;
      delete n.position.end.offset;
    }
    if (n.children) dropOffsets(n.children);
  }
}

/**
 * An Org note's text as the shared tree, parsed by chunk (15.1, as markdown is): with a `cache`
 * (a buffer's, between edits) only the chunks an edit touched are parsed again.
 */
export function parseOrg(source: string, cache?: ParseCache): ParsedNote {
  const lines = source.split("\n");
  const starts = chunkStarts(lines);
  const used: ParseCache["chunks"] = new Map();
  const children: RootContent[] = [];
  starts.forEach((from, k) => {
    const to = starts[k + 1] ?? lines.length;
    const text = lines.slice(from, to).join("\n");
    let entry = used.get(text) ?? cache?.chunks.get(text);
    if (entry && entry.shift !== from) entry = { children: shifted(entry.children, from - entry.shift), shift: from };
    if (!entry) {
      const org = parse(text, { trackPosition: true } as never) as O;
      const kids: RootContent[] = [];
      blocks(org.children, text, kids, { title: null, tags: [] });
      dropOffsets(kids);
      for (const n of kids) (n as unknown as Record<symbol, object>)[ORIGIN] = {};
      entry = { children: from ? shifted(kids, from) : kids, shift: from };
    }
    used.set(text, entry);
    children.push(...entry.children);
  });
  if (cache) cache.chunks = used;
  // The note's title and tags: its `#+TITLE`, its `#+FILETAGS` and its headlines' tags.
  const meta = { title: null as string | null, tags: [] as string[] };
  for (const n of children as O[]) {
    if (n.type === "heading" && n.data?.org) meta.tags.push(...n.data.org.tags);
    if (n.type === "dataField" && n.key === "title" && !meta.title) meta.title = n.value;
    if (n.type === "dataField" && n.key === "filetags") meta.tags.push(...String(n.value).split(/[:\s]+/).filter(Boolean));
  }
  const tree: Root = { type: "root", children, position: { start: { line: 1, column: 1 }, end: { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 } } };
  const data: Record<string, unknown> = {};
  if (meta.title) data.title = meta.title;
  if (meta.tags.length) data.tags = [...new Set(meta.tags)];
  return { tree, frontmatter: Object.keys(data).length ? { raw: "", format: "yaml", data, error: null } : null, source };
}

const HEADLINE = /^(\*+)\s+(?:(?:TODO|DONE|[A-Z]{2,})\s+)?(?:\[#[A-Z0-9]\]\s+)?(.*?)(?:\s+:[\w@#%:]+:)?\s*$/;

/** Org's headlines without a parse (source mode): `* TODO [#A] Text :tags:` → level 1, "Text". */
function scanOrgHeadings(source: string): Omit<LayoutHeading, "line">[] {
  const out: Omit<LayoutHeading, "line">[] = [];
  let block = false;
  source.split("\n").forEach((raw, i) => {
    if (/^\s*#\+begin_/i.test(raw)) block = true;
    else if (/^\s*#\+end_/i.test(raw)) block = false;
    else if (!block && raw.startsWith("*")) {
      const m = HEADLINE.exec(raw.replace(/\r$/, ""));
      if (m) {
        const text = m[2]!.replace(/\[\[(?:[^\]]*)\]\[([^\]]*)\]\]/g, "$1").replace(/\[\[([^\]]*)\]\]/g, "$1").replace(/[*/=~+_]/g, "").trim();
        out.push({ level: Math.min(6, m[1]!.length), text, slug: slugify(text), src: i + 1 });
      }
    }
  });
  return out;
}

/** The Org link around a column of a line: `[[target][text]]` or `[[target]]`, or a bare URL. */
function orgLinkAt(text: string, col: number): SourceLink | null {
  for (const m of text.matchAll(/\[\[([^\]\n]+)\](?:\[([^\]\n]*)\])?\]/g)) {
    if (col < m.index || col >= m.index + m[0].length) continue;
    const url = orgLinkUrl(m[1]!);
    return url === null ? null : { kind: "markdown", target: url, heading: null, text: m[2] ?? m[1]! };
  }
  for (const m of text.matchAll(/\bhttps?:\/\/[^\s\]]+/g)) {
    if (col >= m.index && col < m.index + m[0].length) return { kind: "markdown", target: m[0], heading: null, text: m[0] };
  }
  return null;
}

export const orgReader: NoteReader = {
  format: "org",
  parse: (source, cache) => parseOrg(source, cache),
  scanHeadings: scanOrgHeadings,
  linkAt: orgLinkAt,
  language: "text",
};
