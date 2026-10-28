// PDFKit document construction retains the original A4, metadata, margins and buffering defaults.
import PDFDocument from "pdfkit";
import type { ExportDoc } from "../../../assemble.ts";
import { MARGIN } from "../settings.ts";

/** The PDF a document is written into: A4, its pages kept until the end (for their numbers), its title and author. */
export function pdfDocument(doc: ExportDoc, bufferPages = true): PDFKit.PDFDocument {
  return new PDFDocument({
    size: "A4",
    margins: MARGIN,
    // No default font loaded (Helvetica, which a compiled slipbox hasn't got): every run names its own.
    font: null as unknown as string,
    bufferPages,
    displayTitle: true,
    info: { Title: doc.title, ...(doc.author ? { Author: doc.author } : {}), Creator: "slipbox" },
    ...(doc.lang ? { lang: doc.lang } : {}),
  });
}
