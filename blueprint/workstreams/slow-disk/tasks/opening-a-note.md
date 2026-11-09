---
status: todo
assignee: ""
blocked_by: [SD-T1, SD-T2]
tracker: [gh:#46]
created: "2026-11-09"
---

# SD-T5: A note opened reads on a disk thread

SD-D4, SD-D5, SD-D6.

## Description

- `Opening.buffer` (`src/tui/documents/buffers/opening.ts:106`) asks one `read` of the file, with what else it reads
  there: its writability (`lockedSaid`), its vault (`vaultOf`'s markers on the way up). Its callers await it: a tab
  opened, a link followed, a list's pick, the session's tabs brought back, `:e`.
- While it's out, the window it will be in says `reading <note>…`; the key waits, and the keys after it wait their
  turn (`Input.handleKey`), as for a big note's parse (`views.parses`, `input.ts:165`).
- `esc` is taken at once, out of turn, while a read waits: it gives the read up, the window back as it was. A click
  meanwhile is dropped, as during a big note's parse (`src/tui/shell/input/mouse.ts:73`).
- The session's tabs brought back: the tab shown first, then the rest in order, one at a time.
- `:e!` (`src/tui/actions/documents/actions-edit.ts:259`) and a reload by hand (`saving.ts:140`) read the same way.
- A list's preview (`src/tui/shell/overlays/preview.ts:115`) and a peek (`peek/opening.ts:69`) read on a disk thread
  without holding the keys: `reading…` in the preview or the peek until it comes; a newer selection drops it.
- Answers checked (SD-D5): the window closed, the vault left, the tab replaced — dropped. The file changed after it
  was read: the watcher's next batch reloads it, as now.

## Acceptance criteria

- Held: a note under `held` opened from the switcher — `reading held/a.md…` drawn, `j` and `x` typed meanwhile wait,
  a frame drawn while `held.waiting` ≥ 1; let go, the note shows and `x` deleted its first character after `j` moved
  down. With the read put back here, the test fails (checked once).
- Held: `esc` while it reads leaves the window on the note before, and the answer, when it comes, opens nothing.
- Held: a preview's row under `held` — the selection moves on, the preview says `reading…`, then shows the row
  selected now.
- Past a shortened deadline: `held/a.md didn't answer: not opened`, nothing opened.
- Held: a click on a link while a read waits does nothing; the session's tabs, two under `held`, read the shown one
  first and leave a disk thread free for a `stat` asked meanwhile.
- A binary file, a file you may not write, another vault's file and one through a link not followed open as before.

## Terminal check

`slow disk: a note opened on a slow disk says it's being read; the keys typed meanwhile act on it once it's there, and
esc gives it up`.

## Decided (2026-11-09)

By the maintainer's instruction to take the recommended answer (SD-D12):

- A click while a read waits: dropped, as during a big note's parse; it would land on a screen about to change.
- The session's tabs: the one shown first, then the rest in order, one at a time; a thread stays free for the
  watcher's first look and a key's read.

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("A key's own read").
- Rests on: SD-D4, SD-D5, SD-D6; D120; design/tui.md § Asynchronous git reads; VV-D5, VV-D6, VV-D7.
