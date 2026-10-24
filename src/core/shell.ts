// A command run by your shell (plan 25.7): what you type after `:!` — never what a folder's config names (a root's
// own keys and aliases can't bind the commands that run one: config.ts) — run in the root's folder, `%` the file's
// path. `:{range}!cmd` gives it lines and takes its output in their place, as vim's filter does. What it prints is kept
// up to a size a window can show; a filter's output up to a size a note can be.

import { spawn } from "node:child_process";

/** Which lines a filter takes: the cursor's (`.`), the note's (`%`), the last selection's (`'<,'>`), or by number. */
export type BangRange = "line" | "all" | "selection" | { from: number; to: number };

/** A `:!` line: its range, a filter's (none: a command run), and the command. */
export interface Bang {
  range: BangRange | null;
  command: string;
}

/** `:!cmd`, `:'<,'>!cmd`, `:%!cmd`, `:.!cmd`, `:3!cmd`, `:3,7!cmd`; null where it's none of them, or has no command. */
export function parseBang(input: string): Bang | null {
  const m = /^\s*('<,'>|%|\.|\d+(?:\s*,\s*\d+)?)?\s*!(.*)$/s.exec(input);
  if (!m) return null;
  const command = m[2]!.trim();
  if (!command) return null;
  const r = m[1];
  if (r === undefined) return { range: null, command };
  if (r === "'<,'>") return { range: "selection", command };
  if (r === "%") return { range: "all", command };
  if (r === ".") return { range: "line", command };
  const [a, b = a] = r.split(",").map((x) => Number(x.trim())) as [number, number?];
  return { range: { from: Math.min(a, b!), to: Math.max(a, b!) }, command };
}

/** A string as the shell reads one word: quoted, its own quotes kept. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** `%` in a command as the file's path, quoted (`\%` a percent sign); null where it has `%` and there's no file. */
export function expandPercent(command: string, file: string | null): string | null {
  let missing = false;
  const out = command.replace(/\\%|%/g, (m) => {
    if (m === "\\%") return "%";
    if (file === null) missing = true;
    return shellQuote(file ?? "");
  });
  return missing ? null : out;
}

/** What a command did: how it ended, what it printed (both streams, as they came), its standard output alone. */
export interface ShellResult {
  /** Its exit code; null when a signal ended it. */
  code: number | null;
  signal: string | null;
  /** Standard output and error, in the order they came: as a window shows it. */
  output: string;
  /** Standard output alone; merged, the same as `output` (one pipe). */
  stdout: string;
  /** More than the window keeps (`output`): the rest dropped. */
  truncated: boolean;
  /** More than a filter takes (`stdout`): the rest dropped. */
  stdoutTruncated: boolean;
  ms: number;
}

/** What a window keeps of a command's output; what a filter takes. */
export const OUTPUT_MAX = 2 * 1024 * 1024;
export const STDOUT_MAX = 32 * 1024 * 1024;

/**
 * Run a command by your shell (`$SHELL`, else `/bin/sh`) in `cwd`, `input` its standard input (none: nothing to read).
 * `stop` ends it — and, run by a shell, what the shell started — and `done` says how it went. `merged`: its standard
 * error through its standard output's pipe, so what it prints comes in the order it reached the pipe (D?1); two pipes,
 * read as each has something, can come either way. (A program that holds its output back while it isn't writing to
 * a terminal, as many do, still writes it late: only a terminal of its own would change that.)
 */
export function runShell(
  command: string,
  opts: {
    cwd: string;
    input?: string;
    env?: Record<string, string>;
    merged?: boolean;
    /** Each piece of its output as it's read, and from which stream (merged: all of it standard output's): in the order
     *  the output keeps. */
    onOutput?: (text: string, stream: "stdout" | "stderr") => void;
  },
): { done: Promise<ShellResult>; stop: () => void } {
  const t0 = performance.now();
  const shell = process.env.SHELL || "/bin/sh";
  // Merged, `/bin/sh` — by its path, as the shell's own fallback is — points the shell's standard error at its standard
  // output and becomes it (`exec`: the same process, group and exit), the shell given `-c` and the command as ever: fish
  // or nu as well as a POSIX shell.
  const program = opts.merged ? "/bin/sh" : shell;
  const args = opts.merged ? ["-c", 'exec "$0" -c "$1" 2>&1', shell, command] : ["-c", command];
  // A process group of its own: stopping it stops what it started too.
  const child = spawn(program, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: [opts.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    detached: true,
  });
  let output = "";
  let stdout = "";
  // Each against its own limit: a filter's output isn't refused for being more than a window keeps, and a last piece
  // past the limit counts as cut as much as one after it.
  const take = (text: string, out: boolean) => {
    opts.onOutput?.(text, out ? "stdout" : "stderr");
    if (output.length <= OUTPUT_MAX) output += text;
    if (!out || opts.merged) return; // merged, standard output is `output`
    if (stdout.length <= STDOUT_MAX) stdout += text;
  };
  // Decoded as streams: a character cut across two reads is kept whole, never two replacement characters.
  child.stdout!.setEncoding("utf8").on("data", (text: string) => take(text, true));
  child.stderr!.setEncoding("utf8").on("data", (text: string) => take(text, false));
  if (opts.input !== undefined) {
    // A command that doesn't read it all (head) closes its end: not an error of ours.
    child.stdin!.on("error", () => {});
    child.stdin!.end(opts.input);
  }
  const stop = () => {
    try {
      if (child.pid) process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  };
  const done = new Promise<ShellResult>((resolve) => {
    const finish = (code: number | null, signal: string | null) =>
      resolve({
        code,
        signal,
        output: output.slice(0, OUTPUT_MAX),
        stdout: opts.merged ? output.slice(0, OUTPUT_MAX) : stdout.slice(0, STDOUT_MAX),
        truncated: output.length > OUTPUT_MAX,
        stdoutTruncated: opts.merged ? output.length > OUTPUT_MAX : stdout.length > STDOUT_MAX,
        ms: performance.now() - t0,
      });
    child.on("error", (err) => {
      output += `${err.message}\n`;
      finish(127, null);
    });
    child.on("close", (code, signal) => finish(code, signal));
  });
  return { done, stop };
}
