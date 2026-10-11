---
status: todo
assignee:
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
