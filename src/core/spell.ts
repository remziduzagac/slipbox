// Spelling in notes (plan 25.6): a note's prose checked word by word against Hunspell's dictionaries — English and
// Turkish come with slipbox; any other is yours (`[spell] dictionaries`), else the system's (/usr/share/hunspell…) —
// in the languages its front matter names (`lang: tr`), else `[spell] languages`. Its prose is its text: not its code,
// front matter, HTML or maths, nor a link's address, a wikilink, a tag, a URL, a path or an identifier. A word any of
// its languages knows is spelt right, and so is one of your own words (`z g` adds one, to slipbox's data folder).
// Hunspell runs as WebAssembly (hunspell-asm, MIT; Hunspell itself MPL-1.1, plan 14.6), loaded the first time a
// dictionary is, and each dictionary once.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { HunspellFactory } from "hunspell-asm";
// Its CommonJS build: the ES one imports Hunspell's runtime as a namespace, which a compiled binary can't call.
import { loadModule } from "hunspell-asm/dist/cjs/index.js";
import type { Nodes, Root } from "mdast";
// The package exports only its index.js: its files by their path, so a compiled binary embeds them.
import enAff from "../../node_modules/dictionary-en/index.aff" with { type: "file" };
import enDic from "../../node_modules/dictionary-en/index.dic" with { type: "file" };
import trAff from "../../node_modules/dictionary-tr/index.aff" with { type: "file" };
import trDic from "../../node_modules/dictionary-tr/index.dic" with { type: "file" };
import { dataHome } from "./paths.ts";

/** A word of a note's prose: where it is, by line and column (from 1, UTF-16) and by offset in the text. */
export interface SpellWord {
  word: string;
  line: number;
  column: number;
  from: number;
  to: number;
}

/** A dictionary: whether a word is in it, what it might be instead, and a word put in for the session. */
export interface Speller {
  correct(word: string): boolean;
  suggest(word: string): string[];
  add(word: string): void;
}

/** A dictionary's two files, and whose they are. */
export interface DictionaryFiles {
  aff: string;
  dic: string;
  from: "yours" | "slipbox" | "system";
}

const BUNDLED: Record<string, { aff: string; dic: string }> = { en: { aff: enAff, dic: enDic }, tr: { aff: trAff, dic: trDic } };

/** The languages slipbox brings a dictionary for. */
export const BUNDLED_LANGUAGES = Object.keys(BUNDLED);

/** Where systems keep Hunspell's dictionaries: Linux's, Homebrew's, macOS's. */
export function systemDictionaryDirs(home = homedir()): string[] {
  return [
    join(home, ".local/share/hunspell"),
    "/usr/share/hunspell",
    "/usr/share/myspell",
    "/usr/share/myspell/dicts",
    "/usr/local/share/hunspell",
    "/opt/homebrew/share/hunspell",
    join(home, "Library/Spelling"),
    "/Library/Spelling",
  ];
}

/** A language as Hunspell names its files: `tr-TR` → `tr_TR`; and its base, `tr`. */
function langNames(lang: string): { exact: string; base: string } {
  const exact = lang.trim().replace(/-/g, "_");
  return { exact, base: exact.split("_")[0]!.toLowerCase() };
}

/**
 * A language's dictionary: yours (`[spell] dictionaries`, by the language or its base: a path to the `.dic`, its
 * `.aff` beside it), else the system's for that very language (`tr_TR` for `tr-TR`), else slipbox's (English, Turkish),
 * else the system's first for its base (`de_DE` for `de`). Null where there's none.
 */
export function dictionaryFiles(lang: string, yours: Record<string, string>, dirs = systemDictionaryDirs(), home = homedir()): DictionaryFiles | null {
  const { exact, base } = langNames(lang);
  for (const key of [lang, exact, base]) {
    const given = Object.hasOwn(yours, key) ? yours[key] : undefined;
    if (!given) continue;
    const path = given.startsWith("~/") ? join(home, given.slice(2)) : given;
    const stem = path.replace(/\.(dic|aff)$/i, "");
    if (existsSync(`${stem}.aff`) && existsSync(`${stem}.dic`)) return { aff: `${stem}.aff`, dic: `${stem}.dic`, from: "yours" };
  }
  const inDirs = (name: (file: string) => boolean): DictionaryFiles | null => {
    for (const dir of dirs) {
      let files: string[];
      try {
        files = readdirSync(dir).sort();
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".aff") || !name(f.slice(0, -4))) continue;
        const stem = join(dir, f.slice(0, -4));
        if (existsSync(`${stem}.dic`)) return { aff: `${stem}.aff`, dic: `${stem}.dic`, from: "system" };
      }
    }
    return null;
  };
  if (exact.includes("_")) {
    const found = inDirs((n) => n.toLowerCase() === exact.toLowerCase());
    if (found) return found;
  }
  const bundled = BUNDLED[base];
  if (bundled) return { ...bundled, from: "slipbox" };
  return inDirs((n) => n.toLowerCase() === base || n.toLowerCase().startsWith(`${base}_`));
}

/**
 * A dictionary's text as UTF-8, as Hunspell is given it here: one in another encoding (`SET ISO8859-9`, as older
 * system dictionaries are) decoded, and said to be UTF-8.
 */
export function asUtf8(aff: Uint8Array, dic: Uint8Array): { aff: Uint8Array; dic: Uint8Array } {
  const head = new TextDecoder("latin1").decode(aff);
  const set = /^SET\s+(\S+)/m.exec(head)?.[1];
  if (!set || /^utf-?8$/i.test(set)) return { aff, dic };
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(set.replace(/^ISO(\d)/i, "ISO-$1").replace(/^microsoft-cp/i, "windows-"));
  } catch {
    return { aff, dic };
  }
  const enc = new TextEncoder();
  return { aff: enc.encode(decoder.decode(aff).replace(/^SET\s+\S+/m, "SET UTF-8")), dic: enc.encode(decoder.decode(dic)) };
}

let factory: Promise<HunspellFactory> | null = null;
let mounted = 0;

/** A dictionary opened: Hunspell loaded the first time, its files mounted, read, and let go; your words put in. */
export async function openSpeller(files: DictionaryFiles): Promise<Speller> {
  const f = await (factory ??= loadModule());
  const text = asUtf8(readFileSync(files.aff), readFileSync(files.dic));
  const n = ++mounted;
  const aff = f.mountBuffer(text.aff, `d${n}.aff`);
  const dic = f.mountBuffer(text.dic, `d${n}.dic`);
  const h = f.create(aff, dic);
  f.unmount(aff);
  f.unmount(dic);
  const s: Speller = { correct: (w) => h.spell(w), suggest: (w) => h.suggest(w), add: (w) => h.addWord(w) };
  for (const w of ownWords()) s.add(w);
  return s;
}

/** Your own words: one a line, in slipbox's data folder. */
export function ownWordsFile(): string {
  return join(dataHome(), "spell", "words.txt");
}

/** Your own words, as the file has them now (none where there's no file). */
export function ownWords(file = ownWordsFile()): string[] {
  try {
    return readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}

/** One of your own words added, at the file's end (made when there's none). */
export function addOwnWord(word: string, file = ownWordsFile()): void {
  mkdirSync(dirname(file), { recursive: true });
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {}
  appendFileSync(file, `${text && !text.endsWith("\n") ? "\n" : ""}${word}\n`);
}

/** The languages a note asks for: its front matter's `lang` (one, or a list), else `fallback`. */
export function noteLanguages(frontmatter: Record<string, unknown> | null | undefined, fallback: string[]): string[] {
  const lang = frontmatter?.lang;
  const given = typeof lang === "string" ? lang.split(/[\s,]+/) : Array.isArray(lang) ? lang.filter((l): l is string => typeof l === "string") : [];
  const out = given.map((l) => l.trim()).filter(Boolean);
  return out.length ? out : fallback;
}

/** An address the parse leaves as text (a pointer, `slipbox://…`; `file://…`): blanked out of a run first. */
const ADDRESS = /[a-z][a-z0-9+.-]*:\/\/\S+/giu;

/** A word: letters (and their marks), an apostrophe within (don't, Ankara'da). */
const WORD = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;

/** The offset each line starts at. */
function lineStarts(text: string): number[] {
  const out = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) out.push(i + 1);
  return out;
}

/**
 * Whether a word, as found, is one to check: two letters or more, not an abbreviation (`API`) or an identifier (`camelCase`),
 * and not part of something that isn't prose — beside a digit, an underscore or a slash (`x86`, `snake_case`, `src/core`),
 * or a name with dots (`file.ts`).
 */
function checkable(text: string, from: number, to: number): boolean {
  const w = text.slice(from, to);
  if ([...w].length < 2) return false;
  if (!/\p{Ll}/u.test(w) || /\p{Ll}\p{Lu}/u.test(w)) return false;
  const before = text[from - 1] ?? "";
  const after = text[to] ?? "";
  if (/[\p{N}_/\\]/u.test(before) || /[\p{N}_/\\]/u.test(after)) return false;
  if ((after === "." && /\p{L}/u.test(text[to + 1] ?? "")) || (before === "." && /\p{L}/u.test(text[from - 2] ?? ""))) return false;
  return true;
}

/**
 * A note's prose, word by word, from its parsed tree — its text nodes, by their lines and columns: code, maths, HTML,
 * front matter, a wikilink, a tag and a picture are nodes of their own, without any — and its text.
 */
export function proseWords(tree: Root, source: string): SpellWord[] {
  const starts = lineStarts(source);
  const offset = (p: { line: number; column: number }) => (starts[p.line - 1] ?? source.length) + p.column - 1;
  const out: SpellWord[] = [];
  const walk = (n: Nodes) => {
    // An autolink's text is its address (`<https://…>`, `<a@b.co>`, a bare `www.…`).
    if (n.type === "link" && n.children.length === 1 && n.children[0]!.type === "text") {
      const t = n.children[0]!.value;
      if ([t, `mailto:${t}`, `http://${t}`, `https://${t}`].includes(n.url)) return;
    }
    if (n.type === "text") {
      if (!n.position) return;
      const from = offset(n.position.start);
      const run = source.slice(from, offset(n.position.end)).replace(ADDRESS, (m) => " ".repeat(m.length));
      for (const m of run.matchAll(WORD)) {
        const a = from + m.index;
        const b = a + m[0].length;
        if (!checkable(source, a, b)) continue;
        let line = n.position.start.line;
        while (starts[line] !== undefined && starts[line]! <= a) line++;
        out.push({ word: m[0], line, column: a - starts[line - 1]! + 1, from: a, to: b });
      }
      return;
    }
    if ("children" in n) for (const c of n.children) walk(c as Nodes);
  };
  walk(tree);
  return out;
}

/** A word as a dictionary takes it: a typographic apostrophe a plain one. */
const asked = (word: string) => word.replace(/’/g, "'");

/** Words checked against a note's dictionaries: each word's answer kept, as notes repeat their words. */
export class Checker {
  private readonly known = new Map<string, boolean>();

  constructor(readonly spellers: Speller[]) {}

  correct(word: string): boolean {
    let ok = this.known.get(word);
    if (ok === undefined) {
      const w = asked(word);
      ok = !this.spellers.length || this.spellers.some((s) => s.correct(w));
      this.known.set(word, ok);
    }
    return ok;
  }

  /** The words none of its dictionaries knows. */
  misspelt(words: SpellWord[]): SpellWord[] {
    return words.filter((w) => !this.correct(w.word));
  }

  /**
   * What a word might be instead: its dictionaries' suggestions in turn — each one's best, then each one's next — so
   * one language's many don't hide another's few; each once, ten at most.
   */
  suggest(word: string): string[] {
    const lists = this.spellers.map((s) => s.suggest(asked(word)));
    const out: string[] = [];
    for (let k = 0; k < Math.max(0, ...lists.map((l) => l.length)); k++) for (const l of lists) if (l[k] !== undefined && !out.includes(l[k]!)) out.push(l[k]!);
    return out.slice(0, 10);
  }
}
