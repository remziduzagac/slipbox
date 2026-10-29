// Word/link target boundaries and snippet context from the current buffer.

import { basename, dirname } from "node:path";
import type { App, View } from "../../../app/runtime/app.ts";
import type { SnippetContext } from "../../../../core/documents/editing/snippet.ts";
import { indentUnit } from "../../../../core/documents/editing/indent.ts";

export const WORD = /[\p{L}\p{N}_$]/u;

/** Where the word ending at `at` starts. */
export function wordStart(source: string, at: number): number {
  let i = at;
  while (i > 0 && WORD.test(source[i - 1]!)) i--;
  return i;
}

/** Inside a markdown link's target (`[text](do|`): where the target starts, else null. */
export function linkTargetStart(source: string, at: number): number | null {
  const line = source.slice(source.lastIndexOf("\n", at - 1) + 1, at);
  const m = /\]\(([^()\s<>]*)$/.exec(line);
  return m ? at - m[1]!.length : null;
}

/** Inside a wikilink's target (`[[Da|`, `![[pic`): where the target starts, else null. */
export function wikiTargetStart(source: string, at: number): number | null {
  const line = source.slice(source.lastIndexOf("\n", at - 1) + 1, at);
  const m = /\[\[([^\]|#[]*)$/.exec(line);
  return m ? at - m[1]!.length : null;
}

/** What a snippet (25.8) is expanded with here: the line's indentation, the file's unit, the file's variables. */
export function snippetContext(_app: App, view: View, at: number): SnippetContext {
  const buf = view.buf;
  const lineStart = buf.source.lastIndexOf("\n", at - 1) + 1;
  const lineEnd = buf.source.indexOf("\n", at);
  const line = buf.source.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
  const n = buf.source.slice(0, at).split("\n").length;
  return {
    indent: /^[ \t]*/.exec(line)![0],
    unit: indentUnit(buf.indent()),
    vars: {
      TM_FILENAME: basename(buf.abs),
      TM_FILENAME_BASE: basename(buf.abs).replace(/\.[^.]*$/, ""),
      TM_DIRECTORY: dirname(buf.abs),
      TM_FILEPATH: buf.abs,
      TM_LINE_INDEX: String(n - 1),
      TM_LINE_NUMBER: String(n),
      TM_CURRENT_LINE: line,
      TM_CURRENT_WORD: buf.source.slice(wordStart(buf.source, at), at),
      TM_SELECTED_TEXT: "",
    },
  };
}
