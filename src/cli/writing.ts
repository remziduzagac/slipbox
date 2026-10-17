// The CLI's writing commands (9.4): a note's text written atomically, inside the vault, `--if-unchanged` honoured;
// a task ticked as a one-byte edit; a find replaced in a note, or in every note as a rename is (25.4); its footnotes
// added and changed (3.18); a folder made.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { parseAround } from "../core/parse.ts";
import {
  addFootnote,
  applyEdits,
  deleteFootnote,
  editFootnote,
  type Footnote,
  footnotesOf,
  renameFootnote,
  type TextEdit,
} from "../core/footnotes.ts";
import { parseNoteFile } from "../core/readers.ts";
import { classify, extensionOf, isKnownExtension, noteFormat } from "../core/filetypes.ts";
import { WriteRefused, writeNote } from "../core/fsutil.ts";
import { blockingLink, writesThrough } from "../core/symlinks.ts";
import { expandReplacement, findAll, firstPerLine, replaceMatches } from "../core/replace.ts";
import { planReplace } from "../core/replace-files.ts";
import { listTasks, toggleTask } from "../core/tasks.ts";
import { isInside } from "../core/vault.ts";
import { flag, has, UsageError } from "./args.ts";
import {
  EXIT,
  CliError,
  type Session,
  textFiles,
  type Result,
  type Handler,
  requireArg,
  resolveNote,
  around,
  pattern,
  lineStarts,
  lineAt,
  type NoteFile,
  readNoteFile,
  checkWritable,
  checkUnchanged,
  writeNoteText,
} from "./common.ts";
import { renameResult } from "./files.ts";

/** A note written: its text, a task ticked, a find replaced, its footnotes; a folder made. */
export const WRITING_COMMANDS: Record<string, Handler> = {
  async write(s, rest) {
    const noteArg = requireArg(rest, "note");
    // Text from the arguments is a line (or lines), so it ends with a newline; stdin is taken as is.
    let text = rest.length > 1 ? `${rest.slice(1).join(" ")}\n` : "";
    if (has(s.args, "stdin")) {
      const input = await s.io.stdin();
      text = `${text}${input}`;
    }
    // No text at all: an empty new note, said on purpose (DF-D16); else refused, as blank text is.
    const empty = has(s.args, "create") && has(s.args, "allow-empty");
    if (!has(s.args, "stdin") && rest.length < 2 && !empty)
      throw new UsageError("write needs the text, or --stdin (--create --allow-empty makes an empty note)");
    let rel: string;
    let created = false;
    let shadows: string[] = [];
    if (has(s.args, "create")) {
      // A new note: the argument is a path in the vault (relative to it, or to cwd when inside
      // it), never a name to resolve — and a file already there is never overwritten.
      // A path in the vault, from its root — or from the current folder when it says so (./, ../).
      const base = noteArg.startsWith("/")
        ? noteArg
        : /^\.\.?\//.test(noteArg)
          ? join(s.io.cwd, noteArg)
          : join(s.loc.root, noteArg);
      // A note unless the name says otherwise: `config.toml`, `run.py` keep their extension (16.4).
      const abs = isKnownExtension(extensionOf(base)) ? base : `${base}.md`;
      // Outside by its path: checked before any folder is made — through a link, by checkWritable, next (VV-D6).
      if (!isInside(s.loc.root, abs))
        throw new CliError(`${noteArg} is outside the vault (${s.loc.root})`, EXIT.refused);
      rel = relative(s.loc.root, abs);
      checkWritable(s, abs);
      if (existsSync(abs))
        throw new CliError(`${rel} already exists; not overwriting it (drop --create to write it)`, EXIT.refused, {
          path: rel,
        });
      created = true;
      // A name other notes have: a command naming it by that name now needs a path (links are paths, 20.2).
      const name = rel
        .replace(/\.(md|markdown)$/i, "")
        .split("/")
        .pop()!;
      const same = s.graph.findNote(name, s.loc.root);
      shadows = same.status === "resolved" ? [same.path] : same.status === "ambiguous" ? same.candidates : [];
      if (shadows.length)
        s.warnings.push(
          `${rel}: other notes are named "${name}" (${shadows.join(", ")}); naming it in a command takes a path now`,
        );
    } else {
      try {
        rel = resolveNote(s, noteArg, false);
      } catch (err) {
        if (err instanceof CliError && err.code === EXIT.notFound)
          throw new CliError(`${err.message} (--create makes a new note)`, EXIT.notFound);
        throw err;
      }
      checkWritable(s, join(s.loc.root, rel));
    }
    const abs = join(s.loc.root, rel);
    let previous: NoteFile | null = null;
    if (!created) previous = readNoteFile(s, abs);
    else if (flag(s.args, "if-unchanged") !== undefined)
      throw new CliError(`${rel} doesn't exist; --if-unchanged has nothing to compare`, EXIT.refused);
    // Nothing to write is almost always a failed producer (gen | slipbox write note --stdin): it
    // would empty the note, and --if-unchanged can't catch it. Said on purpose with --allow-empty.
    // Blank counts as empty: `write note "$(gen)"` gives "\n" when gen fails.
    if (!text.trim() && !has(s.args, "allow-empty"))
      throw new UsageError("nothing to write (empty text); --allow-empty empties the note on purpose");
    let content = text;
    if (previous && has(s.args, "append")) {
      // On a new line; with --paragraph after a blank one too, so the text is a block of its own
      // (a line appended right after a table would be its next row, after a paragraph part of it).
      const body = previous.text.replace(/(\r?\n)*$/, "");
      const sep = !body ? "" : has(s.args, "paragraph") ? "\n\n" : "\n";
      content = has(s.args, "paragraph")
        ? `${body}${sep}${text}`
        : `${previous.text}${previous.text && !previous.text.endsWith("\n") ? "\n" : ""}${text}`;
    }
    if (created) mkdirSync(dirname(abs), { recursive: true });
    const written = writeNoteText(s, abs, content, previous);
    return {
      data: {
        path: rel,
        created,
        ...(created ? { shadows } : {}),
        appended: !!previous && has(s.args, "append"),
        previousSha: previous?.sha ?? null,
        sha: written,
      },
      human: `${created ? "created" : "wrote"} ${rel}\n`,
    };
  },

  task(s, rest) {
    const rel = resolveNote(s, requireArg(rest, "note"));
    const abs = s.graph.abs(rel);
    // A task is a one-byte edit, so a note that isn't valid UTF-8 can be ticked, as in the TUI.
    if (classify(rel, s.config.walk.extensions).group !== "note")
      throw new UsageError(`${rel} isn't a note: tasks are in notes`);
    const file = readNoteFile(s, abs, false);
    // Toggling one line needs only the chunk that holds it (a 20,000-task note parses in a blink);
    // the list, the whole note.
    const lineArg = rest[1] === undefined ? undefined : Number(rest[1]);
    const tasks = listTasks(
      lineArg !== undefined && Number.isInteger(lineArg) && lineArg >= 1 && noteFormat(rel) === "markdown"
        ? parseAround(file.text, lineArg)
        : parseNoteFile(rel, file.text).tree,
    );
    // Each task's source line too (its text keeps [[links]]), and the note's sha for a safe tick.
    const lines = file.text.split("\n");
    const withRaw = tasks.map((t) => ({ ...t, raw: (lines[t.line - 1] ?? "").replace(/\r$/, "") }));
    if (rest[1] === undefined) {
      return {
        data: { path: rel, sha: file.sha, tasks: withRaw },
        human: tasks.map((t) => `${String(t.line).padStart(5)}  [${t.checked ? "x" : " "}] ${t.text}\n`).join(""),
      };
    }
    const line = Number(rest[1]);
    if (!Number.isInteger(line) || line < 1) throw new UsageError("the task's line must be a whole number from 1");
    const task = tasks.find((t) => t.line === line);
    if (!task) {
      // The whole note's tasks, to choose from (the chunk's alone would mislead).
      const all = listTasks(parseNoteFile(rel, file.text).tree).map((t) => ({
        ...t,
        raw: (lines[t.line - 1] ?? "").replace(/\r$/, ""),
      }));
      throw new CliError(`no task on line ${line} of ${rel}`, EXIT.notFound, { path: rel, sha: file.sha, tasks: all });
    }
    const want = has(s.args, "check") ? true : has(s.args, "uncheck") ? false : !task.checked;
    if (has(s.args, "check") && has(s.args, "uncheck")) throw new UsageError("--check or --uncheck, not both");
    checkWritable(s, abs);
    checkUnchanged(s, abs, file.sha);
    let sha = file.sha;
    if (want !== task.checked) {
      const r = toggleTask(file.bytes, line);
      if (!r) throw new CliError(`no task marker on line ${line} of ${rel}`, EXIT.notFound);
      try {
        writeNote(s.loc.root, abs, r.bytes);
      } catch (err) {
        if (err instanceof WriteRefused) throw new CliError(err.message, EXIT.refused);
        throw err;
      }
      sha = createHash("sha256").update(r.bytes).digest("hex").slice(0, 16);
    }
    return {
      data: { path: rel, line, text: task.text, checked: want, changed: want !== task.checked, sha },
      human: `${String(line).padStart(5)}  [${want ? "x" : " "}] ${task.text}\n`,
    };
  },

  replace(s, rest) {
    if (has(s.args, "all")) return replaceAll(s, rest);
    if (has(s.args, "files") || has(s.args, "plan"))
      throw new UsageError("--files and --plan go with --all: replace in every note");
    if (rest.length < 3) throw new UsageError('replace needs <note> <old> <new> (the new text may be "")');
    const [noteArg, query, replacement] = rest as [string, string, string];
    if (!query) throw new UsageError("replace needs something to find (an empty pattern matches nothing)");
    const rel = resolveNote(s, noteArg, false);
    const abs = s.graph.abs(rel);
    const dry = has(s.args, "dry-run");
    if (!dry) checkWritable(s, abs);
    // A dry run only reads, so it previews a note that couldn't be rewritten too.
    const file = readNoteFile(s, abs, !dry);
    const re = pattern(s, query);
    const starts = lineStarts(file.text);
    const lines = flag(s.args, "lines");
    let range: [number, number] = [0, file.text.length];
    if (lines !== undefined) {
      const m = /^(\d+)(?:-(\d+))?$/.exec(lines);
      const a = m ? Number(m[1]) : 0;
      const b = m ? Number(m[2] ?? m[1]) : 0;
      if (!m || a < 1 || b < a) throw new UsageError("--lines must look like 12 or 12-40, from 1 and in order");
      const count = file.text.endsWith("\n") ? starts.length - 1 : starts.length;
      if (a > Math.max(1, count))
        throw new UsageError(`--lines starts past the end (${rel} has ${count} line${count === 1 ? "" : "s"})`);
      range = [starts[a - 1] ?? file.text.length, starts[b] ?? file.text.length];
    }
    let ms = findAll(file.text, re, range[0], range[1], has(s.args, "regex")); // ^ and $ insert
    if (has(s.args, "first") && has(s.args, "first-per-line"))
      throw new UsageError("--first or --first-per-line, not both");
    if (has(s.args, "first")) ms = ms.slice(0, 1);
    if (has(s.args, "first-per-line")) ms = firstPerLine(file.text, ms); // vim's :s without g
    const regex = has(s.args, "regex");
    const out = replaceMatches(file.text, ms, replacement, regex);
    // Each change with its column and its line before and after (a window of a long one), so a
    // preview shows a match inside a longer word, and two on one line apart. Built from the line
    // alone, and before the write: the answer never costs more than the edit, and a note is never
    // written without one.
    let colLine = 0;
    let colAt = 0;
    let col = 0;
    const changes = ms.map((m) => {
      const line = lineAt(starts, m.from);
      const ls = starts[line - 1]!;
      const le = (starts[line] ?? file.text.length + 1) - 1;
      const after = expandReplacement(replacement, m, regex);
      const lineBefore = around(file.text, ls, le, m.from, m.to);
      const text = file.text.slice(ls, le);
      const edited = text.slice(0, m.from - ls) + after + text.slice(m.to - ls);
      const lineAfter = around(edited, 0, edited.length, m.from - ls, m.from - ls + after.length);
      // Columns in code points, counted on from the last match of the same line.
      if (colLine !== line || colAt > m.from) [colLine, colAt, col] = [line, ls, 0];
      col += [...file.text.slice(colAt, m.from)].length;
      colAt = m.from;
      return { line, column: col + 1, before: m.groups[0]!, after, text: lineBefore, textAfter: lineAfter };
    });
    const written = !dry && out.count ? writeNoteText(s, abs, out.text, file) : null;
    const verb = dry ? "would replace" : "replaced";
    return {
      // newSha: the note's sha after the call; null on a dry run, which wrote nothing to hash.
      data: {
        path: rel,
        count: out.count,
        dryRun: dry,
        sha: file.sha,
        newSha: dry ? null : (written ?? file.sha),
        changes,
      },
      human: `${verb} ${out.count} in ${rel}\n${dry ? changes.map((c) => `${c.line}:${c.column}: ${c.text}\n${" ".repeat(String(c.line).length + String(c.column).length + 2)}→ ${c.textAfter}\n`).join("") : ""}`,
    };
  },

  footnotes(s, rest) {
    // A note's footnotes (3.17), as the TUI's footnotes view shows them; and adding and changing
    // them (3.18), as its keys do — written as `task` writes, `--if-unchanged` honoured.
    const rel = resolveNote(s, requireArg(rest, "note"));
    if (!s.graph.notes.has(rel)) throw new CliError(`${rel} isn't a note: only notes have footnotes`, EXIT.refused);
    const abs = s.graph.abs(rel);
    const sub = rest[1];
    const file = readNoteFile(s, abs, sub !== undefined);
    const text = file.text.replace(/\r\n/g, "\n");
    const list = footnotesOf(parseNoteFile(rel, text));
    const where = (f: Footnote) => (f.line === null ? "no definition" : `L${f.line}`);
    const refs = (f: Footnote) =>
      f.references.length ? f.references.map((r) => `L${r.line}:${r.column}`).join(" ") : "unused";
    if (sub === undefined)
      return {
        data: { path: rel, sha: file.sha, footnotes: list },
        human: list.map((f) => `[${f.label}]  ${where(f)}  ${f.text ?? ""}  ← ${refs(f)}\n`).join(""),
      };
    const named = (label: string | undefined) => {
      if (!label) throw new UsageError(`footnotes ${sub} needs the footnote's label`);
      const f = list.find((x) => x.id === label.replace(/^\[\^|\]$/g, "").toLowerCase());
      if (!f) throw new CliError(`no footnote [^${label}] in ${rel}`, EXIT.notFound);
      return f;
    };
    let edits: TextEdit[];
    let done: string;
    try {
      if (sub === "add") {
        const m = /^(\d+)(?::(\d+))?$/.exec(rest[2] ?? "");
        if (!m || rest[3] === undefined) throw new UsageError("footnotes <note> add <line[:col]> <text>");
        const starts = [0];
        for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
        const line = Number(m[1]);
        if (line < 1 || line > starts.length) throw new UsageError(`${rel} has no line ${line}`);
        const lineText = text.slice(starts[line - 1], (starts[line] ?? text.length + 1) - 1);
        // At the column given (1-based), else the line's end (before trailing spaces).
        const at =
          starts[line - 1]! +
          (m[2] ? Math.min(Number(m[2]) - 1, lineText.length) : lineText.replace(/\s+$/, "").length);
        const r = addFootnote(text, list, at, rest[3]);
        edits = r.edits;
        done = `added footnote [^${r.label}]`;
      } else if (sub === "edit") {
        const f = named(rest[2]);
        if (rest[3] === undefined) throw new UsageError("footnotes <note> edit <label> <text>");
        edits = editFootnote(text, f, rest[3]);
        done = `edited footnote [^${f.label}]`;
      } else if (sub === "rm") {
        const f = named(rest[2]);
        edits = deleteFootnote(text, f);
        done = `deleted footnote [^${f.label}]`;
      } else if (sub === "rename") {
        const f = named(rest[2]);
        if (!rest[3]) throw new UsageError("footnotes <note> rename <label> <new-label>");
        edits = renameFootnote(text, f, list, rest[3].replace(/^\[\^|\]$/g, ""));
        done = `renamed footnote [^${f.label}] → [^${rest[3]}]`;
      } else throw new UsageError(`footnotes: unknown subcommand ${sub} (add, edit, rm, rename)`);
    } catch (err) {
      if (err instanceof UsageError || err instanceof CliError) throw err;
      throw new CliError((err as Error).message, EXIT.refused);
    }
    checkWritable(s, abs);
    const next = applyEdits(text, edits);
    const out = (file.bom ? "\ufeff" : "") + (file.crlf ? next.replace(/\n/g, "\r\n") : next);
    try {
      writeNote(s.loc.root, abs, out);
    } catch (err) {
      if (err instanceof WriteRefused) throw new CliError(err.message, EXIT.refused);
      throw err;
    }
    const sha = createHash("sha256").update(Buffer.from(out, "utf8")).digest("hex").slice(0, 16);
    return { data: { path: rel, sha, footnotes: footnotesOf(parseNoteFile(rel, next)) }, human: `${done}\n` };
  },

  // A folder (and its parents), in the vault only: from its root, or from the current folder
  // when the path says so (./, ../), as write --create takes a new note's path.
  mkdir(s, rest) {
    const arg = requireArg(rest, "path");
    const abs = arg.startsWith("/") ? arg : /^\.\.?\//.test(arg) ? join(s.io.cwd, arg) : join(s.loc.root, arg);
    if (!isInside(s.loc.root, abs) || blockingLink(s.loc, abs) || !writesThrough(s.loc, abs))
      throw new CliError(`${arg} is outside the vault (${s.loc.root})`, EXIT.refused);
    const rel = relative(s.loc.root, abs);
    if (existsSync(abs)) throw new CliError(`${rel} already exists`, EXIT.refused, { path: rel });
    mkdirSync(abs, { recursive: true });
    return { data: { path: rel, created: true }, human: `${rel}/\n` };
  },
};

/**
 * `replace --all <old> <new>` (25.4): in every note — and with --files, every text file — as a rename is: --dry-run its
 * preview, --plan saved for `apply`, logged for `undo`.
 */
function replaceAll(s: Session, rest: string[]): Promise<Result> {
  if (rest.length !== 2) throw new UsageError('replace --all needs <old> <new> (the new text may be ""), and no note');
  const [query, replacement] = rest as [string, string];
  if (!query) throw new UsageError("replace needs something to find (an empty pattern matches nothing)");
  for (const f of ["first", "first-per-line", "lines", "if-unchanged"])
    if (has(s.args, f)) throw new UsageError(`--${f} is for one note's replace, not --all`);
  pattern(s, query); // not a regex: a usage error, before anything is read
  const rels = [...s.graph.notes.keys(), ...(has(s.args, "files") ? textFiles(s).map((f) => f.path) : [])];
  for (const k of s.graph.skipped)
    if (/^larger than/.test(k.reason)) s.warnings.push(`${k.rel}: not searched (${k.reason})`);
  const opts = { regex: has(s.args, "regex"), whole: has(s.args, "whole"), ignoreCase: has(s.args, "ignore-case") };
  return renameResult(s, () => planReplace(s.graph, query, replacement, rels, opts));
}
