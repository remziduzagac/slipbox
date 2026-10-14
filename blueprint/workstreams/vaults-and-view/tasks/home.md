---
status: proposed
assignee: null
blocked_by: [VV-T1]
created: "2026-10-15"
---

# VV-T2: Home, a vault without a marker

`~` as a vault, its index with a skip list, built while idle (VV-D2).

## Description

- The vault of a file: its nearest marker, else home when it's under `~`, else no-vault (`core/vault.ts`).
- Home's walk: notes and text files only; hidden folders, the system's, `Downloads` and the busy folders skipped; large
  files listed, not read; in slices while idle, beside the background index.
- Home's state keyed as any vault's; its settings the user's; its git only when `~` is a repository.

## Acceptance criteria

- Unit tests: a file under a vault, under home, outside both, each in the right one; the skip list held.
- A terminal check: started in a home of the reference set, a note there has its backlinks.
