// A first word that is not a command, looks like one mistyped, and names nothing on disk: the launcher stops and asks
// instead of opening a new note of that name (the screen takes any other word as a path).

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { newNoteName } from "../core/documents/model/new-note.ts";

/** Edit distance (insert, delete, substitute) between two short words. */
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length]!;
}

/**
 * The command a word was probably meant to be, or null. Only a bare word counts: one that exists as a path, has a `/`
 * or an extension, or is further than two edits from every command is a path to open. Ties go to the first listed.
 */
export function mistypedCommand(
  word: string,
  commands: Iterable<string>,
  exists: (path: string) => boolean = (p) => existsSync(resolve(p)),
): string | null {
  // The note it would open (`home` is `home.md`) counts as existing, as the screen reads it.
  if (word.includes("/") || word.includes(".") || exists(word) || exists(newNoteName(word))) return null;
  let best: string | null = null;
  let bestAt = 3;
  for (const c of commands) {
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
