// Spelling in the TUI (plan 25.6): a note's misspelt words (`core/spell.ts`) where the window shows them — in source
// rows by their offsets, in rendered rows found in the prose's spans — so the marks, `] s` / `[ s`, `z =` and `z g`
// agree in every view: source, rendered and the lens.

import type { Layout, Line } from "../core/layout/ir.ts";
import type { SpellWord } from "../core/spell.ts";
import type { Role } from "../core/theme/theme.ts";
import { stringWidth } from "../core/width.ts";
import type { App, View } from "./app.ts";
import { cells } from "./cursor.ts";
import { cannotEdit } from "./editing.ts";

/** A misspelt word on screen: its row, first column and width, and the word. */
export interface Spot {
  row: number;
  col: number;
  width: number;
  word: SpellWord;
}

/** Rendered text that isn't prose: code, an address, a tag, maths, front matter. */
const NOT_PROSE = new Set<Role>(["code_inline", "code_block", "code_label", "code_gutter", "wikilink", "embed", "url", "tag", "html", "image", "math", "fm_key", "fm_value", "fm_border", "fm_error"]);

/** A letter, a mark or a digit: a word that goes on. */
const WORDISH = /[\p{L}\p{M}\p{N}_]/u;

/** Where a row shows its source line's misspelt words: by their offsets (a source row), else found in its prose spans. */
function rowSpots(line: Line, row: number, byLine: Map<number, SpellWord[]>): Spot[] {
  const out: Spot[] = [];
  if (line.decor) return out;
  if (line.srcMap) {
    const cs = cells(line);
    for (const w of byLine.get(line.src) ?? []) {
      const from = w.column - 1;
      const hit = cs.filter((k) => k.at! >= from && k.at! < from + w.word.length);
      if (hit.length) out.push({ row, col: hit[0]!.x, width: hit[hit.length - 1]!.x + hit[hit.length - 1]!.w - hit[0]!.x, word: w });
    }
    return out;
  }
  let x = 0;
  for (const span of line.spans) {
    const words = byLine.get(span.src ?? line.src);
    if (words && !NOT_PROSE.has(span.role) && !span.role.startsWith("syn_")) {
      // Each misspelt word of its line, wherever the span has it as a whole word.
      const seen = new Set<string>();
      for (const w of words) {
        if (seen.has(w.word)) continue;
        seen.add(w.word);
        for (let i = span.text.indexOf(w.word); i >= 0; i = span.text.indexOf(w.word, i + 1)) {
          if (WORDISH.test(span.text[i - 1] ?? "") || WORDISH.test(span.text[i + w.word.length] ?? "")) continue;
          out.push({ row, col: x + stringWidth(span.text.slice(0, i)), width: stringWidth(w.word), word: w });
        }
      }
    }
    x += stringWidth(span.text);
  }
  return out.sort((a, b) => a.col - b.col);
}

const spotCache = new WeakMap<Layout, { words: SpellWord[]; spots: Spot[] }>();

/** Every misspelt word a layout shows, in reading order. */
export function spellSpots(layout: Layout, words: SpellWord[]): Spot[] {
  const hit = spotCache.get(layout);
  if (hit?.words === words) return hit.spots;
  const byLine = new Map<number, SpellWord[]>();
  for (const w of words) byLine.set(w.line, [...(byLine.get(w.line) ?? []), w]);
  const spots = layout.lines.flatMap((line, row) => rowSpots(line, row, byLine));
  spotCache.set(layout, { words, spots });
  return spots;
}

/** The view's misspelt words where it shows them, or why there are none to go to. */
function spotsOf(app: App, view: View): Spot[] | string {
  if (view.buf.kind.group !== "note") return "spelling is a note's";
  if (!app.ui.spell) return "spelling is off — space u s turns it on";
  const words = app.misspelt(view);
  if (!words) return "spelling: its dictionaries are loading";
  return spellSpots(app.currentLayout(view), words);
}

/** `] s` / `[ s` (vim's): to the next misspelt word after the cursor, or the one before it, around the note's ends. */
export function spellStep(app: App, view: View, dir: 1 | -1): void {
  const spots = spotsOf(app, view);
  if (typeof spots === "string") return app.message("info", spots);
  if (!spots.length) return app.message("info", "no misspelt words here");
  const { row, col } = view.cur;
  const after = (s: Spot) => s.row > row || (s.row === row && s.col > col);
  const before = (s: Spot) => s.row < row || (s.row === row && s.col + s.width <= col);
  const next = dir === 1 ? (spots.find(after) ?? spots[0]!) : ([...spots].reverse().find(before) ?? spots[spots.length - 1]!);
  app.pushHistory(view);
  app.moveCursor(view, { row: next.row, col: next.col });
}

/** The misspelt word under the cursor, where the window shows it. */
function spotHere(app: App, view: View): Spot | string {
  const spots = spotsOf(app, view);
  if (typeof spots === "string") return spots;
  const { row, col } = view.cur;
  return spots.find((s) => s.row === row && col >= s.col && col < s.col + s.width) ?? "no misspelt word under the cursor";
}

/**
 * `z =` (vim's): the misspelt word under the cursor's suggestions, its dictionaries' in turn, and your words to add it
 * to; the one picked put in its place — one undo step, left unsaved.
 */
export function spellSuggest(app: App, view: View): void {
  const here = spotHere(app, view);
  if (typeof here === "string") return app.message("info", here);
  const why = cannotEdit(view);
  if (why) return app.message("warn", `${why} — not editing`);
  const w = here.word;
  const buf = view.buf;
  const version = buf.version;
  const suggestions = app.spellSuggestions(view, w.word);
  const ADD = Symbol("add");
  app.openList({
    title: `"${w.word}" — ${suggestions.length ? "enter puts one in" : "no suggestions"}`,
    items: [...suggestions.map((s) => ({ label: s, data: s })), { label: `add "${w.word}" to your words`, data: ADD }],
    accept: (item) => {
      if (item.data === ADD) return app.addSpellWord(w.word);
      // The text as it was asked of: a word changed since isn't this one any more.
      if (buf.version !== version || buf.source.slice(w.from, w.to) !== w.word) return app.message("warn", `"${w.word}" changed meanwhile — not replaced`);
      buf.edit(w.from, w.to - w.from, item.data as string);
    },
  });
}

/** `z g` (vim's): the misspelt word under the cursor added to your words, marked no more anywhere. */
export function spellAdd(app: App, view: View): void {
  const here = spotHere(app, view);
  if (typeof here === "string") return app.message("info", here);
  app.addSpellWord(here.word.word);
}
