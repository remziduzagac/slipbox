// Counting words (the status line, note info): letters and digits in runs, apostrophes and hyphens
// inside a word kept; each Han or kana character a word of its own (those scripts don't space
// their words), as Obsidian counts them. Markup (`#`, `-`, `|`, `*`) is no word. A note's frontmatter isn't counted.

const WORD = /(?=[\p{L}\u30FC])[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}]|[\p{L}\p{N}](?:[\p{L}\p{N}_]|['’-](?=[\p{L}\p{N}]))*/gu;
const FRONTMATTER = /^(?:---|\+\+\+)\r?\n[\s\S]*?\r?\n(?:---|\+\+\+)\s*(?:\r?\n|$)/;

export function countWords(text: string, frontmatter = false): number {
  const body = frontmatter ? text.replace(FRONTMATTER, "") : text;
  let n = 0;
  for (const _ of body.matchAll(WORD)) n++;
  return n;
}
