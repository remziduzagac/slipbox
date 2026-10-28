// A parse owns its embedded trees and frees each child before its own tree.
import type { Node, Query, Tree } from "web-tree-sitter";
import type { Loaded, Part, Pos, Entry, OutlineEntry, SyntaxError, Span, Comment, CodeModel } from "../contracts.ts";
import { grammarNow } from "../grammar/loader.ts";
import { MARKUP, HIGHLIGHT } from "../grammar/descriptors.ts";
import { partsOf, markupOutline } from "./markup.ts";
import { label, kindOf } from "./outline.ts";
import { before, endOf } from "./positions.ts";
import { DOCUMENT_GRAMMARS, buildCodeModel } from "../model/code-model.ts";

/** A parse of one text: asked for what the layout, the outline and the links need. */
export class SyntaxTree {
  /** The parts in other languages, each parsed with its own grammar, and where it starts here. */
  private readonly embedded: { part: Part; tree: SyntaxTree | null; at: Pos }[];

  constructor(
    private readonly g: Loaded,
    readonly tree: Tree,
    private readonly source: string,
  ) {
    this.embedded = partsOf(g.grammar, tree.rootNode).map((part) => {
      const sub = part.grammar ? grammarNow(part.grammar) : null;
      return { part, tree: sub ? parseSyntax(sub, part.text.text) : null, at: part.text.startPosition };
    });
  }

  /** The trees this parse holds, freed: its own and its parts'. */
  delete(): void {
    for (const e of this.embedded) e.tree?.delete();
    this.tree.delete();
  }

  /** A position in a part, placed in this file: its first row starts at the part's column. */
  private place(at: Pos, p: Pos): Pos {
    return { row: at.row + p.row, column: p.row === 0 ? at.column + p.column : p.column };
  }

  /** This text's own definitions, a page's headings and ids, its parts, and their definitions: unnested. */
  private entries(): Entry[] {
    const out: Entry[] = [];
    for (const m of this.g.defs?.matches(this.tree.rootNode) ?? []) {
      const def = m.captures.find((c) => c.name === "def")?.node;
      if (!def) continue;
      const name = m.captures.find((c) => c.name === "name")?.node;
      out.push({
        name: label(def, name).replace(/\s+/g, " "),
        kind: kindOf(def),
        start: def.startPosition,
        end: def.endPosition,
      });
    }
    if (MARKUP.has(this.g.grammar)) out.push(...markupOutline(this.tree.rootNode));
    for (const e of this.embedded) {
      const s = e.part.section;
      if (s) out.push({ name: s.name, kind: "section", start: s.node.startPosition, end: s.node.endPosition });
      for (const x of e.tree?.entries() ?? [])
        out.push({ ...x, start: this.place(e.at, x.start), end: this.place(e.at, x.end) });
    }
    // A Vue component's template: its own entry, its headings and ids under it.
    for (const t of this.tree.rootNode.descendantsOfType("template_element"))
      if (t) out.push({ name: "template", kind: "section", start: t.startPosition, end: t.endPosition });
    return out;
  }

  /** Functions, classes, methods… (a page's headings and ids, a component's parts) in source order,
   *  each nested under the ones it's inside. */
  outline(): OutlineEntry[] {
    const all = this.entries().sort((a, b) =>
      before(a.start, b.start) ? -1 : before(b.start, a.start) ? 1 : before(a.end, b.end) ? 1 : -1,
    );
    const out: OutlineEntry[] = [];
    const open: Pos[] = []; // the ends of the entries the next may be inside
    for (const e of all) {
      while (open.length && !before(e.start, open[open.length - 1]!)) open.pop();
      out.push({ name: e.name, kind: e.kind, line: e.start.row + 1, depth: open.length });
      open.push(e.end);
    }
    return out;
  }

  /** Where the text doesn't parse: ERROR nodes and nodes the parser had to invent (missing); its parts' too. */
  errors(limit = 100): SyntaxError[] {
    const out: SyntaxError[] = [];
    const lines = this.source.split("\n");
    const visit = (n: Node | null) => {
      if (!n || out.length >= limit || !n.hasError) return;
      if (n.isMissing || n.type === "ERROR") {
        const line = n.startPosition.row + 1;
        const text = lines[n.startPosition.row] ?? "";
        const to =
          n.endPosition.row === n.startPosition.row
            ? Math.max(n.endPosition.column, n.startPosition.column + 1)
            : text.length;
        out.push({
          line,
          from: n.startPosition.column,
          to: Math.min(Math.max(to, n.startPosition.column + 1), Math.max(text.length, n.startPosition.column + 1)),
          message: n.isMissing ? `missing ${n.type}` : "syntax error",
        });
        if (n.type === "ERROR") return; // the first place is enough; its insides are noise
      }
      for (let i = 0; i < n.childCount; i++) visit(n.child(i));
    };
    if (this.tree.rootNode.hasError) visit(this.tree.rootNode);
    for (const e of this.embedded) {
      for (const x of e.tree?.errors(limit) ?? []) {
        const p = this.place(e.at, { row: x.line - 1, column: x.from });
        out.push({ ...x, line: p.row + 1, from: p.column, to: p.column + (x.to - x.from) });
      }
    }
    return out.slice(0, limit);
  }

  /** The parts of lines inside strings and comments that span lines (single-line ones are
   *  highlight.js's to colour, a line at a time); its parts' too. */
  spans(): Span[] {
    const out: Span[] = [];
    const lines = this.source.split("\n");
    const add = (query: Query, kind: Span["kind"]) => {
      for (const c of query.captures(this.tree.rootNode)) {
        const s = c.node.startPosition;
        const e = endOf(c.node, lines);
        if (e.row === s.row) continue;
        for (let r = s.row; r <= e.row; r++)
          out.push({
            line: r + 1,
            from: r === s.row ? s.column : 0,
            to: r === e.row ? e.column : Number.POSITIVE_INFINITY,
            kind,
          });
      }
    };
    add(this.g.strings, "string");
    add(this.g.comments, "comment");
    for (const e of this.embedded) {
      for (const x of e.tree?.spans() ?? []) {
        const row0 = x.line - 1 === 0;
        out.push({
          ...x,
          line: x.line + e.at.row,
          from: row0 ? x.from + e.at.column : x.from,
          to: row0 && x.to !== Number.POSITIVE_INFINITY ? x.to + e.at.column : x.to,
        });
      }
    }
    return out;
  }

  /** Every comment, for the links in it (16.10); its parts' too. */
  comments(): Comment[] {
    const own = this.g.comments
      .captures(this.tree.rootNode)
      .map((c) => ({ line: c.node.startPosition.row + 1, column: c.node.startPosition.column, text: c.node.text }));
    const parts = this.embedded.flatMap((e) =>
      (e.tree?.comments() ?? []).map((x) => ({
        ...x,
        line: x.line + e.at.row,
        column: x.line === 1 ? x.column + e.at.column : x.column,
      })),
    );
    return [...own, ...parts].sort((a, b) => a.line - b.line || a.column - b.column);
  }

  /**
   * What the code view draws beyond the tokens (24.x), for a grammar it maps (DOCUMENT_GRAMMARS; else null): the
   * definitions — functions, classes, types, and a file's top-level values — each nested under those it's inside;
   * the doc comments; the runs of imports.
   */
  codeModel(): CodeModel | null {
    if (!DOCUMENT_GRAMMARS.has(this.g.grammar)) return null;
    return buildCodeModel(this.g, this.tree, this.source);
  }

  /**
   * The lines in another language than the file's (16.22), by highlight.js's name: a part's lines
   * between the one its tag opens on and the one its closing tag is on — those hold the tags too.
   */
  languages(): Map<number, string> {
    const out = new Map<number, string>();
    const lines = this.source.split("\n");
    for (const e of this.embedded) {
      const hl = e.part.highlight ?? (e.part.grammar ? (HIGHLIGHT[e.part.grammar] ?? e.part.grammar) : null);
      if (!hl) continue;
      const s = e.part.text.startPosition;
      const end = e.part.text.endPosition;
      // Its last line is its own when it holds some of its text (Astro's frontmatter ends so).
      const last = (lines[end.row] ?? "").slice(0, end.column).trim() ? end.row : end.row - 1;
      for (let r = s.column === 0 ? s.row : s.row + 1; r <= last; r++) out.set(r + 1, hl);
    }
    return out;
  }
}

/** Parse `source` with a loaded grammar. */
export function parseSyntax(g: Loaded, source: string): SyntaxTree | null {
  const tree = g.parser.parse(source);
  return tree ? new SyntaxTree(g, tree, source) : null;
}
