---
status: done
assignee:
blocked_by: [ORG-T26]
created: "2026-10-26"
---

# ORG-T27: Syntax responsibility splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate grammar loading, tree ownership, code-model extraction and link tokens behind the existing syntax entry.
Preserve eager imports, initialization and disposal.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

## Implementation

[`t27-extraction.json`](../manifests/t27-extraction.json) records the exact static/runtime/declaration deltas and the
symbols assigned to each owner. `syntax.ts:15` retains all original public type/runtime exports; function names,
arities and `GRAMMARS` order match. No existing test, fixture DATA, worker URL, build entry or selector was rewritten.

| Owner under `src/core/documents/syntax/` | Lines | Responsibility |
| --- | ---: | --- |
| `syntax.ts` | 33 | Original entry/header, compatible re-exports |
| `contracts.ts` | 159 | Original parser, position and document records |
| `grammar/assets.ts` | 53 | Same eager WASM imports and grammar enumeration |
| `grammar/descriptors.ts` | 52 | File selection, embedded-language lists and highlighting names |
| `grammar/queries.ts` | 123 | Original grammar query strings |
| `grammar/loader.ts` | 49 | Same runtime promise, lazy cache, load errors and readiness |
| `tree/markup.ts` | 100 | Embedded sections and markup headings/ids |
| `tree/outline.ts` | 79 | Definition labels and kinds |
| `tree/positions.ts` | 15 | Position ordering and final occupied line |
| `tree/tree.ts` | 198 | Parse ownership, embedded traversal and disposal |
| `model/code-model.ts` | 324 | Definitions, documentation, imports and header extraction |
| `links/tokens.ts` | 54 | Link-like text and UTF-16 comment positions |

`grammar/loader.ts:10` keeps the singleton runtime promise and existing lazy keys. The public entry still eagerly
imports every asset; only the five local `grammars/` imports gain one parent segment. Package asset specifiers are
unchanged. `tree/tree.ts:28` retains embedded-child-first disposal, and `:169` retains the grammar admission check
before accessing a tree root. The model body is unchanged apart from replacing `this.g`, `this.tree` and `this.source`
with explicit parameters. All other tree members are unchanged. The 1,170-line syntax cap is removed; six handwritten
legacy exceptions remain. Both worker modules and `package.json` are byte-identical.

## Verification

Baseline is the preceding ORG-T26 task tree in a clean archive. Bun 1.4.2, Linux aarch64, `TMPDIR=/var/tmp`, NO_COLOR
and FORCE_COLOR unset, TERM=xterm-ghostty and COLORTERM=truecolor. No whole-suite or all-terminal run was used.

```sh
bun test tests/core/documents/syntax/grammar.test.ts tests/core/documents/syntax/documentation.test.ts \
  tests/core/documents/syntax/links.test.ts tests/core/documents/syntax/vault-examples.test.ts \
  tests/syntax-worker.test.ts tests/tui/documents/views/syntax-worker.test.ts \
  tests/tui/documents/views/code-notebook.test.ts
bun test tests/core/documents/syntax tests/syntax-worker.test.ts \
  tests/tui/documents/views/syntax-worker.test.ts tests/tui/documents/views/code-notebook.test.ts tests/organization
bun run test:terminal 'code: Python' 'code: Go, Rust' 'code: beyond the grammars' 'window header: code as source'
```

- Existing owners: 70 pass, 0 fail, 607 assertions across seven files before/after (11.71/11.73 s). With three new
  characterization cases and organization guards: 100 pass, 0 fail, 1,331 assertions across seventeen files (11.84 s).
- Four affected terminal checks pass before/after (9.8/8.0 s). A production build passes the Python/comment-link and
  mixed-language/Dockerfile/Vue terminal checks through the compiled executable. Artifact SHA-256:
  `7c5a19eaae0501f9cee247cd3949992736adc028f485c8b5118018aa8d0d54fc`.
- Independent source/compiled probes compare complete spans, outlines, errors, comments, comment links, embedded
  languages and code models for all twenty grammars, before and after: eighty records match exactly. Public runtime
  names/function arities and grammar enumeration also match. All packaged/local WASM assets load in compiled probes.
- Body audit: sixty original top-level declarations and fifteen type token trees match; eleven other tree members
  match, and the model body matches after explicit receiver substitution. Worker sources are byte-identical.
- Static edges: 2,100 → 2,127 (6 removed, 33 added); runtime: 1,688 → 1,705 (6 removed, 23 added). Declarations:
  3,855 → 3,858, three additions and none removed, using the corrected scanner on both sides. Build entries are unchanged,
  all imports resolve, and all seven SCC memberships remain identical: 2, 2, 3, 3, 5, 8, 8. No cycle reduction is claimed.
- The tokens test closure is two graph nodes/one source module using `importGraph`/`reach` from its exact test entry;
  it loads neither grammar initialization nor tree/public-entry composition. All earlier syntax/thread/worker test
  selections and terminal selectors are preserved; new token and ownership cases are selected by their actual owners.

The three characterization cases also pass against the baseline implementation (12 assertions). Ten mechanism owners
have reverse-edge fixtures forbidding entry/tree-composition imports, even for types: 90 entry and 30 tree-owner variant
probes reject their edges, while lower-level imports are accepted. Removing the contracts guard makes the existing
boundary fixture fail; restoring it passes (seven focused tests, 63 assertions). Immutable manifest/SCC comparison,
typecheck, Biome, docs/spelling/file links, explicit Markdown lint, boundary and size checks pass. Assertion totals and
times are host observations; declarations, bodies and complete snapshots provide preservation evidence.
