// Document find matches and pending regex results, independent of workspace search composition.

import { layoutMatches } from "../../../core/workspace/search/regex-jobs.ts";
import { compilePattern, findAll } from "../../../core/documents/editing/replace.ts";
import type { Layout } from "../../../core/rendering/layout/ir.ts";
import type { FindState } from "../../app/runtime/app.ts";
import { stringWidth, prefixWidths } from "../../../core/foundation/text/width.ts";

const findReady = new WeakMap<FindState, Promise<FindState>>();

export function computeFind(
  layout: Layout,
  query: string,
  current = 0,
  whole = false,
  regex = false,
  ignoreCase = false,
  owner: object = layout,
): FindState {
  const matches: FindState["matches"] = [];
  let error: string | undefined;
  if (query) {
    const re = compilePattern(query, { regex, whole, ignoreCase });
    if (typeof re === "string") error = re;
    else if (regex) {
      const lines = layout.lines.map((line) => (line.decor ? "" : line.spans.map((span) => span.text).join("")));
      const entry = layoutMatches(lines, re, owner);
      const finish = (): FindState => {
        if (!entry.value)
          return {
            query,
            matches: [],
            current: 0,
            whole,
            regex,
            error: entry.error ?? "search cancelled",
            failed: true,
          };
        const columns = new Map<number, number[]>();
        const offsets = new Map<number, number[]>();
        for (const match of entry.value.matches) {
          const row = offsets.get(match.row) ?? [];
          row.push(match.from);
          offsets.set(match.row, row);
        }
        for (const [row, starts] of offsets) columns.set(row, prefixWidths(lines[row]!, starts));
        const indices = new Map<number, number>();
        const matches = entry.value.matches.map((match) => {
          const index = indices.get(match.row) ?? 0;
          indices.set(match.row, index + 1);
          return {
            row: match.row,
            col: columns.get(match.row)![index]!,
            len: stringWidth(lines[match.row]!.slice(match.from, match.to)),
          };
        });
        return {
          query,
          matches,
          current: Math.min(current, Math.max(0, matches.length - 1)),
          whole,
          regex,
          limited: entry.value.limited,
        };
      };
      if (entry.value || entry.error || entry.abort.signal.aborted) return finish();
      const pending: FindState = { query, matches: [], current: 0, whole, regex, pending: true };
      findReady.set(pending, entry.pending.then(finish));
      return pending;
    } else {
      // Plain text, worked out at once: every match, as many as there are (n reaches the last).
      layout.lines.forEach((line, row) => {
        if (line.decor) return; // the lens's rules aren't the note's text
        const text = line.spans.map((span) => span.text).join("");
        for (const match of findAll(text, re))
          matches.push({
            row,
            col: stringWidth(text.slice(0, match.from)),
            len: stringWidth(text.slice(match.from, match.to)),
          });
      });
    }
  }
  return {
    query,
    matches,
    current: Math.min(current, Math.max(0, matches.length - 1)),
    whole,
    regex,
    error,
  };
}

export async function computeFindReady(...args: Parameters<typeof computeFind>): Promise<FindState> {
  const state = computeFind(...args);
  return (await findReady.get(state)) ?? state;
}
