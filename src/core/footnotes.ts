// A note's footnotes (3.17): each one's label, its definition's text and line, and every reference
// to it — for the footnotes view in the right panel and `slipbox footnotes`. Numbered as GFM numbers
// them: in the order they're first referred to, the ones nothing refers to after.

import type { FootnoteDefinition, FootnoteReference, Nodes } from "mdast";
import { type ParsedNote, visit } from "./parse.ts";

export interface Footnote {
  /** As written (`[^Label]`); `id` is its identifier, lower-cased: how references find it. */
  label: string;
  id: string;
  /** The definition's text on one line, or null when there's no definition. */
  text: string | null;
  /** The definition's source line (1-based), or null when there's none. */
  line: number | null;
  /** Each reference, in order: its source line and column (1-based), and where `[^label]` is (offsets). */
  references: { line: number; column: number; start: number; end: number }[];
  /** The definition's text span, from its `[^label]:` to its last line's end (offsets), or null. */
  def: { start: number; end: number } | null;
}

/** One change to a note's text: `length` characters at `at` replaced with `text`. */
export interface TextEdit {
  at: number;
  length: number;
  text: string;
}

/** A definition's text as one line: its words, a wikilink's shown text, a tag with its `#`. */
function plain(node: Nodes): string {
  const parts: string[] = [];
  visit(node, (n) => {
    if ((n.type as string) === "wikiLink") {
      const w = n as unknown as { alias: string | null; value: string };
      parts.push(w.alias ?? w.value);
      return false;
    }
    if ((n.type as string) === "hashtag") {
      parts.push(`#${(n as unknown as { value: string }).value}`);
      return false;
    }
    if (n.type === "text" || n.type === "inlineCode") parts.push(n.value);
    else if (n.type === "break" || n.type === "paragraph") parts.push(" ");
  });
  return parts.join("").replace(/\s+/g, " ").trim();
}

export function footnotesOf(parsed: ParsedNote): Footnote[] {
  const byId = new Map<string, Footnote>();
  const get = (identifier: string, label: string | null | undefined) => {
    const id = identifier.toLowerCase();
    let f = byId.get(id);
    if (!f) {
      f = { label: label ?? identifier, id, text: null, line: null, references: [], def: null };
      byId.set(id, f);
    }
    return f;
  };
  // Offsets from lines and columns (a note parsed by chunks keeps its lines, not its offsets).
  const starts = [0];
  for (let i = parsed.source.indexOf("\n"); i >= 0; i = parsed.source.indexOf("\n", i + 1)) starts.push(i + 1);
  const offset = (p: { line: number; column: number } | undefined) => (p ? (starts[p.line - 1] ?? 0) + p.column - 1 : 0);
  visit(parsed.tree, (n) => {
    const at = n.position?.start;
    if (n.type === "footnoteReference") {
      const r = n as FootnoteReference;
      get(r.identifier, r.label).references.push({ line: at?.line ?? 1, column: at?.column ?? 1, start: offset(at), end: offset(n.position?.end) });
    } else if (n.type === "footnoteDefinition") {
      const d = n as FootnoteDefinition;
      const f = get(d.identifier, d.label);
      // The first definition of a label wins (CommonMark), as the renderer's does.
      if (f.line === null) {
        f.line = at?.line ?? 1;
        f.text = plain(d);
        f.label = d.label ?? f.label;
        f.def = { start: offset(at), end: offset(n.position?.end) };
      }
    }
  });
  const first = (f: Footnote) => f.references[0] ?? { line: Number.POSITIVE_INFINITY, column: 0 };
  return [...byId.values()].sort((a, b) => first(a).line - first(b).line || first(a).column - first(b).column || (a.line ?? 0) - (b.line ?? 0));
}

// -------------------------------------------------------------------------------------------
// Changing them (3.18): each change as the edits it makes to the note's text (with `\n` line
// endings), for the TUI's buffer and the CLI alike.

/** The text with the edits made: from the last to the first, so each offset still holds. At one
 *  offset, the edit listed later lands later in the text. */
export function applyEdits(text: string, edits: TextEdit[]): string {
  const order = edits.map((e, i) => ({ e, i })).sort((a, b) => b.e.at - a.e.at || b.i - a.i);
  let out = text;
  for (const { e } of order) out = out.slice(0, e.at) + e.text + out.slice(e.at + e.length);
  return out;
}

/** A label a footnote can have: no spaces, brackets or carets. */
export function footnoteLabelOk(label: string): boolean {
  return /^[^\s[\]^]+$/.test(label);
}

/** The next free number: one past the highest numeric label, else 1. */
export function nextFootnoteLabel(list: Footnote[]): string {
  const taken = list.map((f) => Number(f.label)).filter((n) => Number.isInteger(n) && n > 0);
  return String(taken.length ? Math.max(...taken) + 1 : 1);
}

/** A definition's text as it's written: one line, never empty. */
function oneLine(body: string): string {
  const t = body.replace(/\s+/g, " ").trim();
  if (!t) throw new Error("a footnote needs some text");
  return t;
}

/**
 * Add a footnote (3.18): `[^N]` at `refAt` (the next free number), and `[^N]: text` at the note's
 * end — right after its last definition when the note ends with them, else after a blank line.
 */
export function addFootnote(source: string, list: Footnote[], refAt: number, body: string): { label: string; edits: TextEdit[] } {
  const label = nextFootnoteLabel(list);
  const text = oneLine(body);
  const end = source.replace(/\s+$/, "").length;
  const lastDef = Math.max(-1, ...list.map((f) => f.def?.end ?? -1));
  const afterDefs = lastDef >= 0 && source.slice(lastDef, end).trim() === "";
  const before = end === 0 ? "" : afterDefs ? "\n" : "\n\n";
  const after = end === source.length ? "\n" : "";
  return { label, edits: [{ at: Math.min(refAt, end), length: 0, text: `[^${label}]` }, { at: end, length: 0, text: `${before}[^${label}]: ${text}${after}` }] };
}

/** A footnote's text replaced (3.18): its definition becomes `[^label]: text`, on one line. */
export function editFootnote(source: string, fn: Footnote, body: string): TextEdit[] {
  if (!fn.def) throw new Error(`footnote [^${fn.label}] has no definition to edit`);
  const lead = /^[ \t]*\[\^[^\]]+\]:[ \t]*/.exec(source.slice(fn.def.start))?.[0].length ?? 0;
  return [{ at: fn.def.start + lead, length: fn.def.end - fn.def.start - lead, text: oneLine(body) }];
}

/** A footnote deleted (3.18): every reference to it, and its definition's lines. */
export function deleteFootnote(source: string, fn: Footnote): TextEdit[] {
  const edits: TextEdit[] = fn.references.map((r) => ({ at: r.start, length: r.end - r.start, text: "" }));
  if (fn.def) {
    const from = source.lastIndexOf("\n", fn.def.start - 1) + 1;
    // Its line's end too (a CRLF note's two characters), so no blank line is left in its place.
    const to = source.startsWith("\r\n", fn.def.end) ? fn.def.end + 2 : source[fn.def.end] === "\n" ? fn.def.end + 1 : fn.def.end;
    edits.push({ at: from, length: to - from, text: "" });
  }
  return edits;
}

/** A footnote's label changed everywhere in the note (3.18): its references and its definition. */
export function renameFootnote(source: string, fn: Footnote, list: Footnote[], label: string): TextEdit[] {
  if (!footnoteLabelOk(label)) throw new Error(`"${label}" can't be a footnote's label: no spaces, brackets or ^`);
  if (list.some((f) => f !== fn && f.id === label.toLowerCase())) throw new Error(`[^${label}] is taken in this note`);
  const edits: TextEdit[] = fn.references.map((r) => ({ at: r.start, length: r.end - r.start, text: `[^${label}]` }));
  if (fn.def) {
    const m = /^([ \t]*)\[\^[^\]]+\]/.exec(source.slice(fn.def.start));
    if (m) edits.push({ at: fn.def.start + m[1]!.length, length: m[0].length - m[1]!.length, text: `[^${label}]` });
  }
  return edits;
}
