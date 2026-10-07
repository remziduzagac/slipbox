// Linters without a language server (plan 19.19): the lint surface (3.21) widened to code. Each is
// described in efm-langserver's keys — `lint-command`, `lint-formats` in vim's errorformat,
// `lint-stdin` — so a linter set up for efm pastes in, and runs as efm runs it: through the shell,
// from the project's top folder, the project's own copy first; findings read from what it prints.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import type { Problem, Severity } from "../diagnostics.ts";

/** A linter as the config writes it (`[linter.<name>]`): efm-langserver's keys. */
export interface LinterConfig {
  /** Run through the shell; `${INPUT}` is the file's path. The user's own config only (it names a program). */
  "lint-command"?: string;
  /** The text on its standard input, as typed (efm's default); else the file as saved, its path appended unless `${INPUT}` is there. */
  "lint-stdin"?: boolean;
  /** vim's errorformat, one per line of output, tried in order. */
  "lint-formats"?: string[];
  /** Who it says found them (the linter's name if not). */
  "lint-source"?: string;
  /** A finding's severity when its format has no `%t`: 1 error (efm's default), 2 warning, 3 information, 4 hint. */
  "lint-severity"?: number;
  /** Read its findings even when it exits 0 (efm takes 0 as nothing found). */
  "lint-ignore-exit-code"?: boolean;
  /** Its config files: the nearest folder holding one is where it runs. */
  "root-markers"?: string[];
  /** Only where one of `root-markers` is: the project asks for it. */
  "require-marker"?: boolean;
}

export interface LinterDef {
  name: string;
  command: string;
  stdin: boolean;
  formats: string[];
  source: string;
  severity: Severity;
  ignoreExitCode: boolean;
  rootMarkers: string[];
  requireMarker: boolean;
  /** How to get it, when it's not there. */
  hint?: string;
}

const SEVERITY_OF: Record<number, Severity> = { 1: "error", 2: "warning", 3: "info", 4: "hint" };

/** efm's defaults for what a config leaves out. */
function linterDef(name: string, c: LinterConfig, base?: LinterDef): LinterDef {
  return {
    name,
    command: c["lint-command"] ?? base?.command ?? "",
    stdin: c["lint-stdin"] ?? base?.stdin ?? true,
    formats: c["lint-formats"] ?? base?.formats ?? ["%f:%l:%c: %m"],
    source: c["lint-source"] ?? base?.source ?? name,
    severity: c["lint-severity"] !== undefined ? (SEVERITY_OF[c["lint-severity"]] ?? "error") : (base?.severity ?? "error"),
    ignoreExitCode: c["lint-ignore-exit-code"] ?? base?.ignoreExitCode ?? false,
    rootMarkers: c["root-markers"] ?? base?.rootMarkers ?? [],
    requireMarker: c["require-marker"] ?? base?.requireMarker ?? false,
    ...(base?.hint ? { hint: base.hint } : {}),
  };
}

/** Built in: linters no server runs, each only where the project has its config. */
export const LINTERS: Record<string, LinterDef> = {
  hadolint: linterDef("hadolint", {
    "lint-command": "hadolint --no-color -",
    "lint-formats": ["%f:%l %m"],
    "lint-severity": 2,
    "root-markers": [".hadolint.yaml", ".hadolint.yml"],
    "require-marker": true,
  }),
  yamllint: linterDef("yamllint", {
    "lint-command": "yamllint -f parsable -",
    "lint-formats": ["%f:%l:%c: [%trror] %m", "%f:%l:%c: [%tarning] %m"],
    "root-markers": [".yamllint", ".yamllint.yaml", ".yamllint.yml"],
    "require-marker": true,
  }),
};
LINTERS.hadolint!.hint = "brew install hadolint, or its release binary on your PATH";
LINTERS.yamllint!.hint = "uv tool install yamllint, pip install yamllint, or brew install yamllint";

/** The linters in effect: the built-in ones, each the config names changed (its keys over the defaults) or added. */
export function linterTable(config: Record<string, LinterConfig> = {}): Record<string, LinterDef> {
  const out: Record<string, LinterDef> = { ...LINTERS };
  for (const [name, c] of Object.entries(config)) out[name] = linterDef(name, c, Object.hasOwn(out, name) ? out[name] : undefined);
  return out;
}

// -----------------------------------------------------------------------------------------------
// vim's errorformat, the part linters' formats use.

/** What a format captures, by its letter. */
type Field = "f" | "l" | "c" | "v" | "e" | "k" | "t" | "n" | "m" | "r" | "p" | "s";
const CAPTURES: Record<Field, string> = { f: "(.+?)", l: "(\\d+)", c: "(\\d+)", v: "(\\d+)", e: "(\\d+)", k: "(\\d+)", t: "(.)", n: "(\\d+)", m: "(.*)", r: "(.*)", p: "([-. \\t]*)", s: "(.+)" };
const REGEX_CLASSES = new Set(["s", "S", "d", "D", "w", "W", "a", "A", "x", "X", "l", "L", "u", "U"]);
const VIM_CLASS: Record<string, string> = { a: "[A-Za-z]", A: "[^A-Za-z]", x: "[0-9A-Fa-f]", X: "[^0-9A-Fa-f]", l: "[a-z]", L: "[^a-z]", u: "[A-Z]", U: "[^A-Z]" };

export interface Format {
  re: RegExp;
  fields: Field[];
  /** `%-G`: a line to pass over. */
  ignore: boolean;
  /** `%E`, `%W`, `%I`, `%N`: the severity, when no `%t` says. */
  type: string | null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** One errorformat, or a string saying why it can't be read (a multi-line one: `%C`, `%Z`, `%A`…). */
export function compileFormat(format: string): Format | string {
  let i = 0;
  let ignore = false;
  let type: string | null = null;
  const prefix = /^%([-+]?)([EWINACZGOPQ])/.exec(format);
  if (prefix) {
    const [, sign, letter] = prefix;
    if (letter === "G" && sign === "-") ignore = true;
    else if (!sign && "EWIN".includes(letter!)) type = letter!.toLowerCase();
    else return `"${format}": multi-line and file-stack formats (%${sign}${letter}) aren't read`;
    i = prefix[0].length;
  }
  let re = "";
  const fields: Field[] = [];
  while (i < format.length) {
    const ch = format[i]!;
    if (ch !== "%") {
      re += escape(ch);
      i++;
      continue;
    }
    const next = format[i + 1];
    i += 2;
    if (next === undefined) return `"${format}": ends in a lone %`;
    if (next in CAPTURES) {
      fields.push(next as Field);
      re += CAPTURES[next as Field];
    } else if (next === "%") re += "%";
    else if (next === ".") re += ".";
    else if (next === "#") re += "*";
    else if (next === "^" || next === "$" || next === "~") re += escape(next);
    else if (next === "\\") {
      // A regex item: a class (`%\s`), a quantifier (`%\+`), else a backslash.
      const c = format[i];
      if (c && REGEX_CLASSES.has(c)) re += VIM_CLASS[c] ?? `\\${c}`;
      else if (c === "+") re += "+";
      else if (c === "=" || c === "?") re += "?";
      else {
        re += "\\\\";
        continue;
      }
      i++;
    } else if (next === "[") {
      const end = format.indexOf("]", i + 1);
      if (end < 0) return `"${format}": an unclosed %[`;
      re += `[${format.slice(i, end).replace(/\\/g, "\\\\").replace(/^\\\\\^/, "^")}]`;
      i = end + 1;
    } else if (next === "*") {
      // scanf's `%*\d`, `%*[^:]`: one or more, not captured.
      const c = format[i];
      if (c === "\\" && format[i + 1] && REGEX_CLASSES.has(format[i + 1]!)) {
        re += `${VIM_CLASS[format[i + 1]!] ?? `\\${format[i + 1]}`}+`;
        i += 2;
      } else if (c === "[") {
        const end = format.indexOf("]", i + 2);
        if (end < 0) return `"${format}": an unclosed %*[`;
        re += `[${format.slice(i + 1, end).replace(/\\/g, "\\\\")}]+`;
        i = end + 1;
      } else return `"${format}": %* takes a class (%*\\d) or a range (%*[^:])`;
    } else return `"${format}": %${next} isn't read`;
  }
  return { re: new RegExp(`^${re}$`), fields, ignore, type };
}

const SEVERITY_OF_TYPE: Record<string, Severity> = { e: "error", w: "warning", i: "info", n: "hint" };
/** What a linter reading its standard input calls the file. */
const STDIN_NAMES = new Set(["", "-", "stdin", "<stdin>", "<text>"]);

/**
 * A linter's findings in `file`, from its output: each line read by the first format matching it
 * whole; a line no format reads, or one about another file, passed over. Lines and columns from 1.
 */
export function parseFindings(output: string, formats: Format[], def: Pick<LinterDef, "source" | "severity">, file: string, cwd: string): Problem[] {
  const out: Problem[] = [];
  for (const line of output.split(/\r?\n/)) {
    for (const f of formats) {
      const m = f.re.exec(line);
      if (!m) continue;
      if (f.ignore) break;
      const got: Partial<Record<Field, string>> = {};
      f.fields.forEach((k, j) => (got[k] ??= m[j + 1]));
      const name = (got.f ?? "").trim();
      if (!STDIN_NAMES.has(name) && resolve(cwd, name) !== file) break;
      const lineNo = Number(got.l ?? 1) || 1;
      const col = got.c ? Number(got.c) : got.v ? Number(got.v) : got.p !== undefined ? got.p.length + 1 : null;
      const t = (got.t ?? f.type ?? "").toLowerCase();
      out.push({
        start: { line: lineNo, column: col ?? 1 },
        end: { line: got.e ? Number(got.e) : lineNo, column: got.k ? Number(got.k) : col ? col + 1 : 1 },
        severity: SEVERITY_OF_TYPE[t] ?? def.severity,
        source: def.source,
        code: got.n ?? null,
        message: (got.m ?? line).trim(),
      });
      break;
    }
  }
  return out;
}

// -----------------------------------------------------------------------------------------------
// Running one.

/** The nearest folder above `file` holding one of `markers`, short of the home folder; null when none does. */
export function markerRoot(file: string, markers: string[]): string | null {
  const home = homedir();
  for (let dir = dirname(file); dir !== home && dirname(dir) !== dir; dir = dirname(dir)) {
    if (markers.some((m) => existsSync(join(dir, m)))) return dir;
  }
  return null;
}

/** Where a linter runs for a file: the folder with its config; else, unless it needs one, the file's project. */
export function linterRoot(def: LinterDef, file: string, projectRoot: string): string | null {
  const marked = def.rootMarkers.length ? markerRoot(file, def.rootMarkers) : null;
  if (marked) return marked;
  return def.requireMarker ? null : projectRoot;
}

/** A project's own programs, before `PATH`: its npm, Python and Composer tools. */
export function projectPath(root: string, path = process.env.PATH ?? ""): string {
  const own = ["node_modules/.bin", ".venv/bin", "venv/bin", "vendor/bin"].map((d) => join(root, d)).filter((d) => existsSync(d));
  return [...own, path].filter(Boolean).join(delimiter);
}

const quote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

/** The shell command a linter runs for a file: `${INPUT}` its path; a linter not reading its input gets the path appended. */
export function commandFor(def: LinterDef, file: string): string {
  if (def.command.includes("${INPUT}")) return def.command.replaceAll("${INPUT}", quote(file));
  return def.stdin ? def.command : `${def.command} ${quote(file)}`;
}

export type LintRun = { problems: Problem[] } | { failed: "missing" | "timeout" | "error"; detail: string };

/**
 * Run a linter on a file (`text` on its input, when it reads it) from `root`, as efm does: through
 * the shell, output and errors read together; an exit of 0 is nothing found, unless it's told to
 * ignore its exit code. `missing`: the shell couldn't find it (127).
 */
export function runLinter(def: LinterDef, file: string, text: string, root: string, timeoutMs = 30_000): Promise<LintRun> {
  const formats: Format[] = [];
  for (const f of def.formats) {
    const c = compileFormat(f);
    if (typeof c === "string") return Promise.resolve({ failed: "error", detail: `${def.name}: ${c}` });
    formats.push(c);
  }
  return new Promise((done) => {
    let out = "";
    const child = spawn("sh", ["-c", commandFor(def, file)], { cwd: root, env: { ...process.env, PATH: projectPath(root) }, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done({ failed: "timeout", detail: `${def.name} took longer than ${timeoutMs / 1000} s` });
    }, timeoutMs);
    (timer as { unref?: () => void }).unref?.();
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.stdin.on("error", () => {}); // it exited without reading
    child.stdin.end(def.stdin ? text : "");
    child.on("error", (err) => {
      clearTimeout(timer);
      done({ failed: "error", detail: `${def.name}: ${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 127) return done({ failed: "missing", detail: out.trim().split("\n").at(-1) ?? "" });
      if (code === 0 && !def.ignoreExitCode) return done({ problems: [] });
      done({ problems: parseFindings(out, formats, def, file, root) });
    });
  });
}
