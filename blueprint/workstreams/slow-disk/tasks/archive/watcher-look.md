---
status: done
assignee: ""
blocked_by: [SD-T1, SD-T2]
tracker: [gh:#46]
created: "2026-11-09"
---

# SD-T3: The watcher's look, and its settle by stat, on the disk threads

SD-D3, SD-D5, SD-D6, SD-D8. The first thing you'd feel: on a slow disk, the screen stops every two seconds.

## Description

- `VaultWatcher.pollTick` (`src/core/workspace/graph/watch.ts:148`) asks one `stat` batch per tick: every watched
  folder, its `.gitignore` (`WatchDirectories.gitignoreStamp`), each note in `state.followed`; and a `list` of each
  polled folder with its notes' stamps. Every 15th tick, the sweep's stats of the known notes, a hundred a
  request, each asked when the last answers; a sweep still under way at the next 15th tick goes on, none other
  starts. A tick whose answer hasn't come asks nothing new.
- The answer is compared, when it comes, with what's known then (`known`, `sizes`, `ownWrites`, `stamps`), and only
  while the watcher's `sync` count is the one it was asked under (SD-D5); a folder gone, a `.gitignore` changed, a
  note changed or gone become pending as now.
- `lookAgain` (`watch.ts:252`) lists the folders whose mtime moved on a disk thread; `flush` (`watch.ts:313`) asks
  `WatchReconciliation.settle`'s and `vanished`'s stats and listings there, and the batch goes to `onBatch` when they
  answer; events meanwhile wait for the next flush.
- Each entry a listing or the settle finds is judged on the listing's thread with it, as SD-T7 judges the explorer's:
  the walk's filter (`WalkFilter.exclusion`, `src/core/workspace/walk/filtering/filter.ts:162`: a nested vault's
  marker, a busy folder's note at its top, a `.gitignore`), a link's verdict (`WatchDirectories.symlinkKept` →
  `symlinkVerdict`, `src/core/workspace/walk/traversal/symlinks.ts:29`), and where a note that went has gone
  (`WatchReconciliation.movedTo`, `watch/reconciliation.ts:24`: its candidates statted and their folders listed).
- The batch is SD-T2's: a `stat` request and a `list` per folder, asked together, each with the look's minute.
- `watchDir`'s two stats (`.gitignore`, `startStamp`; `watch/directories.ts:124`) come from the walk's stamps
  (`Graph.dirStamps`, made on the thread) or are asked there; `adoptTree`'s listing is a `list` there. `fs.watch`'s
  registration stays.
- Given up on (SD-D6): `⚠ disk not answering` on the status line, said once in Messages, looked at again a minute
  later; the next answer clears it.

## Acceptance criteria

- Held: a vault with a watched folder `held`, its look started (`pollTick`) while the hold is on — a key (`ctrl+p`)
  handled and its frame drawn while `held.waiting` ≥ 1; let go, a note an agent wrote in `held` meanwhile is in the
  graph and an open one reloaded; `held.gaveUp` 0. With `pollTick`'s stats back here, the test fails (checked once).
- The sweep held: the same, a note rewritten in place (no folder's mtime moved) seen once let go.
- The settle held: an event's batch waits for its stats; a key handled meanwhile.
- Held: a polled folder under `held` holding a busy folder, an ignored file, a nested vault and a link out — a key
  handled meanwhile; let go, each judged as the walk judges it. A note moved into `held` meanwhile is found moved
  (`movedTo`), not gone and new.
- Races: a save of ours while the look is out isn't taken for a change; an answer from before a `sync` (a build
  meanwhile) is dropped; a second tick while one is out asks nothing.
- Past a shortened deadline: `⚠ disk not answering` once; the next look that answers clears it.
- The watcher's existing tests (`tests/core/workspace/graph/watch*.test.ts` and the TUI's) pass unchanged, a test's
  App asking at once.
- `CHECKS_FOR` (`scripts/ci-scope.ts`) names the terminal checks this task's files reach; before its pull request
  merges, they run locally, listed for approval first, with its unit tests (SD-D14).

## Terminal check

`slow disk: the vault open on a slow disk — the watcher's looks hold up no key; an agent's note seen once read`: a
vault with a folder named as the stand-in's, keys pressed for three looks, each answered within a bound short of the
folder's time; a note written by the check meanwhile appears in the switcher.

## Decided (2026-11-09)

By the maintainer's instruction to take the recommended answer (SD-D12):

- The sweep's slice: a hundred notes a request, chained (above). A count needs no clock in a test (#75); a hundred
  stats fit the minute's deadline at T12's slow mount's 0.3 s a stat; a fast disk sweeps as quickly as now.
- Polled folders (`state.polled`): listed every tick, in its batch, as now; a tick whose answer hasn't come asks
  nothing new, so a slow disk slows the looks by itself.

## Open

What the description left open, settled here for the maintainer to confirm; design.md's sections it delivers say
how.

- The watcher's logic is written as looks (`core/workspace/graph/watch/reads.ts`): each a generator that yields the
  batch it needs and goes on with the answer. The TUI's watcher asks each batch of the disk threads; a test's watcher,
  and a test's App's, answers it at once on the thread that asks, with the same code, so the watcher's tests run as
  they did. One look is out at a time — a tick, a flush, a folder listed again, the stamps of folders registered — and
  a flush asked meanwhile runs once it has answered; the sweep is a chain of its own.
- What a disk thread judges is `core/workspace/graph/watch/judging.ts`: a settled path's verdict (a link's, and the
  filter's on it as a folder or a file), a listing's entries (the filter's, a link's, a note's time), a tree taken in
  (`adoptTree`'s, each folder stamped just before it's listed, up to home's room under its cap), and where notes that
  went are (`movedTo`'s). It judges with a filter made from the walk's settings (`filterFrom`) and the root's real
  path, read there. A settle's batch of stats stops at a `.gitignore` among its paths, as the rules change after it.
  `disk-jobs.ts` hands `list` and `stat` with a `judge` to it; `PathStat`, `statOf` and `codeOf` moved to
  `walk/io/stamps.ts`, which the watcher reads too, so neither imports the other.
- Every answer is checked when it comes (SD-D5). Synced since, or closed, a look is dropped: a flush's paths go back
  to pending, settled against what the build knows. Given up on, a flush says what it settled and puts the rest back.
  A path our own write was told for (`noteOwnWrite`) after its stat was asked is settled again (`writtenAt`, by a
  count of writes), so the stat from before the write is never taken for a change.
- `watchDir`'s two stats are asked on a disk thread, with the next look or with one of their own once none is out,
  and compared with the walk's stamps (`Graph.dirStamps`) when they come, as `startStamp` compares them; they're never
  taken from the walk's alone, which has no `.gitignore`'s stamp. A folder taken in with all it holds is stamped from
  the listing that found it.
- Given up on (SD-D6): `onNotAnswering(true)` once, until a look answers (`false`). The TUI says `disk not answering:
  the watcher's look gave up; it looks again in a minute` in Messages; the status line says `⚠ disk not answering`
  after `⚠ not watching`. The looks wait a minute after each given up (the watcher's clock, `now`).
- The root's real path is read when a look here first asks it: the TUI's watcher never reads it on the screen's
  thread. `filter.ts` and `traversal/symlinks.ts` read through the seam, out of `DISK_READERS`. `noteOwnWrite`
  without a stamp (the scratch's) still stats on the screen's thread: SD-T11's, with the scratch.
- `AppOptions.listOffThread` keeps its name: SD-D10's note renames it for what it covers, but the TUI's look (SD-T4),
  built beside this task, keeps it too, so the two don't meet in a rename. The watcher takes the explorer's listings'
  flag (`Listings.offThread`); the name is the consolidation's (SD-T12).
- `CHECKS_FOR`: `watching` and `home-watching` join the disk threads' entry. The watcher's own files keep none: every
  check reads the watcher.
- The terminal check's slow folder takes three seconds a stat (the stand-in's fourth part): every key is answered
  within a second, and the agent's note shows two seconds or more after it was written, once its stat answered. With
  the looks read on the screen's thread again it showed after 577 ms, and the check failed.

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("The watcher's look"); § MODIFIED design/tui.md § External
  changes; § MODIFIED design/tui.md § Bun's watcher, and what covers its gaps.
- Rests on: SD-D3, SD-D5, SD-D6, SD-D8; D137; design/tui.md § Bun's watcher, and what covers its gaps.
