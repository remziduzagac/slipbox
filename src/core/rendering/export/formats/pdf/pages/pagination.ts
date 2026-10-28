// Page fitting, quote bars and footers, including decoration before streaming page release.
import { PRINT } from "../../../assets/style.ts";
import type { PdfFlow } from "../contracts.ts";
import { MARGIN } from "../settings.ts";

export class PdfPagination {
  private readonly bars: { colour: string; x: number; top: number }[] = [];

  constructor(
    private readonly pdf: PDFKit.PDFDocument,
    private readonly streaming: boolean,
    private readonly flow: PdfFlow,
  ) {}

  /** Finish decorations before the next page releases this one. Nested quotes each keep their own start. */
  addPage(): void {
    for (const bar of this.bars) {
      this.drawBar(bar, this.pdf.page.height - MARGIN.bottom);
      bar.top = MARGIN.top;
    }
    if (this.streaming) this.pageNumber(this.page());
    this.pdf.addPage();
  }

  private drawBar(bar: { colour: string; x: number; top: number }, bottom: number): void {
    if (bottom > bar.top)
      this.pdf
        .save()
        .moveTo(bar.x, bar.top)
        .lineTo(bar.x, bottom)
        .lineWidth(2.5)
        .strokeColor(bar.colour)
        .stroke()
        .restore();
  }

  /** Room for `h` points down the page, or a new page. */
  ensure(h: number): void {
    if (this.pdf.y + h > this.pdf.page.height - MARGIN.bottom) this.addPage();
  }

  /** The page being written: the last there is. */
  page(): number {
    const r = this.pdf.bufferedPageRange();
    return r.start + r.count - 1;
  }

  /** What `body` writes, with a bar down its left at `x`, page by page. */
  barred(colour: string, x: number, body: () => void): void {
    const pdf = this.pdf;
    if (this.streaming) {
      const bar = { colour, x, top: pdf.y };
      this.bars.push(bar);
      try {
        body();
        this.drawBar(bar, pdf.y - 4);
      } finally {
        this.bars.pop();
      }
      return;
    }
    const [startPage, startY] = [this.page(), pdf.y];
    body();
    const [endPage, endY] = [this.page(), pdf.y - 4];
    for (let p = startPage; p <= endPage; p++) {
      pdf.switchToPage(p);
      const top = p === startPage ? startY : MARGIN.top;
      const bottom = p === endPage ? endY : pdf.page.height - MARGIN.bottom;
      if (bottom > top)
        pdf.save().moveTo(x, top).lineTo(x, bottom).lineWidth(2.5).strokeColor(colour).stroke().restore();
    }
    pdf.switchToPage(endPage);
    pdf.y = endY + 4;
  }

  /** Each page's number at its foot, centred. */
  pageNumbers(): void {
    const pdf = this.pdf;
    const range = pdf.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      pdf.switchToPage(i);
      this.pageNumber(i);
    }
  }

  /** A page's footer before it's flushed, preserving the body cursor and margins. */
  pageNumber(i: number): void {
    const pdf = this.pdf;
    const x = pdf.x,
      y = pdf.y,
      bottom = pdf.page.margins.bottom;
    pdf.save();
    try {
      pdf.page.margins.bottom = 0;
      pdf.y = pdf.page.height - 44 - 8;
      this.flow(
        [{ text: String(i + 1), size: 8.5, color: PRINT.muted }],
        { x: MARGIN.left, width: pdf.page.width - MARGIN.left - MARGIN.right },
        { align: "center", size: 8.5, keep: true },
      );
    } finally {
      pdf.restore();
      pdf.page.margins.bottom = bottom;
      pdf.x = x;
      pdf.y = y;
    }
  }
}
