---
status: todo
assignee: ""
blocked_by: [OUT-T1, OUT-T2]
created: "2026-11-25"
---

# OUT-T4: Back after a restart

OUT-D6.

## Description

- The workspace's `session.json` (`src/tui/workspace/session/session.ts`) keeps a tab of a file outside the vault with
  `chosen`; brought back editable, its vault named; a peek's kept tab still back read-only.
- The real path recorded when the file was chosen kept with it (OUT-T2): one whose real path changed since comes back,
  and its save is refused, said, as before the restart. A file gone since does what a note's tab whose file is gone
  does.
- The design kept true as it's built: design.md § A file from outside the vault (Back after a restart), which
  design/tui.md takes at consolidation (OUT-T5).

## Acceptance criteria

- Unit tests: the session written and read with a chosen tab and a kept one; the chosen one back editable, the kept
  one read-only; one whose real path changed while slipbox was closed back, its save refused.
- A terminal check: `outside-files` across a restart (quit with two outside tabs, one saved; started again, both back
  as they were).
- Every bug found gets a regression test; `bun run check` passes; the user docs (`docs/manual/vaults.md` § Vaults and
  workspaces) and a CHANGELOG line come with it.
