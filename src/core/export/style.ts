// Export's look on paper (plan 10.x), one for every format: dark on white, GitHub's light colours — print's colours for
// what slipbox draws, a callout's by its kind, code's by the role highlighting gives a token — and the stylesheet the
// HTML and EPUB carry.

/** Print's colours for what slipbox draws: dark on white. */
export const PRINT = {
  bg: "#ffffff",
  fg: "#1f2328",
  line: "#57606a",
  accent: "#0969da",
  muted: "#57606a",
  math: "#1f2328",
};

/** A callout's colour on paper, by its kind: note's for a kind not here. */
export const CALLOUT_COLOURS: Record<string, string> = {
  note: "#0969da",
  info: "#0969da",
  tip: "#1a7f37",
  hint: "#1a7f37",
  success: "#1a7f37",
  check: "#1a7f37",
  done: "#1a7f37",
  important: "#8250df",
  abstract: "#8250df",
  summary: "#8250df",
  warning: "#9a6700",
  attention: "#9a6700",
  question: "#9a6700",
  caution: "#cf222e",
  danger: "#cf222e",
  error: "#cf222e",
  failure: "#cf222e",
  bug: "#cf222e",
};

export function calloutColour(kind: string): string {
  return CALLOUT_COLOURS[kind] ?? CALLOUT_COLOURS.note!;
}

/** Code's colours on paper, by the role highlighting gives a token. */
export const SYNTAX: Record<string, string> = {
  syn_keyword: "#cf222e",
  syn_string: "#0a3069",
  syn_regexp: "#0a3069",
  syn_comment: "#6e7781",
  syn_meta: "#6e7781",
  syn_function: "#8250df",
  syn_type: "#953800",
  syn_variable: "#953800",
  syn_number: "#0550ae",
  syn_constant: "#0550ae",
  syn_builtin: "#0550ae",
  syn_attr: "#0550ae",
  syn_section: "#0550ae",
  syn_tag: "#116329",
  syn_addition: "#116329",
  syn_deletion: "#cf222e",
};

/** Tints: code's and a table header's background, a rule's and a border's line, a highlight's marker (`==text==`). */
export const TINT = { code: "#f6f8fa", inline: "#eff1f3", border: "#d0d7de", link: "#0969da", mark: "#fff8c5" };

/** The stylesheet of an HTML export and an EPUB's chapters: print-friendly, a chapter a page when printed. */
export const CSS = `
:root { color-scheme: light; }
body { margin: 0; background: #ffffff; color: ${PRINT.fg}; font: 16px/1.6 -apple-system, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; }
main { max-width: 46rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
.chapter + .chapter { margin-top: 3rem; border-top: 1px solid ${TINT.border}; padding-top: 1rem; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.5em 0 0.5em; }
h1 { font-size: 2em; } h2 { font-size: 1.5em; } h3 { font-size: 1.25em; } h4 { font-size: 1em; }
h5 { font-size: 0.875em; } h6 { font-size: 0.85em; color: ${PRINT.muted}; }
a { color: ${TINT.link}; }
img { max-width: 100%; height: auto; }
.picture { display: block; margin: 0.5em auto; }
.math-display { text-align: center; margin: 1em 0; overflow-x: auto; }
.math-display img, .math-inline img { max-width: none; height: auto; }
pre { background: ${TINT.code}; padding: 0.75em 1em; border-radius: 6px; overflow-x: auto; line-height: 1.45; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "DejaVu Sans Mono", monospace; font-size: 0.875em; }
:not(pre) > code { background: ${TINT.inline}; padding: 0.15em 0.35em; border-radius: 4px; }
pre.math { background: none; text-align: center; }
blockquote { margin: 1em 0; padding: 0 1em; color: ${PRINT.muted}; border-left: 0.25em solid ${TINT.border}; }
blockquote.callout { color: ${PRINT.fg}; }
table { border-collapse: collapse; margin: 1em 0; display: block; overflow-x: auto; }
th, td { border: 1px solid ${TINT.border}; padding: 0.375em 0.8em; }
th { background: ${TINT.code}; }
hr { border: 0; border-top: 1px solid ${TINT.border}; margin: 1.5em 0; }
li.task { list-style: none; }
mark { background: ${TINT.mark}; color: inherit; padding: 0 0.1em; }
.footnotes { margin-top: 2em; font-size: 0.875em; color: ${PRINT.muted}; border-top: 1px solid ${TINT.border}; }
.footnotes-label { font-size: 1em; }
${Object.entries(SYNTAX)
  .map(([role, colour]) => `.${role} { color: ${colour}; }`)
  .join("\n")}
.syn_comment { font-style: italic; }
@media print {
  main { max-width: none; padding: 0; }
  .chapter + .chapter { break-before: page; border: 0; margin: 0; padding: 0; }
  pre, blockquote, table, img { break-inside: avoid; }
  a { color: inherit; }
}
`.trimStart();
