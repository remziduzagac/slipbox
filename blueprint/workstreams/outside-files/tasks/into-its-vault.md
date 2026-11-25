---
status: todo
assignee: ""
blocked_by: [OUT-T1, OUT-T2]
created: "2026-11-25"
---

# OUT-T3: Going into the file's vault, `space v g`

OUT-D4.

## Description

- `vault.into_file`, "Vaults: go into this file's vault", `cli: null`, in
  `src/core/application/commands/areas/files.ts` beside `vault.open`; implemented in its area under
  `src/tui/actions/workspace/`; bound to `space v g` (`src/tui/shell/input/keys/bindings.ts`, free beside
  `leader v v`).
- A click on the tab's vault mark runs it.
- It goes into the file's vault with the file at its place (`switchVault`), asking Go or Stay; unsaved notes ask their
  own question; on a peek's kept tab the same; on a note of this vault's own, said.
- The line said on opening names `space v g`.
- The design kept true as it's built: design.md § A file from outside the vault and its changes to design/tui.md
  (§ Going into a vault, § The peek) and design/roots.md § Elsewhere, which those files take at consolidation
  (OUT-T5).

## Acceptance criteria

- Unit tests (`tests/tui/workspace/vaults/switch-question.test.ts`, `switching.test.ts`): the question and its two
  answers; unsaved notes asked first; a note of the vault's own.
- Terminal checks: `outside-files` (`space v g`, Stay then Go, `ctrl+o` back; the click on the tab's mark), `vaults`,
  `which-key` (`space v` lists `g`).
- Every bug found gets a regression test; `bun run check` passes; the user docs (`docs/manual/keys.md` § Vaults and
  named folders: `space v`, `docs/manual/vaults.md`) and a CHANGELOG line come with it.
