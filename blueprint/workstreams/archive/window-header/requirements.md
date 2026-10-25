# Requirements

## Goals

- Each window's mode is shown, and switched, on the window itself: Read, Lens and Source as buttons on its header,
  exactly one selected, the window's mode; a click on another switches straight to it; a mode the file can't be shown
  in is drawn disabled, and a click on it says why (HDR-D2).
- Every way to switch the mode is a named command: commands that set a mode, beside the toggles that stay (HDR-D2).
- The row has a name of its own, the window header; "breadcrumb" names only the heading trail on it (HDR-D1).
- Hiding the breadcrumb hides only the breadcrumb; the header has its own setting, which removes the row (HDR-D3).

## Non-goals

- New modes, or a change to what a mode shows: Read, Lens and Source are today's rendered view, lens and source mode,
  switched through `Lens.setViewMode` as `ctrl+k` and `space n l` switch them.
- The floating window (a peek, the floating editor, a diff, a review, the merge screen): it has no header today, and
  gets none.
- The status line's chip: it says `READ`, `LENS`, `SOURCE` and `INSERT` as before.
- Default keys for the new commands: the toggles keep theirs (open question 2 in notes.md).
- The explorer's breadcrumb (VV-D5), which isn't a window's.

## Builds on

- design/tui.md § Source mode, § The lens: live preview, § Files beyond notes: what each mode shows, and which files
  have no rendered view (D107, D125, D130, D146, D147).
- design/tui.md § Modes and dispatch: every binding a registry command (D11).
- design/tui.md § Side panes: where `▤` sits with and without the right rail.
- design/tui.md § UI settings: the `space u u` list, remembered in the folder's session.
- docs/manual/versions.md § What is kept: command names and settings' keys are kept; a setting whose effect changes is
  said in the changelog.

## Acceptance criteria

- Each window's header shows Read · Lens · Source, one selected, following `ctrl+k`, `space n l`, `esc` and the
  editing keys as the mode changes; a click switches the mode (Lens from Source without passing through Read), stops
  typing first, keeps unsaved changes in the buffer, and the status chip agrees. A click on the selected button changes
  no mode (it ends typing, as every click does: open question 7).
- A text file, data that doesn't parse, and code `[render] code = "source"` shows as source: Read and Lens disabled,
  a click saying why in `setViewMode`'s words. A code document and a data file that parses have all three.
- In a narrow window the breadcrumb folds first, then the buttons shorten to `R` `L` `S`, then to the selected one
  alone; the split name and `▤` keep their places.
- The new commands are in the palette and help; the mouse help (`src/tui/mouse-help.ts`) and `docs/manual/keys.md`
  list the buttons.
- `ui.breadcrumb = false` keeps the header, with the split name, the buttons and `▤`; `ui.window_header = false` removes
  the row as `ui.breadcrumb = false` did; zen mode and windows under 8 rows drop the whole header, as before; both are
  in `space u u` and remembered.
- The docs and the design call the row the window header; `#the-breadcrumb` in docs/manual/screen.md still lands
  (`tests/fixtures/documentation/legacy-anchors.json`); a `[colors]` `breadcrumb_band` still colours the row.
- CHANGELOG lines: Added (the buttons, the commands, `ui.window_header`), Changed (`ui.breadcrumb`).
- Tests: unit tests for the selection, the refusals, the narrowing and the two settings; terminal checks driving the
  buttons by the mouse and the settings (`tests/terminal/checks/`); each new command covered by a check. The docs'
  screenshots retaken (`bun run shots`).

## Changes

### MODIFIED requirements.md § Reading

Adds a bullet, after the one on themes:

- Each window has a header: in a split its file's name, the breadcrumb of the headings the cursor is under, its mode as
  three buttons (Read, Lens, Source) of which one is selected and a click switches to another, and the outline's button
  where the rail doesn't have it. The breadcrumb and the header each hide on their own (HDR-D1, HDR-D2, HDR-D3).

Previously: the section had no bullet on the window's header; the breadcrumb was described only in design/tui.md.
