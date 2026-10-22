// The spell checker's thread, from the main thread (25.6, D232): its dictionaries opened, words checked and
// suggestions asked on `spell-worker.ts`, each answer a promise — so keys are answered, and the window drawn, while
// Hunspell builds a dictionary. Started on first use, it keeps the process alive only while an answer is awaited. A
// thread that fails ends what's waiting with its error, and the next request starts another.

import type { SpellAnswer, SpellAsk } from "./spell-worker.ts";
import { type Dictionaries, type DictionaryFiles, ownWordsFile } from "./spell.ts";
import { workerUrl } from "./workers.ts";

type Handle = Worker & { ref?: () => void; unref?: () => void };

let worker: Handle | null = null;
let nextId = 0;
const waiting = new Map<number, { resolve: (answer: unknown) => void; reject: (err: Error) => void }>();

function thread(): Handle {
  if (worker) return worker;
  const w: Handle = new Worker(workerUrl("spell-worker.ts"));
  w.onmessage = (e: MessageEvent<SpellAnswer>) => {
    const p = waiting.get(e.data.id);
    waiting.delete(e.data.id);
    if (!waiting.size) w.unref?.();
    if (e.data.error !== undefined) p?.reject(new Error(e.data.error));
    else p?.resolve(e.data.answer);
  };
  w.onerror = (e) => {
    if (worker === w)
      stop(new Error(`the spell checker's thread stopped: ${(e as ErrorEvent).message || "no reason given"}`));
  };
  w.unref?.();
  worker = w;
  return w;
}

function ask<T>(request: SpellAsk): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let w: Handle;
    try {
      w = thread();
    } catch (err) {
      return reject(err instanceof Error ? err : new Error(String(err)));
    }
    const id = nextId++;
    waiting.set(id, { resolve: resolve as (answer: unknown) => void, reject });
    w.ref?.();
    w.postMessage({ ...request, id });
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
  if (worker) ask({ op: "add", word }).catch(() => {});
}

/** The thread stopped, what's waiting ended with why. */
function stop(err: Error): void {
  const was = [...waiting.values()];
  waiting.clear();
  worker?.terminate();
  worker = null;
  for (const p of was) p.reject(err);
}

/** Stop the thread (the next request starts another, which builds its dictionaries again). */
export function stopSpellThread(): void {
  stop(new Error("the spell checker's thread was stopped"));
}
