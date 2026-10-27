---
status: done
assignee: claude-writes
created: "2026-10-11"
---

# T5: Writing a pointer says when its name is private, and asks on a clash

When slipbox writes a pointer (completion, the link picker, `slipbox link`, a rename's relink), it says so if the
name is private, and in the TUI asks to rename one folder when the name is shared by different folders.

## Description

A private name (a `.slipbox/` kept out of git) works only on this machine, so a pointer to it written into a shared
file won't resolve elsewhere; today only `info` and `folders` show "private". A name two different folders share
gives a pointer that is ambiguous when followed (`pickPointerFolder` asks then); writing one uses the short name
without asking. When writing: a private name gives a warning (the TUI's message line; the CLI's `warnings`), and a
clashing name, in the TUI, asks to rename one of the folders first (the rename is `slipbox name`'s, previewed), or to
write the qualified name; the CLI writes the qualified name and warns.

## Acceptance criteria

- Tests for `core/write-link.ts` (or where the pointer is chosen): a private name returns its warning; a clash yields
  the qualified name and a warning. Each fails without the change.
- A TUI test: completing a pointer to a clashing name asks before writing.
- design/links.md § Pointers and § Links slipbox writes say it.

## References

- Delivers: design/links.md § Pointers, § Links slipbox writes.
- Rests on: D74, D75, D83.

## Log

- 2026-10-11: found that `pointerName` wrote a repository's qualified name on a clash already, silently, and a
  `.slipbox/` folder's short name; and it counted only other folders' names, while following (`lookupFolder`) also
  reads their aliases, so a name another folder had as an alias was written as if it were unique.
- 2026-10-11: `core/workspace/vaults/folders.ts`: `pointerNaming` (the name written, short, qualified, private, the
  folders that share
  it by name or alias, as following reads one), `pointerWarnings`, `privateNameWarning`; `pointerName` is its `name`.
  `core/write-link.ts`: `pointerAt`, `LinkEnds.naming`, `linkWarnings`. `slipbox link` puts them in its `warnings`;
  the relink's plan says them for the pointers it offers (`planRelink`; an ambiguous one it never offered). The TUI:
  `App.writeLinkAsked`, used by completion's pointers and the link picker: on a clash a list asks — write it (by the
  qualified name, or the short one as it is), or rename one of the folders first (a `.slipbox/` one whose name it
  is: `planVaultRename`, the parent folder's name prefixed, previewed; once applied, the link is worked out again
  and written); esc writes nothing. A private name, once written, is a warning in the message line. A completion
  answered later isn't repeated by `.`.
- 2026-10-11: tests: tests/vault.test.ts, "slipbox:// pointers (21.7)": a private name's warning (core, `slipbox link
  --json`, the relink's plan); two repositories of one name, the qualified one and its warning (core, the CLI's
  stderr); two `.slipbox/` folders of one name, the short one, said ambiguous; a name another folder has as an alias.
  tests/tui.test.ts, after the link-target completion test: completing a pointer to a shared name asks, nothing
  written yet; "as it is" writes the short name; renaming the other folder first previews the rename, then writes
  the link with no further question; esc writes nothing; a private name is written and warned. Mutation-checked,
  each failing: without the CLI's warnings; without the private warning; without the clash warning; with aliases
  left out of the clash; without the relink's warnings; without the TUI's question; without its private message;
  without completion's redirect to it; without writing the link after the rename.
- 2026-10-11: tried on the reference set with the CLI (its own `XDG_STATE_HOME` and `XDG_CACHE_HOME`, so this
  machine's named folders were untouched): `slipbox link` from `notes/index.md` to `hobbies/photography/index.md`,
  nothing said; `work/infra` given a private name (`init --name infra-ops --private`), linked: the pointer and the
  private warning; a different `.slipbox/` folder named photography elsewhere: `slipbox://photography/index.md` and
  "2 different folders are called photography: followed, the pointer asks which"; that one renamed with `slipbox
  name`: nothing said; a repository elsewhere with a `…/kestrel` remote: `slipbox://github.com/kestrel-labs/kestrel/…`
  and "written by its qualified name"; `relink --dry-run` of a relative path into infra: its pointer, and the private
  warning. The TUI's question was checked by its test only (no terminal tests here).
- 2026-10-11: design/links.md § Pointers ("Written", an item of its own) and § Links slipbox writes say it.
  docs/cli.md's `slipbox link` paragraph says nothing of pointers yet; not changed here (the task names no user doc).
- 2026-10-11: accepted by the user; done.
