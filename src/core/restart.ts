// Restarting slipbox (UPG). A restart leaves a note for the slipbox it starts — where to come back to, the window's
// session, the version it was, the upgrade asked for and what came of it — then hands over: the upgrade, done in this
// process with the screen given back, then this process replaced by the next binary (`execve`, UPG-D2), so the shell
// sees one process throughout. Where `execve` can't be reached, the next one is started and waited for.

import { dlopen, FFIType, ptr, read } from "bun:ffi";
import { accessSync, constants, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { constants as os } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { libcCandidates } from "./crash-reports.ts";
import { atomicWrite } from "./fsutil.ts";
import type { InstalledBy } from "./install.ts";
import { stateHome } from "./paths.ts";

/** What a restart leaves for the slipbox it starts. `place` and `session` are the TUI's own, kept as it wrote them. */
export interface RestartNote {
  /** The process that wrote it: the slipbox it starts has the same pid (`execve`), or it as its parent. */
  pid: number;
  /** When it was written, then when the hand-over finished, in ms. */
  at: number;
  /** The version that was running. */
  from: string;
  /** The version an upgrade was asked to install; null for a restart alone. */
  upgrade: string | null;
  /** What came of the upgrade: null before it ran, or when none was asked for. */
  outcome: { ok: true; said: string } | { ok: false; why: string } | null;
  place: unknown;
  session: unknown;
}

/** A note older than this is a restart that never came back: ignored. */
export const NOTE_FRESH_MS = 2 * 60 * 1000;

/** Where restarts' notes are: `$XDG_STATE_HOME/slipbox/restart/`. */
export function restartDir(): string {
  return join(stateHome(), "restart");
}

const notePath = (dir: string, pid: number) => join(dir, `${pid}.json`);

/** The note written, then read back to be sure; throws, saying why, when it can't be. */
export function writeNote(note: RestartNote, dir = restartDir()): void {
  const text = `${JSON.stringify(note)}\n`;
  const file = notePath(dir, note.pid);
  atomicWrite(file, text);
  if (readFileSync(file, "utf8") !== text) throw new Error(`${file} reads back differently`);
}

/**
 * The note left for this slipbox — by its own pid (it was `execve`d), else its parent's (started and waited for) —
 * taken: read and removed. A stale one, or one that can't be read, is removed and ignored; so are others' left
 * behind (older than a day).
 */
export function takeNote(opts: { pid: number; ppid: number; now?: number; dir?: string }): RestartNote | null {
  const dir = opts.dir ?? restartDir();
  const now = opts.now ?? Date.now();
  let found: RestartNote | null = null;
  for (const pid of [opts.pid, opts.ppid]) {
    const file = notePath(dir, pid);
    if (!existsSync(file)) continue;
    try {
      const note = JSON.parse(readFileSync(file, "utf8")) as RestartNote;
      if (note.pid === pid && typeof note.at === "number" && now - note.at < NOTE_FRESH_MS && now >= note.at)
        found = note;
    } catch {}
    rmSync(file, { force: true });
    if (found) break;
  }
  try {
    for (const e of readdirSync(dir)) {
      const file = join(dir, e);
      if (now - statSync(file).mtimeMs > 24 * 60 * 60 * 1000) rmSync(file, { force: true });
    }
  } catch {}
  return found;
}

function executable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** The file slipbox was started by, as the shell found it: `argv0` itself when it has a slash, else the first
 *  executable of that name on `PATH`; null when neither says. Asked at start, before anything changes them. */
export function startedPath(argv0: string, path: string, cwd: string): string | null {
  if (!argv0) return null;
  if (argv0.includes("/")) return resolve(cwd, argv0);
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    const file = join(isAbsolute(dir) ? dir : resolve(cwd, dir), argv0);
    if (executable(file)) return file;
  }
  return null;
}

/** What to start: a file, and its arguments, the first being its name. */
export interface Launch {
  file: string;
  argv: string[];
}

/**
 * The binary a restart starts, by how this slipbox was installed: the installer's, `<data>/current/slipbox` — the
 * newest installed — or, after a failed upgrade, the file that was running (`current` when that's gone); Homebrew's,
 * `<prefix>/opt/slipbox/bin/slipbox`, its link to the version it has now; one put here by hand, the path it was
 * started by, so a link moved to another file is followed; from source (`script`), Bun with the same script. The
 * arguments are this one's.
 */
export function nextLaunch(opts: {
  by: InstalledBy;
  data: string;
  /** This process's file (`process.execPath`): links resolved; on Linux `… (deleted)` once it's been removed. */
  execPath: string;
  argv0: string;
  startedBy: string | null;
  /** The script run, when slipbox runs from source; null for a compiled binary. */
  script: string | null;
  upgradeFailed: boolean;
  args: string[];
}): Launch {
  const running = opts.execPath.replace(/ \(deleted\)$/, "");
  const at = (file: string) => ({ file, argv: [opts.argv0 || file, ...opts.args] });
  if (opts.script !== null) return { file: running, argv: [opts.argv0 || running, opts.script, ...opts.args] };
  if (opts.by === "installer") {
    const current = join(opts.data, "current", "slipbox");
    if (opts.upgradeFailed && executable(running)) return at(running);
    return at(executable(current) ? current : running);
  }
  if (opts.by === "homebrew") {
    const prefix = /^(.*)\/Cellar\/slipbox\/[^/]+\/bin\/slipbox$/.exec(running)?.[1];
    const opt = prefix ? join(prefix, "opt", "slipbox", "bin", "slipbox") : null;
    return at(opt && executable(opt) ? opt : running);
  }
  return at(opts.startedBy && executable(opts.startedBy) ? opts.startedBy : running);
}

/** `close_range`'s flag: marked close-on-exec, not closed (Linux 5.11). */
const CLOSE_RANGE_CLOEXEC = 1 << 2;

/**
 * This process replaced by `file`, run with `argv` and `env` (libc's `execve`, reached as D221's switch is): the same
 * pid, process group and terminal. Descriptors above 2 are marked close-on-exec first where Linux's libc has
 * `close_range`, so none is carried into the next one; none is closed, so a failure leaves this process whole.
 * Returns only when it couldn't: why.
 */
export function execInto(file: string, argv: string[], env: Record<string, string | undefined>): string {
  if (process.platform === "win32") return "Windows has no execve";
  const keep: Buffer[] = [];
  const cstr = (s: string) => {
    const b = Buffer.from(`${s}\0`);
    keep.push(b);
    return b;
  };
  const vec = (items: string[]) => {
    const a = new BigUint64Array(items.length + 1);
    items.forEach((s, i) => {
      a[i] = BigInt(ptr(cstr(s)));
    });
    return a;
  };
  for (const lib of libcCandidates()) {
    let execve: (file: Buffer, argv: BigUint64Array, envp: BigUint64Array) => number;
    try {
      const { symbols } = dlopen(lib, EXECVE);
      execve = (f, a, e) => symbols.execve(f, a, e);
    } catch {
      continue;
    }
    if (process.platform === "linux") {
      try {
        dlopen(lib, CLOSE_RANGE).symbols.close_range(3, 0xffffffff, CLOSE_RANGE_CLOEXEC);
      } catch {
        // an older libc: Bun's own descriptors are close-on-exec but one
      }
    }
    const envp = Object.entries(env).flatMap(([k, v]) => (v === undefined ? [] : [`${k}=${v}`]));
    execve(cstr(file), vec(argv), vec(envp));
    return `execve failed${errno(lib)}`;
  }
  return "libc's execve couldn't be reached";
}

const EXECVE = { execve: { args: [FFIType.ptr, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 } } as const;
const CLOSE_RANGE = { close_range: { args: [FFIType.u32, FFIType.u32, FFIType.i32], returns: FFIType.i32 } } as const;

/** libc's errno, said: `: errno 2`; empty when it can't be read. */
function errno(lib: string): string {
  try {
    const where =
      process.platform === "darwin"
        ? dlopen(lib, { __error: { args: [], returns: FFIType.ptr } }).symbols.__error()
        : dlopen(lib, { __errno_location: { args: [], returns: FFIType.ptr } }).symbols.__errno_location();
    return where ? `: errno ${read.i32(where)}` : "";
  } catch {
    return "";
  }
}

/** The terminal's signals, which reach the next slipbox too (one foreground group): this one ignores them while it
 *  waits. */
const TERMINAL_SIGNALS = ["SIGINT", "SIGQUIT", "SIGTSTP"] as const;

/** The next one started with the terminal handed down and waited for: its exit code (128 + a signal's number when a
 *  signal ended it); null, saying why, when it couldn't start. */
export async function startAndWait(
  launch: Launch,
  env: Record<string, string | undefined>,
  say: (line: string) => void,
): Promise<number | null> {
  const ignore = () => {};
  for (const s of TERMINAL_SIGNALS) process.on(s, ignore);
  try {
    const child = Bun.spawn([launch.file, ...launch.argv.slice(1)], {
      argv0: launch.argv[0],
      stdio: ["inherit", "inherit", "inherit"],
      env,
    });
    const code = await child.exited;
    return child.signalCode ? 128 + (os.signals[child.signalCode] ?? 0) : code;
  } catch (err) {
    say(`slipbox: couldn't start ${launch.file}: ${(err as Error).message}`);
    return null;
  } finally {
    for (const s of TERMINAL_SIGNALS) process.off(s, ignore);
  }
}

function onSigint(cancel: () => void): () => void {
  process.on("SIGINT", cancel);
  return () => process.off("SIGINT", cancel);
}

/**
 * The hand-over, once the screen is given back (UPG-D2): the upgrade asked for, `ctrl+c` cancelling it until its
 * commit; the note given its outcome; then the next binary — `execve`d into, else started and waited for. Returns the
 * exit code to end with: the next one's, when it was waited for; 1 when nothing could start.
 */
export async function handOver(opts: {
  note: RestartNote;
  /** Runs the upgrade, saying what it did; throws, saying why, when it fails or is cancelled. */
  upgrade: ((signal: AbortSignal) => Promise<string>) | null;
  launch: (upgradeFailed: boolean) => Launch;
  env: Record<string, string | undefined>;
  say: (line: string) => void;
  dir?: string;
  exec?: typeof execInto;
  /** What cancels the upgrade: `ctrl+c`, its SIGINT. Returns its own removal. */
  onCancel?: (cancel: () => void) => () => void;
}): Promise<number> {
  const { note } = opts;
  let failed = false;
  if (opts.upgrade && note.upgrade) {
    opts.say(`slipbox: upgrading to ${note.upgrade}… (ctrl+c cancels)`);
    const cancel = new AbortController();
    const stopListening = (opts.onCancel ?? onSigint)(() => cancel.abort());
    try {
      const said = await opts.upgrade(cancel.signal);
      opts.say(`slipbox: ${said}`);
      note.outcome = { ok: true, said };
    } catch (err) {
      failed = true;
      const why = (err as Error).message;
      opts.say(`slipbox: the upgrade to ${note.upgrade} failed: ${why} — starting slipbox again`);
      note.outcome = { ok: false, why };
    } finally {
      stopListening();
    }
  }
  note.at = Date.now();
  try {
    writeNote(note, opts.dir);
  } catch {
    // the next one comes back as a start does
  }
  const launch = opts.launch(failed);
  const why = (opts.exec ?? execInto)(launch.file, launch.argv, opts.env);
  const code = await startAndWait(launch, opts.env, opts.say);
  if (code !== null) return code;
  opts.say(`slipbox: nothing started (${why})`);
  return 1;
}
