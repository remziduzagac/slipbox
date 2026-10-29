// Source-layout cache lookup and original format/heading/span selection.

import type { Glyphs } from "../../../../core/rendering/theme/glyphs.ts";
import type { Layout } from "../../../../core/rendering/layout/ir.ts";
import { layoutSource } from "../../../../core/rendering/layout/code/source.ts";
import { headingsOf, slugify } from "../../../../core/documents/markdown/parse.ts";
import { readerFor } from "../../../../core/documents/model/readers.ts";
import type { BufferLayoutContext } from "./contracts.ts";

export function sourceLayout(ctx: BufferLayoutContext, width: number, wrap: boolean, _glyphs: Glyphs): Layout {
  const key = `src:${width}:${wrap ? 1 : 0}`;
  let l = ctx.layouts.get(key);
  if (!l) {
    // With a parse of this very text at hand, its headings (the render's text and slugs);
    // otherwise the ATX lines the layout finds as it goes — so a keystroke, or an undo back to
    // the saved text, never re-parses the note (a 1 MB note would take a second).
    const parsed = ctx.parsedVersion === ctx.buffer.version && !ctx.buffer.dirty;
    // A note is coloured and its headings scanned by its format's reader (16.2); other files
    // are highlighted by their language, with no headings from the text (a `# comment` in a
    // shell script is no heading) — a source file's outline (16.8) stands in for them.
    const note = ctx.buffer.kind.group === "note" ? readerFor(ctx.buffer.kind.format) : null;
    // Tree-sitter's outline where it has one; else the language server's symbols (19.14).
    const outline = ctx.buffer.syntax?.outline.length ? ctx.buffer.syntax.outline : (ctx.buffer.serverOutline ?? []);
    const code = outline.map((o) => ({
      level: Math.min(6, o.depth + 1),
      text: o.name,
      slug: slugify(o.name),
      src: o.line,
    }));
    const fromParse = () =>
      headingsOf(ctx.buffer.parsed.tree).map(({ depth, text, slug, line, id }) => ({
        level: depth,
        text,
        slug,
        src: line,
        ...(id ? { id } : {}),
      }));
    const headings = !note
      ? code
      : parsed
        ? fromParse()
        : note.language === null
          ? "scan"
          : note.scanHeadings(ctx.buffer.source);
    const spans = ctx.buffer.syntax?.spans;
    const langs = ctx.buffer.syntax?.languages;
    l = layoutSource(
      ctx.buffer.source,
      {
        width,
        wrap,
        headings,
        language: note ? note.language : ctx.buffer.kind.format,
        tabWidth: ctx.buffer.indent().tabWidth,
        ...(spans ? { spans: (line: number) => spans.get(line) } : {}),
        ...(langs?.size ? { languageAt: (line: number) => langs.get(line) } : {}),
      },
      ctx.sourceCache,
    );
    if (ctx.layouts.size >= 6) ctx.layouts.delete(ctx.layouts.keys().next().value!);
    ctx.layouts.set(key, l);
  }
  return l;
}
