// The PDF document lifecycle: construct collaborators, attach output handlers, write chapters, end and await.
import type { ExportSink } from "../../../spool.ts";
import type { Rasterizer } from "../../../../media/images/svg.ts";
import type { ExportDoc } from "../../../assemble.ts";
import type { Fonts } from "../../../assets/fonts.ts";
import { pdfDocument } from "./document.ts";
import { PdfFonts } from "../fonts/adapter.ts";
import { PdfLines } from "../layout/lines.ts";
import { PdfPainter } from "../layout/paint.ts";
import { PdfPagination } from "../pages/pagination.ts";
import { PdfBlocks } from "./blocks.ts";

export class PdfWriter {
  private readonly pdf: PDFKit.PDFDocument;
  private readonly pages: PdfPagination;
  private readonly blocks: PdfBlocks;
  constructor(
    private readonly doc: ExportDoc,
    fonts: Fonts,
    r: Rasterizer | null,
    streaming = false,
  ) {
    this.pdf = pdfDocument(doc, !streaming);
    const adapted = new PdfFonts(this.pdf, fonts);
    const layout = new PdfLines(this.pdf, adapted, r);
    this.pages = new PdfPagination(this.pdf, streaming, (content, box, options) => painter.flow(content, box, options));
    const painter = new PdfPainter(this.pdf, layout, this.pages);
    this.blocks = new PdfBlocks(this.pdf, adapted, r, layout, painter, this.pages);
  }

  async write(sink?: ExportSink): Promise<Uint8Array> {
    const pdf = this.pdf;
    const chunks: Buffer[] = [];
    pdf.on("data", (c: Buffer) => {
      if (sink) sink(c);
      else chunks.push(c);
    });
    const done = new Promise<void>((resolve, reject) => {
      pdf.on("end", resolve);
      pdf.on("error", reject);
    });
    // Let the readable enter flowing mode before generating pages, so its output isn't queued until rendering ends.
    await new Promise<void>((resolve) => setImmediate(resolve));
    this.doc.chapters.forEach((ch, k) => {
      if (k > 0) this.pages.addPage();
      this.blocks.writeChapter(ch);
    });
    if (sink) this.pages.pageNumber(this.pages.page());
    else this.pages.pageNumbers();
    pdf.end();
    await done;
    return new Uint8Array(Buffer.concat(chunks));
  }
}
