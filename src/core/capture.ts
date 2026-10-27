// Scratch capture (plan 8.x) — the accumulator from prompt-buffer.lua, CLI-shaped so nvim, agents
// and scripts share one entry point (8.1). Markdown in, markdown out: each entry carries its
// source reference, and the file is readable and pasteable as-is (8.4). An entry says the place it's
// at and your note on it, a rule between it and the one before (D229):
//
//   **At:** `notes/coffee.md:5`
//
//   **Note:** check the ratio for the small pot
//
//   ---
//
// Reference format, GitHub-style, as prompt-buffer.lua emits it:
//   `path:42`  `path:42-50`  `path:42:10-30`  `path:42:10-50:30`

import { existsSync, lstatSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { type Config, isSafeRelative } from "./application/config/config.ts";
import { atomicWrite, climbsOut, ensureDir, landsInside, readRegular } from "./foundation/platform/fsutil.ts";
import { type Keyed, stateDir } from "./foundation/platform/paths.ts";
import { sanitize } from "./foundation/text/sanitize.ts";

export interface ScratchLocation {
  path: string;
  /** The project the scratch belongs to: its root (the plain folder, when one is opened). */
  project: string;
}

/** The vault a scratch belongs to: its root, its storage key, and what kind of root it is. */
export interface ScratchOwner extends Keyed {
  root: string;
  mode: string;
}

/** Where the scratch lives for a vault (0.10 / 8.2): in its state, or in the vault itself when
 *  `capture.location` says so (never in a plain folder: nothing is written into one, 20.22). */
export function scratchLocation(owner: ScratchOwner, config: Config): ScratchLocation {
  const project = owner.root;
  // Config validation already refuses an unsafe name; this holds even if one got through.
  const file =
    isSafeRelative(config.capture.file) && /\.(md|markdown)$/i.test(config.capture.file)
      ? config.capture.file
      : "scratch.md";
  if (config.capture.location === "root" && owner.mode === "vault") {
    // In the vault, a committed symlink could make the scratch read a file from anywhere (and copy
    // it into the vault) or write out of it: then it lives in the state dir, as by default.
    const path = join(project, file);
    let linked = false;
    try {
      linked = lstatSync(path).isSymbolicLink();
    } catch {}
    if (!linked && landsInside(project, path)) return { path, project };
  }
  return { path: join(stateDir(owner), file), project };
}

export class CaptureError extends Error {}

/** The most a snippet's file is read of: as much as `capture`'s check of a reference reads. */
const SNIPPET_FILE = 64 << 20;

export interface Ref {
  path: string;
  startLine: number;
  endLine: number;
  startCol?: number;
  endCol?: number;
}

const REF_RE = /^(.+?):(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/;

/** Parse `path:42`, `path:42-50`, `path:42:10-30`, `path:42:10-50:30`. */
export function parseRef(spec: string): Ref | null {
  const m = REF_RE.exec(spec.trim().replace(/^`|`$/g, ""));
  if (!m) return null;
  const valid = (r: Ref) =>
    r.startLine >= 1 &&
    r.endLine >= r.startLine &&
    (r.startCol === undefined ||
      (r.startCol >= 1 && r.endCol! >= 1 && (r.endLine > r.startLine || r.endCol! >= r.startCol)));
  const startLine = Number(m[2]);
  const a = m[3] ? Number(m[3]) : undefined;
  const b = m[4] ? Number(m[4]) : undefined;
  const c = m[5] ? Number(m[5]) : undefined;
  if (a !== undefined && b !== undefined && c === undefined) {
    // path:42:10-30 — same line, column range.
    const r = { path: m[1]!, startLine, endLine: startLine, startCol: a, endCol: b };
    return valid(r) ? r : null;
  }
  if (a !== undefined && b !== undefined && c !== undefined) {
    const r = { path: m[1]!, startLine, endLine: b, startCol: a, endCol: c };
    return valid(r) ? r : null;
  }
  const r = { path: m[1]!, startLine, endLine: b ?? startLine };
  return valid(r) ? r : null;
}

export function formatRef(r: Ref): string {
  let s = `${r.path}:${r.startLine}`;
  if (r.startCol !== undefined && r.endCol !== undefined) {
    s += r.startLine === r.endLine ? `:${r.startCol}-${r.endCol}` : `:${r.startCol}-${r.endLine}:${r.endCol}`;
  } else if (r.endLine !== r.startLine) s += `-${r.endLine}`;
  return `\`${s}\``;
}

const FENCE_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  jsx: "jsx",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  lua: "lua",
  sh: "bash",
  zsh: "zsh",
  bash: "bash",
  md: "markdown",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  c: "c",
  h: "c",
  cpp: "cpp",
  java: "java",
  sql: "sql",
  css: "css",
  html: "html",
  vim: "vim",
};

export function fenceLanguage(path: string): string {
  const ext = extname(path).slice(1).toLowerCase();
  return FENCE_LANG[ext] ?? ext;
}

export interface CaptureInput {
  /** Free text to append (a note, a question, a pasted excerpt). */
  text?: string;
  ref?: Ref;
  /** Include the referenced lines, fenced, read from disk (or `snippetText` if given). */
  snippet?: boolean;
  snippetText?: string;
  /** Fence language override; default from the file extension. */
  lang?: string;
  cwd?: string;
  /** An entry with a reference and no text ends on its note, empty: the TUI's cursor types it (D229). */
  ask?: boolean;
}

/** The labels of an entry's reference and its text: the place it's at, and your note on it (D229). */
export const AT = "**At:**";
export const NOTE = "**Note:**";

/** Build the markdown block for one entry. Pure apart from reading the snippet file. */
export function formatEntry(input: CaptureInput, project: string): string {
  const parts: string[] = [];
  if (input.ref) {
    const cwd = input.cwd ?? process.cwd();
    const abs = isAbsolute(input.ref.path) ? input.ref.path : resolve(cwd, input.ref.path);
    const rel = relative(project, abs);
    const shown = rel && !climbsOut(rel) ? rel : abs;
    parts.push(`${AT} ${formatRef({ ...input.ref, path: shown })}`);
    if (input.snippet || input.snippetText !== undefined) {
      let body = input.snippetText;
      if (body === undefined) {
        if (!existsSync(abs)) throw new CaptureError(`${input.ref.path}: no such file for --snippet`);
        // A regular file, read with care: a FIFO or a device is never waited on, nor read without end.
        let read: string;
        try {
          read = readRegular(abs, SNIPPET_FILE).toString("utf8");
        } catch (err) {
          throw new CaptureError(`${input.ref.path}: ${(err as Error).message.replace(`${abs}: `, "")} — no --snippet`);
        }
        const lines = read.split(/\r?\n/);
        // A final newline ends the last line; it doesn't start another.
        if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
        const last = input.ref.endLine ?? input.ref.startLine;
        if (last > lines.length)
          throw new CaptureError(`${input.ref.path} has ${lines.length} lines; ${last} is past the end`);
        body = lines.slice(input.ref.startLine - 1, input.ref.endLine).join("\n");
      }
      if (body !== undefined) parts.push(fence(sanitize(body), input.lang ?? fenceLanguage(abs)));
    }
  }
  if (input.text?.trim()) {
    const text = sanitize(input.text).replace(/\s+$/, "");
    parts.push(input.ref ? `${NOTE} ${text}` : text);
  } else if (!input.ref && input.snippetText) {
    parts.push(fence(sanitize(input.snippetText), input.lang ?? ""));
  } else if (input.ref && input.ask) {
    parts.push(`${NOTE} `);
  }
  return parts.join("\n\n");
}

/** Text fenced, the fence longer than any inside it; the scratch's and the context bundle's (9.7). */
export function fence(body: string, lang: string): string {
  // A longer fence when the snippet itself contains fences.
  const longest = Math.max(2, ...[...body.matchAll(/`{3,}/g)].map((m) => m[0].length));
  const f = "`".repeat(longest + 1);
  return `${f}${lang}\n${body.replace(/\n+$/, "")}\n${f}`;
}

export function readScratch(loc: ScratchLocation): string {
  try {
    return readRegular(loc.path).toString("utf8");
  } catch {
    return "";
  }
}

/** The scratch ends on a rule already: none goes before the next entry. */
const ENDS_ON_RULE = /(?:^|\n) {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;

/** A note left empty, and the blank line before it: a capture closed with nothing said about it (D229). */
const EMPTY_ASK = /\n*(?:^|\n)\*\*Note:\*\*[ \t]*(?=\n|$)/g;

/** The scratch without its empty notes (each an ask: the slot for yours). */
export function dropEmptyAsks(text: string): string {
  return text.replace(EMPTY_ASK, "");
}

/**
 * Append an entry atomically: after a blank line, and a rule when there's something before it (D229) — never right
 * under a line of text, where `---` would make that line a heading. `tidy` drops the empty notes before it: the TUI's,
 * never another program's (its cursor may be on one). Returns the new content.
 */
export function appendScratch(loc: ScratchLocation, entry: string, tidy = false): string {
  ensureDir(join(loc.path, ".."));
  const current = tidy ? dropEmptyAsks(readScratch(loc)) : readScratch(loc);
  const sep = current === "" ? "" : current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
  const rule = current.trim() && !ENDS_ON_RULE.test(current) ? "---\n\n" : "";
  const next = `${current}${sep}${rule}${entry}\n`;
  atomicWrite(loc.path, next);
  return next;
}

/** The scratch made, empty, where it isn't yet: the TUI opens it to be typed in before anything is captured (#43). */
export function ensureScratch(loc: ScratchLocation): void {
  if (existsSync(loc.path)) return;
  ensureDir(join(loc.path, ".."));
  atomicWrite(loc.path, "");
}

export function clearScratch(loc: ScratchLocation): void {
  if (existsSync(loc.path)) atomicWrite(loc.path, "");
}
