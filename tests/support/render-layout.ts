import { readdirSync } from "node:fs";
import { join } from "node:path";
import { glyphsFor } from "../../src/core/rendering/theme/glyphs.ts";
import { renderMarkdown } from "../../src/core/rendering/layout/markdown/render.ts";
import type { Layout } from "../../src/core/rendering/layout/ir.ts";
import { loadMermaid } from "../../src/core/rendering/media/diagrams/diagrams.ts";

// The demo vault's notes, by path inside it.
export const SAMPLES = join(import.meta.dir, "../..", "examples", "vault");
export const samples = (readdirSync(SAMPLES, { recursive: true }) as string[]).filter((f) => f.endsWith(".md")).sort();
export const unicode = glyphsFor("unicode");
export async function renderReady(...args: Parameters<typeof renderMarkdown>): Promise<Layout> {
  renderMarkdown(...args);
  await loadMermaid();
  return renderMarkdown(...args);
}

export const text = (l: Layout) =>
  l.lines
    .map((line) =>
      line.spans
        .map((s) => s.text)
        .join("")
        .replace(/\s+$/, ""),
    )
    .join("\n");
