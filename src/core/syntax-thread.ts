// The code files' syntax thread, from the main thread (16.7–16.9): a source's grammar loaded, its tree parsed and what
// the TUI keeps of it extracted on `syntax-worker.ts`, each answer a promise — so a big file's pass never holds up a
// key. One for the process, as the spelling thread is, whatever opens code files; started on first use, it keeps the
// process alive only while an answer is awaited. Requests go one at a time through a bounded mailbox
// (worker-requests.ts): past its room a request waits its turn; one that takes over twenty seconds once the thread has
// it, or that the thread fails on, ends alone with why, and the thread is started afresh for the rest.

import type { Grammar } from "./syntax.ts";
import type { SyntaxSnapshot } from "./syntax-worker.ts";
import { WorkerRequests } from "./worker-requests.ts";
import { workerUrl } from "./workers.ts";

/** The largest source sent to the thread (UTF-8 bytes): a bigger one keeps its text without this structure. */
export const SYNTAX_SOURCE_LIMIT = 4 * 1024 * 1024;

let channel: WorkerRequests | null = null;

/** A source's structure, from the thread; rejected (a `WorkerRequestError`) with why it couldn't be had. */
export function syntaxOnThread(grammar: Grammar, source: string, signal?: AbortSignal): Promise<SyntaxSnapshot> {
  // A pass is one source's, whole: a 4 MB minified bundle's takes over four seconds on a fast machine, more on a busy
  // one, so the deadline is for a thread that's stuck, not a big file (the spelling thread's). No cap on an answer:
  // its size follows its source's, which SYNTAX_SOURCE_LIMIT bounds.
  channel ??= new WorkerRequests(() => new Worker(workerUrl("syntax-worker.ts")), {
    deadline: 20_000,
    bytes: 16 * 1024 * 1024,
    result: Infinity,
  });
  return channel
    .request<{ value: SyntaxSnapshot }>({ grammar, source }, { signal, bytes: source.length * 2 })
    .then((answer) => answer.value);
}

/** Stop the thread and settle every request; a later request starts a fresh one. */
export function stopSyntaxThread(): void {
  channel?.dispose();
  channel = null;
}
