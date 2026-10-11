---
status: todo
assignee:
created: "2026-10-11"
---

# T7: Another root's links to this repository's hosting are backlinks

A file in another root linking to this repository's hosting counts as a backlink here, as its pointers do.

## Description

`reach.ts` (`landsHere`) counts another root's paths, pointers and `file://` links into this root, not its links to
this repository's hosting, which D87 makes the file in this copy. Count them too, through `core/hosting.ts`, with this
checkout's remote. Also check that another root's data and code files' links count, as notes' do; if they don't,
count them (their links are in the index).

## Acceptance criteria

- A test: root B's README links `https://github.com/me/a/blob/main/x.md`; A's `x.md` lists it among its backlinks.
  It fails without the change. Likewise a link from B's code comment, if that was missing.
- design/links.md § Backlinks says what counts.

## References

- Delivers: design/links.md § Backlinks.
- Rests on: D87, D73.

## Log
