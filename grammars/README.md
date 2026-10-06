# grammars

Tree-sitter grammars built to WebAssembly for slipbox's source files (plan `16.18`–`16.22`), for the languages whose
npm packages ship no `.wasm` of their own. The rest come from npm (`package.json`): HTML, CSS, PHP, Ruby, C, C++,
Svelte, and the first set (TypeScript, JavaScript, Python, shell, Lua, Go, Rust).

Each is built from its source at the commit below by `scripts/build-grammars.ts`, which says how to rebuild one or move
it to a newer commit. All are MIT-licensed; each licence is in `licenses/`.

| Grammar | Source | Commit | Licence |
| --- | --- | --- | --- |
| Swift | [alex-pinkus/tree-sitter-swift](https://github.com/alex-pinkus/tree-sitter-swift) | `82bb3a5` | MIT, alex-pinkus |
| SCSS | [serenadeai/tree-sitter-scss](https://github.com/serenadeai/tree-sitter-scss) | `c478c68` | MIT, Serenade Labs |
| Vue | [tree-sitter-grammars/tree-sitter-vue](https://github.com/tree-sitter-grammars/tree-sitter-vue) | `ce8011a` | MIT, Amaan Qureshi |
| Astro | [virchau13/tree-sitter-astro](https://github.com/virchau13/tree-sitter-astro) | `213f6e6` | MIT, Vir Chaudhury |
| Dockerfile | [camdencheek/tree-sitter-dockerfile](https://github.com/camdencheek/tree-sitter-dockerfile) | `971acdd` | MIT, Camden Cheek |

**Built with** tree-sitter-cli 0.27.0, whose WebAssembly (wasi-sdk) loads in web-tree-sitter 0.25, the runtime
slipbox uses. Moving to a newer web-tree-sitter means building these again and running the tests.

**Swift's one change:** its scanner prints to `stderr` when it can't allocate its state, and the runtime has no
`stderr`; the line is dropped (it still exits). The CLI also says its scanner calls `strncpy`, `towlower` and
`towupper`, which its own runtime lacks; web-tree-sitter 0.25 has them, and the tests load and parse every grammar.
