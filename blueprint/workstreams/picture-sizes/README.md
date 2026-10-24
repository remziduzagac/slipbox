---
status: active
created: "2026-10-24"
branch: feat/issue-52
---

# PIC: Pictures sized to their window, shown at their own size on a click

A note's picture follows the window it's in, not a fixed number of rows: its window's text width, its height bounded
by the window's, never larger than its own size and never shrunk past a floor. A click, or a key, shows it at its own
size in place, the text around it as it was, scrolled sideways with a bar of its own where it's wider than the window;
again, it fits the window. From issue #52. It changes `12.6`'s sizing ("at most 12 rows") and builds on `12.7`, `12.8`
and the code blocks that scroll sideways (D233).

- [requirements.md](requirements.md): its goals, what it builds on, its acceptance criteria and its changes to the
  root's requirements.
- [design.md](design.md): its changes to the root's design.
- [research.md](research.md): what the code and the protocols allow, read before designing.
- [decisions.md](decisions.md): PIC-D1 to PIC-D6, taken as recommended while the maintainer was away.
- [notes.md](notes.md): how it was discussed, the options weighed, Codex's critique.
- [tasks/](tasks/README.md): the work, a task per file.
