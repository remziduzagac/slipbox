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

- Held: slipbox started on a vault under `held` — the screen drawn, `reading the vault…`, `q` quits; let go before,
  the note is drawn with its links checked, its backlinks there.
- A start on a vault that answers at once draws its note as now: the terminal checks that start on a note pass
  unchanged.
- Past a shortened deadline: said, the screen up, the note shown as text with its links unchecked (**Open**), or
  nothing opened.

## Terminal check

`slow disk: slipbox started on a vault on a slow disk — the screen at once, the note once the vault's read, q quitting
meanwhile`.

## Open

- What a start shows when its vault's walk gives up: the note as its text without the graph, or nothing.
- Whether a restart (`UPG`) waiting for its vault keeps its tabs' places as a start does.

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("The start").
- Rests on: SD-D4, SD-D9; VV-D2; UPG's restart (its tabs brought back).
