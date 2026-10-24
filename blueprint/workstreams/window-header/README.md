---
status: complete
created: "2026-10-24"
branch: feat/issue-24
---

# HDR: The window header

The row at the top of each window, today called the breadcrumb row, becomes the window header: a split window's file
name, the breadcrumb of headings, the window's mode as three buttons (Read, Lens, Source) that work as a radio group,
and the outline's `▤`. `ui.breadcrumb = false` then hides only the breadcrumb, and a setting of its own,
`ui.window_header`, removes the whole row. From issue #24; the user accepted the design on 2026-10-24 ("design is
ok").

- [requirements.md](requirements.md): its goals, what it builds on, its acceptance criteria and its changes to the
  root's requirements.
- [design.md](design.md): its changes to the root's design.
- [decisions.md](decisions.md): what was decided, and why.
- [notes.md](notes.md): how it was discussed, Codex's critique, the cases to test, and the log.
- [ideas.md](ideas.md): what could come later, open.
- [tasks/](tasks/README.md): the work, a task per file.
