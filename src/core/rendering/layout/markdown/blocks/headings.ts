// Heading rows and outline records retain the original source label and slug rules.
import type { Heading, PhrasingContent } from "mdast";
import { headingLabel } from "../../../../documents/markdown/parse.ts";
import type { Role } from "../../../theme/theme.ts";
import { stringWidth } from "../../../../foundation/text/width.ts";
import { A_BOLD, type Line } from "../../ir.ts";
import { wrapSpans } from "../../wrap.ts";
import type { Ctx } from "../render-context.ts";
import { inline } from "../render-inline.ts";

export function heading(
  depth: number,
  children: PhrasingContent[],
  src: number,
  ctx: Ctx,
  width: number,
  id?: string,
): Line[] {
  const role = `h${Math.min(6, Math.max(1, depth))}` as Role;
  const g = ctx.opts.glyphs;
  const icon = g.mode === "nerd" ? g.heading[depth - 1]! : `${g.heading[depth - 1]} `;
  const spans = inline(children, ctx, { role, attrs: A_BOLD }, src);
  // The heading's text and slug as the outline (headingsOf) has them — not the drawn spans, which
  // carry footnote marks and image glyphs. Repeated headings share a slug; their occurrence tells
  // them apart (anchors count it), so [[#A-1]] is the heading "A-1", never the second "A".
  const { text, slug } = headingLabel({ type: "heading", depth: depth as Heading["depth"], children });
  const idx = ctx.headings.push({ level: depth, text, slug, src, ...(id ? { id } : {}) }) - 1;
  const iconW = stringWidth(icon);
  const rows = wrapSpans(spans, width - iconW);
  return rows.map((row, i) => ({
    spans: [{ text: i === 0 ? icon : " ".repeat(iconW), role, attrs: A_BOLD }, ...row],
    src,
    fill: role,
    heading: i === 0 ? idx : undefined,
  }));
}
