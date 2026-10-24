// Restarting slipbox (UPG). A restart leaves a note for the slipbox it starts — where to come back to, the window's
// session, the version it was, the upgrade asked for and what came of it — then hands over: the upgrade, done in this
// process with the screen given back, then this process replaced by the next binary (`execve`, UPG-D2), so the shell
// sees one process throughout. Where `execve` can't be reached, the next one is started and waited for.

import { ptr } from "bun:ffi";
import { accessSync, constants, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { constants as os } from "node:os";
import { isatty } from "node:tty";
import { join, resolve } from "node:path";
import { libc } from "./libc.ts";
import { atomicWrite, removeOlderThan } from "./fsutil.ts";
import { homebrewPrefix, type InstalledBy } from "./install.ts";
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
  removeOlderThan(dir, 24 * 60 * 60 * 1000, /^/, now);
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
  return Bun.which(argv0, { PATH: path, cwd });
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
    const prefix = homebrewPrefix(running);
    const opt = prefix ? join(prefix, "opt", "slipbox", "bin", "slipbox") : null;
    return at(opt && executable(opt) ? opt : running);
  }
  return at(opts.startedBy && executable(opts.startedBy) ? opts.startedBy : running);
}

/** `close_range`'s flag: marked close-on-exec, not closed (Linux 5.11). */
const CLOSE_RANGE_CLOEXEC = 1 << 2;

/**
 * This process replaced by `file`, run with `argv` and `env` (libc's `execve`, `libc.ts`): the same
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
  const c = libc();
  if (!c) return "libc's execve couldn't be reached";
  // An older libc has no close_range: Bun's own descriptors are close-on-exec but one.
  c.closeRange?.(3, 0xffffffff, CLOSE_RANGE_CLOEXEC);
  const envp = Object.entries(env).flatMap(([k, v]) => (v === undefined ? [] : [`${k}=${v}`]));
  c.execve(cstr(file), vec(argv), vec(envp));
  const errno = c.errno();
  return `execve failed${errno === null ? "" : `: errno ${errno}`}`;
}

/** This process's children, by pid, as Linux lists them (`/proc`); an empty list elsewhere. */
function children(): number[] {
  const pids: number[] = [];
  try {
    for (const task of readdirSync("/proc/self/task")) {
      const listed = readFileSync(`/proc/self/task/${task}/children`, "utf8").trim();
      if (listed) pids.push(...listed.split(/\s+/).map(Number));
    }
  } catch {}
  return pids;
}

/**
 * The children quitting stopped (language servers, a shell job) waited for, a second at most, until they've ended and
 * been reaped: after `execve` the process is the new slipbox's, which never reaps what it didn't start, so one ending
 * later stays a zombie as long as it runs. Never killed: what goes on running is meant to (an editor slipbox handed a
 * note to, an upgrade beside it). Linux only; elsewhere at once.
 */
export async function childrenEnded(withinMs = 1000): Promise<void> {
  const until = Date.now() + withinMs;
  while (children().length && Date.now() < until) await Bun.sleep(20);
}

/** `tcflush`'s queue of what was typed but not read: Linux's `TCIFLUSH`, and BSD's (macOS). */
const TCIFLUSH = process.platform === "darwin" ? 1 : 0;

/** What was typed at the terminal while the hand-over ran, thrown away: never keys for the next slipbox. */
export function flushInput(): void {
  // The descriptor asked, not process.stdin: the TUI's renderer has let go of that stream by now.
  if (process.platform === "win32" || !isatty(0)) return;
  libc()?.tcflush(0, TCIFLUSH);
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

async function settleForNext(): Promise<void> {
  await childrenEnded();
  flushInput();
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
  /** Before the next one starts: children reaped, typing thrown away. A test's own stands in. */
  settle?: () => Promise<void>;
  /** This process's exit hooks, run before it's replaced: `process.emit("exit")`. A test's own stands in. */
  exiting?: () => void;
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
  await (opts.settle ?? settleForNext)();
  const launch = opts.launch(failed);
  // What would run as this process exits, run now: `execve` ends it without them (an export's spool, its temp files).
  (opts.exiting ?? (() => process.emit("exit", 0)))();
  const why = (opts.exec ?? execInto)(launch.file, launch.argv, opts.env);
  const code = await startAndWait(launch, opts.env, opts.say);
  if (code !== null) return code;
  opts.say(`slipbox: nothing started (${why})`);
  return 1;
}
