---
status: todo
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
  polled folder with its notes' stamps. Every 15th tick, the sweep's stats of the known notes in slices (**Open**:
  how many a slice), carried on where it was when the next is due. A tick whose answer hasn't come asks nothing new.
- The answer is compared, when it comes, with what's known then (`known`, `sizes`, `ownWrites`, `stamps`), and only
  while the watcher's `sync` count is the one it was asked under (SD-D5); a folder gone, a `.gitignore` changed, a
  note changed or gone become pending as now.
- `lookAgain` (`watch.ts:252`) lists the folders whose mtime moved on a disk thread; `flush` (`watch.ts:313`) asks
  `WatchReconciliation.settle`'s and `vanished`'s stats and listings there, and the batch goes to `onBatch` when they
  answer; events meanwhile wait for the next flush.
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
- Races: a save of ours while the look is out isn't taken for a change; an answer from before a `sync` (a build
  meanwhile) is dropped; a second tick while one is out asks nothing.
- Past a shortened deadline: `⚠ disk not answering` once; the next look that answers clears it.
- The watcher's existing tests (`tests/core/workspace/graph/watch*.test.ts` and the TUI's) pass unchanged, a test's
  App asking at once.

## Terminal check

`slow disk: the vault open on a slow disk — the watcher's looks hold up no key; an agent's note seen once read`: a
vault with a folder named as the stand-in's, keys pressed for three looks, each answered within a bound short of the
folder's time; a note written by the check meanwhile appears in the switcher.

## Open

- The sweep's slice, by count or by time on the thread.
- Whether polled folders (`state.polled`) are listed every tick on a slow disk, or every other.

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("The watcher's look"); § MODIFIED design/tui.md § External
  changes; § MODIFIED design/tui.md § Bun's watcher, and what covers its gaps.
- Rests on: SD-D3, SD-D5, SD-D6, SD-D8; D137; design/tui.md § Bun's watcher, and what covers its gaps.
