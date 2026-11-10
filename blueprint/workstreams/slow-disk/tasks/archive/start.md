---
status: done
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

## Open

What the description left open, settled as it was built (SD-D15); design.md's section it delivers says how.

- The note read before its graph is placed in its window as it's read, beside the walk, the window saying
  `reading the vault…` until the graph's first build answers (`Builds.awaited`); given up, it's shown as its text.
- `q`, `ctrl+c` and `ctrl+q` quit out of turn while the vault open's graph has never been built (`Builds.unbuilt`): at
  the start, and in a vault gone into, which SD-T8 had waiting for its walk.
- `esc` gives up the note's read, the window left empty; the keys after it still wait for the vault.
- Found building it: the session was saved over while its tabs were coming back, by a quit or the save a second after
  a change, so the next start brought none back (`Session.coming`). The search index, started with a graph of no notes,
  let go of every note it held and indexed them all again after the build (`Search.start`): at every start once the
  build moved, and already at a vault gone into since SD-T8. Each has its regression test
  (`tests/tui/app/runtime/start-read.test.ts`).
- Home's walk asked again, the graph's errors and the offer to relink what a move broke now follow the first build
  (`Builds.after`), as they read the graph.
- `CHECKS_FOR` (`scripts/ci-scope.ts`): no entry added. The start's files (`run.ts`, `startup.ts`, `app.ts`, `input.ts`,
  `views.ts`) reach every check already, and `builds.ts` has its own. The slow-disk checks, the vaults', the session's
  and the start's ran before the pull request.
- Still read on the screen's thread: before the screen, what SD-D9 keeps there (your config, the path named, `--base`,
  the machine's list); as the App starts, in home, the session and whether each of its tabs' notes is there, for the
  folders its first walk asks (`Vaults.tabFolders`).

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("The start").
- Rests on: SD-D4, SD-D9; VV-D2; UPG's restart (its tabs brought back).
