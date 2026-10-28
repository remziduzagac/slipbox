// Standalone image fitting, captions and diagram rows; embedded notes supply their own picture resolver.
import { htmlLinkedImage } from "../../../../documents/markdown/html-adapter.ts";
import { alignHtml } from "../render-html.ts";
import { pictureCaption } from "../render-caption.ts";
import type { PhrasingContent } from "mdast";
import { RESVG, rasterizer } from "../../../media/images/svg.ts";
import { sanitize } from "../../../../foundation/text/sanitize.ts";
import type { Role } from "../../../theme/theme.ts";
import { graphemes, stringWidth } from "../../../../foundation/text/width.ts";
import type { WikiLink } from "../../../../documents/markdown/wikilink.ts";
import type { CodeScroll, Line, Picture, Span } from "../../ir.ts";
import type { Ctx, Style } from "../render-context.ts";
import { NOTE_URL, IMAGE_FILE, SIZE } from "../render-inline.ts";
import type { PictureSource, RenderOptions, Embedded } from "../contracts.ts";
import { isParagraphSpacing } from "../nodes/structure.ts";

/**
 * A paragraph of nothing but pictures (and the line breaks between them), 12.x: each the rows its image is drawn over,
 * then its caption box — blank frame rows, the first carrying the picture. Null when there's other text, or no
 * picture source: then it's a paragraph like any. A caption stands alone when no image can be drawn.
 */
export function picturesAlone(
  children: PhrasingContent[],
  src: number,
  ctx: Ctx,
  width: number,
  base: Style,
): Line[] | null {
  if (children.some((c) => c.type === "image" && NOTE_URL.test(c.url.split("#")[0]!))) return null;
  const images = children.flatMap((c) => {
    const image = htmlLinkedImage(c);
    const from = pictureSource(image ?? c, ctx);
    return from ? [{ c, from }] : [];
  });
  if (!images.length || images.length !== children.filter((c) => !isParagraphSpacing(c)).length) return null;
  const drawn = images.map(({ c, from }) => {
    const at = (htmlLinkedImage(c) ?? c).position?.start.line ?? src;
    const h = (htmlLinkedImage(c) ?? c).data?.html;
    const percent = Math.min(
      h?.width?.unit === "%" ? h.width.value : 100,
      h?.maxWidth?.unit === "%" ? h.maxWidth.value : 100,
    );
    if (h?.maxWidth?.unit === "px" && "url" in from) from.maxWidth = h.maxWidth.value;
    const room = Math.max(1, Math.floor((width * percent) / 100));
    return { c, at, p: askPicture(from, room, ctx, captionRows(c, at, ctx, width, base)) };
  });
  return drawn.flatMap(({ c, at, p }) =>
    alignHtml(pictureRows(c, p, at, ctx, width, base), width, (htmlLinkedImage(c) ?? c).data?.html?.align),
  );
}

/** How many rows a picture's `▣ alt` line wraps to (PIC-D1): what its window has less for the picture. */
export function captionRows(c: PhrasingContent, at: number, ctx: Ctx, width: number, base: Style): number {
  return pictureCaption(c, at, { ...ctx, links: [] }, width, base).length + 1;
}

/** A picture asked for: an SVG's (12.15) waits for its rasteriser — the layout says so, and is made again when it's in. */
export function askPicture(from: PictureSource, width: number, ctx: Ctx, caption = 1): Picture | null {
  if (!ctx.opts.picture) return null;
  ctx.asks.picture = true;
  const named = "url" in from ? from.url.split(/[?#]/)[0]! : "name" in from ? from.name : "";
  if (/\.svg$/i.test(named) && !rasterizer()) ctx.pending.add(RESVG);
  return ctx.opts.picture(from, width, caption);
}

/**
 * The rows a picture is drawn over, where available, then its wrapped caption box:
 * blank frame rows, the first carrying the picture; each of them naming it (PIC). At its own size and wider than its
 * room, its frame rows scroll sideways as a code block's do, and one more frame row under them holds its bar.
 */
export function pictureRows(
  c: PhrasingContent,
  p: Picture | null,
  at: number,
  ctx: Ctx,
  width: number,
  base: Style,
): Line[] {
  const caption = pictureCaption(c, at, ctx, width, base);
  if (!p) return caption;
  const out: Line[] = [];
  const linked = caption
    .flatMap((l) => l.spans)
    .find((s) => s.link !== undefined && ctx.links[s.link]?.kind === "markdown")?.link;
  const scroll: CodeScroll | undefined = p.scrolls ? { x: 0, w: width, total: p.cols } : undefined;
  for (let k = 0; k < p.rows; k++)
    out.push({
      spans: linked !== undefined ? [{ text: "", role: "image", attrs: 0, link: linked }] : [],
      src: at,
      decor: k !== 0,
      pic: { p, row: k },
      ...(k === 0 ? { image: p } : {}),
      ...(scroll ? { scroll } : {}),
    });
  if (scroll)
    out.push({ spans: [], src: at, decor: true, pic: { p, row: p.rows }, scroll: { ...scroll, part: "bar" } });
  const gap: Line = { spans: [], src: at, decor: true };
  const rows = ctx.opts.caption === "top" ? [...caption, gap, ...out] : [...out, gap, ...caption];
  const first = ctx.opts.caption === "top" ? caption.length + 1 : 0;
  return rows.map((line, i) => ({ ...line, pic: { p, row: i - first } }));
}

/** Where a picture is drawn from: a markdown image's URL, or a picture embedded by name (`![[dal.png|300]]`) and the
 *  size its `|…` gives it. Null for anything else. */
export function pictureSource(c: PhrasingContent, ctx: Ctx): PictureSource | null {
  if (c.type === "imageReference") {
    const url = ctx.definitions.get(c.identifier.toLowerCase());
    return url ? { url } : null;
  }
  if (c.type === "image") {
    const h = c.data?.html;
    return {
      url: c.url,
      ...(h?.width?.unit === "px" || h?.height
        ? {
            size: {
              width: h?.width?.unit === "px" ? h.width.value : Number.MAX_SAFE_INTEGER,
              height: h?.height?.value ?? null,
            },
          }
        : {}),
    };
  }
  if ((c.type as string) !== "wikiLink") return null;
  const w = c as unknown as WikiLink;
  if (!w.embed || !IMAGE_FILE.test(w.target)) return null;
  const m = SIZE.exec(w.alias?.trim() ?? "");
  return { name: w.target, size: m ? { width: Number(m[1]), height: m[2] ? Number(m[2]) : null } : null };
}

/** An image URL's path and its fragment: `#^id` a block, any other a heading. */
export function urlParts(url: string): { target: string; heading: string | null; block: string | null } {
  const hash = url.indexOf("#");
  const target = hash >= 0 ? url.slice(0, hash) : url;
  let frag = hash >= 0 ? url.slice(hash + 1) : "";
  try {
    frag = decodeURIComponent(frag);
  } catch {}
  return {
    target,
    heading: frag && !frag.startsWith("^") ? frag : null,
    block: frag.startsWith("^") ? frag.slice(1) : null,
  };
}

/** An embedded note's pictures (12.14): found from where it is, then drawn as the note showing it draws its own. */
export function embeddedPictures(
  picture: RenderOptions["picture"],
  locate: Embedded["locate"],
): RenderOptions["picture"] {
  if (!picture || !locate) return undefined;
  return (from, width, caption) => {
    const found = locate(from);
    return found ? picture(found, width, caption) : null;
  };
}

/**
 * A drawing slipbox makes as a picture (12.16, 12.17), centred: its first row holds the indent before it — where the
 * cursor stops, the lens opening on the block's source — the rest are the rows it's drawn over. Null where there's no
 * picture of it (pictures aren't drawn, it's wider than the text): then it's drawn in text.
 */
export function drawing(svg: string, kind: "diagram" | "math", src: number, ctx: Ctx, width: number): Line[] | null {
  const p = ctx.opts.picture?.({ svg, kind }, width - 1);
  if (!p) return null;
  const indent = Math.max(1, Math.floor((width - p.cols) / 2));
  return Array.from(
    { length: p.rows },
    (_, k): Line =>
      k === 0
        ? { spans: [{ text: " ".repeat(indent), role: "text", attrs: 0 }], src, image: p, pic: { p, row: 0 } }
        : { spans: [], src, decor: true, pic: { p, row: k } },
  );
}

/**
 * A diagram too wide for its room even drawn close together (12.10), drawn anyway to scroll sideways in the window
 * (`codeScroll`), as a code block too wide does: a column either side of it for the marks saying it goes on, and a row
 * under it for its scrollbar.
 */
export function scrollingDiagram(lines: Line[], src: number, width: number): Line[] {
  const total = Math.max(0, ...lines.map((l) => l.spans.reduce((w, s) => w + stringWidth(s.text), 0)));
  const scroll: CodeScroll = { x: 1, w: Math.max(1, width - 2), total };
  return [
    ...lines.map((l): Line => ({ ...l, spans: [{ text: " ", role: "text", attrs: 0 }, ...l.spans], scroll })),
    { spans: [], src, scroll: { ...scroll, part: "bar" } },
  ];
}

/** A diagram drawn in text (12.10), every row at its block's line: its lines in the table's border colour, its words
 *  as text. */
export function diagram(rows: string[], src: number, ascii: boolean): Line[] {
  const drawing = ascii ? ASCII_DRAWING : DRAWING;
  return rows.map((row) => {
    const spans: Span[] = [];
    for (const g of graphemes(sanitize(row))) {
      const role: Role = drawing.test(g) ? "table_border" : "text";
      const last = spans[spans.length - 1];
      if (last?.role === role) last.text += g;
      else spans.push({ text: g, role, attrs: 0 });
    }
    return { spans, src };
  });
}

/** A diagram's lines, arrows and node shapes: box drawing, arrows, geometric shapes — in ASCII, `+ - | < > ^`. */
const DRAWING = /^[\u2190-\u21ff\u2500-\u257f\u25a0-\u25ff]$/;

const ASCII_DRAWING = /^[+\-|<>^]$/;
