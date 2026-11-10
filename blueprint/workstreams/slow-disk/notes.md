# Notes

## How it came up

T12 (#9) found, while it moved the walks off the screen's thread, that more than the walk read the disk there: the
watcher's look every two seconds, the graph built again, a note's text, the explorer's tree of the vault open
(blueprint/tasks/archive/walk-off-the-main-thread.md, 2026-10-23). It moved what it was asked to and left the rest
said in design/roots.md § The index, "Not done", and in issue #46. This workstream was drafted from that issue on
2026-11-09, as a design for the maintainer's approval before anything is built.

## How the inventory was made

- Every read named in #46 was looked up in the code on `dev` at 0df9a0a6, and its caller followed up to a timer, a key
  or the start; each line in README.md § The inventory is where the read or its caller is on that commit.
- Then every `node:fs` call under `src/tui/` and the parts of `src/core/` the TUI runs on its own thread was read
  through, for what the issue didn't name. Found that way: the `.gitignore` stamped every look; the settle by stat of
  each event the watcher hears; the stats and the listing as a folder is watched (`watchDir`, `adoptTree`); the config's
  stamps and git's `HEAD`, lock and rebase every second, and the lock every 100 ms while git writes; the activity
  file's stat every quarter second; what drawing a note reads (a `/…` link's folder, a nested vault's link, a name's
  case on macOS, a picture); the Problems panel's notes. README.md marks the last two "(not in #46)".
- Names the issue used that have moved since it was written: `Graph.build` is `GraphRefresh.build` in
  `src/core/workspace/graph/refresh.ts`; `pollTick` is in `src/core/workspace/graph/watch.ts`, its folders' stamps in
  `watch/directories.ts`; `fromDisk` is in `src/tui/workspace/explorer/explorer-disk.ts`; `folderUnreadable` is in
  `src/core/foundation/platform/fsutil.ts`.

## What drafting it settled

- **A seam first.** Today's stand-in for a slow disk (`SLIPBOX_SLOW_DISK`) and the tests' hold reach folder listings
  only (`src/core/workspace/walk/io/folders.ts`). A stat or a read moved off the screen's thread couldn't be shown to
  have moved: the test would pass with the read left where it was. So SD-T1 widens the seam before anything moves, and
  every later task's test is checked by putting its read back once.
- **One pool.** The listing threads T12 made are what the reads need: light to start, two of them, a request never
  behind a stuck one while the other's free. SD-D2 grows them rather than adding threads per feature, for memory's
  sake (#56).
- **A key's own read waits; nothing else does.** The split follows what the screen does already: a big note's parse
  holds the keys after it (D120), git's reads hold their key and give way to `esc` (design/tui.md § Asynchronous git
  reads); timers and the background never hold anything.
- **Saves stay.** Moving a write would change the order of a save against the watcher's look and against a quit, which
  is what keeps a note from being lost; design/how-it-works.md already puts asynchronous saves in the roadmap's Later.
- **The start.** The only read that's neither a key's nor a timer's is the start's `openGraph`; SD-D9 moves it after
  the screen comes up, as home's start already is.

## The questions answered (2026-11-09)

- The maintainer answered the seven questions, each with the option recommended: one pool of disk threads; a note
  opened on a slow disk holds the keys after it, `esc` giving it up; the screen as it was while the vault is built
  again; no write moved; the screen first at the start; what drawing a note reads in, as the last code task; a minute
  for a look and a key's read, ten for a walk and a listing.
- That agrees SD-D2, SD-D3, SD-D4, SD-D6, SD-D7 and SD-D9, and SD-D1's last part. No question asked SD-D1's order,
  SD-D5, SD-D8 or SD-D10: they stay proposed.

## The rest settled (2026-11-09)

- The maintainer agreed SD-D1, SD-D5, SD-D8 and SD-D10 as proposed, and said to take the recommended answer for every
  question the tasks had left open. Those were decided with the recommendation: a rename's build as SD-D11, the rest
  as SD-D12, each said in its task. The workstream is active; its tasks are `todo`.
- Deciding them found one more read the inventory had missed: `ensureAll` reads every note not parsed yet when the
  tags, the problems, the link forms or a note's backlinks are asked of the graph on the screen's thread. It's in
  § 4 of the inventory now, and SD-T6 takes it: a key that needs those notes waits for them, as an open does.

## The review (2026-11-10)

- The design's pull request was reviewed, and its twelve findings fixed; where one needed a choice, the recommended
  one was taken, by the maintainer's instruction, and recorded as a note under the decision it changes or as a new
  one (SD-D13, SD-D14).
- The inventory had missed reads made as the screen is drawn — git's `HEAD` and the operation under way for the top
  bar and the git panel, every note for the Problems tab's count and the Info panel, the scratch's places — and made
  by the watcher for each entry it lists (the walk's filter, a link's verdict, where a note went), by the TUI's look
  (each open file's links, the config read again), by an open (its links), by git's keys, by link completion, by the
  explorer (nested vaults' names, what's left out) and, since `9912f519`, `asRead`. Each is in its task now; the
  upgrade check, which reads slipbox's data folder, stays as a known limit.
- The boundary check could not refuse every read in the inventory's files, as SD-D12 had it: some keep theirs until
  their task lands, some for good (SD-D7's guards, a save, SD-D9's `prepare`). It holds an allow list now, and says
  what it doesn't see; the held tests see the rest.
- A look's deadline had two values; it's set by what asked now. The tasks' `blocked_by` follow SD-D1. The pointer
  added to design/roots.md went: the workstream writes only in its own folder, and consolidation replaces that
  paragraph.

## The disk threads measured (2026-11-10)

SD-T2 measured the TUI's resident memory (#56) with no disk thread started, then one, then two, then both stopped:
slipbox on the demo vault in a 120×34 headless terminal, a preloaded script asking the threads 20 s after the start
(the second started while a slowed stat held the first). Each figure is the median of seven readings, each after a
full collection, taken once three in a row were within 0.3 MB; five runs, in MB:

| run | none | one | two | both stopped |
| --- | --- | --- | --- | --- |
| 1 | 244.0 | 244.6 | 245.4 | 238.1 |
| 2 | 240.1 | 239.2 | 240.4 | 229.4 |
| 3 | 209.2 | 209.4 | 210.2 | 202.6 |
| 4 | 204.0 | 203.8 | 204.6 | 197.5 |
| 5 | 218.3 | 218.6 | 219.6 | 208.1 |
| median | 218.3 | 218.6 | 219.6 | 208.1 |

- Within a run: none to one +0.2 MB, one to two +0.8, both stopped −7.6 (medians). The process's threads: 24 with
  none, 25 with one, 27 with two, 24 again once stopped.
- Starting a thread grows the process by about a megabyte, most likely because its heap reuses memory the main thread
  had freed and not yet given back; stopping both gives back 7 to 11.5 MB, their heaps and stacks with it. A thread
  let go of after a minute idle is stopped the same way.
