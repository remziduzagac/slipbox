// A note's diff before and after, laid out (GIT-D2): each changed block in a `before` frame and an `after` frame,
// lightly formatted — a heading in its colour, emphasis, links as their text, a list's marker, a table's cells, a
// quote's bar, code as written — the removed words marked in the first and the added in the second; a block added or
// removed whole in one frame, on its sign's tint; each group under its head, the unchanged stretches folded to a row.
// What the formatting hides is marked through what shows: a link whose target changed, text made bold, are marked
// whole. A block too big to diff by words has its changed lines on its sign's tint, their changed words more strongly.
// What changed that no line shows is a dim row.

import type { Parents, PhrasingContent } from "mdast";
import {
  type BlockDiff,
  type BlockItem,
  type BlockSide,
  blockText,
  headText,
  type NoteBlock,
} from "../foundation/text/blockdiff.ts";
import type { Glyphs } from "../glyphs.ts";
import { inRanges, type WordRange } from "../merge.ts";
import { sanitize } from "../foundation/text/sanitize.ts";
import type { Role } from "../theme/theme.ts";
import { graphemes, graphemeWidth, stringWidth } from "../foundation/text/width.ts";
import type { WikiLink } from "../wikilink.ts";
import { A_BOLD, A_ITALIC, A_STRIKE, type Layout, type Line, type Span } from "./ir.ts";

export interface BlockDiffLayoutOptions {
  width: number;
  glyphs: Glyphs;
  tabWidth?: number;
}

/** A cell of a block as shown: the offset in the block's text (`blockText`) of what it shows, -1 for what the layout
 *  adds; `mark`, marked whatever its offset (a node changed where nothing of it shows). */
interface Cell {
  g: string;
  w: number;
  role: Role;
  attrs: number;
  at: number;
  bg?: Role;
  mark?: boolean;
  /** The unit (1-based) of the line it's from: `enter` there goes to that line, not the row's first's. */
  src?: number;
}

/** A line of a block as shown: what goes before its first row (a list's marker, a quote's bar) and before the rows it
 *  wraps to, its cells, and how it wraps — prose at its spaces, the rest anywhere. `line`: its source line. */
interface Piece {
  lead: Cell[];
  hang: Cell[];
  cells: Cell[];
  prose: boolean;
  line: number;
}

/** How a frame is drawn: its label, its rules' colour, and what its text is marked with — `word` the marked words,
 *  `line` the marked lines (a block diffed by its lines), `all` every cell. */
interface Frame {
  label: string;
  role: Role;
  word?: Role;
  line?: Role;
  all?: Role;
}

const FRAMES = {
  before: { label: "before", role: "git_sign_delete", word: "diff_del_word", line: "diff_del" },
  after: { label: "after", role: "git_sign_add", word: "diff_add_word", line: "diff_add" },
  removed: { label: "removed", role: "git_sign_delete", all: "diff_del" },
  added: { label: "added", role: "git_sign_add", all: "diff_add" },
} satisfies Record<string, Frame>;

/**
 * The diff's items laid out at `width`: each row's `src` is the unit it shows (`BlockDiff.units`, 1-based), so `enter`
 * knows where it goes. A frame is as wide as the window, however narrow (its label cut to fit); its rules are
 * decoration, never the cursor's.
 */
export function layoutBlockDiff(d: BlockDiff, opts: BlockDiffLayoutOptions): Layout {
  const g = opts.glyphs;
  // The narrowest a frame can be: its rules, and a column of text between them.
  const width = Math.max(5, opts.width);
  const lines: Line[] = [];
  let prev: BlockItem | null = null;
  for (const item of d.items) {
    switch (item.kind) {
      case "@@":
        lines.push({
          spans: [{ text: sanitize(headText(item.heading, item.line)), role: "diff_head", attrs: 0 }],
          src: item.unit + 1,
        });
        break;
      case "fold": {
        const text = `${g.foldClosed} ${item.count} unchanged line${item.count === 1 ? "" : "s"}`;
        lines.push({ spans: [{ text, role: "dim", attrs: 0 }], src: item.unit + 1 });
        break;
      }
      case "\\":
        lines.push({ spans: [{ text: sanitize(`\\ ${item.text}`), role: "dim", attrs: 0 }], src: item.unit + 1 });
        break;
      case "same":
        // Unchanged blocks one after another: a blank row between, as the note has.
        if (prev?.kind === "same") lines.push({ spans: [], src: item.unit + 1, gap: true });
        lines.push(...plain(d.to, item.block, item.unit, width, opts));
        break;
      case "change": {
        const del = { words: item.del, lines: item.delLines };
        lines.push(...framed(d.from, item.before, item.unit, del, FRAMES.before, width, opts));
        const after = item.unit + item.before.to - item.before.from + 1;
        const add = { words: item.add, lines: item.addLines };
        lines.push(...framed(d.to, item.after, after, add, FRAMES.after, width, opts));
        break;
      }
      case "removed":
        lines.push(...framed(d.from, item.block, item.unit, NONE, FRAMES.removed, width, opts));
        break;
      case "added":
        lines.push(...framed(d.to, item.block, item.unit, NONE, FRAMES.added, width, opts));
    }
    prev = item;
  }
  if (!lines.length) lines.push({ spans: [], src: 1 });
  return { lines, links: [], headings: [], width };
}

/** What a frame marks: the words changed, and the lines (a block diffed by its lines) — offsets in its block's text. */
interface Marks {
  words: WordRange[];
  lines?: WordRange[];
}

const NONE: Marks = { words: [] };

/** An unchanged block: its rows where a frame's text is, unframed. */
function plain(side: BlockSide, b: NoteBlock, unit: number, width: number, opts: BlockDiffLayoutOptions): Line[] {
  return rowsOf(side, b, unit, width - 4, NONE, undefined, opts).map(({ cells, src }) => ({
    spans: [{ text: "  ", role: "text", attrs: 0 }, ...spansOf(cells)],
    src,
    text: [2, Number.MAX_SAFE_INTEGER] as [number, number],
  }));
}

/** A block in a frame: its label on the top rule, its rows between the side rules — a marked line's on its tint. */
function framed(
  side: BlockSide,
  b: NoteBlock,
  unit: number,
  marks: Marks,
  f: Frame,
  width: number,
  opts: BlockDiffLayoutOptions,
): Line[] {
  const box = opts.glyphs.box;
  const inner = width - 4;
  const rule = (text: string, attrs = 0): Span => ({ text, role: f.role, attrs });
  const label = ` ${f.label} `.slice(0, width - 2);
  const out: Line[] = [
    {
      spans: [rule(box.tl), rule(label, A_BOLD), rule(box.h.repeat(Math.max(0, width - 2 - label.length)) + box.tr)],
      src: unit + 1,
      decor: true,
    },
  ];
  for (const r of rowsOf(side, b, unit, inner, marks, f, opts)) {
    const w = r.cells.reduce((n, c) => n + c.w, 0);
    const pad: Span = {
      text: " ".repeat(Math.max(0, inner - w)),
      role: "text",
      attrs: 0,
      ...(r.tint ? { bg: r.tint } : {}),
    };
    out.push({
      spans: [rule(`${box.v} `), ...spansOf(r.cells), pad, rule(` ${box.v}`)],
      src: r.src,
      text: [2, 2 + inner],
    });
  }
  out.push({ spans: [rule(box.bl + box.h.repeat(width - 2) + box.br)], src: out[out.length - 1]!.src, decor: true });
  return out;
}

/**
 * A block's rows at `inner` columns, marked as its frame says, each with the unit (1-based) of its first line; a row of
 * a line as written that's a marked line has its frame's line tint (`tint`), to go to the frame's edge.
 */
function rowsOf(
  side: BlockSide,
  b: NoteBlock,
  unit: number,
  inner: number,
  marks: Marks,
  f: Frame | undefined,
  opts: BlockDiffLayoutOptions,
): { cells: Cell[]; src: number; tint?: Role }[] {
  const text = blockText(side, b);
  // Each line's first offset in the block's text, and the line an offset is on (found by halves: a fence can be
  // thousands of lines).
  const starts = [0];
  for (const l of side.lines.slice(b.from - 1, b.to - 1)) starts.push(starts[starts.length - 1]! + l.length + 1);
  const lineOf = (at: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= at) lo = mid;
      else hi = mid - 1;
    }
    return b.from + lo;
  };
  const out: { cells: Cell[]; src: number; tint?: Role }[] = [];
  const changed = marks.lines ?? [];
  for (const p of piecesOf(side, b, text, starts, marks.words, opts)) {
    for (const c of [...p.lead, ...p.cells]) {
      if (c.at < 0) continue;
      c.src = unit + lineOf(c.at) - b.from + 1;
      if (f?.all) c.bg = f.all;
      else if (f?.word && (c.mark || inRanges(marks.words, c.at))) c.bg = f.word;
      else if (f?.line && inRanges(changed, c.at)) c.bg = f.line;
    }
    // A line as written that's marked: tinted to the frame's edge, as the source diff's row is — a blank one too.
    const tint = f?.line && !p.prose && inRanges(changed, starts[p.line - b.from] ?? -1) ? f.line : undefined;
    // A lead as wide as the frame (a list nested deep, a narrow window): its indent goes, then the rest of it.
    const lead = fit(p.lead, inner);
    const hang =
      widthOf(p.hang) <= widthOf(lead)
        ? p.hang
        : p.hang.every((c) => c.at < 0 && !c.g.trim())
          ? spaces(widthOf(lead))
          : fit(p.hang, inner);
    wrap(p.cells, Math.max(1, inner - Math.max(widthOf(lead), widthOf(hang))), p.prose).forEach((cells, k) => {
      const first = cells.find((c) => c.at >= 0);
      out.push({
        cells: [...(k ? hang : lead), ...cells],
        src: unit + (first ? lineOf(first.at) : p.line) - b.from + 1,
        ...(tint ? { tint } : {}),
      });
    });
  }
  return out;
}

/** Cells in rows of at most `width` columns: prose at its last space that fits, else anywhere (a wide character
 *  never split). The space a row breaks at goes. */
function wrap(cells: Cell[], width: number, prose: boolean): Cell[][] {
  const out: Cell[][] = [];
  let start = 0;
  do {
    let w = 0;
    let i = start;
    while (i < cells.length && w + cells[i]!.w <= width) w += cells[i++]!.w;
    if (i >= cells.length) {
      out.push(cells.slice(start));
      break;
    }
    let cut = i;
    if (prose)
      for (let k = i; k > start; k--)
        if (cells[k]!.g === " ") {
          cut = k;
          break;
        }
    if (cut === start) cut = Math.max(start + 1, i);
    out.push(cells.slice(start, cut));
    start = cut;
    while (prose && cells[start]?.g === " ") start++;
  } while (start < cells.length);
  return out;
}

/** Cells as spans: a run of one role, attributes and tint, one span. */
function spansOf(cells: Cell[]): Span[] {
  const out: Span[] = [];
  for (const c of cells) {
    const last = out[out.length - 1];
    if (last && last.role === c.role && last.attrs === c.attrs && last.bg === c.bg && last.src === c.src)
      last.text += c.g;
    else
      out.push({
        text: c.g,
        role: c.role,
        attrs: c.attrs,
        ...(c.bg ? { bg: c.bg } : {}),
        ...(c.src !== undefined ? { src: c.src } : {}),
      });
  }
  return out;
}

const CONTROL = /^[\x00-\x08\x0b-\x1f\x7f-\x9f]/;

/** The block's text from offset `from` to `to` as written: tabs as spaces, a control character as `�`. */
function verbatim(text: string, from: number, to: number, role: Role, tab: number): Cell[] {
  const out: Cell[] = [];
  let col = 0;
  let at = from;
  for (const g of graphemes(text.slice(from, to))) {
    if (g === "\t") {
      const k = tab - (col % tab);
      for (let j = 0; j < k; j++) out.push({ g: " ", w: 1, role, attrs: 0, at });
      col += k;
    } else if (CONTROL.test(g)) {
      out.push({ g: "�", w: 1, role: "dim", attrs: 0, at });
      col += 1;
    } else {
      const s = sanitize(g);
      const w = graphemeWidth(s);
      if (s && w) {
        out.push({ g: s, w, role, attrs: 0, at });
        col += w;
      }
    }
    at += g.length;
  }
  return out;
}

/** A list item's first line: its indent, its marker, and a task's box. */
const MARKER = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(\[[ xX]\](?:\s+|$))?/;

const spaces = (w: number, role: Role = "text"): Cell[] => (w ? [{ g: " ".repeat(w), w, role, attrs: 0, at: -1 }] : []);
const widthOf = (cells: Cell[]) => cells.reduce((n, c) => n + c.w, 0);

/** A lead that leaves `inner` room for its text — two columns, a wide character's: as it is; else without its indent;
 *  else none. */
function fit(lead: Cell[], inner: number): Cell[] {
  if (widthOf(lead) + 2 <= inner) return lead;
  const kept = lead.filter((c) => c.at >= 0 || c.g.trim());
  return widthOf(kept) + 2 <= inner ? kept : [];
}

/** A block as pieces, a line each, laid out by its kind. */
function piecesOf(
  side: BlockSide,
  b: NoteBlock,
  text: string,
  starts: number[],
  marks: WordRange[],
  opts: BlockDiffLayoutOptions,
): Piece[] {
  const g = opts.glyphs;
  const tab = opts.tabWidth ?? 4;
  const n = b.node;
  /** The offset in the block's text of a point of the note. */
  const off = (p: { line: number; column: number } | undefined) =>
    p ? Math.min(text.length, (starts[p.line - b.from] ?? text.length) + p.column - 1) : -1;
  /** Lines `from` to `to` as written, `lead` before the first and `hang` before the others. A CRLF line's CR isn't
   *  shown, as source mode doesn't show it. */
  const asWritten = (role: Role, from = b.from, to = b.to, lead: Cell[] = [], hang = spaces(widthOf(lead))) => {
    const out: Piece[] = [];
    for (let l = from; l <= Math.min(to, b.to); l++) {
      const s = starts[l - b.from] ?? text.length;
      let e = (starts[l - b.from + 1] ?? text.length + 1) - 1;
      if (e > s && text[e - 1] === "\r") e--;
      out.push({ lead: l === from ? lead : hang, hang, cells: verbatim(text, s, e, role, tab), prose: false, line: l });
    }
    return out;
  };
  /** Inline nodes as prose: a piece a line (a hard break starts one), `lead` before the first. */
  const prose = (
    nodes: PhrasingContent[],
    role: Role,
    line: number,
    lead: Cell[] = [],
    hang = spaces(widthOf(lead)),
    attrs = 0,
  ) =>
    phrasing(nodes, text, off, marks, role, attrs, g).map(
      (cells, k): Piece => ({ lead: k ? hang : lead, hang, cells, prose: true, line }),
    );
  if (!n) return asWritten("text");
  const lineOf = (c: { position?: { start: { line: number } } }) => c.position?.start.line ?? b.from;
  const endOf = (c: { position?: { end: { line: number } } }) => c.position?.end.line ?? b.to;
  switch (n.type) {
    case "heading":
      return prose(n.children, `h${n.depth}` as Role, b.from, [], [], A_BOLD);
    case "paragraph":
      return prose(n.children, "text", b.from);
    case "listItem": {
      const m = MARKER.exec(side.lines[b.from - 1] ?? "");
      const lead: Cell[] = [];
      if (m) {
        lead.push(...spaces(Math.min(8, stringWidth(m[1]!.replace(/\t/g, " ".repeat(tab))))));
        const mark = /\d/.test(m[2]!) ? m[2]! : g.bullets[0]!;
        lead.push({ g: `${mark} `, w: stringWidth(mark) + 1, role: "list_marker", attrs: 0, at: m[1]!.length });
        if (m[4]) {
          const box = n.checked ? g.checkDone : g.checkTodo;
          const role: Role = n.checked ? "check_done" : "check_todo";
          lead.push({ g: `${box} `, w: stringWidth(box) + 1, role, attrs: 0, at: m[0].length - m[4].length });
        }
      }
      const hang = spaces(widthOf(lead));
      const out: Piece[] = [];
      for (const c of n.children) {
        if (c.type === "list") break;
        const first = out.length ? hang : lead;
        if (c.type === "paragraph") out.push(...prose(c.children, "text", lineOf(c), first, hang));
        else out.push(...asWritten("text", lineOf(c), endOf(c), first, hang));
      }
      return out.length ? out : [{ lead, hang, cells: [], prose: true, line: b.from }];
    }
    case "tableRow": {
      const cells: Cell[] = [];
      n.children.forEach((cell, k) => {
        if (k) cells.push({ g: ` ${g.box.v} `, w: 3, role: "table_border", attrs: 0, at: -1 });
        const role: Role = b.header ? "table_header" : "text";
        for (const row of phrasing(cell.children, text, off, marks, role, b.header ? A_BOLD : 0, g)) cells.push(...row);
      });
      return [{ lead: [], hang: [], cells, prose: true, line: b.from }];
    }
    case "blockquote": {
      const bar: Cell[] = [
        { g: `${g.quoteBar} `, w: stringWidth(g.quoteBar) + 1, role: "quote_bar", attrs: 0, at: -1 },
      ];
      const out: Piece[] = [];
      for (const c of n.children) {
        if (out.length) out.push({ lead: bar, hang: bar, cells: [], prose: true, line: lineOf(c) });
        if (c.type === "paragraph") out.push(...prose(c.children, "quote", lineOf(c), bar, bar));
        else out.push(...asWritten("quote", lineOf(c), endOf(c), bar, bar));
      }
      return out;
    }
    case "code": {
      // Fenced: its fences as labels, its lines as code.
      const fence = /^\s{0,3}(`{3,}|~{3,})/;
      if (!fence.test(side.lines[b.from - 1] ?? "") || b.to === b.from) return asWritten("code_block");
      const closed = /^\s{0,3}(`{3,}|~{3,})\s*$/.test(side.lines[b.to - 1] ?? "");
      return [
        ...asWritten("code_label", b.from, b.from),
        ...asWritten("code_block", b.from + 1, closed ? b.to - 1 : b.to),
        ...(closed ? asWritten("code_label", b.to, b.to) : []),
      ];
    }
    case "math":
      return asWritten("math");
    case "thematicBreak":
      return asWritten("rule");
    default:
      if (n.type !== "yaml" && (n.type as string) !== "toml") return asWritten("text");
      // Frontmatter: its rules, then each key and its value.
      return asWritten("fm_value").map((p, k, all) => {
        const raw = side.lines[p.line - 1] ?? "";
        if (k === 0 || (k === all.length - 1 && /^(---|\+\+\+|\.\.\.)\s*$/.test(raw)))
          return { ...p, cells: p.cells.map((c) => ({ ...c, role: "fm_border" as Role })) };
        const key = /^(\s*[\w-]+)\s*[:=]/.exec(raw)?.[1]?.length ?? 0;
        const from = starts[p.line - b.from] ?? 0;
        return { ...p, cells: p.cells.map((c) => (c.at - from < key ? { ...c, role: "fm_key" as Role } : c)) };
      });
  }
}

/**
 * Inline nodes as cells, a line each (a hard break starts one): emphasis, strong and struck text in their styles, code
 * and maths as written, a link as its text, a wikilink as it reads, a picture as its glyph and its words. Each cell is
 * at the offset of the character it shows, found in the text from where its node starts. A node whose source has a
 * changed word none of its cells show (a link's target, `**` added) is marked whole.
 */
function phrasing(
  nodes: PhrasingContent[],
  text: string,
  off: (p: { line: number; column: number } | undefined) => number,
  marks: WordRange[],
  role: Role,
  attrs: number,
  g: Glyphs,
): Cell[][] {
  const lines: Cell[][] = [[]];
  const cur = () => lines[lines.length - 1]!;
  const marked = (c: Cell) => c.mark || inRanges(marks, c.at);
  /** `shown`'s characters, each at its place in the text from `from` on (before `to`); white space as a space — a CRLF
   *  line break, one character to the eye, too. */
  const put = (shown: string, from: number, to: number, r: Role, a: number) => {
    let p = Math.max(0, from);
    const end = to < 0 ? text.length : to;
    for (const ch of graphemes(shown)) {
      const q = text.indexOf(ch, p);
      const found = q >= 0 && q < end;
      const at = found ? q : Math.min(p, Math.max(0, end - 1));
      if (found) p = q + ch.length;
      const s = /^\s+$/.test(ch) ? " " : sanitize(ch);
      const w = graphemeWidth(s);
      if (s && w) cur().push({ g: s, w, role: r, attrs: a, at });
    }
  };
  const walk = (ns: PhrasingContent[], r: Role, a: number) => {
    for (const n of ns) {
      const s = off(n.position?.start);
      const e = off(n.position?.end);
      const line = cur();
      const first = line.length;
      switch (n.type) {
        case "text":
          put(n.value, s, e, r, a);
          continue;
        case "strong":
          walk(n.children, r === "text" || r === "quote" ? "strong" : r, a | A_BOLD);
          break;
        case "emphasis":
          walk(n.children, r === "text" ? "emphasis" : r, a | A_ITALIC);
          break;
        case "delete":
          walk(n.children, r === "text" ? "strike" : r, a | A_STRIKE);
          break;
        case "inlineCode":
          put(n.value, s, e, "code_inline", 0);
          break;
        case "inlineMath":
          put(n.value, s, e, "math", a);
          break;
        case "break":
          lines.push([]);
          continue;
        case "link":
        case "linkReference":
          if (n.children.length) walk(n.children, "link", a);
          else if (n.type === "link") put(n.url, s, e, "link", a);
          break;
        case "image":
        case "imageReference":
          cur().push({ g: g.image, w: stringWidth(g.image), role: "image", attrs: 0, at: Math.max(0, s) });
          put(` ${n.alt ?? ""}`, s, e, "image", 0);
          break;
        case "footnoteReference":
          put(`[${n.label ?? n.identifier}]`, s, e, "footnote", 0);
          break;
        case "html":
          put(n.value, s, e, "html", 0);
          break;
        default: {
          const type = n.type as string;
          if (type === "comment") continue; // Obsidian's `%%…%%`: hidden, as reading hides it
          if (type === "wikiLink") {
            const w = n as unknown as WikiLink;
            const shown = w.alias ?? (w.heading ? `${w.target} › ${w.heading}` : w.target || w.value);
            // An alias is after the `|`: its characters found there, not in the target.
            const bar = w.alias ? text.lastIndexOf("|", e) : -1;
            put(shown, bar > s ? bar : s, e, w.embed ? "embed" : "wikilink", a);
          } else if (type === "hashtag") put(`#${(n as unknown as { value: string }).value}`, s, e, "tag", a);
          else if (type === "highlight") walk((n as unknown as Parents).children as PhrasingContent[], "highlight", a);
          else if ("children" in n) walk((n as unknown as Parents).children as PhrasingContent[], r, a);
          else if ("value" in n) put(String((n as { value: unknown }).value), s, e, r, a);
        }
      }
      // A node whose source changed where nothing of it shows (a link's target, its `**`): marked whole.
      if (s < 0 || e <= s || line !== cur()) continue;
      const made = line.slice(first);
      if (made.length && !made.some(marked) && marks.some(([ms, me]) => ms < e && me > s))
        for (const c of made) c.mark = true;
    }
  };
  walk(nodes, role, attrs);
  return lines;
}
