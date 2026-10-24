---
status: review
assignee: claude-24
blocked_by: [HDR-T1, HDR-T2, HDR-T4]
tracker: [gh:#24]
created: "2026-10-24"
---

# HDR-T3: The header drawn on its own, with the mode's buttons and their clicks

The row's drawing moves out of `drawPane` into `drawWindowHeader` (`src/tui/draw-header.ts`), which adds the mode's
buttons, laid out by `modeButtons`, and their hit areas, whose clicks `clickHot` handles.

## Description

- `drawPane` keeps the gate (`header = app.ui.window_header && !zen && rect.h >= 8 && not floating`) and the text's
  height arithmetic; it calls `drawWindowHeader`, which draws the rules, the band, the name, `▤`, the buttons and the
  breadcrumb (when `ui.breadcrumb`), the window's layout asked for before the buttons are drawn.
- `modeButtons(room, selected, breadcrumbLeast)` picks full, letters, the selected letter or none (HDR-D4); the
  breadcrumb's least room is worked out from its headings.
- The selected button `topbar_button_on`, the others `topbar_button` (`hover` under the mouse), a disabled one
  `topbar_button_disabled` (a new role: `surface2`; in the terminal theme a faint ANSI colour; in mono dim), never
  `hover`. Hit areas `mode:<window>:<read|lens|source>`.
- `clickHot`'s `mode:` focuses the window and its content region, then runs the mode's command on another enabled
  button, says `Lens.refusal`'s words on a disabled one, nothing more on the selected one.

## Acceptance criteria

- The selection follows every way the mode changes; every switch by a click; the refusals; hover; which-key over the
  header; the room at each boundary; the name and `▤` in their places: unit tests (notes.md § The tasks).
- `bun run check:size` passes: `draw-pane.ts` smaller, `draw-header.ts` well under the limit.

## References

- Delivers: design.md § MODIFIED design/tui.md § Screen layout.
- Rests on: (HDR-D1), (HDR-D2), (HDR-D4).
