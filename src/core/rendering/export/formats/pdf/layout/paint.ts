// Laid-out lines painted into the shared document; pagination is supplied through its fit capability.
import { PRINT, TINT } from "../../../assets/style.ts";
import type { Box, Inline, Line, PageFit } from "../contracts.ts";
import { BODY, MARGIN } from "../settings.ts";
import type { PdfLines } from "./lines.ts";

export class PdfPainter {
  constructor(
    private readonly pdf: PDFKit.PDFDocument,
    private readonly layout: PdfLines,
    private readonly fit: PageFit,
  ) {}

  /** Lines set in `box` from the current position, a new page where the next won't fit (unless `keep`). */
  draw(lines: Line[], box: Box, o: { align?: "left" | "center" | "right"; gap?: number; keep?: boolean } = {}): void {
    const pdf = this.pdf;
    const gap = o.gap ?? 2.5;
    for (const l of lines) {
      if (!o.keep) this.fit.ensure(l.ascent + l.descent);
      const top = pdf.y;
      const baseline = top + l.ascent;
      let x =
        box.x + (o.align === "center" ? (box.width - l.width) / 2 : o.align === "right" ? box.width - l.width : 0);
      // Its spaces at its end, unseen.
      let last = l.atoms.length;
      while (last > 0 && l.atoms[last - 1]!.kind === "text" && (l.atoms[last - 1] as { space: boolean }).space) last--;
      // A link's area: one a line, across its words and the spaces between them.
      const areas: { link?: string; goTo?: string; x: number; width: number }[] = [];
      for (const a of l.atoms.slice(0, last)) {
        const [up, down] = a.kind === "text" ? [a.ascent, a.descent] : [a.height - a.drop, a.drop];
        const prev = areas.at(-1);
        if (
          (a.link || a.goTo) &&
          prev &&
          prev.link === a.link &&
          prev.goTo === a.goTo &&
          Math.abs(prev.x + prev.width - x) < 0.01
        )
          prev.width += a.width;
        else if (a.link || a.goTo) areas.push({ link: a.link, goTo: a.goTo, x, width: a.width });
        if (a.kind === "text") {
          if (a.mark)
            pdf
              .save()
              .rect(x, baseline - up, a.width, up + down)
              .fill(TINT.mark)
              .restore();
          if (a.tint)
            pdf
              .save()
              .roundedRect(x - 1, baseline - up, a.width + 2, up + down, 2)
              .fill(TINT.inline)
              .restore();
          // Spaces drawn too: what a reader copies, or searches, has its words apart.
          pdf
            .font(a.font)
            .fontSize(a.size ?? BODY)
            .fillColor(a.color ?? box.color ?? PRINT.fg);
          pdf.text(a.text, x, baseline, {
            lineBreak: false,
            underline: a.underline,
            baseline: "alphabetic",
          } as PDFKit.Mixins.TextOptions);
          if (a.strike)
            pdf
              .save()
              .moveTo(x, baseline - (a.size ?? BODY) * 0.3)
              .lineTo(x + a.width, baseline - (a.size ?? BODY) * 0.3)
              .lineWidth(0.6)
              .strokeColor(a.color ?? box.color ?? PRINT.fg)
              .stroke()
              .restore();
        } else pdf.image(a.data, x, baseline - up, { width: a.width, height: a.height });
        x += a.width;
      }
      for (const area of areas) {
        if (area.link) pdf.link(area.x, top, area.width, l.ascent + l.descent, area.link);
        if (area.goTo) pdf.goTo(area.x, top, area.width, l.ascent + l.descent, area.goTo);
      }
      pdf.y = top + l.ascent + l.descent + gap;
    }
    pdf.x = MARGIN.left;
  }

  /** Inline content set as one paragraph in `box`, wrapping, from the current position. */
  flow(
    content: Inline[],
    box: Box,
    o: { align?: "left" | "center" | "right"; size?: number; gap?: number; keep?: boolean } = {},
  ): void {
    this.draw(this.layout.lines(content, box.width, { size: o.size, color: box.color }), box, o);
  }
}
