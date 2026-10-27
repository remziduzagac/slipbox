// Wrapping over the one width function (plan 2.4). Word boundaries first; CJK breaks between
// characters; a word longer than the line is broken by grapheme, never overflowed.

import { graphemes, graphemeWidth } from "../foundation/text/width.ts";
import type { Span } from "./ir.ts";

interface G {
  g: string;
  w: number;
  /** Index of the source span, and where in its text the grapheme starts. */
  s: number;
  o: number;
}

type Chunk = { kind: "word" | "space"; gs: G[]; width: number } | { kind: "newline" };

// Where a line may break: whitespace — but not a no-break space (U+00A0, U+2007, U+202F), which
// keeps "10 km" together as its author asked.
const SPACE = /^(?![\u00a0\u2007\u202f])\s$/;
// Kinsoku: CJK closing punctuation never starts a row, opening punctuation never ends one.
const NO_BREAK_BEFORE = /^[、。，．：；？！）」』】〕〉》｝］〙〗ー々ゝゞヽヾ…‥・％]$/;
const NO_BREAK_AFTER = /^[（「『【〔〈《｛［〘〖]$/;
const BREAK_AFTER = /^[/\\\-_.?&=,:;|]$/;
/** ASCII closing punctuation: kept with the CJK character before it. */
const CLOSING = ",.;:!?)]}";

function chunkify(spans: Span[]): Chunk[] {
  const chunks: Chunk[] = [];
  let cur: { kind: "word" | "space"; gs: G[]; width: number } | null = null;
  const flush = () => {
    if (cur?.gs.length) chunks.push(cur);
    cur = null;
  };
  spans.forEach((span, s) => {
    let o = 0;
    for (const g of graphemes(span.text)) {
      const at = o;
      o += g.length;
      if (g === "\n") {
        flush();
        chunks.push({ kind: "newline" });
        continue;
      }
      const w = graphemeWidth(g);
      // ASCII without a regex: whitespace is a space, a tab or a line break's kin (\v \f \r).
      const c = g.length === 1 ? g.charCodeAt(0) : -1;
      const kind =
        c >= 0 && c < 0x80 ? (c === 32 || (c >= 9 && c <= 13) ? "space" : "word") : SPACE.test(g) ? "space" : "word";
      // Wide (CJK) graphemes are each their own break opportunity — except that closing
      // punctuation stays with what precedes it and opening punctuation with what follows (kinsoku).
      if (kind === "word" && w === 2) {
        flush();
        const prev = chunks.at(-1);
        if (prev?.kind === "word" && (NO_BREAK_BEFORE.test(g) || NO_BREAK_AFTER.test(prev.gs.at(-1)!.g))) {
          prev.gs.push({ g, w, s, o: at });
          prev.width += w;
          continue;
        }
        chunks.push({ kind: "word", gs: [{ g, w, s, o: at }], width: w });
        continue;
      }
      if (!cur || cur.kind !== kind) {
        flush();
        const prev = chunks.at(-1);
        // Text right after opening punctuation continues its chunk (no break after （ or 「), and so
        // does ASCII closing punctuation right after a CJK character (no row starts with its comma),
        // and closing punctuation that measures 1 (`…` `‥`, East Asian Ambiguous) likewise.
        if (
          kind === "word" &&
          prev?.kind === "word" &&
          (NO_BREAK_AFTER.test(prev.gs.at(-1)!.g) ||
            (c >= 0 && CLOSING.includes(g)) ||
            (prev.gs.at(-1)!.w === 2 && NO_BREAK_BEFORE.test(g)))
        )
          cur = chunks.pop() as { kind: "word" | "space"; gs: G[]; width: number };
        else cur = { kind, gs: [], width: 0 };
      }
      cur.gs.push({ g, w, s, o: at });
      cur.width += w;
    }
  });
  flush();
  return chunks;
}

/** A row's graphemes as spans: each run from one source span sliced from its text, not rebuilt. */
function toSpans(gs: G[], spans: Span[]): Span[] {
  const out: Span[] = [];
  let i = 0;
  while (i < gs.length) {
    const first = gs[i]!;
    let end = first.o + first.g.length;
    let j = i + 1;
    // A run: the same span, each grapheme right after the one before (a dropped space ends it).
    while (j < gs.length && gs[j]!.s === first.s && gs[j]!.o === end) end += gs[j++]!.g.length;
    const src = spans[first.s]!;
    const text = src.text.slice(first.o, end);
    const last = out[out.length - 1];
    // A space dropped between two runs of one span: the text joins, as before.
    if (last && (last as Span & { _s?: number })._s === first.s) last.text += text;
    else out.push({ ...src, text, _s: first.s } as Span);
    i = j;
  }
  for (const sp of out) delete (sp as Span & { _s?: number })._s;
  return out;
}

/**
 * Wrap styled spans to `width` columns. Returns rows of spans. Leading spaces of a wrapped row
 * are dropped; trailing spaces are trimmed.
 */
export function wrapSpans(spans: Span[], width: number): Span[][] {
  return wrapAscii(spans, Math.max(1, width)) ?? wrapGraphemes(spans, width);
}

/** The characters `segments` breaks a long word after. */
const BREAK_CHARS = "/\\-_.?&=,:;|";

/**
 * `wrapGraphemes` for spans of printable ASCII only — most paragraphs: every character one
 * grapheme one column wide, only a space a break, no CJK rules — by ranges of the spans' joined
 * text rather than an object per character (plan 15.1). The same rows, exactly; null for any
 * other text.
 */
function wrapAscii(spans: Span[], w: number): Span[][] | null {
  let all = "";
  const starts: number[] = [];
  for (const sp of spans) {
    const t = sp.text;
    for (let k = 0; k < t.length; k++) {
      const c = t.charCodeAt(k);
      if (c < 0x20 || c > 0x7e) return null;
    }
    starts.push(all.length);
    all += t;
  }
  const rows: [number, number][] = [];
  // The row being filled (a < 0: empty), and the space before the next word, if the row has one.
  let a = -1;
  let b = -1;
  let rowW = 0;
  let pa = -1;
  let pb = -1;
  const endRow = () => {
    rows.push([a, b]);
    a = b = pa = pb = -1;
    rowW = 0;
  };
  const add = (x: number, y: number) => {
    if (a < 0) a = x;
    b = y;
    rowW += y - x;
  };
  const n = all.length;
  let i = 0;
  while (i < n) {
    let j = i;
    if (all.charCodeAt(i) === 32) {
      while (j < n && all.charCodeAt(j) === 32) j++;
      if (a >= 0) {
        pa = i;
        pb = j;
      }
      i = j;
      continue;
    }
    while (j < n && all.charCodeAt(j) !== 32) j++;
    const cw = j - i;
    const pendingW = pa >= 0 ? pb - pa : 0;
    if (rowW + pendingW + cw <= w) {
      if (pa >= 0) add(pa, pb);
      add(i, j);
      pa = pb = -1;
    } else if (a >= 0 && cw <= w) {
      endRow();
      add(i, j);
    } else {
      // Longer than a row: its soft segments, and by character one wider than a row (as below).
      if (a >= 0) endRow();
      pa = pb = -1;
      let from = i;
      for (let k = i; k < j; k++) {
        if (!(k === j - 1 || (k > i && BREAK_CHARS.includes(all[k]!)))) continue;
        const to = k + 1;
        const sw = to - from;
        if (rowW + sw <= w) add(from, to);
        else if (sw <= w) {
          endRow();
          add(from, to);
        } else {
          if (a >= 0) endRow();
          for (let q = from; q < to; q++) {
            if (rowW + 1 > w && a >= 0) endRow();
            add(q, q + 1);
          }
        }
        from = to;
      }
    }
    i = j;
  }
  if (a >= 0 || rows.length === 0) rows.push([a, b]);
  // Rows come in the text's order: each starts looking from the first span the last one still
  // reached — not from the first span again (a long paragraph's thousands of rows and spans).
  let first = 0;
  return rows.map(([x, y]) => {
    const out: Span[] = [];
    if (x < 0) return out;
    while (first < spans.length && starts[first]! + spans[first]!.text.length <= x) first++;
    for (let k = first; k < spans.length && starts[k]! < y; k++) {
      const sp = spans[k]!;
      const st = starts[k]!;
      const from = Math.max(x, st);
      const to = Math.min(y, st + sp.text.length);
      if (from < to) out.push({ ...sp, text: sp.text.slice(from - st, to - st) });
    }
    return out;
  });
}

/** Wrap by grapheme: any text (the rule `wrapAscii` follows for ASCII). */
export function wrapGraphemes(spans: Span[], width: number): Span[][] {
  const w = Math.max(1, width);
  const rows: G[][] = [];
  let row: G[] = [];
  let rowW = 0;
  let pendingSpace: G[] = [];
  let pendingW = 0;

  const endRow = () => {
    rows.push(row);
    row = [];
    rowW = 0;
    pendingSpace = [];
    pendingW = 0;
  };

  for (const c of chunkify(spans)) {
    if (c.kind === "newline") {
      endRow();
      continue;
    }
    if (c.kind === "space") {
      if (row.length) {
        pendingSpace = c.gs;
        pendingW = c.width;
      }
      continue;
    }
    if (rowW + pendingW + c.width <= w) {
      row.push(...pendingSpace, ...c.gs);
      rowW += pendingW + c.width;
      pendingSpace = [];
      pendingW = 0;
      continue;
    }
    if (row.length && c.width <= w) {
      endRow();
      row.push(...c.gs);
      rowW = c.width;
      continue;
    }
    // Longer than a whole row: start a fresh row, then pack the word's soft segments (split
    // after `/ - _ . ?` …), breaking by grapheme only a segment wider than a row. This is the
    // rule `countLines` counts with, so the table allocator predicts exactly what is drawn.
    if (row.length) endRow();
    pendingSpace = [];
    pendingW = 0;
    for (const seg of segments(c.gs)) {
      const sw = seg.reduce((a, x) => a + x.w, 0);
      if (rowW + sw <= w) {
        row.push(...seg);
        rowW += sw;
        continue;
      }
      if (sw <= w) {
        endRow();
        row.push(...seg);
        rowW = sw;
        continue;
      }
      if (row.length) endRow();
      for (const g of seg) {
        if (rowW + g.w > w && row.length) endRow();
        row.push(g);
        rowW += g.w;
      }
    }
  }
  if (row.length || rows.length === 0) rows.push(row);
  return rows.map((r) => toSpans(r, spans));
}

/**
 * Soft segments of a word: split after the separators the wrapper prefers to break at, so
 * `anti_conceal.enabled` is `anti_conceal.` + `enabled` and a path breaks at its slashes.
 */
function segments(gs: G[]): G[][] {
  const out: G[][] = [];
  let cur: G[] = [];
  for (let i = 0; i < gs.length; i++) {
    cur.push(gs[i]!);
    if (BREAK_AFTER.test(gs[i]!.g) && i < gs.length - 1 && i > 0) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

function segmentWidths(gs: G[]): number[] {
  return segments(gs).map((seg) => seg.reduce((a, x) => a + x.w, 0));
}

/**
 * Width of the longest run that should not break — the table allocator's per-column minimum.
 * Long identifiers and paths count by their soft segments, since the wrapper breaks them there.
 */
export function longestWord(spans: Span[]): number {
  let best = 0;
  for (const c of chunkify(spans)) {
    if (c.kind !== "word") continue;
    for (const w of segmentWidths(c.gs)) if (w > best) best = w;
  }
  return best;
}

/** Width of the widest explicit line (hard breaks split lines). */
export function naturalWidth(spans: Span[]): number {
  let best = 0;
  let cur = 0;
  for (const c of chunkify(spans)) {
    if (c.kind === "newline") {
      best = Math.max(best, cur);
      cur = 0;
    } else cur += c.width;
  }
  return Math.max(best, cur);
}

/**
 * A cell measured once for the table allocator: word and space widths in order, with hard
 * breaks. `countLines` then answers "how many rows at width w" cheaply, many times over.
 */
export interface Measure {
  /** 0 word, 1 space, 2 hard break, 3 soft segment continuing the previous word */
  kinds: number[];
  widths: number[];
  /** Each segment's grapheme widths, for breaking one longer than a row exactly as wrapSpans does
   *  (a wide character is never split, so a row can end a column short). */
  graphemes: number[][];
}

export function measure(spans: Span[]): Measure {
  const kinds: number[] = [];
  const widths: number[] = [];
  const graphemes: number[][] = [];
  for (const c of chunkify(spans)) {
    if (c.kind === "newline") {
      kinds.push(2);
      widths.push(0);
      graphemes.push([]);
    } else if (c.kind === "space") {
      kinds.push(1);
      widths.push(c.width);
      graphemes.push([]);
    } else {
      segments(c.gs).forEach((seg, i) => {
        kinds.push(i === 0 ? 0 : 3);
        widths.push(seg.reduce((a, x) => a + x.w, 0));
        graphemes.push(seg.map((x) => x.w));
      });
    }
  }
  return { kinds, widths, graphemes };
}

/** Rows `wrapSpans` would produce at `width` — the same greedy rule, without building spans. */
export function countLines(m: Measure, width: number): number {
  return fit(m, width).lines;
}

/**
 * Rows at `width`, and how many words end up split across rows (at a soft segment or mid-grapheme).
 * The table allocator treats a split word as costing about as much as an extra row.
 */
export function fit(m: Measure, width: number): { lines: number; splits: number } {
  let splits = 0;
  const w = Math.max(1, width);
  let lines = 1;
  let rowW = 0;
  let pending = 0;
  let empty = true;
  const n = m.kinds.length;
  for (let i = 0; i < n; i++) {
    const k = m.kinds[i]!;
    if (k === 2) {
      lines++;
      rowW = 0;
      pending = 0;
      empty = true;
      continue;
    }
    if (k === 1) {
      if (!empty) pending = m.widths[i]!;
      continue;
    }
    // A word: its first segment and any continuation segments.
    let j = i;
    let total = m.widths[i]!;
    while (j + 1 < n && m.kinds[j + 1] === 3) total += m.widths[++j]!;
    if (rowW + pending + total <= w) {
      rowW += pending + total;
    } else if (!empty && total <= w) {
      lines++;
      rowW = total;
    } else {
      // Too long for a row: packed segment by segment, a segment longer than a row broken hard.
      if (!empty) {
        lines++;
        rowW = 0;
      }
      const before = lines;
      for (let s = i; s <= j; s++) {
        const sw = m.widths[s]!;
        if (rowW + sw <= w) rowW += sw;
        else if (sw <= w) {
          lines++;
          rowW = sw;
        } else {
          // Broken by grapheme, as wrapSpans does: a row ends where the next one wouldn't fit.
          if (rowW > 0) {
            lines++;
            rowW = 0;
          }
          let started = false;
          for (const gw of m.graphemes[s]!) {
            if (rowW + gw > w && started) {
              lines++;
              rowW = 0;
            }
            rowW += gw;
            started = true;
          }
        }
      }
      if (lines > before) splits++;
    }
    pending = 0;
    empty = false;
    i = j;
  }
  // Nothing placed after the last hard break (only spaces, or nothing): wrapSpans draws no row for it.
  if (empty && lines > 1) lines--;
  return { lines, splits };
}
