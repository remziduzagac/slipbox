---
status: todo
assignee:
blocked_by: []
created: "2026-10-11"
---

# DF-T2: The CLI's words and small fixes

The CLI says root, keeps web addresses whole, predicts its refusals in dry runs, warns only when it should, and can
make an empty note.

## Description

- **A19 (DF-D9):** "root" for vault in the CLI's messages and JSON (`mode`, the change kinds `root`, `make-root`,
  `unmake-root`, "nothing to undo … in this root"), and `built-in` in `themes`; schema stays 1; the skill
  (`skills/slipbox/SKILL.md`) and `docs/manual/cli.md` with it. Search the code for other user-facing "vault".
- **A7:** `slipbox links` keeps a web address whole (`https:/` today; `graph.abs` near `src/cli/cli.ts`'s links).
- **A9:** `slipbox init --name x --dry-run` refuses as the run would when the name is taken (exit 5).
- **A10:** `slipbox undo` after an `apply` of a move: no `unreadable: ENOENT` warning about the path it moved from.
- **C4 (DF-D16):** `slipbox write <note> --create --allow-empty` with no text makes an empty note.

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task (`docs/manual/`, `docs/guides/`, the skill for the CLI),
  without IDs; `tests/docs.test.ts` passes.
- The new design text written under its entry in DF's [design.md](../design.md), never in the root's design files.
- The typecheck and the test files touched pass; the whole suite once at the end.

## References

- Delivers: DF-D9, DF-D16.
- Docs: docs/manual/cli.md, the skill, docs/guides/agents.md.

## Log
