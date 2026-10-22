---
status: done
assignee: claude-cli
blocked_by: []
created: "2026-10-13"
---

# TT-T6: Checks: links, roots, files and git

Today's scenarios of this area carried over to the headless harness, split one feature each, their content from the
sample folders (TT-D3, TT-D5).

## Description

- The area: links, roots and nested roots, vaults, converting links, rename, the trash, files, git (marks, diffs, source
  control, branches, merge review).
- Each of today's scenarios here split into checks of one feature, small related ones grouped; each declares its
  cases and commands; what a scenario wrote for itself (`beside`, `files`) moved into `examples/home` (or the
  demo vault) with its `CASES.md` entries, or made by `scripts/build-home.ts` where git can't hold it.
- Features of the area no scenario checked today, found from the coverage test and the area's `CASES.md`, given
  checks.
- The failing ones settled (notes.md): the check's fault fixed, or slipbox's, a bug with its regression test.
- Run the area's checks to the end, then fix, then run again (TT-D6); never one at a time.

## Acceptance criteria

- The area's checks pass here, in parallel; the old-to-new table in notes.md filled for the area; the coverage test's
  left-out list for the area only what can't be checked in a terminal, each with its reason.
