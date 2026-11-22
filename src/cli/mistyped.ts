// A first word that is not a command, looks like one mistyped, and names nothing on disk: the launcher stops and asks
// instead of opening a new note of that name (the screen takes any other word as a path).

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { newNoteName } from "../core/documents/model/new-note.ts";

/** Edit distance between two short words: an insertion, a deletion, a substitution or a swap of two neighbours is one. */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  return d[a.length]![b.length]!;
}

/** The most edits a word may be from a command and still be taken for it: none under three letters, one up to six,
 *  two from seven (a short word is too often a note's name: `todo` and `undo`, `inbox` and `index`). */
function allowedEdits(word: string): number {
  return word.length < 3 ? 0 : word.length <= 6 ? 1 : 2;
}

/**
 * The command a word was probably meant to be, or null. Only a bare word counts: one that exists as a path, has a `/`
 * or a `.`, is further from every command than `allowedEdits`, or holds one (`tasks`) or sits in one (`install`) is a path to open. Ties go to the first listed.
 */
export function mistypedCommand(
  word: string,
  commands: Iterable<string>,
  exists: (path: string) => boolean = (p) => existsSync(resolve(p)),
): string | null {
  // The note it would open (`home` is `home.md`) counts as existing, as the screen reads it.
  if (word.includes("/") || word.includes(".") || exists(word) || exists(newNoteName(word))) return null;
  const most = allowedEdits(word);
  let best: string | null = null;
  let bestAt = most + 1;
  for (const c of commands) {
    // A word that holds a command, or sits in one, is a name of its own, not a slip: `tasks`, `folder`, `research`.
    if (word.includes(c) || c.includes(word)) continue;
    const d = distance(word, c);
    if (d < bestAt) {
      best = c;
      bestAt = d;
    }
  }
  return best;
}

/** The usage error for a mistyped command, naming the way to open a note of that name anyway. */
export function mistypedMessage(word: string, command: string): string {
  return (
    `slipbox: unknown command "${word}" — did you mean \`${command}\`? (\`slipbox help\` lists the commands; ` +
    `\`slipbox ./${word}\` opens a new note named ${word})\n`
  );
}
