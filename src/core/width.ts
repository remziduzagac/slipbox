// The one width function (plan 0.7). Nothing else in slipbox measures text.
//
// Display width governs every wrap point, cursor position and column alignment, so it is
// decided once here, per grapheme cluster: a ZWJ family is one grapheme across several code
// points, a combining mark adds nothing, CJK takes two columns.

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
  const out: string[] = [];
  for (const { segment } of segmenter.segment(text)) out.push(segment);
  return out;
}

function isPrintableAscii(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) return false;
  }
  return true;
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
  if (RGI_EMOJI.test(g)) return 2;
  // A pictograph forced to emoji presentation by VS16 is wide even when not RGI.
  if (g.includes("️") && PICTOGRAPHIC.test(g)) return 2;
  const cp = g.codePointAt(0) ?? 0;
  return eastAsianWidth(cp, { ambiguousAsWide: false });
}

export function stringWidth(text: string): number {
  if (isPrintableAscii(text)) return text.length;
  let w = 0;
  for (const g of graphemes(text)) w += graphemeWidth(g);
  return w;
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
