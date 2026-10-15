---
status: done
assignee: claude-cli
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

## Done (2026-10-15)

Home is a vault of mode `home`; the skip list is `homeSkip` and the busy folders `BUSY_FOLDERS` in `core/walk.ts`,
where VV-T5 reads them for the explorer's marks. Its walk is made in slices while nobody works, by the background index
first in each pass or by the TUI alone when that's off, and kept (`walk.json`), so opening home never walks it; the CLI
walks it the first time. A cap of 10,000 notes and 5,000 folders, said when reached. The reference set has a note of
home's own (`todo.md`) with a backlink from below its top (`household/bike-insurance.md`), and the terminal check
"vaults: home". The workstream's design.md has the text for roots.md. Left for later tasks: Downloads and the busy
folders listed in the explorer (VV-T5; until then a folder of home its index leaves out is listed a level at a time
when it's opened), Elsewhere for what's outside home (VV-T3).
