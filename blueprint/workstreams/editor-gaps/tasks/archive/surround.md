---
status: done
assignee: ""
blocked_by: [EG-T5]
created: "2026-11-08"
---

# EG-T6: Surround, and wrapping on type

EG-D8.

## Description

- `y s`, `d s`, `c s` in SOURCE view and the lens, `shift+s` in visual mode, the marks EG-D8 names; one undo step,
  `.` repeating it.
- A mark typed over a typed selection wraps it.

## Acceptance criteria

- Unit tests for each mark added, deleted and changed, nested pairs included.
- A terminal check: `y s i w b`, `c s *` then a backtick, `d s (`, a quote typed over a selection.
- Every bug found gets a regression test; `bun run check` passes; the user docs and a CHANGELOG line come with it.

## Open

Settled by the maintainer on 2026-11-24; design.md § "MODIFIED design/tui.md § Editing", its Wrap on type item, says
how.

- Whether wrapping on type needs `editor.auto_pairs`, and which characters it takes. Settled: it follows
  `[editor] auto_pairs`; with it off, a character typed over a selection replaces it, as before. With it on, `(`, `[`,
  `{`, `"`, `'` and `` ` `` wrap the selection everywhere; `*` and `~` only in Markdown notes, and in code (code files,
  code cells) they replace it, being operators there. The selection stays on the text inside, so typing `*` twice
  gives bold.

Settled here, for the maintainer to confirm; the design's Surround and Wrap on type items say how.

- A note's fenced block's code counts as code: `*` and `~` typed over a selection starting in it replace it.
- `y s s` surrounds the line's text, the operator doubled; a closing bracket is the same mark as its opening one.
- White space at the ends of `y s`'s range stays outside the pair (`y s a w b` bolds the word, not its space).
- In a file that isn't a Markdown note, `d s` and `c s` find `` ` `` on the line as a quote; `*`, `b`, `~` and `l`
  aren't found there, said.
- A link's `d s l` keeps its text (a wikilink's alias, else its target); an image and a bare address aren't links here.
- The cursor ends on the opening mark, or where it was after `d s`; typing in a new link's target after `l`.
