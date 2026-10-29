// Writer output flows straight to a private spool. Format libraries and the assembled tree still own their inputs.
import type { ExportDoc } from "./assemble.ts";
import type { ExportSpool } from "./spool.ts";

export { utf8 } from "./encoding.ts";

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
