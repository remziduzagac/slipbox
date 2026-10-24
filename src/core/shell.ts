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
  /** Standard output alone; merged, both (one pipe). */
  stdout: string;
  /** More than the window keeps (`output`), or than a filter takes (`stdout`): the rest dropped. */
  truncated: boolean;
  ms: number;
}

/** What a window keeps of a command's output; what a filter takes. */
export const OUTPUT_MAX = 2 * 1024 * 1024;
export const STDOUT_MAX = 32 * 1024 * 1024;

/**
 * Run a command by your shell (`$SHELL`, else `/bin/sh`) in `cwd`, `input` its standard input (none: nothing to read).
 * `stop` ends it — and, run by a shell, what the shell started — and `done` says how it went. `merged`: its standard
 * error through its standard output's pipe, so what it prints comes in the order it wrote it, as a terminal shows it
 * (D?1); two pipes, read as each has something, can come either way.
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
  // Merged, `/bin/sh` points the shell's standard error at its standard output and becomes it (`exec`: the same process,
  // group and exit), the shell given `-c` and the command as ever: fish or nu as well as a POSIX shell.
  const [program, ...args] = opts.merged
    ? ["/bin/sh", "-c", 'exec "$0" -c "$1" 2>&1', shell, command]
    : [shell, "-c", command];
  // A process group of its own: stopping it stops what it started too.
  const child = spawn(program!, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: [opts.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    detached: true,
  });
  let output = "";
  let stdout = "";
  let truncated = false;
  const take = (chunk: Buffer, out: boolean) => {
    const text = chunk.toString("utf8");
    opts.onOutput?.(text, out ? "stdout" : "stderr");
    if (output.length < OUTPUT_MAX) output += text;
    else truncated = true;
    if (!out) return;
    if (stdout.length < STDOUT_MAX) stdout += text;
    else truncated = true;
  };
  child.stdout!.on("data", (c: Buffer) => take(c, true));
  child.stderr!.on("data", (c: Buffer) => take(c, false));
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
        stdout: stdout.slice(0, STDOUT_MAX),
        truncated,
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
