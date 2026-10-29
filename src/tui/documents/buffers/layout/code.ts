// Code-layout cache lookup over the same buffer and source-layout method.

import type { Problem } from "../../../../core/documents/diagnostics/diagnostics.ts";
import type { Glyphs } from "../../../../core/rendering/theme/glyphs.ts";
import type { Layout } from "../../../../core/rendering/layout/ir.ts";
import { layoutCode } from "../../../../core/rendering/layout/code/code.ts";
import type { BufferLayoutContext } from "./contracts.ts";

export function codeLayout(
  ctx: BufferLayoutContext,
  width: number,
  wrap: boolean,
  glyphs: Glyphs,
  cells: "box" | "band" = "box",
  problems: readonly { line: number; severity: Problem["severity"] }[] = [],
): Layout {
  const marks = problems.map((p) => `${p.line}${p.severity[0]}`).join(",");
  const key = `code:${width}:${wrap ? 1 : 0}:${glyphs.mode}:${cells}:${[...ctx.buffer.codeOpen].join(",")}:${[...ctx.buffer.codeFolded].join(",")}:${marks}:${ctx.buffer.syntax?.version ?? -1}`;
  let l = ctx.layouts.get(key);
  if (!l) {
    const base = ctx.buffer.sourceLayout(1, false, glyphs);
    const spans = ctx.buffer.syntax?.spans;
    const fresh = ctx.buffer.syntax?.version === ctx.buffer.version;
    // Its comments' paths (16.10), drawn as links in their prose.
    const lines = ctx.buffer.lines();
    const paths = fresh
      ? (ctx.buffer.syntax?.links ?? []).flatMap((l) =>
          l.href ? [{ line: l.line, text: (lines[l.line - 1] ?? "").slice(l.from, l.to), target: l.href }] : [],
        )
      : [];
    l = layoutCode(ctx.buffer.source, base, fresh ? (ctx.buffer.syntax?.code ?? null) : null, {
      width,
      wrap,
      glyphs,
      open: ctx.buffer.codeOpen,
      folded: ctx.buffer.codeFolded,
      cells,
      problems,
      inside: (line) => !!spans?.get(line)?.length,
      paths,
      // Its headings as source mode's: the outline's definitions, not only its cells.
      ...(fresh && ctx.buffer.syntax ? { outline: ctx.buffer.syntax.outline } : {}),
    });
    if (ctx.layouts.size >= 6) ctx.layouts.delete(ctx.layouts.keys().next().value!);
    ctx.layouts.set(key, l);
  }
  return l;
}
