// The one width function (plan 0.7). Nothing else in slipbox measures text.
//
// Display width governs every wrap point, cursor position and column alignment, so it is
// decided once here, per grapheme cluster: a ZWJ family is one grapheme across several code
// points, a combining mark adds nothing, CJK takes two columns. How wide a cluster is follows the
// terminal (`WidthMethod`): the TUI draws through OpenTUI, which asks the terminal and lays its cells
// out so; slipbox counts as it does, or rows and borders drift within one frame.

import { eastAsianWidth } from "get-east-asian-width";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const RGI_EMOJI = /^\p{RGI_Emoji}$/v;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const MARK_ONLY = /^\p{M}+$/u;
// Zero-width format characters that survive sanitising: ZWSP, ZWNJ, ZWJ, word joiner, BOM.
const ZERO_WIDTH = /^[​-‍⁠﻿]+$/;

export function graphemes(text: string): string[] {
  // ASCII fast path: one grapheme per char unless CR LF appears.
  if (isPrintableAscii(text)) return text.split("");
  // Mostly ASCII (a bullet, a border, an accent in a sentence): only the islands around the rest go
  // through the segmenter. Between two printable ASCII characters is always a boundary (no rule
  // of UAX #29 joins them), so a character with printable ASCII on both sides is a grapheme alone,
  // and each island starts and ends at a certain boundary.
  const out: string[] = [];
  let island = -1;
  for (let i = 0; i < text.length; i++) {
    const alone =
      printable(text.charCodeAt(i)) &&
      (i === 0 || printable(text.charCodeAt(i - 1))) &&
      (i + 1 === text.length || printable(text.charCodeAt(i + 1)));
    if (!alone) {
      if (island < 0) island = i;
      continue;
    }
    if (island >= 0) {
      for (const { segment } of segmenter.segment(text.slice(island, i))) out.push(segment);
      island = -1;
    }
    out.push(text[i]!);
  }
  if (island >= 0) for (const { segment } of segmenter.segment(text.slice(island))) out.push(segment);
  return out;
}

function printable(c: number): boolean {
  return c >= 0x20 && c <= 0x7e;
}

function isPrintableAscii(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) return false;
  }
  return true;
}

/**
 * How a grapheme cluster's width is counted — OpenTUI's methods, chosen by asking the terminal:
 * `unicode`, each cluster its own width (Bun's: terminals that cluster graphemes — libghostty, kitty,
 * WezTerm — and the default); `wcwidth`, a cluster as wide as its first code point (terminals that
 * don't). OpenTUI's third, `unicode-wide`, counts Indic spacing marks by rules of its own: slipbox
 * counts as `unicode` there, and such text may drift.
 */
export type WidthMethod = "unicode" | "wcwidth";
let method: WidthMethod = "unicode";

/** Count widths the terminal's way (the TUI, from OpenTUI's answer); every cached width forgotten. */
export function setWidthMethod(next: WidthMethod): void {
  if (next === method) return;
  method = next;
  cache.clear();
  shortCache.clear();
}

export function widthMethod(): WidthMethod {
  return method;
}

const cache = new Map<string, number>();

export function graphemeWidth(g: string): number {
  if (g.length === 1) {
    const c = g.charCodeAt(0);
    if (c >= 0x20 && c < 0x7f) return 1;
    if (c < 0x20 || (c >= 0x7f && c < 0xa0)) return 0;
  }
  const hit = cache.get(g);
  if (hit !== undefined) return hit;
  const w = computeWidth(g);
  if (cache.size < 10_000) cache.set(g, w);
  return w;
}

function computeWidth(g: string): number {
  if (ZERO_WIDTH.test(g) || MARK_ONLY.test(g)) return 0;
  const cp = g.codePointAt(0) ?? 0;
  // Where OpenTUI's table differs from the others (a test holds slipbox and OpenTUI together on
  // every grapheme the reference set and halden have, and slipbox's own glyphs): the heart and
  // exclamation ornaments, ❠ to ❧ — ❤, the unicode set's ❢ — are wide to it, whatever their selector.
  if (cp >= 0x2760 && cp <= 0x2767) return 2;
  // Not clustering, the terminal advances by the first code point (a flag's first letter, a
  // keycap's digit, ✔ before its VS16), as OpenTUI then lays the cluster out.
  if (method === "wcwidth") return eastAsianWidth(cp, { ambiguousAsWide: false });
  // Clustering: the cluster's own width — an RGI emoji or a VS16 pictograph two, a conjunct with
  // its spacing marks what its parts take (Bun's measure, OpenTUI's too).
  if (RGI_EMOJI.test(g) || (g.includes("️") && PICTOGRAPHIC.test(g))) return 2;
  return Bun.stringWidth(g, { ambiguousIsNarrow: true });
}

/** Short strings with something besides ASCII, measured: a list's bullet, a table's border, a
 *  heading's mark come back row after row. */
const shortCache = new Map<string, number>();

export function stringWidth(text: string): number {
  if (isPrintableAscii(text)) return text.length;
  const short = text.length <= 32;
  if (short) {
    const hit = shortCache.get(text);
    if (hit !== undefined) return hit;
  }
  let w = 0;
  for (const g of graphemes(text)) w += graphemeWidth(g);
  if (short && shortCache.size < 10_000) shortCache.set(text, w);
  return w;
}

/** Cut to `width` columns from the start, keeping the end: `…` then the text's last graphemes. */
export function truncateStart(text: string, width: number, ellipsis = "…"): string {
  if (width <= 0) return "";
  if (stringWidth(text) <= width) return text;
  const budget = Math.max(0, width - stringWidth(ellipsis));
  const gs = graphemes(text);
  let out = "";
  let w = 0;
  for (let i = gs.length - 1; i >= 0; i--) {
    const gw = graphemeWidth(gs[i]!);
    if (w + gw > budget) break;
    out = gs[i]! + out;
    w += gw;
  }
  return ellipsis + out;
}

/** Cut `text` to at most `width` columns, appending `ellipsis` when it was cut. */
export function truncate(text: string, width: number, ellipsis = "…"): string {
  if (width <= 0) return "";
  if (stringWidth(text) <= width) return text;
  const ew = stringWidth(ellipsis);
  const budget = Math.max(0, width - ew);
  let out = "";
  let w = 0;
  for (const g of graphemes(text)) {
    const gw = graphemeWidth(g);
    if (w + gw > budget) break;
    out += g;
    w += gw;
  }
  return ew <= width ? out + ellipsis : out;
}

/** Pad with spaces to exactly `width` columns (truncating if longer). */
export function padEnd(text: string, width: number): string {
  const w = stringWidth(text);
  if (w > width) return truncate(text, width, "");
  return text + " ".repeat(width - w);
}

/** Split text into two at a column boundary; a wide grapheme never straddles the cut. */
export function splitAtWidth(text: string, width: number): [string, string] {
  let w = 0;
  let i = 0;
  const gs = graphemes(text);
  let head = "";
  for (; i < gs.length; i++) {
    const g = gs[i]!;
    const gw = graphemeWidth(g);
    if (w + gw > width) break;
    head += g;
    w += gw;
  }
  return [head, gs.slice(i).join("")];
}
