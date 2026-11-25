---
status: todo
assignee: ""
blocked_by: [OUT-T1]
created: "2026-11-25"
---

# OUT-T2: The file you chose, edited and saved where it is

OUT-D2, OUT-D5, OUT-D10, OUT-D11.

## Description

- The buffer opened by OUT-T1's routes marked chosen; no other way sets it.
- The guards held in the write path, where every save passes (`App.writeBuffer`,
  `src/tui/documents/saving/write-buffer.ts`): `:w`, `:w!`, autosave, a task ticked, a save asked for on quitting or
  on a switch.
  - A read-only buffer refused there, whatever the save: the read-only guard moves into the write path. The callers
    that set `readOnly` checked, so that none whose buffer is saved on purpose is refused (a virtual buffer is turned
    away before, as now).
  - A buffer of another place (`elsewhere`) written only when chosen.
  - A chosen buffer written as its own place writes its files: its root and its links' rules from its own location
    (`locateVault`), not the current vault's; `writeNote`'s refusal (`src/core/foundation/platform/fsutil.ts`)
    measured from its own vault (D220), a followed link written through in home and what the file system allows in
    Elsewhere (VV-D6).
  - Every other refusal kept: a virtual buffer, a window read through a link not followed, a vault's note whose
    symlink leads out (D220), a plan's file (`mayRewrite`).
- A chosen buffer opened as any file is: a file you may not write read-only, said (`lockedSaid`), and one read through
  a link you're only looking at read-only (`throughLink`), both of which `took` skips today for a buffer of another
  place (`src/tui/documents/buffers/opening.ts`).
- The real path recorded when the file is chosen, kept on the buffer; a save whose real path differs by then refused,
  said.
- A file open both ways (OUT-D11): a peek's kept tab (`t`) of a file then named with `:e` made chosen, its way and its
  permissions checked then; a file open by name then kept from a peek (`peekKeep` in
  `src/tui/documents/navigation/peek/history.ts`) staying chosen.
- A named path whose way passes a symlink asked about in its own place's terms (Follow it, Just look, No;
  `src/tui/documents/navigation/following.ts`), the answer kept as VV-D6 keeps it, for the link and where it leads;
  what a yes allows is that place's, a vault's never a write out of it (D220); Just look reads it read-only.
- Link completion in a chosen file of another place (OUT-D10): what that place itself offers, from its graph
  (`elsewhere.graph`) and in its link convention (`linkItems` in `src/tui/documents/editing/completion/items.ts`).
- `:w`, autosave, a task ticked; the conflict prompt on a change made on disk; unsaved, asked about on quitting and on
  a switch, as any note.
- Polled while open (`Watch.poll`).
- The CLI's write commands unchanged (`checkWritable` in `src/cli/common.ts`): a path outside the vault refused.
- The design kept true as it's built: design.md § A file from outside the vault and its changes to design/tui.md
  § Writing notes and design/roots.md § Links followed only when you say so, which those files take at consolidation
  (OUT-T5); requirements.md's change to `7.5` the same.

## Acceptance criteria

- Unit tests, each refusal one that fails without its guard:
  - `tests/tui/documents/saving/write-buffer.test.ts`, new: a chosen buffer outside the vault written by `:w`,
    autosave and a task ticked; a read-only buffer refused by every save, the forced one too (a peek's kept tab, a
    file you may not write, a file read just looking); a buffer of another place not chosen refused; a chosen file of
    another vault whose symlink leads out of that vault refused (D220); a chosen file of home's written through a link
    followed there; a chosen buffer whose real path changed since refused; a symlinked note of this vault out of it, a
    plan's file and a window through a link not followed still refused.
  - `tests/core/foundation/platform/writes.test.ts`: `writeNote` measured from a chosen file's own vault.
  - `tests/tui/documents/navigation/peek.test.ts`: a link's buffer, a backlink's, a search hit's and `ctrl+click`'s
    never chosen; a peek's kept tab named with `:e` becomes chosen; a named file kept with `t` stays chosen.
  - `tests/tui/documents/navigation/link-completion.test.ts`: in another vault's chosen file, that vault's notes in
    its convention, none of the current vault's.
  - A named path through a symlink: Follow it writes as its place allows, the answer kept for the link; Just look
    read-only and never written; No reads nothing.
  - The CLI's `write` given a path outside the vault still exits 5 (`tests/cli/`, if no test shows it already).
- Terminal checks: `outside-files` (typed into, saved, autosaved, a task ticked, changed on disk under it; a peek's
  kept tab named with `:e`, then typed into; a symlink on the named path's way asked; `[[` completing that vault's
  notes), `saving`, `symlinks`, `save-conflicts`, `vault-peek` (a link's file still refuses typing and saving).
- Every bug found gets a regression test; `bun run check` passes; the user docs (`docs/guides/vaults.md`,
  `docs/manual/vaults.md`, `docs/manual/files.md`) and a CHANGELOG line come with it.
