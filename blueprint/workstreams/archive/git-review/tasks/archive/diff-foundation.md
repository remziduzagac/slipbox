---
status: done
assignee: claude-cli
blocked_by: []
created: "2026-10-14"
---

# GIT-T1: The diff's foundation: changed words, and the source diff

Changed words inside changed lines, drawn in the source diff every diff window uses (GIT-D2).

## Description

- `merge.ts`: inside a hunk, each removed line paired with the most alike added line, and the pair diffed by word; a
  pair less than half alike stays a line removed and a line added. Unit tests on prose and on code.
- The source diff: a row a line, `-` and `+` in the gutter, highlighted by the file's language, changed words in
  `diff_del_word` and `diff_add_word`; long lines scroll sideways (D233) instead of being cut; unchanged stretches
  folded to a line saying how many.
- Used by `space g d`, the changes' list's diff, a history entry's diff to now and the conflict prompt's (D)iff.
- The themes' new roles, in every built-in theme.

## Acceptance criteria

- A one-word change in a long line shows that word marked, the rest of the line plain; the line's end reachable by
  scrolling, never cut with `…`.
- A terminal check on the example set's `kestrel-agent-sync-retry`: `space g d` marks the changed words.
- `bun run check` passes.
