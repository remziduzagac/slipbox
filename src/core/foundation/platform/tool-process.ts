// Finite tool jobs: bounded capture, owned process groups, and a deadline that includes inherited pipes. A group
// slipbox owns never outlives it: stopped when it exits, and on the signals that end it.
import { type ChildProcess, spawn } from "node:child_process";

const MiB = 1024 * 1024;
/** What a tool may print on each stream before its run fails: an installer's progress, a few lines. */
export const TOOL_OUTPUT_BYTES = MiB;
/** A linter's findings are what it's run for: as much as slipbox reads from git (16 MiB). */
export const LINT_OUTPUT_BYTES = 16 * MiB;
/** From the graceful stop to the forced one; the readers close 100 ms after that. */
const GRACE_MS = 250;

/** Why slipbox gave up on a run: output past the limit, its deadline, a cancel, no start, or its pipes failing. */
export type ToolFailure = "overflow" | "deadline" | "cancelled" | "spawn" | "io";

export interface ToolResult {
  code: number | null;
  /** The signal that ended it, whoever sent it: then what it printed may be cut short. */
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: string;
  failure?: ToolFailure;
}

/**
 * Why a run can't be read as whole, or null when it finished on its own: slipbox's limit, deadline or cancel (with
 * "partial output discarded" when it had printed something), a start or pipe failure, or a signal that ended it.
 */
export function toolFailure(r: ToolResult): string | null {
  if (r.error) {
    const cut = r.failure === "overflow" || r.failure === "deadline" || r.failure === "cancelled";
    return cut && (r.stdout || r.stderr) ? `${r.error}; partial output discarded` : r.error;
  }
  return r.signal ? `ended by ${r.signal}` : null;
}

const sizeText = (n: number) => (n % MiB === 0 ? `${n / MiB} MiB` : n % 1024 === 0 ? `${n / 1024} KiB` : `${n} bytes`);

/** A run's group (on Windows, its child) sent a signal; one already gone is no error. */
function kill(child: ChildProcess, sig: NodeJS.Signals): void {
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, sig);
    else child.kill(sig);
  } catch {}
}

/** The runs still going, each with its own stop (a cancel): what slipbox's end stops. */
const live = new Map<ChildProcess, (why: string, failure: ToolFailure) => void>();
const ENDING = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
let exitHooked = false;
/** Runs from just before their spawn to their end: while there are any, slipbox's end is watched. */
let held = 0;

/** Every live group stopped at once: terminated, the grace waited (slipbox is ending), then killed. */
function stopAllNow(): void {
  if (!live.size) return;
  for (const child of live.keys()) kill(child, "SIGTERM");
  Bun.sleepSync(GRACE_MS);
  for (const child of live.keys()) kill(child, "SIGKILL");
}

/**
 * A signal that ends slipbox, while tools run. Another handler of it (the TUI's, which saves first) ends the process:
 * the runs are cancelled, their forced stop still timed. Alone, the signal keeps its own effect: the groups are stopped
 * now, then it's raised again, so the process ends by it as it would have.
 */
const onEnding: Record<(typeof ENDING)[number], () => void> = {
  SIGINT: () => ending("SIGINT"),
  SIGTERM: () => ending("SIGTERM"),
  SIGHUP: () => ending("SIGHUP"),
};
function ending(sig: (typeof ENDING)[number]): void {
  if (process.listenerCount(sig) > 1) {
    for (const stop of [...live.values()]) stop("tool cancelled", "cancelled");
    return;
  }
  stopAllNow();
  for (const s of ENDING) process.off(s, onEnding[s]);
  process.kill(process.pid, sig);
}

/**
 * Before a spawn: slipbox's end watched from now. A signal arriving while the tool starts is handled once this turn's
 * code is done, by when the tool is tracked; watching only from then, the signal could end slipbox and leave it.
 */
function hold(): void {
  if (!exitHooked) {
    exitHooked = true;
    process.on("exit", stopAllNow);
  }
  // First, so it's here before a handler that ends the process sees the signal.
  if (held++ === 0) for (const s of ENDING) process.prependListener(s, onEnding[s]);
}

/** A run over (or never started): slipbox's end no longer watched once none is left. */
function release(): void {
  if (--held === 0) for (const s of ENDING) process.off(s, onEnding[s]);
}

export function runTool(
  argv: string[],
  opts: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs: number;
    signal?: AbortSignal;
    outputBytes?: number;
    graceMs?: number;
    input?: string;
  },
): Promise<ToolResult> {
  return new Promise((resolve) => {
    const cap = opts.outputBytes ?? TOOL_OUTPUT_BYTES;
    const grace = opts.graceMs ?? GRACE_MS;
    let child: ChildProcess;
    // Chunks kept as they come, joined once: a copy per chunk would be quadratic at 16 MiB.
    const streams = { stdout: { chunks: [] as Buffer[], size: 0 }, stderr: { chunks: [] as Buffer[], size: 0 } };
    let error: string | undefined;
    let failure: ToolFailure | undefined;
    let code: number | null = null;
    let ended: NodeJS.Signals | null = null;
    let settled = false;
    let escalation: ReturnType<typeof setTimeout> | undefined;
    let cutoff: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const text = (s: { chunks: Buffer[]; size: number }) => Buffer.concat(s.chunks, s.size).toString();
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(escalation);
      clearTimeout(cutoff);
      opts.signal?.removeEventListener("abort", abort);
      kill(child, "SIGKILL"); // An owned helper may have exited while its descendants still hold its pipes.
      live.delete(child);
      release();
      child.stdin?.destroy();
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve({
        code,
        signal: ended,
        stdout: text(streams.stdout),
        stderr: text(streams.stderr),
        ...(error ? { error, failure } : {}),
      });
    };
    const stop = (why: string, kind: ToolFailure) => {
      if (error || settled) return;
      error = why;
      failure = kind;
      kill(child, "SIGTERM");
      escalation = setTimeout(() => kill(child, "SIGKILL"), grace);
      cutoff = setTimeout(finish, grace + 100);
    };
    const abort = () => stop("tool cancelled", "cancelled");
    const none = { code: null, signal: null, stdout: "", stderr: "" };
    if (opts.signal?.aborted) return resolve({ ...none, error: "tool cancelled", failure: "cancelled" });
    hold();
    try {
      child = spawn(argv[0]!, argv.slice(1), {
        cwd: opts.cwd,
        env: opts.env,
        stdio: [opts.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
    } catch (err) {
      release();
      return resolve({ ...none, error: (err as Error).message ?? String(err), failure: "spawn" });
    }
    live.set(child, stop);
    opts.signal?.addEventListener("abort", abort, { once: true });
    deadline = setTimeout(() => stop("tool deadline exceeded", "deadline"), opts.timeoutMs);
    const capture = (data: Buffer, name: "stdout" | "stderr") => {
      if (settled || error) return;
      const s = streams[name];
      const room = cap - s.size;
      const kept = data.length > room ? data.subarray(0, room) : data;
      if (kept.length) {
        s.chunks.push(kept);
        s.size += kept.length;
      }
      if (data.length > room) stop(`${name} output limit (${sizeText(cap)}) exceeded`, "overflow");
    };
    child.stdin?.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code !== "EPIPE") stop(`tool input failed: ${err.message}`, "io");
    });
    child.stdin?.end(opts.input);
    child.stdout!.on("data", (data: Buffer) => capture(data, "stdout"));
    child.stderr!.on("data", (data: Buffer) => capture(data, "stderr"));
    child.stdout!.on("error", (err) => stop(`tool output failed: ${err.message}`, "io"));
    child.stderr!.on("error", (err) => stop(`tool output failed: ${err.message}`, "io"));
    // Not started (no pid): its own message, as before. A later error (a kill that failed) keeps the first reason.
    child.on("error", (err) => {
      if (!error) {
        error = err.message;
        failure = child.pid === undefined ? "spawn" : "io";
      }
      finish();
    });
    child.once("exit", (value, sig) => {
      code = value;
      ended = sig;
    });
    child.once("close", finish);
  });
}
