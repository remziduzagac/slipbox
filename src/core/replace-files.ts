// Replace across files (plan 25.4): every match of a find, in the files named — a root's notes, and the text files the
// explorer shows (the TUI) or `--files` adds (the CLI) — replaced as a plan, the way a rename's is (7.2): each line it
// changes previewed before and after, carried out by `applyPlan` (nothing written when a file changed since), and
// logged, so `slipbox undo` and the TUI's `space v shift+u` take it back (7.4). The matching is find's (`replace.ts`).

import { readText } from "./fsutil.ts";
import type { Graph } from "./graph.ts";
import { dirtyTrees, type Edit, type FileChange, RenameError, type RenamePlan } from "./rename.ts";
import { compilePattern, expandReplacement, findAll, type PatternOptions, replaceMatches, type TextMatch } from "./replace.ts";

/** Plan replacing `query` with `replacement` in the files at `rels` (paths from the root): the ones it changes. */
export function planReplace(g: Graph, query: string, replacement: string, rels: string[], opts: PatternOptions): RenamePlan {
  if (!query) throw new RenameError("nothing to find: an empty pattern matches nothing");
  const re = compilePattern(query, opts);
  if (typeof re === "string") throw new RenameError(`not a regex: ${re}`);
  const files: FileChange[] = [];
  const skipped: RenamePlan["skipped"] = [];
  for (const rel of [...rels].sort()) {
    const abs = g.abs(rel);
    const shown = g.shownPath(abs);
    let d: ReturnType<typeof readText>;
    try {
      d = readText(abs);
    } catch {
      skipped.push({ shown, line: 1, reason: "can't be read" });
      continue;
    }
    // With regex, `^` and `$` insert, as `:s` and `slipbox replace` have them.
    const ms = findAll(d.text, re, 0, d.text.length, opts.regex);
    if (!ms.length) continue;
    // Written back, its invalid bytes would be U+FFFD.
    if (d.invalidUtf8) {
      skipped.push({ shown, line: lineEdits(d.text, ms, replacement, opts.regex)[0]!.line, reason: "not valid UTF-8: not rewritten" });
      continue;
    }
    const next = replaceMatches(d.text, ms, replacement, opts.regex).text;
    if (next === d.text) continue;
    files.push({ abs, shown, vault: null, edits: lineEdits(d.text, ms, replacement, opts.regex), text: d.text, next });
  }
  return { kind: "replace", from: query, to: replacement, move: null, files, warnings: dirtyTrees(files.map((f) => f.abs)), skipped };
}

/** Where the line holding `at` ends: its newline, or the text's end. */
const lineEnd = (text: string, at: number) => {
  const nl = text.indexOf("\n", at);
  return nl < 0 ? text.length : nl;
};

/**
 * The lines the matches change, each before and after (a CRLF's `\r` left out). The lines a match spans — one across
 * a line break, or one replaced by several — are one edit at the first of them, joined by `\n`, as are a line's
 * several matches.
 */
export function lineEdits(text: string, ms: TextMatch[], replacement: string, regex: boolean): Edit[] {
  const edits: Edit[] = [];
  const bare = (s: string) => s.replace(/\r(?=\n|$)/g, "");
  let line = 1;
  let counted = 0;
  for (let i = 0; i < ms.length; ) {
    const start = text.lastIndexOf("\n", ms[i]!.from - 1) + 1;
    for (let k = text.indexOf("\n", counted); k >= 0 && k < start; k = text.indexOf("\n", k + 1)) line++;
    counted = start;
    let end = lineEnd(text, ms[i]!.to);
    let after = "";
    let at = start;
    for (; i < ms.length && ms[i]!.from <= end; i++) {
      const m = ms[i]!;
      after += text.slice(at, m.from) + expandReplacement(replacement, m, regex);
      at = m.to;
      end = Math.max(end, lineEnd(text, m.to));
    }
    after += text.slice(at, end);
    const before = text.slice(start, end);
    if (before !== after) edits.push({ line, before: bare(before), after: bare(after) });
  }
  return edits;
}
