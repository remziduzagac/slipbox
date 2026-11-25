---
status: active
created: "2026-11-25"
---

# OUT: A file outside the vault, opened where you are

A file outside the vault open — another vault's, home's or Elsewhere's — opened by name asked first to go into its
vault (D270): Go, Peek or Stay, and Stay opened nothing; `:e ../x.md` was refused outright. Every code editor compared
opens such a file where you are ([the research](../../research/outside-files.md)). slipbox has no windows, so going
into the file's vault was its one way to open it, and that replaced every tab. This workstream opens the file at once,
as a tab here: editable when you named or picked it, a link's still a read-only peek; going into its vault is a
command offered beside it, asked as every switch is. Settled with the maintainer on 2026-11-25, item by item;
accepted, not built yet.

- [requirements.md](requirements.md): its goals, what it builds on, its acceptance criteria, its changes to the root's
  requirements.
- [design.md](design.md): its changes to the root's design, every point settled.
- [decisions.md](decisions.md): OUT-D1 to OUT-D11.
- [notes.md](notes.md): how it came up, and the decisions it reopens.
- [tasks/](tasks/README.md): the work, a task per file.
- The research: [../../research/outside-files.md](../../research/outside-files.md), how nine editors and note apps
  open a file outside the project open, with provenance.

Five settled decisions and a constraint change in part, each with the maintainer's agreement: VV-D3 (the loose file
retired, back for a file you name or pick, as no new kind of place: OUT-D8), VV-D4 (choosing another vault's file goes
into it), VV-D7 (its reason that an editable tab of another vault's file would be a half-switch), D142 as amended by
VV-D6 and constraint `7.5` (nothing written outside a vault), and D270 (`:e`, the explorer and the switcher's path
going into the file's vault). VV-D6 and D220 get notes too: the one write out of a vault is written as the file's own
vault writes it, so what they keep from being written stays so. Their notes are written at consolidation (notes.md
§ The decisions it reopens).

## Goal

A file outside the vault opened by name, or picked, opens at once where you are, your tabs as they were; you edit and
save it there; a link only lets you look; its own vault is a command away; and the tab, and the vault's search and
backlinks, always say where you are.

## Scope

In: the TUI's ways of opening a file by name or by picking it (`:e`, the switcher's path, the explorer, the command
line with a file outside `--root`), the tab they open, its writes, the command into its vault, the workspace
bringing it back, a relative `:e` path that leaves the vault.

Out:

- Windows, or two vaults' tabs side by side: slipbox stays in one vault at a time.
- Links: they keep the read-only peek (VV-D7).
- The CLI's commands: they keep writing only inside their vault, and refusing a path outside `--root` (design.md).
- Going into a vault itself (its row, `space v v`, the top bar, the git panel's Open, a folder link): still a switch,
  asked (D270, OUT-D3).
