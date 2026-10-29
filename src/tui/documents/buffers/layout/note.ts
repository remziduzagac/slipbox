// Note-layout cache lookup, embeds and picture bookkeeping over the same buffer.

import type { Glyphs } from "../../../../core/rendering/theme/glyphs.ts";
import type { Graph } from "../../../../core/workspace/graph/graph.ts";
import type { Layout } from "../../../../core/rendering/layout/ir.ts";
import { layoutNote, type NoteRenderOptions } from "../../../../core/documents/model/note.ts";
import type { BufferLayoutContext } from "./contracts.ts";

export function noteLayout(
  ctx: BufferLayoutContext,
  width: number,
  glyphs: Glyphs,
  showUrls: boolean,
  graph: Graph | null,
  pictures?: {
    picture: NonNullable<NoteRenderOptions["picture"]>;
    key: string;
    /** What the pictures are sized for besides the width (PIC): a kept block with a picture is laid out again when
     *  it changes. */
    sized?: string;
    drawings?: NoteRenderOptions["drawings"];
  },
  codeScroll = false,
  caption: "bottom" | "top" = "bottom",
  html: Pick<NoteRenderOptions, "htmlTheme" | "htmlDetails"> = {},
): Layout {
  const key = `${width}:${glyphs.mode}:${showUrls ? 1 : 0}:${codeScroll ? 1 : 0}:${pictures?.key ?? "-"}:${caption}`;
  const variant = key + ":" + html.htmlTheme + ":" + JSON.stringify([...(html.htmlDetails ?? [])]);
  let l = ctx.layouts.get(variant);
  if (!l) {
    // Another vault's file: its links and embeds read in its own vault.
    const there = ctx.buffer.elsewhere?.graph && ctx.buffer.elsewhere.rel !== null ? ctx.buffer.elsewhere : null;
    l = layoutNote(
      ctx.buffer.parsed,
      there ? there.graph : graph,
      there ? there.rel : ctx.buffer.rel,
      {
        width,
        glyphs,
        showUrls,
        codeScroll,
        caption,
        ...html,
        ...(pictures
          ? { picture: pictures.picture, drawings: pictures.drawings, pictureKey: pictures.sized ?? "" }
          : {}),
      },
      ctx.renderCache,
    );
    // Whether it asks for pictures (PIC): then its window's rows are part of its key.
    if (pictures) ctx.buffer.asksPictures = !!l.pictures;
    for (const p of l.embedded ?? []) ctx.buffer.embedded.add(p);
    // Keep the last few widths (a drag back and forth, a toggle and back): evict the oldest.
    if (ctx.layouts.size >= 6) ctx.layouts.delete(ctx.layouts.keys().next().value!);
    ctx.layouts.set(variant, l);
  }
  return l;
}
