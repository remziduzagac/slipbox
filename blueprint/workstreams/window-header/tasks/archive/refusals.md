---
status: done
assignee: claude-24
blocked_by: []
tracker: [gh:#24]
created: "2026-10-24"
---

# HDR-T1: The refusals in one place, and the toggles' words shared

`Lens.refusal(view, mode)` decides what `setViewMode` refuses, saying nothing itself, so the header can draw a button
disabled with the same rule; the toggles' messages, said after a switch, become one helper the new commands share.

## Description

- `Lens.refusal(view, mode): { level: "info" | "warn"; text: string } | null` for a mode other than the window's: a
  drawn buffer ("a diff is drawn one way"), else a mode other than source on a file `canRender` says no to (data:
  "`<name>` doesn't parse — `<error>`: source mode", warn; text: "`<name>` has no rendered view: source mode"; else
  "has no rendered view yet"). `setViewMode` calls it and says what it returns.
- `sayMode(app, view)` in `src/tui/actions-view.ts`: what the window shows now ("source — the note's markdown" or "the
  file as written", "the lens: … — esc closes it", "rendered" or "the code as a document"); `view.source` and
  `view.live` say it after a switch, as now.

## Acceptance criteria

- `setViewMode`'s refusals and the toggles' messages unchanged, word for word (their tests pass unchanged).
- A unit test of `Lens.refusal` for a note, a text file, code `[render] code = "source"`, data that does and doesn't
  parse, and a drawn buffer.

## References

- Delivers: design.md § MODIFIED design/tui.md § Screen layout (the mode's buttons).
- Rests on: (HDR-D2).
