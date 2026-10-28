// Grammar assets are eagerly imported; parser initialization remains demand-driven in loader.ts.
// Each language's own package, its wasm built for this runtime's ABI (a mismatched build can trip
// an assertion in a grammar's scanner: bash's heredocs did). Install scripts stay off
// (`bunfig.toml`): only the wasm is used, never the native bindings.
import lua from "@tree-sitter-grammars/tree-sitter-lua/tree-sitter-lua.wasm" with { type: "file" };
import svelte from "@tree-sitter-grammars/tree-sitter-svelte/tree-sitter-svelte.wasm" with { type: "file" };
import bash from "tree-sitter-bash/tree-sitter-bash.wasm" with { type: "file" };
import c from "tree-sitter-c/tree-sitter-c.wasm" with { type: "file" };
import cpp from "tree-sitter-cpp/tree-sitter-cpp.wasm" with { type: "file" };
import css from "tree-sitter-css/tree-sitter-css.wasm" with { type: "file" };
import go from "tree-sitter-go/tree-sitter-go.wasm" with { type: "file" };
import html from "tree-sitter-html/tree-sitter-html.wasm" with { type: "file" };
import javascript from "tree-sitter-javascript/tree-sitter-javascript.wasm" with { type: "file" };
import php from "tree-sitter-php/tree-sitter-php.wasm" with { type: "file" };
import python from "tree-sitter-python/tree-sitter-python.wasm" with { type: "file" };
import ruby from "tree-sitter-ruby/tree-sitter-ruby.wasm" with { type: "file" };
import rust from "tree-sitter-rust/tree-sitter-rust.wasm" with { type: "file" };
import tsx from "tree-sitter-typescript/tree-sitter-tsx.wasm" with { type: "file" };
import typescript from "tree-sitter-typescript/tree-sitter-typescript.wasm" with { type: "file" };
// Those npm ships no wasm for: built from their sources (grammars/README.md, scripts/build-grammars.ts).
import astro from "../../../../../grammars/tree-sitter-astro.wasm" with { type: "file" };
import dockerfile from "../../../../../grammars/tree-sitter-dockerfile.wasm" with { type: "file" };
import scss from "../../../../../grammars/tree-sitter-scss.wasm" with { type: "file" };
import swift from "../../../../../grammars/tree-sitter-swift.wasm" with { type: "file" };
import vue from "../../../../../grammars/tree-sitter-vue.wasm" with { type: "file" };

import type { Grammar } from "../contracts.ts";

export const WASM: Record<Grammar, string> = {
  typescript,
  tsx,
  javascript,
  python,
  bash,
  lua,
  go,
  rust,
  swift,
  html,
  css,
  scss,
  php,
  dockerfile,
  vue,
  svelte,
  astro,
  ruby,
  c,
  cpp,
};

/** Every grammar slipbox parses code with (16.8): what the reference set must have a file of each for. */
export const GRAMMARS = Object.keys(WASM) as Grammar[];
