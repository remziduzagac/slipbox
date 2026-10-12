---
status: done
assignee: claude
blocked_by: [DF-T1, DF-T2, DF-T3, DF-T4, DF-T5, DF-T6, DF-T7]
created: "2026-10-11"
---

# DF-T10: Merged, the fixed parts' terminal tests, the check

The tasks' branches merged onto main, the terminal tests of what they changed run, `bun run check` green.

## Description

- Each worktree's commits cherry-picked onto main, conflicts merged with care.
- The e2e scenarios covering the fixed parts run in the e2e tabs; new scenarios where a fix has none.
- `bun run check`; the docs test.

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task (`docs/manual/`, `docs/guides/`, the skill for the CLI),
  without IDs; `tests/docs.test.ts` passes.
- The new design text written under its entry in DF's [design.md](../../design.md), never in the root's design files.
- The typecheck and the test files touched pass; the whole suite once at the end.

## References

- Delivers: requirements.md § Acceptance criteria.

## Log

- 2026-10-12: DF-T1 to DF-T7 cherry-picked onto main: two conflicts, an import line in `tests/cli.test.ts` and
  `src/core/export/markdown.ts`'s header and imports, merged; DF's design.md's shared DF-D8 entry merged. The worktrees
  and branches removed.
- 2026-10-12: `bun run check`: 1786 pass, 4 fail: the about-this-vault snapshot (DF-T8's edit: updated), `search
  --scope all` past the default limit now that more tests register roots (the test given `--limit 500`), and two known
  ones (the background index's timing under load; the pipeline-cookbook Mermaid snapshot when export.test.ts runs
  first, reproduced by DF-T7 on code from before it).
- 2026-10-12: terminal tests: the 32 existing scenarios covering the fixed parts, in three panes: 29 pass; the other
  3 fail the same at d5c5dee, stale (`ctrl+e` for source mode; code files open in the code view; an error's line
  number coloured, not signed): brought up to date, passing. The 7 export scenarios (`world-export.ts`), uncommitted
  until now, pass. Nine new scenarios (`world-fixes.ts`, claude-e2e) pass three runs in a row each; eight fail on the
  code from before DF; the ninth (which-key's `z`, `[`, `]`) showed A16's explanations are never drawn: F12, DF-D31.

- 2026-10-12: accepted on the coordinator's recommendation, the user having said to take them as answers until done; done.
- 2026-10-12: after DF-T11 and DF-T12: the fixes' scenarios extended (the hover on a missing heading; a folder's
  `update.check` warned of); the 41 scenarios covering the fixed parts, in three panes: all pass. `bun run check`:
  1798 pass, 0 fail (*ran*).

