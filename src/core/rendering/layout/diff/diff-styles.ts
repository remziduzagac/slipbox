// A note's diff with its inline styles held to SOURCE view's budget (SIS-D5): each text's parse in chunks and its
// layout's cache kept between the diff's layouts; nothing past `BACKGROUND_PARSE` parsed on the screen's thread, a big
// text's parse sent to the parse workers instead, and the diff laid out again when it lands. Its window, the review and
// the merge screen each lay a diff out on every draw that changes its width, and again for each fold opened.

import { BACKGROUND_PARSE, parseInBackground } from "../../../documents/markdown/parse-pool.ts";
import { newParseCache, type ParseCache } from "../../../documents/markdown/parse.ts";
import { layoutSource, newSourceCache, type SourceCache, type SourceLayoutOptions } from "../code/source.ts";
import type { Layout } from "../ir.ts";

/** A text's styles: its parse in chunks, its layout's cache, and its parse on the workers: not sent, running, ended. */
interface Side {
  parsed: ParseCache;
  cache: SourceCache;
  parse: "none" | "running" | "done" | "failed";
}

/** Kept by the app between a diff's layouts: the styles of the last few texts laid out. */
export interface DiffStyles {
  sides: Map<string, Side>;
  /** Bumped when a text's parse lands: what a diff's layout is kept by, so one made before is made again. */
  version: number;
  /** Told when a text's parse lands: the screen is drawn again. */
  landed: () => void;
}

/** The texts kept: a diff's two, a merge screen's few. */
const KEPT = 8;

export function newDiffStyles(landed: () => void = () => {}): DiffStyles {
  return { sides: new Map(), version: 0, landed };
}

/**
 * `text` laid out as SOURCE view lays it out, the lines `wanted` (1-based) with their inline styles — those that can be
 * had within the budget. Past it, none are parsed: the lines have the light highlighting, the text's parse goes to the
 * workers, and it's styled when it lands (`landed`). What the workers failed on keeps the light highlighting.
 */
export function styledSource(text: string, wanted: number[], opts: SourceLayoutOptions, styles: DiffStyles): Layout {
  const side = styles.sides.get(text) ?? { parsed: newParseCache(), cache: newSourceCache(), parse: "none" };
  styles.sides.delete(text);
  styles.sides.set(text, side);
  if (styles.sides.size > KEPT) styles.sides.delete(styles.sides.keys().next().value!);
  const lay = (limit: number) =>
    layoutSource(text, { ...opts, styles: { lines: new Set(wanted), parsed: side.parsed, limit } }, side.cache);
  const l = lay(side.parse === "running" ? 0 : BACKGROUND_PARSE);
  if (!side.cache.styles.pending || side.parse === "running" || side.parse === "failed") return l;
  if (side.parse === "done") return lay(Number.POSITIVE_INFINITY); // what's left the workers don't parse: little
  side.parse = "running";
  void parseInBackground(text, side.parsed).then((ok) => {
    side.parse = ok ? "done" : "failed";
    styles.version++;
    styles.landed();
  });
  return l;
}
