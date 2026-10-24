---
status: done
assignee: claude-24
blocked_by: []
tracker: [gh:#24]
created: "2026-10-24"
---

# HDR-T4: The two settings

`ui.window_header` (default `true`) removes the row; `ui.breadcrumb` hides only the breadcrumb.

## Description

- `[ui] window_header` in `src/core/config.ts` (type, default, doc comment); `UiState` and `uiDefaults`
  (`src/tui/app.ts`); "Window header" in `UI_TOGGLES` (`src/tui/actions.ts`), the `ui.window_header` spec
  (`src/core/commands/ui.ts`), no key; remembered like the others.
- The tests that turned the row off with `ui.breadcrumb = false` turn it off with `ui.window_header = false` where the
  row was what they meant.

## Acceptance criteria

- With the breadcrumb off: the header, its name, buttons and `▤`, no `§`, `space f b`'s list centred, find's row under
  the header. With the header off: today's breadcrumb-off screen. Both together; zen; heights 7 and 8; restored from
  the session. Unit tests, and a terminal check (HDR-T5).

## References

- Delivers: design.md § MODIFIED design/tui.md § UI settings, § Screen layout.
- Rests on: (HDR-D3).
