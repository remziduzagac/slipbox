// Original lightweight Markdown section recognition patterns.

export const FENCE = /^ {0,3}(`{3,}|~{3,})/;

export const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;

export const SETEXT = /^ {0,3}(?:=+|-{2,})[ \t]*$/;

/** A line a setext underline can't make a heading of: blank, a list item, a quote, a heading, a fence. */
export const NOT_PARAGRAPH =
  /^\s*$|^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)|^ {0,3}>|^ {0,3}#|^ {0,3}(?:`{3,}|~{3,})|^ {4}/;
