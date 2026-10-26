// Spelling in notes (plan 25.6): a note's prose checked word by word against Hunspell's dictionaries — English and
// Turkish come with slipbox; any other is yours (`[spell] dictionaries`), else the system's (/usr/share/hunspell…) —
// in the languages its front matter names (`lang: tr`), else `[spell] languages`. Its prose is its text: not its code,
// front matter, HTML or maths, nor a link's address, a wikilink, a tag, a URL, a path or an identifier. A word any of
// its languages knows is spelt right, and so is one of your own words (`z g` adds one, to slipbox's data folder).
// Hunspell (`hunspell.ts`) builds each dictionary once, on the spell checker's thread (`spell-thread.ts`, D232): building
// Turkish's takes a few tenths of a second, which keys would wait for on the main thread. A checker here asks it, and the
// answers come later.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Nodes, Root } from "mdast";
// The package exports only its index.js: its files by their path, so a compiled binary embeds them.
import enAff from "../../node_modules/dictionary-en/index.aff" with { type: "file" };
import enDic from "../../node_modules/dictionary-en/index.dic" with { type: "file" };
import trAff from "../../node_modules/dictionary-tr/index.aff" with { type: "file" };
import trDic from "../../node_modules/dictionary-tr/index.dic" with { type: "file" };
import { dataHome } from "./foundation/platform/paths.ts";

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

/** Where a test's hold on the thread is (`holdBuild`), by its number in shared memory: the thread and its caller
 *  both read these. */
export const HOLD_STATES = ["set", "waiting", "let go", "ran out", "spent"] as const;

/** A dictionary's two files, and whose they are. */
export interface DictionaryFiles {
  aff: string;
  dic: string;
  from: "yours" | "slipbox" | "system";
}

const BUNDLED: Record<string, { aff: string; dic: string }> = {
  en: { aff: enAff, dic: enDic },
  tr: { aff: trAff, dic: trDic },
};

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
export function dictionaryFiles(
  lang: string,
  yours: Record<string, string>,
  dirs = systemDictionaryDirs(),
  home = homedir(),
): DictionaryFiles | null {
  const { exact, base } = langNames(lang);
  for (const key of [lang, exact, base]) {
    const given = Object.hasOwn(yours, key) ? yours[key] : undefined;
    if (!given) continue;
    const path = given.startsWith("~/") ? join(home, given.slice(2)) : given;
    const stem = path.replace(/\.(dic|aff)$/i, "");
    if (existsSync(`${stem}.aff`) && existsSync(`${stem}.dic`))
      return { aff: `${stem}.aff`, dic: `${stem}.dic`, from: "yours" };
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
  const given =
    typeof lang === "string"
      ? lang.split(/[\s,]+/)
      : Array.isArray(lang)
        ? lang.filter((l): l is string => typeof l === "string")
        : [];
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
  if ((after === "." && /\p{L}/u.test(text[to + 1] ?? "")) || (before === "." && /\p{L}/u.test(text[from - 2] ?? "")))
    return false;
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

/**
 * A note's dictionaries as a checker asks them, answering later: for each word, whether any of them knows it; for one,
 * each dictionary's suggestions. The spell checker's thread's (`spell-thread.ts`), or a test's.
 */
export interface Dictionaries {
  check(words: string[]): Promise<boolean[]>;
  suggest(word: string): Promise<string[][]>;
}

/**
 * Words checked against a note's dictionaries (none: every word is right), which answer later: each word's answer kept,
 * as notes repeat their words, and each word asked once. A word not answered yet isn't misspelt until it is; whoever
 * draws hears of each answer (`onAnswer`) and asks again.
 */
export class Checker {
  private readonly known = new Map<string, boolean>();
  private readonly asking = new Set<string>();
  private readonly inFlight = new Set<Promise<void>>();
  /** Words the dictionaries didn't answer, and when: unknown — never marked, never taken as right — and asked again
   *  once `RETRY_MS` has passed, so a thread that keeps failing isn't asked at every frame. */
  private readonly unanswered = new Map<string, number>();
  static readonly RETRY_MS = 2_000;
  /** Answers had so far: a list made before the last came may be out of date. */
  answers = 0;
  /** Why the dictionaries didn't answer, the last time they didn't. */
  error: string | null = null;

  constructor(
    readonly dictionaries: Dictionaries | null,
    private readonly onAnswer: () => void = () => {},
    private readonly now: () => number = Date.now,
  ) {}

  /** Whether a word is spelt right; undefined until its answer has come. */
  correct(word: string): boolean | undefined {
    return this.known.get(word);
  }

  /** The words none of its dictionaries knows, of those answered; the rest asked (one unanswered, once it's due). */
  misspelt(words: SpellWord[]): SpellWord[] {
    const before = this.now() - Checker.RETRY_MS;
    this.ask(
      [...new Set(words.map((w) => w.word))].filter(
        (w) => !this.known.has(w) && !this.asking.has(w) && !((this.unanswered.get(w) ?? -Infinity) > before),
      ),
    );
    return words.filter((w) => this.known.get(w.word) === false);
  }

  /** Whether a word the dictionaries didn't answer is due to be asked again: a list made since may be out of date. */
  retryDue(): boolean {
    const before = this.now() - Checker.RETRY_MS;
    for (const at of this.unanswered.values()) if (at <= before) return true;
    return false;
  }

  /** Whether words are still waiting for their answers. */
  get pending(): boolean {
    return this.asking.size > 0;
  }

  /** Every answer asked for so far, come. */
  async settled(): Promise<void> {
    while (this.inFlight.size) await Promise.all(this.inFlight);
  }

  /** The words none of its dictionaries knows, once each is answered (the CLI's, which can wait). */
  async misspeltAll(words: SpellWord[]): Promise<SpellWord[]> {
    this.misspelt(words);
    await this.settled();
    return words.filter((w) => this.known.get(w.word) === false);
  }

  /**
   * A word added to the dictionaries: right from now on, and the others found misspelt asked again (adding `zorvex`
   * makes `Zorvex` right too) — each keeping its answer until the new one comes, so no mark goes and comes back.
   */
  added(word: string): void {
    this.known.set(word, true);
    this.ask([...this.known].filter(([w, ok]) => !ok && !this.asking.has(w)).map(([w]) => w));
  }

  private ask(words: string[]): void {
    if (!words.length) return;
    for (const w of words) {
      this.asking.add(w);
      this.unanswered.delete(w);
    }
    const answer = this.dictionaries
      ? this.dictionaries.check(words.map(asked))
      : Promise.resolve(words.map(() => true));
    const done: Promise<void> = answer
      .then(
        (oks) => {
          for (const [i, w] of words.entries()) this.known.set(w, oks[i] ?? true);
        },
        (err: unknown) => {
          // Unknown, not right: asked again a while later (a word's mark never decided by a thread's failure).
          this.error = (err as Error)?.message ?? String(err);
          const at = this.now();
          for (const w of words) if (!this.known.has(w)) this.unanswered.set(w, at);
        },
      )
      .finally(() => {
        for (const w of words) this.asking.delete(w);
        this.inFlight.delete(done);
        this.answers++;
        this.onAnswer();
      });
    this.inFlight.add(done);
  }

  /**
   * What a word might be instead: its dictionaries' suggestions in turn — each one's best, then each one's next — so
   * one language's many don't hide another's few; each once, ten at most.
   */
  async suggest(word: string): Promise<string[]> {
    const lists = this.dictionaries ? await this.dictionaries.suggest(asked(word)) : [];
    const out: string[] = [];
    for (let k = 0; k < Math.max(0, ...lists.map((l) => l.length)); k++)
      for (const l of lists) if (l[k] !== undefined && !out.includes(l[k]!)) out.push(l[k]!);
    return out.slice(0, 10);
  }
}
