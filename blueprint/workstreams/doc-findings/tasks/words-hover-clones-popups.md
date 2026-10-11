---
status: todo
assignee:
blocked_by: []
created: "2026-10-12"
---

# DF-T12: Your config says root; the hover on a missing heading; named clones; the popups' titles

The follow-ups F3, F7, F11, F12.

## Description

- **F3 (DF-D22):** every config value or name that takes vault takes root too: `capture.location = "root"`, the
  explorer's actions `rename_root` and `make_root` (`[keys.explorer]`), the colour role `sidebar_root`; search
  `src/core/config.ts`, `src/tui/keys.ts` and the theme roles for others. The docs show root; the old words work.
- **F7 (DF-D26):** the hover (`shift+k`) on a link to a missing heading or block says it opens the note at its top
  (`fragmentAnchor` in `src/tui/actions.ts` has the words following uses).
- **F11 (DF-D30):** `slipbox folders default <repository> <path>` accepts a clone with a `.slipbox/` name of its
  own; `init` and `name` let a clone be named as its repository (`src/core/folders.ts`, `byRepository`).
- **F12 (DF-D31):** the which-key popup of a top-level prefix (`z`, `[`, `]`) carries its group's explanation
  in its title (`DEFAULT_GROUPS`, `src/tui/keys.ts`; the popup's drawing). Then the terminal scenario "which-key:
  z, [ and ] list every key under them" in `tests/e2e/world-fixes.ts` should check the title: say so in your report
  (the coordinator runs it).

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task, without IDs; `tests/docs.test.ts` passes.
- The new design text under its entry in DF's [design.md](../design.md), never in the root's design files.
- The typecheck and the test files touched pass; never the whole suite (the coordinator runs it once, after merging).

## References

- Delivers: DF-D22, DF-D26, DF-D30, DF-D31.
- Docs: docs/manual/configuration.md, keys.md, screen.md, links-and-roots.md, cli.md.

## Log
