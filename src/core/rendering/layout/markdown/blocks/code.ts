// Fenced/indented code rows, labels, source maps and sideways-scroll metadata.
import { expandTabs, sanitize } from "../../../../foundation/text/sanitize.ts";
import { stringWidth, truncate } from "../../../../foundation/text/width.ts";
import { highlight } from "../highlight.ts";
import type { CodeScroll, Line, Span } from "../../ir.ts";
import { type Ctx, breakHard } from "../render-context.ts";

/** `note`: why a block that's drawn elsewhere is its code here (a diagram too wide, a kind not drawn), after its
 *  language in the label. */
export function codeBlock(
  value: string,
  lang: string | null,
  src: number,
  ctx: Ctx,
  width: number,
  firstLine = 1,
  note?: string,
  originalLines?: number[],
): Line[] {
  const g = ctx.opts.glyphs;
  const code = sanitize(value);
  const sourceLines = code.split("\n").map((l) => expandTabs(l));
  const tokens = highlight(sourceLines.join("\n"), lang);
  const out: Line[] = [];
  const label = lang ? sanitize(note ? `${lang} — ${note}` : lang) : "";
  // Top padding row carries the language label, right-aligned.
  const top: Span[] = [];
  if (label) {
    // Cut with … when wider than the row, never left to the last defence's clip (lost text).
    const shown = truncate(label, Math.max(1, width - 1));
    const lw = stringWidth(shown) + 1;
    top.push(
      { text: " ".repeat(Math.max(0, width - lw)), role: "code_block", attrs: 0 },
      { text: `${shown} `, role: "code_label", attrs: 0 },
    );
  }
  const inner = Math.max(1, width - 2);
  // A line too long for the block: with `codeScroll`, every line kept whole, the block scrolling sideways in the
  // window — its label row and its last, where its scrollbar goes, staying put; else each long line wrapped.
  const widest = Math.max(0, ...sourceLines.map((l) => stringWidth(l)));
  const scroll: CodeScroll | undefined =
    ctx.opts.codeScroll && widest > inner ? { x: 1, w: inner, total: widest } : undefined;
  out.push({ spans: top, src, fill: "code_block", ...(scroll ? { scroll: { ...scroll, part: "top" } } : {}) });
  sourceLines.forEach((text, i) => {
    const lineSrc = originalLines?.[i] ?? src + firstLine + i;
    const spans: Span[] = tokens?.[i]?.length
      ? tokens[i]!.map((t) => ({ text: t.text, role: t.role ?? "code_block", attrs: 0, src: lineSrc }))
      : [{ text, role: "code_block", attrs: 0, src: lineSrc }];
    const gutter: Span = { text: " ", role: "code_gutter", attrs: 0 };
    if (scroll) {
      out.push({ spans: [gutter, ...spans], src: lineSrc, fill: "code_block", scroll });
      return;
    }
    // Hard wrap at the block width; continuation rows carry a marker in the gutter.
    breakHard(spans, inner).forEach((row, r) => {
      out.push({
        spans: [r === 0 ? gutter : { ...gutter, text: g.codeWrap.slice(0, 1) }, ...row],
        src: lineSrc,
        fill: "code_block",
      });
    });
  });
  out.push({
    spans: [],
    src: originalLines?.at(-1) ?? src + sourceLines.length + 1,
    fill: "code_block",
    ...(scroll ? { scroll: { ...scroll, part: "bar" } } : {}),
  });
  return out;
}
