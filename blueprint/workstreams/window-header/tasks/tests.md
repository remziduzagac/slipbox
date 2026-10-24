---
status: doing
assignee: claude-24
blocked_by: [HDR-T3, HDR-T4]
tracker: [gh:#24]
created: "2026-10-24"
---

# HDR-T5: The cases' tests: unit tests and terminal checks

Every case in notes.md § The tasks has a unit test and, where it says T, a terminal check that drives slipbox through
it; the new commands and cases are covered.

## Description

- Unit tests in `tests/tui.test.ts` (the harness), written with each task.
- Terminal checks in `tests/terminal/checks/` (the feature's own file, `navigating.ts` or `reading.ts`): the buttons by
  the mouse (SGR clicks, as the mouse check sends them), the chip agreeing, a text file's and broken data's disabled
  buttons and their messages, typing ended with the changes kept, a split's other window, a narrow split, a diff's
  floating window with no header, the two settings, zen.
- `examples/home/CASES.md`: the header's cases and `ui.window_header`; the coverage's owners for the new commands.

## Acceptance criteria

- `bun test tests/tui.test.ts -t <the header's tests>` and `SLIPBOX_TERMINAL_JOBS=2 bun run test:terminal <the checks>`
  pass; the coverage test passes; each new behaviour's test fails with it undone once (checked).
- The pull request's body maps each case to its tests.

## References

- Delivers: requirements.md § Acceptance criteria (the tests).
- Rests on: (HDR-D2), (HDR-D3), (HDR-D4).
