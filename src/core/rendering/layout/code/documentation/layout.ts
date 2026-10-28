// Documentation prose, terms and comment links, positioned through explicit row/link arrays.
import { readDoc } from "../../../../documents/model/docformats.ts";
import type { CodeDoc } from "../../../../documents/syntax/syntax.ts";
import type { Glyphs } from "../../../theme/glyphs.ts";
import { stringWidth, truncate } from "../../../../foundation/text/width.ts";
import type { Line, Span, LayoutLink } from "../../ir.ts";
import { renderMarkdown } from "../../markdown/render.ts";
import type { CommentPath } from "../contracts.ts";
import { indentSpans } from "../cells/framing.ts";
import { unmark } from "./comments.ts";

/** Prose (a comment's, a doc's body) rendered as markdown at `column`: line k of `text` is source line `first + k`. */
export function proseRows(
  text: string[],
  first: number,
  column: number,
  width: number,
  unit: number,
  g: Glyphs,
  links: LayoutLink[],
  rowBase: number,
  map?: number[],
  guidesFrom = unit,
  shift = 0,
): Line[] {
  const at = (k: number) => (map ? (map[k] ?? map[map.length - 1] ?? 0) + first : first + k);
  const indent = Math.min(column, Math.max(0, width - 20));
  // The author's line breaks kept: each line its own row (a markdown hard break), wrapped when it's too long.
  const md = renderMarkdown(text.join("  \n"), { width: Math.max(10, width - indent), glyphs: g, showUrls: false });
  const before = links.length;
  for (const l of md.links)
    links.push({ ...l, line: l.line < 0 ? -1 : rowBase + l.line, col: l.col + indent + shift, src: at(l.src - 1) });
  return md.lines.map((l) => {
    const spans: Span[] = l.spans.map((s) => ({
      ...s,
      ...(s.src !== undefined ? { src: at(s.src - 1) } : {}),
      ...(s.link !== undefined ? { link: s.link + before } : {}),
    }));
    return { spans: [...indentSpans(indent, unit, g, guidesFrom), ...spans], src: at(Math.max(1, l.src) - 1) };
  });
}

/**
 * Documentation as prose (24.4): its markers gone (a docstring's quotes, dedented), read into prose and a list of
 * terms whatever its format (`docformats.ts`), the prose rendered as markdown at its column and the terms under it —
 * each name, then what it is, its type dimmed after. Placed by line: what it says is where its source line is.
 */
export function docRows(
  texts: string[],
  doc: CodeDoc,
  width: number,
  unit: number,
  g: Glyphs,
  links: LayoutLink[],
  rowBase: number,
  guidesFrom = Number.POSITIVE_INFINITY,
  shift = 0,
  drawAt = doc.column,
): Line[] {
  const raw = texts.slice(doc.start - 1, doc.end);
  let text: string[];
  if (doc.style === "docstring") {
    text = raw.map((l, k) => {
      let t = k === 0 ? l.trimStart().replace(/^[rRuUbBfF]{0,2}("""|'''|"|')/, "") : l;
      if (k === raw.length - 1) t = t.replace(/("""|'''|"|')\s*$/, "");
      return t;
    });
    // PEP 257: the lines after the first lose their common indentation.
    const rest = text.slice(1).filter((t) => t.trim());
    const common = rest.length ? Math.min(...rest.map((t) => t.length - t.trimStart().length)) : 0;
    text = text.map((t, k) => (k === 0 ? t.trim() : t.slice(common)));
  } else if (doc.style === "lines") text = raw.map((l) => unmark(l.slice(doc.column)).trimEnd());
  else {
    text = raw.map((l, k) => {
      let t = k === 0 ? l.slice(doc.column).replace(/^\/\*+\s?/, "") : l.replace(/^\s*\*(?!\/)\s?/, "");
      if (k === raw.length - 1) t = t.replace(/\s*\*+\/\s*$/, "");
      return t;
    });
  }
  const read = readDoc(text, doc.style);
  const out: Line[] = [];
  if (read.body.some((b) => b.text.trim())) {
    out.push(
      ...proseRows(
        read.body.map((b) => b.text),
        doc.start,
        drawAt,
        width,
        unit,
        g,
        links,
        rowBase,
        read.body.map((b) => b.line),
        guidesFrom,
        shift,
      ),
    );
  }
  if (!read.tags.length) return out.length ? out : [{ spans: [], src: doc.start }];
  if (out.length) out.push({ spans: [], src: doc.start + read.tags[0]!.line, decor: true });
  const indent = Math.min(drawAt, Math.max(0, width - 20));
  const room = Math.max(10, width - indent);
  const termW = Math.min(16, Math.max(...read.tags.map((t) => stringWidth(t.term)))) + 3;
  for (const t of read.tags) {
    const src = doc.start + t.line;
    const descRoom = Math.max(10, room - 2 - termW);
    const words = t.desc.trim() ? wrapWords(t.desc.trim(), descRoom) : [""];
    words.forEach((w, k) => {
      const spans: Span[] = [...indentSpans(indent, unit, g, guidesFrom), { text: "  ", role: "text", attrs: 0 }];
      if (k === 0) spans.push({ text: truncate(t.term, termW - 1).padEnd(termW), role: "fm_key", attrs: 0, src });
      else spans.push({ text: " ".repeat(termW), role: "text", attrs: 0 });
      // Its code spans as the prose's: the backticks gone, the code coloured.
      if (w)
        w.split(/(`[^`]+`)/).forEach(
          (part, j) =>
            part &&
            spans.push(
              j % 2
                ? { text: part.slice(1, -1), role: "code_inline", attrs: 0, src }
                : { text: part, role: "text", attrs: 0, src },
            ),
        );
      if (k === 0 && t.type) spans.push({ text: `${w ? "  " : ""}${t.type}`, role: "dim", attrs: 0, src });
      out.push({ spans, src });
    });
  }
  return out;
}

/** A character a path is made of: one before or after a path's text means it's part of a longer word. */
const PATH_CHAR = /[\w./@~-]/;

/**
 * The comments' paths (16.10) in their prose — a doc's, a comment's box, a comment among code — as links: the text that
 * reads as one where its line says so, split out of its span (a row of code, mapped to the file, is source mode's to
 * draw). Then the links in the order they're drawn, as the keys that go from one to the next expect them.
 */
export function linkPaths(lines: Line[], links: LayoutLink[], paths: readonly CommentPath[]): void {
  const byLine = new Map<number, CommentPath[]>();
  for (const p of paths) byLine.set(p.line, [...(byLine.get(p.line) ?? []), p]);
  const before = links.length;
  lines.forEach((line, row) => {
    if (line.srcMap || line.decor) return;
    const spans: Span[] = [];
    let col = 0;
    let changed = false;
    for (const s of line.spans) {
      const here = s.link === undefined && s.button === undefined ? byLine.get(s.src ?? line.src) : undefined;
      // Where each path is in the span's text, whole (not part of a longer one), the first of any that overlap.
      const hits: { at: number; p: CommentPath }[] = [];
      for (const p of here ?? []) {
        for (let at = s.text.indexOf(p.text); at >= 0; at = s.text.indexOf(p.text, at + 1)) {
          if (!PATH_CHAR.test(s.text[at - 1] ?? "") && !/[\w/]/.test(s.text[at + p.text.length] ?? ""))
            hits.push({ at, p });
        }
      }
      hits.sort((a, b) => a.at - b.at);
      let from = 0;
      let x = col;
      for (const { at, p } of hits) {
        if (at < from) continue;
        if (at > from) spans.push({ ...s, text: s.text.slice(from, at) });
        x += stringWidth(s.text.slice(from, at));
        const id =
          links.push({
            kind: "markdown",
            target: p.target,
            heading: null,
            text: p.text,
            status: "resolved",
            line: row,
            col: x,
            src: p.line,
          }) - 1;
        spans.push({ ...s, text: p.text, role: "link", link: id });
        x += stringWidth(p.text);
        from = at + p.text.length;
        changed = true;
      }
      if (!from) spans.push(s);
      else if (from < s.text.length) spans.push({ ...s, text: s.text.slice(from) });
      col += stringWidth(s.text);
    }
    if (changed) lines[row] = { ...line, spans };
  });
  if (links.length === before) return;
  // In the order drawn: by row, then column; links not drawn (a row cut) last.
  const rowOf = (l: LayoutLink) => (l.line < 0 ? Number.MAX_SAFE_INTEGER : l.line);
  const order = links
    .map((_, i) => i)
    .sort((a, b) => rowOf(links[a]!) - rowOf(links[b]!) || links[a]!.col - links[b]!.col || a - b);
  const to = new Map(order.map((old, i) => [old, i]));
  const sorted = order.map((i) => links[i]!);
  sorted.forEach((l, i) => (links[i] = l));
  for (const [row, line] of lines.entries()) {
    if (!line.spans.some((s) => s.link !== undefined)) continue;
    lines[row] = {
      ...line,
      spans: line.spans.map((s) => (s.link === undefined ? s : { ...s, link: to.get(s.link)! })),
    };
  }
}

/** Words in rows no wider than `width` (a word longer than that is cut). */
function wrapWords(text: string, width: number): string[] {
  const rows: string[] = [];
  let row = "";
  for (const word of text.split(/\s+/)) {
    if (!row) row = word;
    else if (stringWidth(row) + 1 + stringWidth(word) <= width) row += ` ${word}`;
    else {
      rows.push(row);
      row = word;
    }
  }
  if (row) rows.push(row);
  return rows.map((r) => truncate(r, width));
}
