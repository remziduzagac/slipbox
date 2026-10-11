---
status: todo
assignee:
created: "2026-10-11"
---

# T3: Pair a move seen by the watcher only when its text is unique

The watcher takes a removal and an arrival for a move only when exactly one gone file had that text, as the index
does when it is built.

## Description

At index time a note gone from one path whose text turns up at exactly one new path, and no other gone note had that
text, was moved. The watcher's pairing (a removal and an arrival within a minute, in either order) takes the first
entry with the same hash, with no uniqueness check: two identical files gone, and one arriving, pair arbitrarily.
Make the watcher's rule the index's: several candidates with that text, no move.

## Acceptance criteria

- A test removes two notes with the same text and adds one of them back elsewhere: no move is recorded. With one
  candidate, the move is recorded as now. The first fails without the fix.
- design/links.md § Repairs (or wherever moves seen are described) says the rule once.

## References

- Delivers: design/links.md § Repairs.
- Rests on: D63.

## Log
