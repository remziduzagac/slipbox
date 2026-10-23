// The spell checker's thread (25.6, D232): Hunspell's dictionaries built and asked here, off the main thread, where
// building one blocks only this thread. Each request names its dictionaries, so a thread started again builds them again
// as it's asked; and requests are answered in the order they came, so a word added is known to every check after it.

import { openSpeller } from "./hunspell.ts";
import { type DictionaryFiles, HOLD_STATES, ownWords, type Speller } from "./spell.ts";

declare const self: Worker;

/** What the spell checker's thread is asked: `wordsFile` is your own words, put in a dictionary as it's built. */
export type SpellAsk =
  | { op: "open"; files: DictionaryFiles[]; wordsFile: string }
  | { op: "check"; files: DictionaryFiles[]; wordsFile: string; words: string[] }
  | { op: "suggest"; files: DictionaryFiles[]; wordsFile: string; word: string }
  | { op: "add"; word: string }
  | { op: "hold"; dic: string; limit: number; flag: SharedArrayBuffer };

/** A request, by its number: its answer has the number too. */
export type SpellRequest = SpellAsk & { id: number };

/** Its answer: what was asked for, or why there's none. */
export type SpellAnswer = { id: number; answer?: unknown; error?: string };

const spellers = new Map<string, Speller>();

/** Tests' holds (`holdBuild`), by the words they hold: such a dictionary waits, once asked for, before it's built. */
const holds = new Map<string, { flag: Int32Array; limit: number }>();

/** Waiting for the test to let go, or its limit: the flag's second slot says where it is (`HOLD_STATES`). */
function waitIfHeld(dic: string): void {
  const hold = holds.get(dic);
  if (!hold) return;
  holds.delete(dic);
  const { flag, limit } = hold;
  Atomics.store(flag, 1, HOLD_STATES.indexOf("waiting"));
  const how = Atomics.wait(flag, 0, 0, limit);
  Atomics.store(flag, 1, HOLD_STATES.indexOf(how === "timed-out" ? "ran out" : "let go"));
}

/** The dictionaries named, each built the first time. */
async function open(files: DictionaryFiles[], wordsFile: string): Promise<Speller[]> {
  const out: Speller[] = [];
  for (const f of files) {
    const key = `${f.aff}\n${f.dic}`;
    let s = spellers.get(key);
    if (!s) {
      waitIfHeld(f.dic);
      s = await openSpeller(f, ownWords(wordsFile));
      spellers.set(key, s);
    }
    out.push(s);
  }
  return out;
}

async function answer(m: SpellRequest): Promise<unknown> {
  switch (m.op) {
    case "open":
      await open(m.files, m.wordsFile);
      return true;
    case "check": {
      const ss = await open(m.files, m.wordsFile);
      return m.words.map((w) => ss.some((s) => s.correct(w)));
    }
    case "suggest":
      return (await open(m.files, m.wordsFile)).map((s) => s.suggest(m.word));
    case "add":
      for (const s of spellers.values()) s.add(m.word);
      return true;
    case "hold":
      holds.set(m.dic, { flag: new Int32Array(m.flag), limit: m.limit });
      return true;
  }
}

let queue: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent<SpellRequest>) => {
  const m = e.data;
  queue = queue.then(() =>
    answer(m).then(
      (a) => self.postMessage({ id: m.id, answer: a } satisfies SpellAnswer),
      (err: unknown) =>
        self.postMessage({ id: m.id, error: (err as Error)?.message ?? String(err) } satisfies SpellAnswer),
    ),
  );
};
