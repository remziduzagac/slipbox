---
status: todo
assignee: ""
blocked_by: [OUT-T1]
created: "2026-11-25"
---

# OUT-T2: The file you chose, edited and saved where it is

OUT-D2, OUT-D5.

## Description

- The buffer opened by OUT-T1's routes marked chosen; no other way sets it.
- `App.writeBuffer` (`src/tui/documents/saving/write-buffer.ts`) passing `through` to `writeNote`
  (`src/core/foundation/platform/fsutil.ts`) for a chosen buffer alone; every other refusal kept: a virtual buffer, a
  window read through a link not followed, a peek's tab, a vault's note whose symlink leads out (D220), a plan's file
  (`mayRewrite`).
- `:w`, autosave, a task ticked; the conflict prompt on a change made on disk; unsaved, asked about on quitting and on
  a switch, as any note.
- Polled while open (`Watch.poll`).
- The real path recorded when the file is chosen, kept on the buffer; a save whose real path differs by then refused,
  said.
- A peek's kept read-only tab (`t`) of a file then named with `:e` made editable, chosen now.
- A named path whose way passes a symlink asked about as today (`src/tui/documents/navigation/following.ts`): Follow
  it allows the write for that file alone; Just look reads it read-only, this once; No follows nothing, as today.
- The CLI's write commands unchanged (`checkWritable` in `src/cli/common.ts`): a path outside the vault refused.
- The design kept true as it's built: design.md § A file from outside the vault and its changes to design/tui.md
  § Writing notes and design/roots.md § Links followed only when you say so, which those files take at consolidation
  (OUT-T5); requirements.md's change to `7.5` the same.

## Acceptance criteria

- Unit tests (`tests/core/foundation/platform/writes.test.ts`, and a test file for `write-buffer.ts` in
  `tests/tui/documents/saving/`): a chosen buffer outside the vault written; refused, each in a test that fails
  without its guard: a link's buffer, a peek's tab, a window through a link not followed, a symlinked note out of the
  vault, a plan's file, a chosen buffer whose real path changed since, a named path through a symlink answered Just
  look. Written: a peek's kept tab once named with `:e`; a named path through a symlink answered Follow it. The CLI's
  `write` given a path outside the vault still exits 5 (`tests/cli/`, if no test shows it already).
- Terminal checks: `outside-files` (typed into, saved, autosaved, a task ticked, changed on disk under it; a peek's
  kept tab named with `:e`, then typed into; a symlink on the named path's way asked), `saving`, `symlinks`,
  `save-conflicts`, `vault-peek` (a link's file still refuses typing).
- Every bug found gets a regression test; `bun run check` passes; the user docs (`docs/guides/vaults.md`,
  `docs/manual/vaults.md`, `docs/manual/files.md`) and a CHANGELOG line come with it.
