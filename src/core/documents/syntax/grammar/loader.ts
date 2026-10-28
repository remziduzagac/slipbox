// One runtime initialization and the existing per-grammar lazy cache, including embedded grammars.
import { Language, Parser, Query } from "web-tree-sitter";
import runtime from "web-tree-sitter/tree-sitter.wasm" with { type: "file" };
import { lazy, load, loadError } from "../../../foundation/platform/lazy.ts";
import type { Grammar, Loaded } from "../contracts.ts";
import { WASM } from "./assets.ts";
import { EMBEDS } from "./descriptors.ts";
import { QUERIES } from "./queries.ts";

let runtimeReady: Promise<void> | null = null;

async function loadGrammar(g: Grammar): Promise<Loaded> {
  runtimeReady ??= Parser.init({ locateFile: () => runtime });
  await runtimeReady;
  const language = await Language.load(WASM[g]);
  const parser = new Parser();
  parser.setLanguage(language);
  const q = QUERIES[g];
  return {
    grammar: g,
    parser,
    language,
    defs: q.defs.trim() ? new Query(language, q.defs) : null,
    comments: new Query(language, q.comments),
    strings: new Query(language, q.strings),
  };
}

const key = (g: Grammar) => `grammar:${g}`;

/**
 * A grammar if it's loaded, with those of the languages its files embed (16.22); else their loading
 * starts (once) and this is null until they land. An embedded one that fails to load is left out.
 */
export function grammarNow(g: Grammar): Loaded | null {
  const own = lazy(key(g), () => loadGrammar(g));
  let ready = own !== null;
  for (const e of EMBEDS[g] ?? []) if (!lazy(key(e), () => loadGrammar(e)) && !loadError(key(e))) ready = false;
  return ready ? own : null;
}

/** A grammar, and those its files embed, waited for (the CLI). */
export async function grammar(g: Grammar): Promise<Loaded | null> {
  const [own] = await Promise.all([
    load(key(g), () => loadGrammar(g)),
    ...(EMBEDS[g] ?? []).map((e) => load(key(e), () => loadGrammar(e))),
  ]);
  return own;
}
