---
status: todo
assignee:
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
