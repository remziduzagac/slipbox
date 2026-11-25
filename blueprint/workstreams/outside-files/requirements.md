# Requirements

## Goals

- **Opened where you are** (OUT-D1, OUT-D3, OUT-D7): a file outside the vault — another vault's, home's or
  Elsewhere's — opened with `:e`, the switcher's path, the explorer or on the command line beside a `--root` that
  doesn't hold it opens at once as a tab here, the tabs as they were; `:e ../x.md` reads from the vault's top.
- **Edited when you chose it, looked at when a link led there** (OUT-D2): the file you named or picked is edited and
  saved where it is; a link's opens in the read-only peek.
- **Its vault a command away** (OUT-D4): `space v g` goes into the file's vault with the file open, asked first as
  every switch is; a line says so when the file opens.
- **Where you are, always said** (OUT-D5): the tab names the file's vault; this vault's search, backlinks, index, task
  list, renames and git panel stay this vault's.
- **Back after a restart** (OUT-D6), as every tab is.

## Non-goals

- Windows, or two vaults' tabs side by side: slipbox is in one vault at a time (VV-D4).
- A link's file written: links keep the peek (VV-D6, VV-D7).
- An outside file in this vault's search, backlinks, index or git (OUT-D5).
- Files made, moved or renamed outside the vault (OUT-D5).
- The CLI's commands writing outside the vault, or taking a path outside `--root`: they keep refusing (`7.5`;
  design.md).
- Going into a vault itself, by its row, `space v v`, the top bar, the git panel's Open or a folder link, without
  asking (D270, OUT-D3).

## Builds on

- The peek and the tab it keeps (VV-D7; design/tui.md § The peek): a tab here of another vault's file, its links read
  in its vault (`markElsewhere` in `tui/documents/buffers/opening.ts`), brought back with the workspace.
- Going into a vault and its question (VV-D4, D270; design/tui.md § Going into a vault; `switchVault` and `intoOther`
  in `tui/workspace/vaults/vaults.ts`).
- The one write path (D142; design/tui.md § Writing notes): `App.writeBuffer` (`tui/documents/saving/write-buffer.ts`)
  and `writeNote`'s `through` (`core/foundation/platform/fsutil.ts`); design/roots.md § Links followed only when you
  say so.
- Files no watcher sees, polled while open (`Watch.poll`; design/tui.md § External changes).
- Workspaces kept by vault in slipbox's own state (WSP-D1; design/how-it-works.md § Storage).

## Acceptance criteria

- **Opened here** (OUT-T1): from a vault of the reference set, `:e` with another vault's note's path, with a `~/` path,
  with a pointer and with `../`, the switcher's typed path, and `enter` on a file outside the vault's tree in the
  explorer each open the file in a tab here, no question asked, the other tabs as they were; the tab names its vault;
  its links open peeks; this vault's search, backlinks and task list don't list it, nor does the gutter mark its git
  changes. Started with `--root` naming notes and kestrel's note, notes opens with that note as a tab, its vault
  named; without `--root`, kestrel opens. The git panel's Open on a worktree still asks to go into it. A terminal
  check covers each.
- **Edited and saved** (OUT-T2): typed into and saved with `:w`, autosaved, a task ticked — written to the file
  itself, atomically; a file a link led to, kept with `t`, still refuses typing, said; a note of the vault whose
  target a symlink takes outside is still never written there; a save after the file changed on disk asks as any
  note's does; a save after its real path changed is refused; a peek's kept tab named with `:e` becomes editable; a
  named path through a symlink asks first. Unit tests for the write path: allowed for the buffer named, refused for
  every other case, each a test that fails without its guard; the CLI's `write` still refuses a path outside the vault.
- **Into its vault** (OUT-T3): `space v g` on such a tab asks `Go into kestrel? …` with Go and Stay; Go opens kestrel
  with the file open; Stay leaves everything as it was; a click on the tab's vault mark does the same; the line said
  on opening names the key.
- **After a restart** (OUT-T4): quit with two outside tabs open, one edited and saved; started again, both are back,
  editable, their vaults named; one whose file is gone since does what a note's tab whose file is gone does.
- Every bug found gets a regression test; every part a terminal check; `bun run check` passes; the user docs say it
  all without the blueprint's IDs, and a CHANGELOG line comes with each task (OUT-T5).

## Changes to the root's requirements

### MODIFIED requirements.md § Vaults and links

The first bullet's last sentence becomes:

"Every file is in exactly one; a file of another vault, home or Elsewhere, opened by name or picked, opens here as a
tab, editable, its vault named on it; choosing another vault goes into it, and into your workspace there (D58, D69,
D80, VV-D1–VV-D4, WSP-D1, OUT-D1–OUT-D3)."

Previously: "Every file is in exactly one; choosing a file of another vault goes into it, and into your workspace
there (D58, D69, D80, VV-D1–VV-D4, WSP-D1)."

The bullet on going into another vault becomes:

"- Going into another vault, by any way, asks first: Go, Peek at the note, or Stay; a peek never switches, and a file
  opened here is no switch (D270, OUT-D1, OUT-D4)."

Previously: "- Going into another vault, by any way, asks first: Go, Peek at the note, or Stay; a peek never switches
(D270)."

### MODIFIED requirements.md § Navigating and search

"- Another vault's file a link leads to is read in a peek, going there a choice; one opened by name opens here
  (VV-D7, OUT-D3)."

Previously: "- Another vault's file is read in a peek, going there a choice (VV-D7)."

### MODIFIED requirements.md § Constraints, Safety: `7.5`

"- **`7.5`** (D142, D69, D79, VV-D6, OUT-D2): slipbox never writes outside the vault, save a file outside it that the
  person opened by name or picked, and that file alone. A symlinked note is written through to its target, and a
  target outside the vault is refused; a file a link leads to is never written out of the vault; nothing is made
  outside the vault. In home, a link the user followed is written through wherever it leads; in Elsewhere, which no
  vault bounds, what the file system allows. design/tui.md § Writing notes; design/roots.md § Links followed only when
  you say so."

Previously: "- **`7.5`** (D142, D69, D79, VV-D6): slipbox never writes outside the vault. A symlinked note is written
through to its target, and a target outside the vault is refused; nothing is made outside the vault. In home, a link
the user followed is written through wherever it leads; in Elsewhere, which no vault bounds, what the file system
allows. design/tui.md § Writing notes; design/roots.md § Links followed only when you say so."
