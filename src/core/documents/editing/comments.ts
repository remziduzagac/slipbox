// Comments toggled (plan 25.2), as vim-commentary does: lines all commented are uncommented, else every one is
// commented, its marker at the least indentation among them, so they line up. Blank lines are left alone. A language
// with line comments (`//`, `#`, `--`) gets its marker in front; one with only block comments (HTML's `<!-- -->`, CSS's
// `/* */`) has each line wrapped.

/** How a language comments a line: a marker in front of it, or a pair around it. */
export type CommentStyle = { line: string } | { open: string; close: string };

const LINE: Record<string, string> = {
  typescript: "//",
  javascript: "//",
  tsx: "//",
  go: "//",
  rust: "//",
  swift: "//",
  java: "//",
  c: "//",
  cpp: "//",
  scss: "//",
  php: "//",
  python: "#",
  bash: "#",
  ruby: "#",
  yaml: "#",
  toml: "#",
  ini: "#",
  makefile: "#",
  dockerfile: "#",
  lua: "--",
  sql: "--",
  vim: '"',
};

const BLOCK: Record<string, [string, string]> = {
  css: ["/*", "*/"],
  xml: ["<!--", "-->"],
  html: ["<!--", "-->"],
  markdown: ["<!--", "-->"],
  vue: ["<!--", "-->"],
  svelte: ["<!--", "-->"],
  astro: ["<!--", "-->"],
};

/** A language's comments, by its name (a format, or a part's language: a component's script, its style); null for
 *  one with none (JSON, CSV, a diff). */
export function commentStyle(language: string): CommentStyle | null {
  const line = LINE[language];
  if (line) return { line };
  const block = BLOCK[language];
  return block ? { open: block[0], close: block[1] } : null;
}

const lead = (line: string) => /^[ \t]*/.exec(line)![0];

/** Whether a line is commented in a style: its marker after its indentation, or wrapped in the pair. */
function commented(line: string, s: CommentStyle): boolean {
  const t = line.trim();
  return "line" in s
    ? t.startsWith(s.line)
    : t.startsWith(s.open) && t.endsWith(s.close) && t.length >= s.open.length + s.close.length;
}

/**
 * `lines` with their comments toggled: all the non-blank ones commented — their markers taken away, with the space
 * after one — else each commented at the least indentation among them. Null where there's nothing to toggle.
 */
export function toggleComments(lines: string[], s: CommentStyle): string[] | null {
  const solid = lines.filter((l) => l.trim());
  if (!solid.length) return null;
  if (solid.every((l) => commented(l, s))) {
    return lines.map((l) => {
      if (!l.trim()) return l;
      const ind = lead(l);
      let body = l.slice(ind.length);
      if ("line" in s) body = body.slice(s.line.length).replace(/^ /, "");
      else
        body = body
          .slice(s.open.length, body.length - s.close.length)
          .replace(/^ /, "")
          .replace(/ $/, "");
      return ind + body;
    });
  }
  // At the least indentation: where the shallowest line starts (a tab counted as one character, as written).
  const least = Math.min(...solid.map((l) => lead(l).length));
  return lines.map((l) => {
    if (!l.trim()) return l;
    const ind = l.slice(0, least);
    const body = l.slice(least);
    return "line" in s ? `${ind}${s.line} ${body}` : `${ind}${s.open} ${body} ${s.close}`;
  });
}
