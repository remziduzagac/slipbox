---
status: todo
assignee: ""
blocked_by: [SD-T3, SD-T4, SD-T5]
tracker: [gh:#46]
created: "2026-11-09"
---

# SD-T8: The vault open built again from a walk and an index read on a disk thread

SD-D3, SD-D5, SD-D6.

## Description

- `GraphRefresh.build` (`src/core/workspace/graph/refresh.ts:165`) takes its walk given (as home's refresh gives one
  now) and its index's text and stamp given; the TUI asks a disk thread's `walk` for them: `walkVault`,
  `listDirectory` in Elsewhere, home's `homeWalk` → `keptWalk` with the folders asked for. The CLI builds as now.
- The moves found by reading new notes' texts (`moves/reconcile.ts:38`) are asked of the thread with the walk.
- The callers ask and go on: a reindex (`actions-files.ts:91`), the watcher's rescan (`vault-feed.ts:38`), a setting
  of the walk changed (`settings.ts:244`), a vault gone into (`Vaults.ask`, `vaults.ts:91`), a branch's tabs
  (`Vaults.askTabs`, `vaults.ts:103`). The graph stays as it was meanwhile, `reading the vault…` among the background
  tasks; the build applied when it answers, then `Watch.rebuilt` as now.
- Answers checked (SD-D5): taken only while `Graph.builds` and the vault open are the ones asked under; the changes
  the graph took in meanwhile (the watcher's, slipbox's own writes, a file reached) applied again over it, as
  `GraphRefresh.homeBuilt` does (`since`). A second ask while one is out waits for it and asks again once.
- A rename's and a folder operation's build (`renaming.ts:206`, `:220`; `mutations/files.ts:102`, `:148`;
  `mutations/rename/rename-apply.ts:319`, `:421`), SD-D11: read on a disk thread too, the keys after it waiting their
  turn as after an open, `reading the vault…` in the status line, `esc` not giving it up; the write stays on the
  screen's thread.
- The index crosses as its text, parsed here as it is now (`readJson`, `refresh.ts:186`).
- The index written at the end of the background parse (`writeCache`, `refresh.ts:384`) stays a write (SD-D7).
- Measured: the screen's thread's longest gap as a 10,000-note vault's walk and index cross, sent whole or the index
  as its text (T12 measured 50 ms for home's walk crossing twice).

## Acceptance criteria

- Held: a reindex with a folder of the vault under `held` — `reading the vault…`, links and backlinks as they were,
  a key handled and drawn meanwhile; let go, a note added there meanwhile is in the graph.
- Held: a vault gone into, its walk held — the old vault's state let go of as now, the new vault's notes come when it
  answers; going into a third meanwhile drops the second's answer.
- Races: a reindex asked again while one is out; a note saved by slipbox while the walk is out survives it; the
  watcher's change meanwhile survives it; a vault left meanwhile drops it.
- Held: a rename with a folder of the vault under `held` — the rename written at once, `reading the vault…`, a frame
  drawn and `j` waiting; let go, `j` acts on the graph the rename made, the link to the renamed note followed.
- Past a shortened deadline: `reading the vault gave up: …`, the graph as it was.
- Mutation: the walk made here again, the first test fails (checked once).
- `CHECKS_FOR` (`scripts/ci-scope.ts`) names the terminal checks this task's files reach; before its pull request
  merges, they run locally, listed for approval first, with its unit tests (SD-D14).

## Terminal check

`slow disk: the vault open reindexed on a slow disk — its links and backlinks stay while it's read, every key
answered; a note added meanwhile there once read`.

## Decided (2026-11-09)

By the maintainer's instruction to take the recommended answer (SD-D11, SD-D12):

- A rename's and a folder operation's build: on a disk thread, the keys after it waiting (SD-D11). The next key must
  see the graph the write made; the build kept on the screen's thread would leave every rename on a slow disk a
  freeze, and one in the background would let the next key act on paths that are gone.
- The index across threads: as its text. The screen's thread parses it today after reading it; as text it does the
  same minus the read, where a structured copy would add the copy on top of a parse on the thread. The gap at 10,000
  notes is recorded here.

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("The vault built again").
- Rests on: SD-D3, SD-D5, SD-D6, SD-D7; D40; VV-D2; T12 (`homeBuilt`, `Graph.builds`).
