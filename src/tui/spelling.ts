// Spelling in the TUI (plan 25.6): a note's misspelt words (`core/documents/diagnostics/spell.ts`) where the window
// shows them — in source
// rows by their offsets, in rendered rows found in the prose's spans — so the marks, `] s` / `[ s`, `z =` and `z g`
// agree in every view: source, rendered and the lens. Its checkers (`app.speller`): a note's languages, a dictionary
// for each loaded in the background, the misspelt words of the text on screen, suggestions, your own words added.

import type { Layout, Line } from "../core/rendering/layout/ir.ts";
import type { SpellWord } from "../core/documents/diagnostics/spell.ts";
import type { Role } from "../core/rendering/theme/theme.ts";
import { stringWidth } from "../core/foundation/text/width.ts";
import type { App, View } from "./app.ts";
import { cells } from "./cursor.ts";
import { cannotEdit } from "./editing.ts";
import {
  type DictionaryFiles,
  Checker,
  noteLanguages,
  dictionaryFiles,
  proseWords,
  addOwnWord,
  ownWordsFile,
} from "../core/documents/diagnostics/spell.ts";
import type { NoteBuffer } from "./buffer.ts";
import { lazy, loadError } from "../core/foundation/platform/lazy.ts";
import { openDictionary, threadDictionaries, addToDictionaries } from "../core/documents/diagnostics/spell-thread.ts";

/** A misspelt word on screen: its row, first column and width, and the word. */
export interface Spot {
  row: number;
  col: number;
  width: number;
  word: SpellWord;
}

/** Rendered text that isn't prose: code, an address, a tag, maths, front matter. */
const NOT_PROSE = new Set<Role>([
  "code_inline",
  "code_block",
  "code_label",
  "code_gutter",
  "wikilink",
  "embed",
  "url",
  "tag",
  "html",
  "image",
  "math",
  "fm_key",
  "fm_value",
  "fm_border",
  "fm_error",
]);

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
      if (hit.length)
        out.push({ row, col: hit[0]!.x, width: hit[hit.length - 1]!.x + hit[hit.length - 1]!.w - hit[0]!.x, word: w });
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
  const words = app.speller.misspelt(view);
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
  const next =
    dir === 1 ? (spots.find(after) ?? spots[0]!) : ([...spots].reverse().find(before) ?? spots[spots.length - 1]!);
  app.history.push(view);
  app.moveCursor(view, { row: next.row, col: next.col });
}

/** The misspelt word under the cursor, where the window shows it. */
function spotHere(app: App, view: View): Spot | string {
  const spots = spotsOf(app, view);
  if (typeof spots === "string") return spots;
  const { row, col } = view.cur;
  return (
    spots.find((s) => s.row === row && col >= s.col && col < s.col + s.width) ?? "no misspelt word under the cursor"
  );
}

/**
 * `z =` (vim's): the misspelt word under the cursor's suggestions, its dictionaries' in turn, and your words to add it
 * to; the one picked put in its place — one undo step, left unsaved. The suggestions come from the spell checker's
 * thread; the keys after wait for them, as for any command that waits.
 */
export async function spellSuggest(app: App, view: View): Promise<void> {
  const here = spotHere(app, view);
  if (typeof here === "string") return app.message("info", here);
  const why = cannotEdit(view);
  if (why) return app.message("warn", `${why} — not editing`);
  const w = here.word;
  const buf = view.buf;
  const version = buf.version;
  let suggestions: string[];
  try {
    suggestions = await app.speller.suggestions(view, w.word);
  } catch (err) {
    return app.message("warn", `spelling: no suggestions for "${w.word}" — ${(err as Error).message}`);
  }
  if (app.view !== view) return; // its window closed meanwhile
  const ADD = Symbol("add");
  app.overlays.openList({
    title: `"${w.word}" — ${suggestions.length ? "enter puts one in" : "no suggestions"}`,
    items: [...suggestions.map((s) => ({ label: s, data: s })), { label: `add "${w.word}" to your words`, data: ADD }],
    accept: (item) => {
      if (item.data === ADD) return app.speller.addWord(w.word);
      // The text as it was asked of: a word changed since isn't this one any more.
      if (buf.version !== version || buf.source.slice(w.from, w.to) !== w.word)
        return app.message("warn", `"${w.word}" changed meanwhile — not replaced`);
      buf.edit(w.from, w.to - w.from, item.data as string);
    },
  });
}

/** `z g` (vim's): the misspelt word under the cursor added to your words, marked no more anywhere. */
export function spellAdd(app: App, view: View): void {
  const here = spotHere(app, view);
  if (typeof here === "string") return app.message("info", here);
  app.speller.addWord(here.word.word);
}

/** Spelling: checkers, misspelt words, suggestions. */
export class Speller {
  constructor(readonly app: App) {}

  /** The dictionaries' checkers by their languages (25.6): each once its dictionaries are loaded. */
  private readonly checkers = new Map<string, Checker>();
  /** Languages already said to have no dictionary, or one that wouldn't load: said once. */
  private readonly said = new Set<string>();
  /** Bumped when your words change: the words found misspelt before are found again. */
  private generation = 0;
  private memo: {
    buf: NoteBuffer;
    version: number;
    key: string;
    generation: number;
    answers: number;
    prose: SpellWord[];
    words: SpellWord[];
  } | null = null;

  /** A note's languages for spelling: its front matter's `lang`, else `[spell] languages`. */
  private languages(view: View): string[] {
    return noteLanguages(view.buf.parsed.frontmatter?.data, this.app.config.spell.languages);
  }

  /**
   * A checker for some languages (25.6): their dictionaries, once all have loaded — each built on the spell checker's
   * thread the first time (D232), the window drawn again when it's there; null until then. A language with no
   * dictionary is said once. The checker asks the thread about the words it hasn't had answered, and each answer draws
   * the window again.
   */
  private checker(langs: string[]): Checker | null {
    const key = langs.join(" ");
    const hit = this.checkers.get(key);
    if (hit) return hit;
    const dictionaries: DictionaryFiles[] = [];
    let waiting = false;
    for (const lang of langs) {
      const files = dictionaryFiles(lang, this.app.config.spell.dictionaries);
      const name = files ? `spell:${files.aff}` : "";
      const s = files ? lazy(name, () => openDictionary(files).then(() => files)) : null;
      if (s) dictionaries.push(s);
      else if (files && !loadError(name)) waiting = true;
      else if (!this.said.has(lang)) {
        this.said.add(lang);
        this.app.message(
          "warn",
          files
            ? `spelling: ${lang}'s dictionary didn't load (${loadError(name)})`
            : `spelling: no dictionary for ${lang} — [spell] dictionaries can name yours`,
        );
      }
    }
    if (waiting) return null;
    const c = new Checker(dictionaries.length ? threadDictionaries(dictionaries) : null, () => {
      if (c.error && !this.said.has(c.error)) {
        this.said.add(c.error);
        this.app.message("warn", `spelling: ${c.error}`);
      }
      this.app.host.requestRender();
    });
    this.checkers.set(key, c);
    return c;
  }

  /**
   * A note's misspelt words (25.6), in order, while spelling is on: its prose's words none of its languages' dictionaries
   * knows — null while they load, or for a file that isn't a note.
   */
  misspelt(view: View): SpellWord[] | null {
    if (!this.app.ui.spell || view.buf.kind.group !== "note") return null;
    const buf = view.buf;
    const langs = this.languages(view);
    const checker = this.checker(langs);
    if (!checker) return null;
    const key = langs.join(" ");
    const m = this.memo;
    const same = m?.buf === buf && m.version === buf.version;
    if (
      same &&
      m.key === key &&
      m.generation === this.generation &&
      m.answers === checker.answers &&
      !checker.retryDue()
    )
      return m.words;
    const prose = same ? m.prose : proseWords(buf.parsed.tree, buf.source);
    // The words answered so far: one the thread hasn't answered yet is marked when its answer comes.
    const words = checker.misspelt(prose);
    this.memo = {
      buf,
      version: buf.version,
      key,
      generation: this.generation,
      answers: checker.answers,
      prose,
      words,
    };
    return words;
  }

  /** Whether a note's words are still being checked (25.6): some not answered yet, so not marked yet. */
  pending(view: View): boolean {
    return !!this.checkers.get(this.languages(view).join(" "))?.pending;
  }

  /** What a word of the note might be instead: its languages' dictionaries' suggestions, asked of their thread. */
  async suggestions(view: View, word: string): Promise<string[]> {
    return (await this.checker(this.languages(view))?.suggest(word)) ?? [];
  }

  /** One of your words added (25.6): to your list, and to every dictionary loaded — marked no more anywhere. */
  addWord(word: string): void {
    try {
      addOwnWord(word);
    } catch (err) {
      return this.app.message("error", `couldn't add "${word}" to your words: ${(err as Error).message}`);
    }
    addToDictionaries(word);
    // Right from now on; the others found misspelt asked again, keeping their marks until they're answered.
    for (const c of this.checkers.values()) c.added(word);
    this.generation++;
    this.app.message("info", `"${word}" added to your words (${this.app.graph.shownPath(ownWordsFile())})`);
  }
}
