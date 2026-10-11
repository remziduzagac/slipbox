---
status: todo
assignee:
blocked_by: []
created: "2026-10-11"
---

# DF-T1: Privacy settings yours alone; the launcher; no roadmap numbers in messages

A folder can no longer widen what reaches the network; the source launcher never writes through a link; users never
see slipbox's internal numbers.

## Description

- **A1 (DF-D1):** `render.images_remote` and `lsp.auto_install` read from your own config only, a folder's warned
  of and ignored (`USER_ONLY` in `src/core/config.ts`, beside `update.check`'s handling).
- **A11 (DF-D7):** `scripts/install-local.sh` removes a link at the launcher's path and writes a file of its own,
  saying it replaced a release's link; tested as the script's other behaviour is (`tests/distribution.test.ts`).
- **A18:** no roadmap number in a user-facing message: the retired `[rename]` warning (`RETIRED` in
  `src/core/config.ts`), the installer's Windows error (`scripts/release.ts`'s `install.sh`), and a test that
  searches the messages slipbox prints for one.

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task (`docs/manual/`, `docs/guides/`, the skill for the CLI),
  without IDs; `tests/docs.test.ts` passes.
- The new design text written under its entry in DF's [design.md](../design.md), never in the root's design files.
- The typecheck and the test files touched pass; the whole suite once at the end.

## References

- Delivers: DF-D1, DF-D7; the root's design/trust.md § What runs, design/distribution.md § Installing.
- Docs: docs/manual/privacy.md, configuration.md (what only your own file can set), reading.md (pictures on the
  internet), code.md, docs/guides/install.md.

## Log
