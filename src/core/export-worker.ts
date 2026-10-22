// An export job's worker (10.x, `export/jobs.ts`): its graph, the assembly and the writer, here; the owner writes the
// output it hands back.
import { ExportSpool } from "./export/spool.ts";
import { streamExport } from "./export/stream.ts";
import { assemble } from "./export/assemble.ts";
import { formatFor } from "./export/index.ts";
import { exportGraph, type ExportRequest } from "./export/jobs.ts";
import { withExportReads } from "./export/reads.ts";

declare const self: Worker;
self.onmessage = async (event: MessageEvent<ExportRequest>) => {
  try {
    await withExportReads(async () => {
      const request = event.data;
      self.postMessage({ stage: "reading" });
      const graph = exportGraph(request);
      const format = formatFor(request.format);
      if (!format) throw Error("unknown export format");
      self.postMessage({ stage: "assembling" });
      const document = await assemble(graph, request.rels);
      self.postMessage({ stage: "writing" });
      if (request.spool) {
        const spool = new ExportSpool(request.spool);
        await streamExport(document, request.format, request.target, spool);
        self.postMessage({ prepared: spool.manifest });
      } else self.postMessage({ output: await format.write(document, request.target) });
    });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
self.postMessage({ ready: true });
