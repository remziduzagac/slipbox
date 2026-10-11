---
status: todo
assignee:
blocked_by: []
created: "2026-10-11"
---

# DF-T6: Desktop keys while typing; reload asks to discard; the rail, help and which-key

Typing works for someone who doesn't use vim; reloading an unsaved note asks the right question; small UI text
fixed.

## Description

- **C2 (DF-D15):** while typing (insert, in source mode and the lens): `ctrl+z` / `ctrl+y` undo and redo,
  `shift`+arrows (and `shift+home`/`end`, `ctrl+shift`+arrows by word) select, the page keys scroll, and typing,
  `backspace` or `delete` replace the selection; a `shift`+arrow selection in source mode is one `d`, `x` and
  `c` act on. Keys in `src/tui/keys.ts`, commands in `src/core/command-specs.ts` where new ones are needed.
- **A6 (DF-D6):** `space n r` on an unsaved note whose file hasn't changed asks to discard (`reloadBuffer` calls
  `conflictPrompt` without `changedOnDisk()` today); autosave untouched.
- **A14:** a click on the rail's `±` opens source control (`clickHot`'s `btn` case in `src/tui/app.ts`).
- **A15:** help's mouse list (`MOUSE_HELP`, `src/tui/actions.ts`) as the keys chapter's § Mouse has it.
- **A16:** which-key's descriptions of `[`, `]` and `z` (`DEFAULT_GROUPS`) name every key under them.
- **A17:** following a link to a picture or another binary file says "path copied" (`fileLink`).

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task (`docs/manual/`, `docs/guides/`, the skill for the CLI),
  without IDs; `tests/docs.test.ts` passes.
- The new design text written under its entry in DF's [design.md](../design.md), never in the root's design files.
- The typecheck and the test files touched pass; the whole suite once at the end.

## References

- Delivers: DF-D6, DF-D15; the root's design/tui.md § Editing, § External changes.
- Docs: docs/manual/editing.md (§ Editing without vim), keys.md, screen.md, docs/guides/getting-started.md.

## Log
