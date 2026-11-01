import { beforeAll } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../src/core/application/config/config.ts";
import { formatFor } from "../../src/core/rendering/export/index.ts";
import { prepareExport } from "../../src/core/rendering/export/jobs.ts";
import { openGraph } from "../../src/core/workspace/graph/graph.ts";
import { loadRasterizer } from "../../src/core/rendering/media/images/svg.ts";
import { locateVault } from "../../src/core/workspace/vaults/vault.ts";
import { rect } from "./export-pictures.ts";
import { makeExportSandbox } from "./export-sandbox.ts";

export let png: Uint8Array;

/** Each export owner registers the original environment and picture initialization. */
export function makeExportFixture() {
  const sandbox = makeExportSandbox();

  beforeAll(async () => {
    png = (await loadRasterizer())!.png(rect(40, 20), 40)!;
  });

  /** A root of its own, holding `files`. */
  function root(files: Record<string, string | Uint8Array>) {
    const dir = mkdtempSync(join(sandbox, "root-"));
    mkdirSync(join(dir, ".slipbox"));
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), body);
    }
    return { dir, graph: openGraph(locateVault({ root: dir }), DEFAULT_CONFIG, false) };
  }

  /** A root's notes exported as `format` to `target` (from the root): the document, and what's beside it. */
  async function exportOf(
    r: ReturnType<typeof root>,
    rels: string[],
    format: string,
    target = `out.${formatFor(format)!.ext}`,
  ) {
    const abs = join(r.dir, target);
    const prepared = await prepareExport(r.graph, rels, format, abs);
    try {
      const data = readFileSync(join(prepared.dir, "document"));
      const files = prepared.manifest.files.map((file, i) => ({
        path: file.path,
        data: readFileSync(join(prepared.dir, `asset-${i}`)),
      }));
      return { data, files, abs, text: new TextDecoder().decode(data) };
    } finally {
      await prepared.dispose();
    }
  }

  return { sandbox, root, exportOf };
}
