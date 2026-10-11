---
status: todo
assignee:
blocked_by: []
created: "2026-10-11"
---

# DF-T3: Exports: pictures of the root only, never over a note, folders made, lookups clean

The Markdown export copies only pictures from inside the root; no export writes over a note of any root; `-o dir/`
makes the folder; an export's pictures don't answer lookups by name.

## Description

- **A2 (DF-D2):** the Markdown export's `.export.assets/` takes only files that are pictures (by content), from
  inside the note's root; anything else stays a link (`src/core/export/`).
- **A3 (DF-D3):** `slipbox export -o` refuses a note of any root (exit 5); an earlier Markdown export can still be
  replaced. Check the TUI's path refuses alike.
- **A5 (DF-D5):** `-o` ending in `/` makes the folder and writes `<note>.<ext>` in it, CLI and TUI.
- **C6 (DF-D18):** lookups by name (wikilinks, embeds) leave out `*.export.assets/` folders.

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task (`docs/manual/`, `docs/guides/`, the skill for the CLI),
  without IDs; `tests/docs.test.ts` passes.
- The new design text written under its entry in DF's [design.md](../design.md), never in the root's design files.
- The typecheck and the test files touched pass; the whole suite once at the end.

## References

- Delivers: DF-D2, DF-D3, DF-D5, DF-D18; the root's design/export.md, design/links.md § Wikilinks.
- Docs: docs/manual/export.md, docs/guides/exporting.md, docs/manual/cli.md, docs/manual/links-and-roots.md.

## Log
