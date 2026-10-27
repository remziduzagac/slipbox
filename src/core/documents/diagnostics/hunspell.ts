// Hunspell itself (25.6): as WebAssembly (hunspell-asm, MIT; Hunspell MPL-1.1, plan 14.6), loaded the first time a
// dictionary is built. Building one blocks its thread — Turkish's 9 MB for a few tenths of a second, a few times that on
// a slow machine — so only the spell checker's thread imports this (`spell-worker.ts`, D232): the main thread never
// loads Hunspell, and keys are answered while a dictionary builds.

import { readFileSync } from "node:fs";
import type { HunspellFactory } from "hunspell-asm";
// Its CommonJS build: the ES one imports Hunspell's runtime as a namespace, which a compiled binary can't call.
import { loadModule } from "hunspell-asm/dist/cjs/index.js";
import { type DictionaryFiles, ownWords, type Speller } from "./spell.ts";

/**
 * A dictionary's text as UTF-8, as Hunspell is given it here: one in another encoding (`SET ISO8859-9`, as older
 * system dictionaries are) decoded, and said to be UTF-8.
 */
export function asUtf8(aff: Uint8Array, dic: Uint8Array): { aff: Uint8Array; dic: Uint8Array } {
  const head = new TextDecoder("latin1").decode(aff);
  const set = /^SET\s+(\S+)/m.exec(head)?.[1];
  if (!set || /^utf-?8$/i.test(set)) return { aff, dic };
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(set.replace(/^ISO(\d)/i, "ISO-$1").replace(/^microsoft-cp/i, "windows-"));
  } catch {
    return { aff, dic };
  }
  const enc = new TextEncoder();
  return {
    aff: enc.encode(decoder.decode(aff).replace(/^SET\s+\S+/m, "SET UTF-8")),
    dic: enc.encode(decoder.decode(dic)),
  };
}

let factory: Promise<HunspellFactory> | null = null;
let mounted = 0;
let built = 0;

/** How many dictionaries this thread has built: the main thread's stay none, as the spell checker's thread builds them. */
export function dictionariesBuilt(): number {
  return built;
}

/** A dictionary opened: Hunspell loaded the first time, its files mounted, read, and let go; your words put in. */
export async function openSpeller(files: DictionaryFiles, words = ownWords()): Promise<Speller> {
  const f = await (factory ??= loadModule());
  const text = asUtf8(readFileSync(files.aff), readFileSync(files.dic));
  const n = ++mounted;
  const aff = f.mountBuffer(text.aff, `d${n}.aff`);
  const dic = f.mountBuffer(text.dic, `d${n}.dic`);
  const h = f.create(aff, dic);
  built++;
  f.unmount(aff);
  f.unmount(dic);
  const s: Speller = { correct: (w) => h.spell(w), suggest: (w) => h.suggest(w), add: (w) => h.addWord(w) };
  for (const w of words) s.add(w);
  return s;
}
