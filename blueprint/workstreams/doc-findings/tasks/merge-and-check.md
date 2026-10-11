---
status: todo
assignee:
blocked_by: [DF-T1, DF-T2, DF-T3, DF-T4, DF-T5, DF-T6, DF-T7]
created: "2026-10-11"
---

# DF-T10: Merged, the fixed parts' terminal tests, the check

The tasks' branches merged onto main, the terminal tests of what they changed run, `bun run check` green.

## Description

- Each worktree's commits cherry-picked onto main, conflicts merged with care.
- The e2e scenarios covering the fixed parts run in the e2e tabs; new scenarios where a fix has none.
- `bun run check`; the docs test.

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task (`docs/manual/`, `docs/guides/`, the skill for the CLI),
  without IDs; `tests/docs.test.ts` passes.
- The new design text written under its entry in DF's [design.md](../design.md), never in the root's design files.
- The typecheck and the test files touched pass; the whole suite once at the end.

## References

- Delivers: requirements.md § Acceptance criteria.

## Log
