---
status: todo
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
