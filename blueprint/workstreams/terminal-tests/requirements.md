# Requirements

## Goals

- Every feature a person reaches in the TUI is checked in a terminal: the keys a keyboard sends, the screen it draws,
  one check per feature (TT-D3), and every command and every area of the reference set covered or left out with a
  reason (TT-D4).
- The terminal tests need no herdr: headless, in parallel, locally and in CI on Linux and macOS (TT-D2, TT-D6).
- Their content comes from the sample folders, extended where a case is missing (TT-D5).

## Non-goals

- Native Windows: Bun's pseudo-terminal is POSIX's; Windows' console (ConPTY) comes with `14.17`.
- Replacing the headless unit tests (`bun run test`), which drive the model; the terminal tests drive slipbox.
- Pixels: pictures are checked by what slipbox sends the terminal, Kitty's own drawing in the few herdr checks.

## Builds on

- design/testing.md § The terminal tests: today's runner, `Session` API and scenarios (135, in `tests/e2e/`), whose
  checks carry over; the trace of the commands run (`SLIPBOX_TRACE`).
- The reference set, `examples/home` and its `CASES.md` (1,081 cases by area), and `scripts/build-home.ts`.
- The prototype in notes.md.

## Acceptance criteria

- `bun run test:terminal` runs every check headless, in parallel, and reports every failure at the end; filters by
  area and name; on Linux and macOS here and in CI, inside the `ci` check.
- Each check is one feature, named by it, saying the cases and commands it covers; the coverage test passes: no command
  and no `CASES.md` area uncovered but those listed, each with its reason.
- No check writes its own document set: the content they need is in `examples/`, with its `CASES.md` entries.
- Every scenario of today carried over or its check folded into another, none lost: a table in notes.md maps old to
  new. The six failing today (notes.md) fixed, each found to be the check's fault or slipbox's, a bug with its
  regression test.
- herdr keeps the screenshots and the real-terminal set; `tests/e2e/` and the word "e2e" are gone.
- `bun run check` passes; the docs and the blueprint say "terminal tests".

## Changes

### MODIFIED requirements.md § Quality goals

Adds a goal: **Every feature checked in a terminal** (TT-D2, TT-D3, TT-D4) — by the keys a keyboard sends and the
screen drawn, one check per feature, headless and in parallel, in CI on Linux and macOS; a command or a reference-set
area no check covers fails a test. How: design/testing.md § The terminal tests.

Previously: the terminal tests were a developer's tool, not in CI.
