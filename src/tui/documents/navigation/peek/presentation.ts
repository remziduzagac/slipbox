// Peek titles and backlink Markdown over sanitized path labels.

import { dirname, relative } from "node:path";
import { ELSEWHERE, tildePath } from "../../../../core/workspace/vaults/names.ts";
import { sanitize } from "../../../../core/foundation/text/sanitize.ts";
import { linkSaid } from "../../../../core/workspace/vaults/symlinks.ts";
import { stringWidth, truncate, truncateStart } from "../../../../core/foundation/text/width.ts";
import type { BacklinksState, Peek } from "./contracts.ts";

/** What a peek shows of a file it doesn't read (VV-D6): the link, and that going there is where it's asked. */
export function notRead(b: { link: string; target: string | null }, label: string): string {
  return `**Not read here:** ${md(linkSaid(b.link, b.target))} isn't followed in ${md(label)}. \`o\` goes there, where opening it asks.\n`;
}

/**
 * A peek's title, `kestrel › docs/architecture.md` (`Elsewhere › /etc/hosts`), in `width` columns: short of room, its
 * path is cut from the front, so where it is and the file's name stay.
 */
export function peekTitle(
  p: Pick<Peek, "abs" | "label">,
  rel: string | null,
  width = Number.POSITIVE_INFINITY,
): string {
  const head = `${sanitize(p.label)} › `;
  const path = sanitize(rel ?? tildePath(p.abs));
  const room = width - stringWidth(head);
  if (stringWidth(path) <= room) return `${head}${path}`;
  if (room < 8) return truncate(`${head}${path}`, width);
  return `${head}${truncateStart(path, room)}`;
}

/** Text read as Markdown as it is: what would format it, or end a link's text, escaped. */
export function md(s: string): string {
  return s.replace(/[\\`*_[\]<>|~$]/g, "\\$&");
}

/** A file's name on one line: a control character in it — a newline — shown as its escape (`\n`, `\x1b`). */
export function visible(s: string): string {
  const named: Record<string, string> = { "\n": "\\n", "\r": "\\r", "\t": "\\t" };
  return s.replace(/[\x00-\x1f\x7f]/g, (c) => named[c] ?? `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

/**
 * A note's text and, under a rule, its backlinks: each a link to the line linking here, from the note's folder — a
 * link inside the peek like any. While they're worked out, or without them, a line saying so.
 */
export function withBacklinks(text: string, abs: string, label: string, state: BacklinksState): string {
  const end = text.endsWith("\n") ? "" : "\n";
  const said = (s: string) => `${text}${end}\n---\n\n**Linked from:** ${s}\n`;
  if (state === "reading") return said(`reading ${md(label)}'s index…`);
  if (state === "building")
    return said(`${md(label)} has no index here yet — building it; they're shown when it's done.`);
  if (state === "none") return said(`${md(label)} has no index here yet — \`o\` goes there, and finds them.`);
  if (!Array.isArray(state)) return said(`not worked out — ${md(visible(state.failed))}.`);
  if (!state.length) return said("no note links here.");
  const rows = state.map((b) => {
    // What would end the `<…>` or its line, or start a fragment, percent-encoded: a file's name can hold any of them.
    const href = relative(dirname(abs), b.from).replace(/[%#<>\x00-\x1f\x7f]/g, (c) => encodeURIComponent(c));
    return `- [${md(visible(b.shown))}:${b.line}](<${href}#L${b.line}>)${b.text ? ` — ${md(b.text)}` : ""}`;
  });
  return `${text}${end}\n---\n\n**Linked from** (${state.length}):\n\n${rows.join("\n")}\n`;
}

/** A note of Elsewhere's (VV-D3) and, under a rule, why it has no backlinks: Elsewhere has no index. */
export function withoutIndex(text: string): string {
  const end = text.endsWith("\n") ? "" : "\n";
  return `${text}${end}\n---\n\n**Linked from:** no backlinks in ${ELSEWHERE} — it has no index; a note in a vault or home has them.\n`;
}
