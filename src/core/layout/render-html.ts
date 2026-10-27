// Presentation shared by translated HTML blocks and inlines.
import type { HtmlPresentation } from "../documents/markdown/html-adapter.ts";
import { A_BOLD, A_ITALIC, A_STRIKE, A_UNDERLINE, type Line } from "./ir.ts";
import type { Style } from "./render-context.ts";
import { stringWidth } from "../foundation/text/width.ts";

export function htmlStyle(base: Style, presentation?: HtmlPresentation): Style {
  if (!presentation) return base;
  let attrs = base.attrs;
  let clear = base.clear ?? 0;
  for (const [value, flag] of [
    [presentation.bold, A_BOLD],
    [presentation.italic, A_ITALIC],
    [presentation.underline, A_UNDERLINE],
    [presentation.strike, A_STRIKE],
  ] as const)
    if (value !== undefined) {
      attrs = value ? attrs | flag : attrs & ~flag;
      clear = value ? clear & ~flag : clear | flag;
    }
  const role = presentation.mark ? "highlight" : presentation.code ? "code_inline" : base.role;
  return { role, attrs, pre: presentation.pre ?? base.pre, ...(clear ? { clear } : {}) };
}

export function alignHtml(rows: Line[], width: number, align?: HtmlPresentation["align"]): Line[] {
  if (!align) return rows;
  return rows.map((line) => {
    if (line.htmlAligned) return line;
    line = { ...line, htmlAligned: true };
    if (align === "left") return line;
    if (line.caption && !line.decor && line.spans.length >= 3) {
      const content = line.spans.slice(1, -1);
      const space = Math.max(0, width - 3 - content.reduce((n, s) => n + stringWidth(s.text), 0));
      const pad = align === "right" ? space : Math.floor(space / 2);
      const first = line.spans[0]!;
      const last = line.spans.at(-1)!;
      return {
        ...line,
        spans: [{ ...first, text: first.text + " ".repeat(pad) }, ...content, { ...last, text: last.text.slice(pad) }],
      };
    }
    const used = line.caption
      ? line.spans.reduce((n, s) => n + stringWidth(s.text), 0)
      : (line.image?.cols ?? line.pic?.p.cols ?? line.spans.reduce((n, s) => n + stringWidth(s.text), 0));
    const remaining = Math.max(0, width - used);
    const pad = align === "right" ? remaining : Math.floor(remaining / 2);
    if (!pad) return line;
    return { ...line, spans: [{ text: " ".repeat(pad), role: "text", attrs: 0 }, ...line.spans] };
  });
}
