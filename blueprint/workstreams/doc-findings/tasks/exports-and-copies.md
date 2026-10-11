---
status: todo
assignee:
blocked_by: []
created: "2026-10-12"
---

# DF-T11: Copies into a folder; every export's pictures the root's; a folder's update check warned of

The follow-ups F1, F2, F4, F5, F6.

## Description

- **F1, F2 (DF-D20, DF-D21):** `slipbox cp` (and the TUI's copy where a path is typed) into an existing folder or
  one ending in `/`, made if missing, as `mv` now does (`moveTarget` in `src/core/rename.ts`).
- **F5 (DF-D24):** Word, PDF, the web page and the e-book embed only pictures from inside the note's root (realpath,
  as the Markdown export's check in `src/core/export/markdown.ts`); one from outside shows as its caption.
- **F6 (DF-D25):** lookups by name leave out the pictures folder of any Markdown export, the folder beside a file
  slipbox marked as its export (`byFileName` in `src/core/graph.ts` skips `*.export.assets/` today).
- **F4 (DF-D23):** a folder's `update.check` warned of as `render.images_remote` is (`USER_ONLY`,
  `src/core/config.ts`).

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task, without IDs; `tests/docs.test.ts` passes.
- The new design text under its entry in DF's [design.md](../design.md), never in the root's design files.
- The typecheck and the test files touched pass; never the whole suite (the coordinator runs it once, after merging).

## References

- Delivers: DF-D20, DF-D21, DF-D23, DF-D24, DF-D25.
- Docs: docs/manual/files.md, cli.md, export.md, privacy.md, configuration.md, links-and-roots.md,
  docs/guides/exporting.md.

## Log
