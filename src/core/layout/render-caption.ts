// Standalone picture captions; inline images keep their paragraph layout.
import type { PhrasingContent } from "mdast";
import type { Line } from "./ir.ts";
import type { Ctx, Style } from "./render-context.ts";
import { inline } from "./render-inline.ts";
import { wrapSpans } from "./wrap.ts";
import { stringWidth } from "../foundation/text/width.ts";

export function pictureCaption(c: PhrasingContent, at: number, ctx: Ctx, width: number, base: Style): Line[] {
  const spans = inline([c], ctx, base, at);
  const link = spans.find((span) => span.link !== undefined)?.link;
  const target = link === undefined ? "" : (ctx.links[link]?.target ?? "");
  const text = link === undefined ? "" : (ctx.links[link]?.text ?? "");
  const meta = { target, text, from: ctx.linkFrom, kind: link === undefined ? undefined : ctx.links[link]?.kind };
  const box = ctx.opts.glyphs.box;
  const border = (text: string) => ({ text, role: "image" as const, attrs: 0 });
  const w = Math.max(4, width);
  if (width < 4)
    return wrapSpans(spans, Math.max(1, width)).map((row, i) => ({
      spans: row,
      src: at,
      fill: "picture_caption",
      caption: { ...meta, top: i === 0 },
    }));
  const rows = wrapSpans(spans, Math.max(1, w - 4));
  return [
    {
      spans: [border(box.tl + box.h.repeat(w - 2) + box.tr)],
      src: at,
      decor: true,
      fill: "picture_caption",
      caption: { ...meta, top: true },
    },
    ...rows.map(
      (row): Line => ({
        spans: [
          border(`${box.v} `),
          ...row,
          border(`${" ".repeat(Math.max(0, w - 3 - row.reduce((n, span) => n + stringWidth(span.text), 0)))}${box.v}`),
        ],
        src: at,
        fill: "picture_caption",
        caption: meta,
      }),
    ),
    {
      spans: [border(box.bl + box.h.repeat(w - 2) + box.br)],
      src: at,
      decor: true,
      fill: "picture_caption",
      caption: meta,
    },
  ];
}
