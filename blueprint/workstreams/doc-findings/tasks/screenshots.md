---
status: todo
assignee:
blocked_by: [DF-T6, DF-T7]
created: "2026-10-11"
---

# DF-T9: Screenshots in the guides and the screen chapter

About 10 to 15 screenshots, made by `scripts/screenshot.ts` from slipbox in a herdr pane of the coordinator's own.

## Description

- `scripts/screenshot.ts`, tried and committed; a script that takes them all from the reference set in one go.
- The places: the writers' proposals (DOC's tasks), the guides' key moments and the screen chapter only (DF-D19).
- Stored in `docs/images/`, linked with alt text that says what each shows.

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task (`docs/manual/`, `docs/guides/`, the skill for the CLI),
  without IDs; `tests/docs.test.ts` passes.
- The new design text written under its entry in DF's [design.md](../design.md), never in the root's design files.
- The typecheck and the test files touched pass; the whole suite once at the end.

## References

- Delivers: DF-D19; requirements.md § Documentation (DF's change).

## Log
