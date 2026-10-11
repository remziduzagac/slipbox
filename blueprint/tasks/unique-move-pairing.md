---
status: review
assignee: claude-moves
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

- 2026-10-11: Found: `Graph.pairMove` kept one entry per text on each side (`Map<hash, {rel, at}>`), so a second
  removal of the same text replaced the first, and an arrival paired with whichever was last.
- 2026-10-11: Fixed (`src/core/graph.ts`): each side keeps every removal and arrival of a text within the minute; a
  pair is a move only when the other side has exactly one candidate and this side none pending (two gone and one
  come, or the other way, is no move, as `detectMoves` rules at index time). A note gone and back at the same path
  cancels, rather than standing as a removal a later arrival could pair with.
- 2026-10-11: Test `the watcher pairs a move only when one gone note had that text, as the index does (D63)` in
  tests/vault.test.ts (moves, 17.12): two gone and one back, two come and one gone, a third gone after the arrival,
  and the single case still recorded. Mutation-checked: with the old `pairMove` it fails (`a.md` → `x.md` recorded);
  without the "nothing pending on this side" condition it fails too.
- 2026-10-11: Tried on the reference set (no herdr: the real `VaultWatcher` on `home/notes`, its batches applied
  with `applyToGraph` as the TUI's feed does): two notes of one text removed and the text written at a new path, no
  redirect; `inbox.md` copied to `inbox-moved.md` and then removed, the redirect recorded.
- 2026-10-11: design/links.md § Repairs says the rule once, for the index and the watcher alike.
