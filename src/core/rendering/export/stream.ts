// Writer output flows straight to a private spool. Format libraries and the assembled tree still own their inputs.
import type { ExportDoc } from "./assemble.ts";
import { EXPORT_CHUNK, type ExportSink, type ExportSpool } from "./spool.ts";

/** Encode in fixed-size windows, keeping surrogate pairs together across a window boundary. */
export function utf8(text: string, sink: ExportSink): void {
  const encoder = new TextEncoder();
  const buffer = new Uint8Array(EXPORT_CHUNK);
  for (let at = 0; at < text.length; ) {
    // Three bytes per UTF-16 code unit is the maximum; encodeInto never splits a code point.
    const end = Math.min(text.length, at + Math.floor(EXPORT_CHUNK / 3));
    const high = text.charCodeAt(end - 1);
    const until = end < text.length && high >= 0xd800 && high <= 0xdbff ? end - 1 : end;
    const { read, written } = encoder.encodeInto(text.slice(at, until), buffer);
    if (!read) throw Error("export text encoding made no progress");
    sink(buffer.subarray(0, written));
    at += read;
  }
}

export async function streamExport(doc: ExportDoc, format: string, target: string, spool: ExportSpool): Promise<void> {
  if (format === "md") {
    await (await import("./formats/markdown.ts")).toMarkdown(doc, target, spool);
    return;
  }
  await spool.document(async (sink) => {
    switch (format) {
      case "pdf":
        await (await import("./formats/pdf.ts")).toPdf(doc, undefined, sink);
        break;
      case "html":
        await (await import("./formats/html.ts")).toHtml(doc, sink);
        break;
      case "epub":
        await (await import("./formats/epub.ts")).toEpub(doc, sink);
        break;
      // docx's public toStream buffers the whole archive too. Keep that encoder cost confined to the worker;
      // do not clone its output into the owner or use a private compiler API to bypass it.
      case "docx":
        sink(await (await import("./formats/docx.ts")).toDocx(doc));
        break;
      default:
        throw Error("unknown export format");
    }
  });
}
