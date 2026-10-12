# Requirements

## Goals

- slipbox does what its design and its docs say: every bug and disagreement the docs' writers found, settled as the
  user decided (decisions.md).
- A folder you clone can't widen what slipbox sends over the network or writes outside its own folders (DF-D1, DF-D2,
  DF-D3, DF-D7).
- Someone who doesn't use vim can type, select and undo as in a desktop editor (DF-D15).
- The guides and the screen chapter show what the reader should see (DF-D19).

## Non-goals

- The skill as an npx package for common harnesses: a workstream of its own (ideas.md § Agent surface).
- Anything the findings didn't name.

## Builds on

- DOC's notes § What writing the docs found in the code, and the user's answers (notes.md).
- The design files each task names, and the user docs, which say what the code does now and change with it.

## Acceptance criteria

- Each fix with a regression test that fails without it (mutation-checked), and tried on the reference set (D209).
- The docs changed with each user-visible change, in the same task; `tests/docs.test.ts` passes.
- The terminal tests of the parts fixed run in the e2e tabs (the user's approval for the fixed parts stands).
- `bun run check` passes.

## Changes

### MODIFIED requirements.md § Constraints, Safety

Adds: what reaches the network, a web picture fetched or a package installed, is yours alone to allow: a folder's
settings never turn either on (DF-D1). An export copies pictures of the root only, and never writes over a note
(DF-D2, DF-D3).

Previously: § Safety held `2.9`, `7.5`, `12.5` and `13.2`, with nothing on the network or exports.

### MODIFIED requirements.md § Documentation

Adds: the guides and the screen chapter carry screenshots, made by a script from slipbox itself on the reference set
and retaken when the UI changes (DF-D19).

Previously: "slipbox ships user documentation in Markdown in `docs/` …", text only.
