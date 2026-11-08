---
status: todo
assignee: ""
blocked_by: []
created: "2026-11-08"
---

# EG-T3: Problems where they are: jumps, the status line, the whole message

EG-D5.

## Description

- `] d` / `[ d`, `] e` / `[ e` over the problems shown, by where each starts, around the ends.
- The cursor's problem on the status line, in its severity's colour, giving the word count and the tab's place way.
- `space c d`: a floating window with each problem at the cursor and who found it; `y` copies, `s` adds it to the
  scratch.
- design/tui.md § Screen layout no longer says the status line never shows a problem's words.

## Acceptance criteria

- A terminal check on a note with a lint warning, a broken link and a server's error in code: the jumps visit each
  in order; the status line says the cursor's; `y` and `s` in the window.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.

## Open

- Where the message goes when the cursor is also on a link.
