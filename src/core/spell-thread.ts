// The spell checker's thread, from the main thread (25.6, D232): its dictionaries opened, words checked and
// suggestions asked on `spell-worker.ts`, each answer a promise — so keys are answered, and the window drawn, while
// Hunspell builds a dictionary. Started on first use, it keeps the process alive only while an answer is awaited.
// Requests go one at a time through a bounded mailbox (worker-requests.ts): past its room a request waits its turn; one
// that takes over 20 seconds once the thread has it, or that the thread fails on, ends alone with why, and the thread
// is started afresh for the rest.

import type { SpellAnswer, SpellAsk } from "./spell-worker.ts";
import { type Dictionaries, type DictionaryFiles, HOLD_STATES, ownWordsFile } from "./spell.ts";
import { WorkerRequests } from "./worker-requests.ts";
import { workerUrl } from "./workers.ts";

let channel: WorkerRequests | null = null;

function ask<T>(request: SpellAsk): Promise<T> {
  channel ??= new WorkerRequests(() => new Worker(workerUrl("spell-worker.ts")), { deadline: 20_000 });
  return channel
    .request<SpellAnswer>(request)
    .then((result) => result.answer as T)
    .catch((error: Error) => {
      if (error.message.startsWith("worker stopped unexpectedly:"))
        throw new Error(error.message.replace("worker stopped unexpectedly:", "the spell checker's thread stopped:"));
      throw error;
    });
}

/** A dictionary built on the thread (once: the second time, at once); rejected with why it couldn't be. */
export async function openDictionary(files: DictionaryFiles): Promise<void> {
  await ask({ op: "open", files: [files], wordsFile: ownWordsFile() });
}

/** Some dictionaries as a checker asks them, on the thread. */
export function threadDictionaries(files: DictionaryFiles[]): Dictionaries {
  return {
    check: (words) => ask({ op: "check", files, wordsFile: ownWordsFile(), words }),
    suggest: (word) => ask({ op: "suggest", files, wordsFile: ownWordsFile(), word }),
  };
}

/** One of your words put in every dictionary the thread has built (one it builds later reads it from your file). */
export function addToDictionaries(word: string): void {
  if (channel) ask({ op: "add", word }).catch(() => {});
}

/** Where a test's hold is (`holdBuild`): set, the thread waiting there, let go by the test, or its wait run out. */
export type HoldState = (typeof HOLD_STATES)[number];

/**
 * For a test: the dictionary whose words are `dic`, the next time the thread is asked to build it, waits first until
 * the test lets it go, or for `limit` ms on the thread's own clock, so that a main thread held until it's built is let
 * go too. Asked for when it's built already, it isn't built again: the hold is spent, never waiting. Stopping the
 * thread ends a wait, the dictionary unbuilt.
 */
export async function holdBuild(dic: string, limit = 40_000): Promise<{ state: () => HoldState; letGo: () => void }> {
  const flag = new Int32Array(new SharedArrayBuffer(8));
  await ask({ op: "hold", dic, limit, flag: flag.buffer as SharedArrayBuffer });
  return {
    state: () => HOLD_STATES[Atomics.load(flag, 1)]!,
    letGo: () => {
      Atomics.store(flag, 0, 1);
      Atomics.notify(flag, 0);
    },
  };
}

/** Stop the thread and settle every accepted request; a later request starts a fresh one. */
export function stopSpellThread(): void {
  channel?.dispose();
  channel = null;
}
