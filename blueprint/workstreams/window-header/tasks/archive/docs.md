---
status: done
assignee: claude-24
blocked_by: [HDR-T3, HDR-T4]
tracker: [gh:#24]
created: "2026-10-24"
---

# HDR-T6: The docs, the screenshots and the records

The user docs call the row the window header and describe the buttons and the two settings; the screenshots show the
header as it is; the workstream's design matches what was built.

## Description

- `docs/manual/screen.md`: § The window header, § The breadcrumb under it; the map (`:25`), splits (`:123`), the side
  panes (`:212`), the modes' table, the UI settings table and zen's list.
- `docs/manual/keys.md` § Mouse (`:1067-1071`), the palette's commands where listed; `docs/manual/configuration.md`
  (`[ui] window_header`, `breadcrumb`'s comment, the roles' table: `breadcrumb_band` the header's background,
  `topbar_button_disabled`); the mouse help (`src/tui/mouse-help.ts`).
- CHANGELOG under Unreleased: Added (the buttons, the commands, `ui.window_header`), Changed (`ui.breadcrumb`).
- `bun run shots`: the screenshots retaken, each PNG looked at.
- design.md and requirements.md here checked against the code; the tasks done, the workstream `complete`.

## Acceptance criteria

- `bun run check:docs` and `bun run test:docs` pass; `#the-breadcrumb` lands (the legacy anchors' test).

## References

- Delivers: requirements.md § Acceptance criteria (the records).
- Rests on: (HDR-D1), (HDR-D3).
