// The CLI's reading commands: a note's outline (its headings, a data file's sections, code's definitions), its
// text and sha, the notes and files listed, text found in them, and a note's misspelt words (25.6).

import { grammar, grammarFor, parseSyntax } from "../core/syntax.ts";
import { loadError } from "../core/foundation/platform/lazy.ts";
import { statSync } from "node:fs";
import { headingsOf, parseMarkdown } from "../core/parse.ts";
import {
  addOwnWord,
  Checker,
  type DictionaryFiles,
  dictionaryFiles,
  noteLanguages,
  ownWordsFile,
  proseWords,
} from "../core/spell.ts";
import { addToDictionaries, openDictionary, threadDictionaries } from "../core/spell-thread.ts";
import { dataOutline } from "../core/data.ts";
import { classify, extensionOf } from "../core/filetypes.ts";
import { readText } from "../core/foundation/platform/fsutil.ts";
import { matchText } from "../core/regex-jobs.ts";
import { flag, has, UsageError } from "./args.ts";
import {
  EXIT,
  CliError,
  parseFile,
  textFiles,
  type Handler,
  requireArg,
  resolveNote,
  around,
  pattern,
  lineStarts,
  lineAt,
  readNoteFile,
} from "./common.ts";

/** A note read: its outline, its text, the notes listed, a word found, its spelling. */
export const READING_COMMANDS: Record<string, Handler> = {
  async outline(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"));
    // Source code's outline is its definitions, from its grammar (16.8), each with its kind.
    const kind = classify(rel, s.config.walk.extensions);
    const g = kind.group === "text" ? grammarFor(kind.format, extensionOf(rel)) : null;
    if (g) {
      const loaded = await grammar(g);
      const tree = loaded ? parseSyntax(loaded, readText(s.graph.abs(rel)).text) : null;
      if (!tree)
        throw new CliError(
          `couldn't load the ${g} grammar${loadError(`grammar:${g}`) ? ` — ${loadError(`grammar:${g}`)}` : ""}`,
          EXIT.error,
        );
      const defs = tree.outline().map((d) => ({ depth: d.depth + 1, text: d.name, kind: d.kind, line: d.line }));
      tree.delete();
      return {
        data: { path: rel, headings: defs },
        // The kind before the name, unless the name says it already (Rust's `impl Trait for T`).
        human: defs
          .map(
            (d) =>
              `${String(d.line).padStart(5)}  ${"  ".repeat(d.depth - 1)}${d.text.startsWith(`${d.kind} `) ? "" : `${d.kind} `}${d.text}\n`,
          )
          .join(""),
      };
    }
    // A data file's sections are its outline (16.11); other text files have none.
    const hs =
      s.graph.entry(rel)?.headings ??
      (kind.group === "data" ? dataOutline : headingsOf)(parseFile(s, rel, readText(s.graph.abs(rel)).text).tree);
    return {
      data: { path: rel, headings: hs },
      human: hs
        .map((h) => `${String(h.line).padStart(5)}  ${"  ".repeat(h.depth - 1)}${"#".repeat(h.depth)} ${h.text}\n`)
        .join(""),
    };
  },

  read(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"), false);
    const abs = s.graph.abs(rel);
    const file = readNoteFile(s, abs, false);
    return {
      data: {
        path: rel,
        abs,
        sha: file.sha,
        bom: file.bom,
        crlf: file.crlf,
        invalidUtf8: file.invalidUtf8,
        content: file.text,
      },
      human: file.text,
    };
  },

  ls(s) {
    if (has(s.args, "json")) s.graph.ensureAll();
    const notes = [...s.graph.notes.values()];
    const data: Record<string, unknown>[] = notes.map((n) => ({
      path: n.rel,
      title: n.title,
      size: n.size,
      mtime: new Date(n.mtimeMs).toISOString(),
      tags: n.tags,
      links: n.links.length,
    }));
    const lines = notes.map((n) => n.rel);
    // --files: the vault's data and text files too (16.4), each with its group and format.
    if (has(s.args, "files")) {
      for (const f of textFiles(s)) {
        let st: { size: number; mtimeMs: number } | null = null;
        try {
          st = statSync(s.graph.abs(f.path));
        } catch {}
        data.push({
          path: f.path,
          group: f.group,
          format: f.format,
          size: st?.size ?? 0,
          mtime: st ? new Date(st.mtimeMs).toISOString() : null,
        });
        lines.push(f.path);
      }
    }
    return { data, human: lines.map((l) => `${l}\n`).join("") };
  },

  async find(s, rest) {
    const query = requireArg(rest, "query");
    const re = pattern(s, query);
    // --files: the vault's data and text files are searched too (16.4).
    const notes = rest[1]
      ? [resolveNote(s, rest[1], false)]
      : [...s.graph.notes.keys(), ...(has(s.args, "files") ? textFiles(s).map((f) => f.path) : [])].sort();
    const matches: { path: string; line: number; column: number; match: string; text: string }[] = [];
    for (const rel of notes) {
      let text: string;
      try {
        text = readText(s.graph.abs(rel)).text;
      } catch (err) {
        // One unreadable or vanished note doesn't fail the search: it's a warning, the rest go on.
        if (rest[1]) throw new CliError(`${rel}: ${(err as Error).message}`, EXIT.notFound);
        s.warnings.push(`${rel}: not searched (${(err as NodeJS.ErrnoException).code ?? (err as Error).message})`);
        continue;
      }
      const starts = lineStarts(text);
      let [colLine, colAt, col] = [0, 0, 0];
      // Every match; only a regex whose captures outgrow the text many times over is cut short, and said.
      const result = await matchText(text, re, { regex: has(s.args, "regex"), partial: true });
      if (result.limited) s.warnings.push(`${rel}: the matches' captures outgrow the text; the first ones shown`);
      for (const m of result.matches) {
        const line = lineAt(starts, m.from);
        const lineStart = starts[line - 1]!;
        const lineEnd = (starts[line] ?? text.length + 1) - 1;
        // Columns in code points, counted on from the last match of the same line.
        if (colLine !== line) [colLine, colAt, col] = [line, lineStart, 0];
        col += [...text.slice(colAt, m.from)].length;
        colAt = m.from;
        matches.push({
          path: rel,
          line,
          column: col + 1,
          match: m.groups[0]!,
          text: around(text, lineStart, lineEnd, m.from, m.to),
        });
      }
    }
    // The walk leaves out notes over walk.max_file_size: say so, rather than find nothing in them.
    if (!rest[1]) {
      for (const k of s.graph.skipped)
        if (/^larger than/.test(k.reason))
          s.warnings.push(`${k.rel}: not searched (${k.reason}); name it to search it`);
    }
    return {
      data: { query, regex: has(s.args, "regex"), whole: has(s.args, "whole"), count: matches.length, matches },
      human: matches.map((m) => `${m.path}:${m.line}:${m.column}: ${m.text}\n`).join(""),
    };
  },

  // Spelling (25.6): a note's misspelt words, by line and column (code points, as find's), with --suggest what each
  // might be; --add puts a word in your own list, which the TUI's z g writes too.
  async spell(s, rest) {
    const add = flag(s.args, "add");
    if (add !== undefined) {
      if (rest.length || has(s.args, "suggest") || flag(s.args, "lang") !== undefined)
        throw new UsageError("spell --add takes the word alone");
      const word = add.trim();
      if (!word || /\s/.test(word)) throw new UsageError("--add takes one word");
      addOwnWord(word);
      addToDictionaries(word); // those this process has built already: run in one, a check after knows it
      return {
        data: { added: word, file: ownWordsFile() },
        human: `"${word}" added to your words (${ownWordsFile()})\n`,
      };
    }
    const rel = resolveNote(s, requireArg(rest, "note"), false);
    if (classify(rel, s.config.walk.extensions).group !== "note")
      throw new UsageError(`${rel} isn't a note: spelling checks a note's prose`);
    const text = readText(s.graph.abs(rel)).text;
    const parsed = parseMarkdown(text);
    const given = flag(s.args, "lang");
    const languages =
      given !== undefined
        ? given
            .split(",")
            .map((l) => l.trim())
            .filter(Boolean)
        : noteLanguages(parsed.frontmatter?.data, s.config.spell.languages);
    // Built and asked on the spell checker's thread, as the TUI's are: the CLI waits for them.
    const dictionaries: DictionaryFiles[] = [];
    const missing: string[] = [];
    for (const lang of languages) {
      const files = dictionaryFiles(lang, s.config.spell.dictionaries);
      if (files) {
        await openDictionary(files);
        dictionaries.push(files);
      } else missing.push(lang);
    }
    if (missing.length)
      s.warnings.push(`no dictionary for ${missing.join(", ")} — [spell] dictionaries can name yours`);
    const checker = new Checker(dictionaries.length ? threadDictionaries(dictionaries) : null);
    const starts = lineStarts(text);
    const found = await checker.misspeltAll(proseWords(parsed.tree, text));
    if (checker.error) throw new Error(`spelling: ${checker.error}`);
    const words = await Promise.all(
      found.map(async (w) => ({
        line: w.line,
        column: [...text.slice(starts[w.line - 1]!, w.from)].length + 1,
        word: w.word,
        ...(has(s.args, "suggest") ? { suggestions: await checker.suggest(w.word) } : {}),
      })),
    );
    return {
      data: { path: rel, languages, missing, words },
      human: words
        .map(
          (w) =>
            `${rel}:${w.line}:${w.column}: ${w.word}${w.suggestions ? ` → ${w.suggestions.join(", ") || "(none)"}` : ""}\n`,
        )
        .join(""),
    };
  },
};
