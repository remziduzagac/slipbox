---
status: todo
assignee: ""
blocked_by: [SD-T1, SD-T2]
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
- Past a shortened deadline: `reading the vault gave up: …`, the graph as it was.
- Mutation: the walk made here again, the first test fails (checked once).

## Terminal check

`slow disk: the vault open reindexed on a slow disk — its links and backlinks stay while it's read, every key
answered; a note added meanwhile there once read`.

## Open

- A rename's and a folder operation's build (`renaming.ts:206`, `:220`; `mutations/files.ts:102`, `:148`;
  `rename-apply.ts:319`, `:421`): on the thread with the key waiting as an open does, or kept here as part of the
  key's write (a question for the maintainer once this task starts; the write itself stays, SD-D7).
- Sending the index across whole, or as its text parsed here (measured first).

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("The vault built again").
- Rests on: SD-D3, SD-D5, SD-D6, SD-D7; D40; VV-D2; T12 (`homeBuilt`, `Graph.builds`).
