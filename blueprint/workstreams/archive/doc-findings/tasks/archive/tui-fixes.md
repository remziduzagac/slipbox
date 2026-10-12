---
status: done
assignee: claude-tui
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

- 2026-10-12: read DF-D6, DF-D15, D139 (the conflict prompt), tui.md § Editing, § External changes, § The cursor,
  § Modes and dispatch, and the keys chapter's conventions. Insert mode's keys are fixed in `editing.ts`
  (`insertKey`), not a keymap; the keymap test for `ctrl` chords reads `DEFAULT_KEYS` only, so it doesn't apply to
  them. `ctrl+z` and `ctrl+y` while typing run the existing `edit.undo` / `edit.redo` (their other routes stay `u`,
  `ctrl+r`, `shift+u`): no new command. The terminals' sequences (tests/e2e/herdr.ts's RAW) reach the TUI as
  `shift+left`, `ctrl+shift+left`, `shift+home`, `pagedown`, `shift+pagedown` and so on, which the insert keys take.
- 2026-10-12: C2. While typing, `shift` with any of typing's moves selects (`selectingMove`, `selectTo`): the view's
  own selection, its ends between characters, so the character after its end is neither drawn (`draw.ts`) nor taken
  (`typedSelection`, used by `selectionText`). With one, typed text, `enter`, `ctrl+v` and the terminal's paste
  replace it; `backspace`, `delete`, `ctrl+w`, `ctrl+u` delete it; nothing replaced is copied (a paste over it puts
  what was copied before); `ctrl+c` copies and `ctrl+x` cuts (clipboard and register); `left` / `right` go to its
  ends; other keys drop it, and leaving insert drops it. The anchor is re-derived past a row's end on a re-layout, as
  the cursor is. `ctrl+z` / `ctrl+y` while typing close what was typed as a step, undo or redo, and open a new step
  at the cursor (typing after an undo ends the redo); `.` then repeats what's typed from there as an `i` started it.
  The page keys move a window's height less two rows over rows of text (the lens's rules stop them), and in source
  mode scroll the view as far. `ctrl+home` / `ctrl+end` added as typing's moves, beside `cmd+up` / `cmd+down`, since
  the selecting table of the keys chapter has them (a judgment call: the decision lists the arrows, home/end and the
  page keys). In source mode and the lens, a `shift` selection (not typing) is a visual one, as a drag's
  (`extendOrMove` in actions.ts), so `d`, `x`, `c` act on it; `motionRange` now puts a selection back too, so
  `d shift+right` leaves none (it left a plain one before, and would have left visual mode now).
- 2026-10-12: C2, a choice to note for review: in source mode a `shift` selection being visual means a plain move
  then extends it, as after a drag (vim's visual mode), where reading a plain move clears it. The alternative, `d`,
  `x` and `c` reading a plain selection, would have made a second kind of selection to explain.
- 2026-10-12: A6. `note.reload`: unsaved, not deleted, the file unchanged → `Discard your changes to <note>? It's
  loaded from disk again: u brings them back.`; `y` runs `:e!`'s revert (factored out as `revert`), `n` / `esc`
  keep the text and leave `conflictKept` alone. A changed or deleted file goes to `reloadBuffer` as before.
- 2026-10-12: A14. `clickHot`'s `btn` case opens any of `LEFT_VIEWS` (it named the explorer and the history only).
  A15. `MOUSE_HELP` rewritten from the keys chapter's § Mouse: the rail's six buttons, the palette chip, the
  breadcrumb's icon and `…`, the strip's `+N`, a task's box, the status line's `‹ ›`, path and problems, the problems
  bar, the messages box, which-key's entries, a code cell's buttons, the panels' clicks, lists and questions. The
  code switches tabs on the wheel over the tab strip, which the chapter didn't say: added to both. A16.
  `DEFAULT_GROUPS`' `z`, `[` and `]` name `= g a` and `s c t`. A17. `fileLink` says `attachment <path> — path
  copied`.
- 2026-10-12: tests, each mutation-checked (the fix undone, the test failing, restored; 22 mutations by a runner in
  the scratch folder, all caught): tests/tui.test.ts "a desktop editor's selection while typing (DF-D15)…", "ctrl+z
  and ctrl+y while typing…", "the page keys while typing…" (editing: insert mode), "in source mode a shift selection
  is a visual one…" (selection), "space n r with unsaved changes… (DF-D6)" (saving and conflicts), "the rail's ±
  shows source control…" (the left panel's views), "help's mouse list has what the keys chapter's § Mouse has…"
  (overlays), "the explanations of g, z, [ and ] name every key under them" (which-key), and the attachment test's
  message now matched whole (links: "wikilinks followed within their root…").
- 2026-10-12: tried (D209) headlessly on a scratch copy of the reference set, state folders of its own
  (`scratch/df/claude-tui/try.ts`): in `notes/inbox.md`, `shift+right` ×5 while typing selected the first line's first
  five characters, `ctrl+c` copied them and kept typing, typing replaced them, `ctrl+z` / `ctrl+y` undid and redid
  typing on, `pagedown` went 23 lines on, two lines selected with `shift+down` went with `backspace`; not typing,
  `shift+right` made a visual selection that `x` deleted. `space n r` asked, `n` kept the text with autosave on, `y`
  reloaded. The rail's `±` opened source control, focused. Help listed the new mouse entries; which-key's `z`, `[`, `]`
  read as above; following `index.md`'s whiteboard picture said "attachment attachments/whiteboard-2026-08-26.png — path
  copied".
- 2026-10-12: docs: editing.md (§ Editing without vim, § Typing and a new § Selecting while you type, § Undo, the
  vim keys' visual mode, § When a file changes on disk), keys.md (§ Selecting, § Typing, `space n r`, § Mouse: `±`,
  the strip's wheel), screen.md and git.md (`±` opens source control), getting-started.md. Design text under DF-D6's
  and DF-D15's entries in design.md (DF-D15's also for § The cursor and § Modes and dispatch).
- 2026-10-12: typecheck clean; tests/docs.test.ts passes; tests/tui.test.ts whole once: 12 failures under a load
  average near 28 (seven agents' runs), all timing; rerun alone all pass but "the background index parses a big note
  on other threads… (15.1)", whose slice timing (333 ms against 250) fails alone too under load: it times the
  graph's parsing, which nothing here touches. The whole suite not run, at the coordinator's word.
- 2026-10-12: accepted on the coordinator's recommendation, the user having said to take them as answers until done; done.
