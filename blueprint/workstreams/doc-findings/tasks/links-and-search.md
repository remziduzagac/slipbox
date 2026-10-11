---
status: todo
assignee:
blocked_by: []
created: "2026-10-11"
---

# DF-T5: Clones open the default copy; search leaves worktrees out; a missing heading

The code brought in line with the design in three places.

## Description

- **A8:** a repository and a clone of it (one remote), the clone with a `.slipbox/` name of its own: a pointer by the
  remote's name, and a hosting URL to it, open this machine's default copy, as design/roots.md § Named folders' table
  says; an error, where one remains, names each copy by its path, never the same name twice. The reference set has the
  case (`work/kestrel`, `route-engine-spike`).
- **B1:** search's linked scope leaves worktrees out, as design/roots.md § Search scope says, even one a note links
  into by `@branch` (`scopeRoots`, `src/core/scope.ts`).
- **B2:** a link whose heading or block isn't there opens the note at its top and says what's missing, heading and
  block alike, as design/links.md § Where a link lands says (TUI and `slipbox resolve`).

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task (`docs/manual/`, `docs/guides/`, the skill for the CLI),
  without IDs; `tests/docs.test.ts` passes.
- The new design text written under its entry in DF's [design.md](../design.md), never in the root's design files.
- The typecheck and the test files touched pass; the whole suite once at the end.

## References

- Delivers: design/roots.md § Named folders, § Search scope; design/links.md § Where a link lands (unchanged).
- Docs: docs/manual/links-and-roots.md, finding.md.

## Log
