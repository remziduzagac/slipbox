// Link-like tokens in text and comments, with the original UTF-16 source positions.
import type { Comment, CommentLink } from "../contracts.ts";

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/g;

/** A path with an extension (a letter first: `1.5` isn't one), maybe `:line` or `:line:col` after; `../` as
 *  many times as it climbs. */
const PATH_RE =
  /(?<![\w./@~-])(?:\.\/|(?:\.\.\/)+|\/)?[\w@~-][\w.@~-]*(?:\/[\w.@~-]+)*\.[A-Za-z][A-Za-z0-9]{0,9}(?::(\d+)(?::\d+)?)?(?![\w/])/g;

/**
 * Link-like tokens in a text (16.10): URLs, and paths with an extension, `path:42` included. Which
 * paths are links is the caller's to say — the ones that name a file of the root.
 */
export function linkTokens(
  text: string,
): { index: number; length: number; target: string; url: boolean; at: number | null }[] {
  const out: { index: number; length: number; target: string; url: boolean; at: number | null }[] = [];
  let masked = text;
  for (const m of text.matchAll(URL_RE)) {
    // Trailing punctuation is the sentence's; a `)` is the URL's only when it opened one.
    let u = m[0].replace(/[.,;:!?'"]+$/, "");
    while (u.endsWith(")") && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0))
      u = u.slice(0, -1).replace(/[.,;:!?]+$/, "");
    out.push({ index: m.index, length: u.length, target: u, url: true, at: null });
    masked = masked.slice(0, m.index) + " ".repeat(m[0].length) + masked.slice(m.index + m[0].length);
  }
  for (const m of masked.matchAll(PATH_RE)) {
    const tok = m[0].replace(/\.+$/, "");
    const target = m[1] ? tok.slice(0, tok.indexOf(":")) : tok;
    out.push({ index: m.index, length: tok.length, target, url: false, at: m[1] ? Number(m[1]) : null });
  }
  return out.sort((x, y) => x.index - y.index);
}

/** The link-like tokens in a file's comments, placed by line and column. */
export function commentLinks(comments: Comment[]): CommentLink[] {
  const out: CommentLink[] = [];
  for (const c of comments) {
    c.text.split("\n").forEach((text, i) => {
      const base = i === 0 ? c.column : 0;
      for (const t of linkTokens(text))
        out.push({
          line: c.line + i,
          from: base + t.index,
          to: base + t.index + t.length,
          target: t.target,
          url: t.url,
          at: t.at,
        });
    });
  }
  return out;
}
