---
status: done
assignee: claude
blocked_by: [DOC-T9, DOC-T10, DOC-T11]
created: "2026-10-11"
---

# DOC-T12: The guides tried as written

Every guide's steps, followed as written on the reference set: the CLI's in a shell, the TUI's in a herdr tab of the
coordinator's own (D209).

## Description

Build the reference set (`scripts/build-home.ts`) and follow each guide as a newcomer would. A step that doesn't work
as written is fixed in the guide; where the code is wrong, it becomes a task, and the guide waits for the fix.

## Acceptance criteria

- Each guide followed to its end, what was tried noted in the Log, per guide.
- Every step works as written, or its fix is noted.

## Out of scope

- The manual's chapters, beyond their examples a guide repeats.

## References

- Delivers: requirements.md § Acceptance criteria (the guides tried).
- Rests on: DOC-D2, D209.

## Log

- 2026-10-11: getting-started.md, followed to its end in a herdr pane of my own (203×53), state folders in the
  scratchpad: the two notes made by its commands (`created inbox.md`, `created ideas/coffee.md`); slipbox opens
  `ideas/coffee.md`, tab `1 coffee.md`, `READ` and `L1:1`; `space` and `?`; `ctrl+p` "Open note (2)", `inbox`, `enter`;
  `space e` (`FILES`, inbox.md selected), `k`, `enter` (`2 coffee.md`), `q`; `tab` (`→ ideas/coffee.md (resolved)`),
  `enter`, `ctrl+o`; `/grinder` (`1/1`); `space f s` `beans` (`ideas/coffee.md:7`), `enter`, `ctrl+o`; `o` (the
  message, `- [ ]`, `INSERT`), typing, `esc` (`SOURCE`, the dot), `ctrl+s` (`saved inbox.md`), `ctrl+k`; `ctrl+l`
  (`done ✓`, `- [x]` on disk, and back); `ctrl+q`; reopened, the tab where it was. All as written. One change: the
  unsaved-changes message quoted as slipbox gives it, `:w` beside `ctrl+s` (*ran*).
- 2026-10-11: making-it-yours.md: `space u t` (the live preview), `space u u`, and `theme = "nord"` saved in the
  settings file applied at once (`config reloaded (file changed) — changed: theme`); a bad value warned of in
  messages (*ran*).
- 2026-10-11: exporting.md: `space n o`, the five formats, `enter` on Word, the Save As window (`coffee.docx` beside
  the note), `enter`: `exporting to ideas/coffee.docx…`, then `exported … (Word (.docx))`, the file there. The places
  list only the Downloads, Desktop and Documents folders that exist: the step's words to say so (*ran*).
- 2026-10-11: code-and-git.md, on the reference set's `work/kestrel`: the status line `kestrel · main`; a code file's
  cells (`interface: RetryPolicy`, `function: backoff`) and the trust question, as quoted; `n`; `space g s` (Changes,
  Untracked, the letters); `space g m`, `refactor/docs-layout → main`: 18 links that would break, each with its
  cause. In a repository with a `.slipbox/` folder the switcher lists notes and data files only, as the guide says of
  the explorer: the guide's own example, a repository without one, lists its code (*ran*).
- 2026-10-11: from-obsidian-or-zk.md, on `hobbies/cooking`: `Home.md` drawn with its properties table, wikilinks,
  embedded picture, callout and tags (*ran*). The CLI steps of every guide were run by their writers (their Logs).
- 2026-10-11: accepted by the user; done.
