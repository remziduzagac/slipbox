// User regex execution stays on this worker; the owner can terminate a non-yielding matcher.
import {
  everyMatch,
  expandReplacement,
  findAll,
  MatchLimitError,
  type MatchLimits,
  nextLine,
  SHOWN_MATCHES,
  type TextMatch,
} from "../../documents/editing/replace.ts";
import type { RegexRequest } from "./regex-jobs.ts";
declare const self: Worker;

/** The first matches within `limits`, however many there would be. */
function first(text: string, re: RegExp, from: number, to: number, empty: boolean, limits: MatchLimits): TextMatch[] {
  try {
    return findAll(text, re, from, to, empty, limits);
  } catch (error) {
    if (!(error instanceof MatchLimitError)) throw error;
    return error.matches;
  }
}

self.onmessage = (event: MessageEvent<RegexRequest & { id: number }>) => {
  const request = event.data;
  try {
    const re = new RegExp(request.source, request.flags);
    if (request.kind === "confirm") {
      let { text, pos, end, lastEnd } = request;
      const edits: { from: number; length: number; text: string }[] = [];
      // The edits' size: bounded by the text's as a replace's matches are (`everyMatch`).
      const most = everyMatch(text.length).bytes!;
      let bytes = 0;
      while (pos <= end) {
        // The next match alone, with g or without (the first per line starts with the first): two at most, since an
        // empty one where the last replacement ended is passed over.
        const match = first(text, re, pos, end, true, { count: 2 }).find(
          (m) => !(m.from === m.to && m.from === lastEnd),
        );
        if (!match) break;
        let next = expandReplacement(request.replacement, match, true);
        if (request.eol !== "\n") next = next.replace(/\r?\n/g, request.eol);
        bytes += next.length * 2 + 48;
        if (bytes > most) throw new Error("the matches' captures outgrow the text; no replacement was made");
        edits.push({ from: match.from, length: match.to - match.from, text: next });
        text = text.slice(0, match.from) + next + text.slice(match.to);
        end += next.length - (match.to - match.from);
        if (match.to > match.from) lastEnd = match.from + next.length;
        pos = request.global
          ? match.from + next.length + (match.from === match.to ? 1 : 0)
          : nextLine(text, Math.max(match.from, match.from + next.length - 1));
      }
      self.postMessage({ id: request.id, edits });
    } else if (request.kind === "text") {
      let matches: TextMatch[];
      let limited = false;
      try {
        matches = findAll(request.text, re, request.from, request.to, request.empty, request.limits);
      } catch (error) {
        if (!(error instanceof MatchLimitError)) throw error;
        matches = error.matches;
        limited = true;
      }
      self.postMessage({ id: request.id, matches, limited });
    } else {
      const matches: { row: number; from: number; to: number }[] = [];
      let limited = false;
      for (const [row, text] of request.lines.entries()) {
        let found: TextMatch[];
        try {
          found = findAll(text, re, 0, text.length, false, {
            count: Math.max(0, SHOWN_MATCHES.count! - matches.length),
            bytes: SHOWN_MATCHES.bytes,
          });
        } catch (error) {
          if (!(error instanceof MatchLimitError)) throw error;
          found = error.matches;
          limited = true;
        }
        for (const match of found) matches.push({ row, from: match.from, to: match.to });
        if (limited) break;
      }
      self.postMessage({ id: request.id, matches, limited });
    }
  } catch (error) {
    self.postMessage({ id: request.id, error: (error as Error).message });
  }
};
