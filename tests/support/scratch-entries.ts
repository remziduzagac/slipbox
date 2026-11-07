// A scratch entry's `**When:**` line (D268): the time a capture was made, which a test can't fix from outside.

/** A `**When:**` line, its hard break or blank line after it. */
export const WHEN = /\*\*When:\*\* \d{4}-\d\d-\d\d \d\d:\d\d UTC[+-]\d\d:\d\d(?:\\\n|\n\n)/;

/** The text with each entry's `**When:**` line taken out: the rest, exactly. */
export const untimed = (t: string) => t.replace(new RegExp(WHEN.source, "g"), "");
