// Wrapping over the one width function (plan 2.4). Word boundaries first; CJK breaks between
// characters; a word longer than the line is broken by grapheme, never overflowed.

import { graphemes, graphemeWidth } from "../width.ts";
import type { Span } from "./ir.ts";

interface G {
  g: string;
  w: number;
  /** Index of the source span. */
  s: number;
}

type Chunk = { kind: "word" | "space"; gs: G[]; width: number } | { kind: "newline" };

const SPACE = /^\s$/;
// Kinsoku: CJK closing punctuation never starts a row, opening punctuation never ends one.
const NO_BREAK_BEFORE = /^[、。，．：；？！）」』】〕〉》｝］〙〗ー々ゝゞヽヾ…‥・％]$/;
const NO_BREAK_AFTER = /^[（「『【〔〈《｛［〘〖]$/;
const BREAK_AFTER = /^[/\\\-_.?&=,:;|]$/;

function chunkify(spans: Span[]): Chunk[] {
  const chunks: Chunk[] = [];
  let cur: { kind: "word" | "space"; gs: G[]; width: number } | null = null;
  const flush = () => {
    if (cur && cur.gs.length) chunks.push(cur);
    cur = null;
  };
  spans.forEach((span, s) => {
    for (const g of graphemes(span.text)) {
      if (g === "\n") {
        flush();
        chunks.push({ kind: "newline" });
        continue;
      }
      const w = graphemeWidth(g);
      const kind = SPACE.test(g) ? "space" : "word";
      // Wide (CJK) graphemes are each their own break opportunity — except that closing
      // punctuation stays with what precedes it and opening punctuation with what follows (kinsoku).
      if (kind === "word" && w === 2) {
        flush();
        const prev = chunks.at(-1);
        if (prev?.kind === "word" && (NO_BREAK_BEFORE.test(g) || NO_BREAK_AFTER.test(prev.gs.at(-1)!.g))) {
          prev.gs.push({ g, w, s });
          prev.width += w;
          continue;
        }
        chunks.push({ kind: "word", gs: [{ g, w, s }], width: w });
        continue;
      }
      if (!cur || cur.kind !== kind) {
        flush();
        const prev = chunks.at(-1);
        // Text right after opening punctuation continues its chunk (no break after （ or 「), and so
        // does ASCII closing punctuation right after a CJK character (no row starts with its comma).
        if (kind === "word" && prev?.kind === "word" && (NO_BREAK_AFTER.test(prev.gs.at(-1)!.g) || /^[,.;:!?)\]}]$/.test(g)))
          cur = chunks.pop() as { kind: "word" | "space"; gs: G[]; width: number };
        else cur = { kind, gs: [], width: 0 };
      }
      cur.gs.push({ g, w, s });
      cur.width += w;
    }
  });
  flush();
  return chunks;
}

function toSpans(gs: G[], spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const { g, s } of gs) {
    const last = out[out.length - 1];
    if (last && (last as Span & { _s?: number })._s === s) last.text += g;
    else {
      const src = spans[s]!;
      const sp: Span & { _s?: number } = { ...src, text: g, _s: s };
      out.push(sp);
    }
  }
  for (const sp of out) delete (sp as Span & { _s?: number })._s;
  return out;
}

/**
 * Wrap styled spans to `width` columns. Returns rows of spans. Leading spaces of a wrapped row
 * are dropped; trailing spaces are trimmed.
 */
export function wrapSpans(spans: Span[], width: number): Span[][] {
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
