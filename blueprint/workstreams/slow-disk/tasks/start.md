---
status: todo
assignee: ""
blocked_by: [SD-T5, SD-T8]
tracker: [gh:#46]
created: "2026-11-09"
---

# SD-T10: The start takes the screen first, then reads the vault

SD-D9, SD-D4.

## Description

- `prepare` (`src/tui/shell/terminal/run.ts:62`) no longer calls `openGraph` (`:115`): a vault's graph starts unbuilt,
  as home's does, and is built by SD-T8's build on a disk thread once the screen is up (`Vaults.ask`).
- What's read before the screen stays: your config (keys, theme, where state is), the path named (`openingPath`),
  `--base`, the machine's list recorded (`recordLocation`).
- The note named, or the session's tabs, open as SD-T5 opens a note, then wait for the graph: `reading the vault…` in
  the window, the keys after them waiting, `q` and `ctrl+c` quitting meanwhile, `esc` leaving the window empty.
- Home: its first build (`Vaults.ask` → `Graph.askFolders` → `homeWalk`), with the folders its tabs are in, on the
  thread as SD-T8 makes it.

## Acceptance criteria

- Held: slipbox started on a vault with a folder inside it under `held` (`notes/held/`), not the vault itself — so
  `openingPath`'s marker checks and `.slipbox/config.toml` (`run.ts:74`, `:83`), which stay before the screen
  (SD-D9), answer, and the walk is what waits: the screen drawn, `reading the vault…`, `q` quits; let go before, the
  note is drawn with its links checked, its backlinks there.
- A start on a vault that answers at once draws its note as now: the terminal checks that start on a note pass
  unchanged.
- Past a shortened deadline: said, the screen up; the note shown as its text if its own read answered, its links
  drawn as resolved, the vault asked again a minute later and the note drawn again when it comes; nothing opened, and
  said, if the note's read gave up too.
- A restart (`UPG`) waiting for its vault: its tabs brought back as a start's, their places kept.
- `CHECKS_FOR` (`scripts/ci-scope.ts`) names the terminal checks this task's files reach; before its pull request
  merges, they run locally, listed for approval first, with its unit tests (SD-D14).

## Terminal check

`slow disk: slipbox started on a vault on a slow disk — the screen at once, the note once the vault's read, q quitting
meanwhile`.

## Decided (2026-11-09)

By the maintainer's instruction to take the recommended answer (SD-D12):

- A vault that doesn't answer in time: the note shown as its text, links drawn as resolved, asked again a minute
  later (above). The note asked for is what's of use meanwhile; an empty window leaves nothing to do but quit.
- A restart: brought back as a start is, one path.

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("The start").
- Rests on: SD-D4, SD-D9; VV-D2; UPG's restart (its tabs brought back).
