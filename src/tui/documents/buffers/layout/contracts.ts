// Live buffer layout capabilities and the original cache references; no copied buffer state.

import type { NoteBuffer } from "../buffer.ts";
import type { Layout } from "../../../../core/rendering/layout/ir.ts";
import type { newSourceCache } from "../../../../core/rendering/layout/code/source.ts";
import type { newRenderCache } from "../../../../core/rendering/layout/markdown/render.ts";
import type { ParseCache } from "../../../../core/documents/markdown/parse.ts";

export interface BufferLayoutContext {
  readonly buffer: Pick<
    NoteBuffer,
    | "source"
    | "kind"
    | "version"
    | "dirty"
    | "parsed"
    | "indent"
    | "syntax"
    | "serverOutline"
    | "sourceLayout"
    | "lines"
    | "codeOpen"
    | "codeFolded"
    | "elsewhere"
    | "rel"
    | "asksPictures"
    | "embedded"
    | "parsing"
    | "parseAhead"
  >;
  readonly parsedVersion: number;
  readonly layouts: Map<string, Layout>;
  readonly sourceCache: ReturnType<typeof newSourceCache>;
  readonly renderCache: ReturnType<typeof newRenderCache>;
  /** The note's parse in chunks, which SOURCE view's inline styles read before parsing a chunk again (SIS). */
  readonly parseCache: ParseCache;
}
