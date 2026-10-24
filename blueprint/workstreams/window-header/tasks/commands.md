---
status: review
assignee: claude-24
blocked_by: [HDR-T1]
tracker: [gh:#24]
created: "2026-10-24"
---

# HDR-T2: The commands that set a mode

`view.mode_read`, `view.mode_lens` and `view.mode_source`: each sets the window's mode through `setViewMode`, says
what it shows (`sayMode`) or why not, and does nothing in the mode the window is in.

## Description

- Specs in `src/core/commands/files.ts` beside the toggles: "Read mode", "Lens mode", "Source mode", `cli: null`, a
  `desc` each; the help group's pattern (`src/core/command-specs.ts`, Editing) takes them.
- Handlers in `src/tui/actions-view.ts`. No default keys, no aliases.

## Acceptance criteria

- Each command from each other mode switches straight there (Lens from Source never through Read), its message the
  toggles'; in its own mode nothing, no message; a refused one says `Lens.refusal`'s words. Unit tests.
- The palette and help list them under Editing; registration and the specs agree (the registry's test).
- A terminal check runs each (HDR-T5), so the coverage test passes.

## References

- Delivers: design.md § MODIFIED design/tui.md § Source mode, § The lens.
- Rests on: (HDR-D2).
