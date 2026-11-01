import { afterAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UNIT_TIMEOUT_MS } from "../../../../support/timeouts.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);

const sandbox = mkdtempSync(join(tmpdir(), "slipbox-cold-diagram-"));
const root = join(import.meta.dir, "..", "..", "..", "..", "..");
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

// The same requests as the cold-load fixture: a diagram and its embedded diagram, through the real renderer.
const seed = `
  import { parseMarkdown } from "./src/core/documents/markdown/parse.ts";
  import { newRenderCache, renderTree } from "./src/core/rendering/layout/markdown/render.ts";
  import { glyphsFor } from "./src/core/rendering/theme/glyphs.ts";
  import { loadMermaid } from "./src/core/rendering/media/diagrams/diagrams.ts";
  const parsed = parseMarkdown("# D\\n\\n\`\`\`mermaid\\ngraph TD\\n  A[Write] --> B[Disk]\\n\`\`\`\\n");
  const inner = parseMarkdown("\`\`\`mermaid\\ngraph TD\\n  A --> B\\n\`\`\`\\n").tree.children;
  const opts = { width: 60, glyphs: glyphsFor("unicode"), showUrls: false };
  const first = renderTree(parsed.tree, opts, null, newRenderCache());
  const host = renderTree(parseMarkdown("![[inner]]\\n").tree,
    { ...opts, embed: () => ({ path: "/inner.md", title: "inner", nodes: inner }) }, null);
  await loadMermaid();
  console.log(JSON.stringify([first.pending ?? null, host.pending ?? null]));
`;

test("the cold diagram fixture stays cold with a warm startup cache across two runs", () => {
  const env = { ...process.env, XDG_CACHE_HOME: join(sandbox, "foreign-cache"), SLIPBOX_DIAGRAM_CACHE: "on" };
  const warm = () => {
    const result = Bun.spawnSync(["bun", "-e", seed], { cwd: root, env });
    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).toBe("");
    return JSON.parse(result.stdout.toString());
  };
  expect(warm()).toEqual([["mermaid"], ["mermaid"]]);
  expect(warm()).toEqual([null, null]);

  for (let run = 0; run < 2; run++) {
    const result = Bun.spawnSync(
      ["bun", "test", "tests/core/rendering/media/drawings.test.ts", "-t", "drawn while its library loads:"],
      {
        cwd: root,
        env,
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).toContain("1 pass");
    expect(result.stderr.toString()).toContain("0 fail");
  }
});
