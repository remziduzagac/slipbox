---
status: done
assignee: claude-cli
blocked_by: []
created: "2026-10-13"
---

# TT-T1: The headless harness and the parallel runner

slipbox in a pseudo-terminal of Bun's own, read through a headless xterm (TT-D2), many at once (TT-D6).

## Description

- `@xterm/headless` 6.0.0 admitted as a dev dependency (D192, D201: MIT, no dependencies, a week old).
- `tests/terminal/session.ts`: today's `Session` API (tests/e2e/session.ts) on `Bun.Terminal` and the headless xterm:
  start (home, demo vault, `startAt`, `cwd`, `args`, `env`, `setup`, `noWait`), `keys` as a terminal encodes them,
  `type`, bracketed `paste`, `see`/`notSee`/`until`/`status`/`topBar`, `screen`, `styleOf`/`runs` from the cells'
  colours and attributes, the title (OSC 0/2) and OSC 52 captured from the output, `resize`, `restart`, `signal`,
  `cliIn`, `quit`; the emulator's replies to slipbox's queries written back; `XDG_*`, `HOME` and `TMPDIR` its own.
- `tests/terminal/run.ts` and `bun run test:terminal [area or name…]`: the checks run concurrently, as many as the
  machine has cores; each check's commands traced (`SLIPBOX_TRACE`); every failure reported at the end with the
  screen; a summary per area.
- Two of today's scenarios carried over first, as the pattern: one on the demo vault, one on the reference set.

## Acceptance criteria

- The two checks pass here on Linux, in parallel with themselves many times over; a test of the session's key
  encodings and its reading of colours.
