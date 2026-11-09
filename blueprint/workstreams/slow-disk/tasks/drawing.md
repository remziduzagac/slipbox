---
status: todo
assignee: ""
blocked_by: [SD-T2, SD-T6]
tracker: [gh:#46]
created: "2026-11-09"
---

# SD-T11: What drawing a note reads, and the Problems panel's notes

SD-D3, SD-D5. Found while drafting, not in #46; in this workstream as its last code task, measured first (question 6
of README.md, answered 2026-11-09).

## Description

- Measured first: how often a layout reads the disk, on which notes (the demo vault, the reference set), and how long
  each read holds the screen on a slow disk.
- What a layout asks: a `/…` link's first folder (`existsSync`, `src/core/workspace/graph/graph-resolve.ts:298`); a
  link into a nested vault (`statSync`, `graph-lookup.ts:249`); a name's case on a disk that folds it (`onDisk`,
  `src/core/workspace/links/links.ts:264`, macOS); a picture's file (`src/tui/documents/media/images.ts:93`, `:101`).
  Each answered from what's kept — the walk's folders and files, a picture's bytes — and, when it isn't, drawn as not
  checked yet and asked of a disk thread; the layout drawn again when it answers.
- The Problems panel (`src/tui/documents/diagnostics/problems.ts:83`): each file the vault's lint names read on a
  disk thread, its findings shown unfiltered until its parse is in.

## Acceptance criteria

- The measurement, in the log here.
- Held: a note with a picture under `held` opened — the note drawn with the picture's place said, a key handled
  meanwhile; let go, the picture drawn.
- Held: a `/…` link into `held` — drawn as resolved at once; a missing one drawn broken once its answer comes.
- A layout drawn twice for one answer never moves the cursor or the reading position (D98).

## Terminal check

`slow disk: a note whose picture is on a slow disk — drawn at once with its place said, the picture once read`.

## Decided (2026-11-09)

By the maintainer's instruction to take the recommended answer (SD-D12):

- A link not checked yet: drawn as resolved until said otherwise; most resolve, so the drawing changes only for the
  few that don't.
- Pictures: here, the same kind of read, measured with the rest under one rule for what drawing asks.

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("Drawing a note").
- Rests on: SD-D3, SD-D5; D98; `1.4`, `12.x`, `1.7`.
