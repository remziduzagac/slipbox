// Original source normalization before Markdown parsing.

/**
 * Inputs the markdown parser takes quadratic time over, made harmless without moving a single
 * offset (positions are what editing uses) and without changing what an ordinary note means:
 *
 * - a run of 64+ `*` `_` `[` `]` on a line that has other text too (`***…x***…`) becomes as many
 *   look-alikes — a line that is only rule characters (a rule, a setext underline) is left alone;
 * - a container prefix of 20+ real quote or list markers (`> - > - …`), or 96+ columns of
 *   indentation before a list marker: one no-break space where the cap falls ends the containers.
 *
 * Code blocks and frontmatter are never touched. Only the rendered view sees a difference, and only
 * in notes built to be pathological; source mode shows the file's own text.
 */
export function tame(source: string): string {
  if (
    !/([*_[\]])\1{63}/.test(source) &&
    !/^(?:[ \t]*(?:>|[-*+]|\d{1,9}[.)])[ \t]+){20}|^[ \t]{96,}(?:[-*+]|\d{1,9}[.)])[ \t]/m.test(source)
  )
    return source;
  const like: Record<string, string> = { "*": "∗", _: "‗", "[": "［", "]": "］" };
  const lines = source.split("\n");
  let fence: string | null = null;
  let front = lines[0] === "---";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (front) {
      if (i > 0 && /^(---|\.\.\.)\s*$/.test(line)) front = false;
      continue;
    }
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length) fence = null;
      continue;
    }
    if (f) {
      fence = f[1]!;
      continue;
    }
    let out = line;
    if (/([*_[\]])\1{63}/.test(out) && !/^\s*[-*_=\s]+$/.test(out))
      out = out.replace(/([*_[\]])\1{63,}/g, (run) => like[run[0]!]!.repeat(run.length));
    const deep =
      /^(?:[ \t]*(?:>|[-*+]|\d{1,9}[.)])[ \t]+){20}/.exec(out) ??
      /^[ \t]{96}/.exec(/^[ \t]{96,}(?:[-*+]|\d{1,9}[.)])[ \t]/.test(out) ? out : "");
    // One no-break space where the cap falls ends the containers there: what follows is text (its
    // spaces still wrap), not 5,000 more levels.
    if (deep && deep[0].length < out.length)
      out = `${out.slice(0, deep[0].length)}\u00a0${out.slice(deep[0].length + 1)}`;
    lines[i] = out;
  }
  return lines.join("\n");
}
