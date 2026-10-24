---
status: review
assignee: claude-23
blocked_by: []
created: "2026-10-24"
---

# UPG-T3: The dialog (`tui/dialog.ts`)

A pop-up with text, a select and checkboxes, its keys and clicks: design.md § MODIFIED design/tui.md § Overlays.

## Acceptance criteria

- Drawn as the other popups are: its title in its border, its text wrapped, the choices `●`/`○` (`(*)`/`( )` in
  ASCII's glyphs), the checkboxes `☑`/`☐` (`[x]`/`[ ]`), one the chosen choice doesn't take dimmed, the row's
  explanation under a rule, its keys in its bottom border; text measured by `core/width.ts` and sanitized.
- Keys: `↑`/`↓`, `j`/`k`, `tab`/`shift+tab`, `ctrl+n`/`ctrl+p` move, wrapping; `space` ticks; `enter` does it; `esc`
  cancels. Clicks: a choice marks and does it; a checkbox ticks; outside is `esc`.
- One that opens on its own drops the keys, pastes and clicks that arrived in its first half second, by each one's own
  arrival time.
- Unit tests of its model (moves, ticks, dimming, the drop by arrival time) and of its drawing.

## References

- Delivers: ../design.md § MODIFIED design/tui.md § Overlays.
- Rests on: UPG-D1, UPG-D3; ../notes.md § Codex's critique, 7.

## Log

- 2026-10-24: `src/tui/dialog.ts` (`openDialog`, `dialogKey`, `dialogMouse`, `dimmed`, `tooEarly`), drawn by
  `drawChoiceDialog` in `draw-overlays.ts`; `DialogOverlay` joins `Overlay`; `choiceOn`/`choiceOff` added to each
  glyph set. Each key carries the time it arrived: `Input.handleKey` takes it, `processKey` and `dispatchKey` pass it,
  `Overlays.key` gives it to the dialog; a click's is when it's handled (clicks aren't queued). A paste does nothing
  in a dialog. The test harness takes a clock (`now`).
- 2026-10-24: `tests/tui-updates.test.ts`, 8 pass (41 expects): the drawing, the keys, a dimmed checkbox, esc and a
  paste, the mouse, the drop by arrival (keys, a click), a key queued behind one a parse held, ASCII's glyphs. Near
  it: `tests/core.test.ts -t glyph` 5 pass, `tests/tui.test.ts -t 'paste|prompt|question|Save As|save as|dialog|
  overlay'` 32 pass. Mutations, each alone (nothing dropped; the arrival time not carried — missed by a held key
  alone, caught once a second key queued behind it; a dimmed checkbox taken; a dimmed checkbox ticking; moving not
  marking; a click outside not cancelling; clicks not dropped): all seven caught.
