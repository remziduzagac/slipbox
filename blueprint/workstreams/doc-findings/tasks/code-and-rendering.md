---
status: review
assignee: claude-code
blocked_by: []
created: "2026-10-11"
---

# DF-T7: Formatting's indentation; comment paths and syntax errors in the code view; Obsidian's highlights and comments

The code view follows a comment's path and shows slipbox's syntax errors; formatting keeps the file's indentation;
Obsidian's highlights and comments are drawn.

## Description

- **A12 (DF-D8):** `textDocument/formatting`'s options from the file's indentation (`.editorconfig`, its lines, its
  language), not `tabSize: 2`; confirm the bug with a test first.
- **A13:** in the code view, `enter` on a path in a comment follows it, as source mode does.
- **B3 (DF-D10):** slipbox's own syntax errors (tree-sitter, when no server answered) show in the code view: marks,
  the line's colour, the cell header's count.
- **C5 (DF-D17):** `==text==` drawn highlighted (a theme role), `%%comment%%` hidden while reading, shown in source
  mode and the lens; in exports alike; the reference set's Obsidian vault (`hobbies/cooking`) gets a case of each
  (`examples/home/`, and its `CASES.md`).

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task (`docs/manual/`, `docs/guides/`, the skill for the CLI),
  without IDs; `tests/docs.test.ts` passes.
- The new design text written under its entry in DF's [design.md](../design.md), never in the root's design files.
- The typecheck and the test files touched pass; the whole suite once at the end.

## References

- Delivers: DF-D8, DF-D10, DF-D17; the root's design/lsp.md, design/code-view.md, design/rendering.md.
- Docs: docs/manual/code.md, reading.md, export.md, docs/guides/from-obsidian-or-zk.md.

## Log

- 2026-10-11, A12: the bug confirmed first by a test at the request the client builds (`textDocument/formatting`'s
  options, the server manager's `request` wrapped): a 4-space file, a tab file and one under `.editorconfig`
  (`indent_size = 3`) were all asked `tabSize: 2`. Fixed in `lsp.format` (src/tui/actions.ts): the options are the
  buffer's own indentation (`indentFor`: `.editorconfig`, else its lines, else its language) — `tabSize` the step (a
  tab's width where it's tabs), `insertSpaces` unless tabs. Test: tests/tui.test.ts "space c f: the server asked to
  format with the file's own indentation", failing before the fix (the mutation), passing after.
- 2026-10-11, B3: `problemsShown` (src/tui/app.ts) let slipbox's syntax errors through in source mode only; now in the
  code view too (same rules: out of insert, the text as it is, until a server has answered). Test: tests/tui.test.ts
  "slipbox's own syntax errors, no server having spoken" (marks in `syntax_error`, the line number red, the cell's ⚠
  button, the status line's ✖; a server's answer stands in for them); it failed before the fix, and with the fix
  undone (mutation-checked).
- 2026-10-11, A13: in the code view a comment's prose is rendered Markdown, so a bare path in it was no link and
  `sourceLinkAt` (rows of code only) didn't reach it. Now the parse's comment links carry where a path goes (`href`, as
  `fileLinksOf` gives it), the code layout (`linkPaths`, src/core/layout/code.ts) makes those paths links in the
  prose rows — drawn as links, followed by `enter`, in `] l`'s order (the links sorted as drawn) — and the rows of code
  (a note beside code, a comment kept as written) draw them as source mode does (`commentLinksShown`, src/tui/draw.ts).
  Test: tests/tui.test.ts "a path in a comment's prose is a link, as in source mode", mutation-checked four ways (no
  prose links; no marks on code rows; links unsorted, which the first version of the test missed — `] l` added).
- 2026-10-11, C5: `src/core/obsidian.ts`, a micromark extension beside the wikilink and tag ones: `==highlight==` pairs
  as GFM's strike (two marks, flanking), `%%comment%%` any two `%%` of a paragraph; both read their content (a link in
  a comment stays a link of the note: the index unchanged). A comment over blank lines is wrapped into a
  `commentBlock` after the chunks are merged, marked per chunk while the offsets are there (an escaped `\%%` is text).
  Render (layout/render.ts): the `highlight` role (new: a palette's yellow blended into the page; the terminal's yellow;
  `mono` reversed, so `inverse` now reaches a span's style and the ANSI writer), comments hidden, the white space at a
  seam made one (and none before a full stop), a paragraph of comments and a comment block no rows, source lines kept.
  Exports: the assembler leaves comments out for every format; `<mark>` in HTML and EPUB, Word's yellow highlight, a
  PDF tint (`TINT.mark`), `==…==` in Markdown. Tests: render.test.ts (one), export.test.ts (the assembler and each of
  the five formats), core.test.ts (a comment block across chunks parses as whole); 26 mutations, all killed (three
  survived the first tests: an escaped `%%` closing a block, the line count after a comment ending a line, comments
  nested in emphasis in exports — each test strengthened).
- 2026-10-12, C5, tried on the reference set (D209) found a bug: a block comment holding a list ends with the `%%` as
  the last item's lazy line, so no paragraph closed it and the comment showed. A list or quote whose last line closes
  one closes it now (`closes`, obsidian.ts); the tests hold a list there (mutation-checked).
- 2026-10-12, the reference set: `hobbies/cooking/Pantry.md` (a comment before a full stop, `1 cup == 2 cups`, a
  highlight with emphasis) and `Recipes/Family/Grandma's flan.md` (a comment mid-sentence, a block over a blank line
  holding a list, `==splash of *real* vanilla==`); a case in CASES.md § inline, and both files' entries in
  `.build/manifest.json`. No link was put in a comment there: other tests count the set's backlinks.
- 2026-10-12, tried (D209) on a scratch build of the reference set with its own XDG folders: `slipbox render` of the
  flan and the pantry (comments gone, `oil.`, the block gone), `slipbox export` to md, html, docx (comments gone, `<mark>`,
  `==…==`); headlessly as tests/tui.test.ts drives the TUI: `work/kestrel/src/sync/queue.ts` in the code view, `enter`
  on `../../docs/sync.md` in its comment's prose opened `docs/sync.md`; a broken TS file there showed its syntax error
  in the code view (✖ on its cell's header); `api/kestrel_api/sync.py` formatted by the fake server (as the tests run
  one, no npm) was asked `{tabSize: 4, insertSpaces: true}` from the set's `.editorconfig` (after answering the trust
  question, which a `space c f` otherwise lands in); the flan read without its comments, and in source mode with them.
- 2026-10-12, open, for the user (not decided here): whether a link, tag, task or heading inside an Obsidian comment
  should still count (backlinks, renames, tags, task lists, the outline) — kept as before, counted, since the decision
  names only drawing; a heading's text and slug still include a comment in it.
- 2026-10-12, suite (files touched only, per the coordinator): typecheck, boundary; tui, render, export, core, home,
  docs pass. Under load, timing tests failed and passed alone (the big note's slices, search, linters). The render
  snapshot of `software/pipeline-cookbook.md` fails when export.test.ts runs before render.test.ts in one process (Mermaid
  already loaded): the same on HEAD, checked on a scratch copy; not this task's.
