// Export as PDF (plan 10.5): set on A4 with pdfkit (MIT), in fonts found on the machine (`fonts.ts`) and embedded, a
// character a font hasn't got taken from another that has. Lines are laid out here (10.11), not by pdfkit: words and
// pictures in a line together — a picture in a sentence, maths typeset on the baseline, an emoji in a font that has
// it — broken where Unicode lets a line break (linebreak, MIT), each run set on a common baseline. A chapter a note,
// each from a new page, its notes at its end; headings as the PDF's outline, each a destination the document's links
// go to; pictures at their size up to the text's width; code on a tint, coloured; tables drawn, their header again on a
// new page; quotes behind a bar, a callout's in its colour; the page's number at its foot.

import type { ExportSink } from "../spool.ts";
import type { ExportDoc } from "../assemble.ts";
import { findFonts, type Fonts } from "../assets/fonts.ts";
import { loadRasterizer } from "../../media/images/svg.ts";
import { convertPictures } from "../assets/convert.ts";
import { PdfWriter } from "./pdf/writing/writer.ts";
export { pdfDocument } from "./pdf/writing/document.ts";
export { splitByFont } from "./pdf/fonts/adapter.ts";
export { words } from "./pdf/layout/breaks.ts";

/** The document as a PDF's bytes. */
export async function toPdf(doc: ExportDoc, fonts: Fonts = findFonts(), sink?: ExportSink): Promise<Uint8Array> {
  const r = await loadRasterizer();
  // A PDF holds PNG and JPEG: a GIF, a BMP, a WebP made a PNG first.
  await convertPictures(doc, ["png", "jpg"], r);
  return new PdfWriter(doc, fonts, r, !!sink).write(sink);
}
