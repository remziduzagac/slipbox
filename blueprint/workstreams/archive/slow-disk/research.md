# Research: slow disks, and the ways round them

What the design rests on that isn't slipbox's own code. Each point says where it's from: *read* (a source named),
*measured* (here, with how), *memory* (known, no source named; to be checked before a task relies on it), *ours* (a
judgement).

## What T12 measured

- On `dev` before T12, with home a FUSE passthrough whose `slow/` lists in 3 s and stats in 0.3 s each, one slice of
  the background index held the screen's thread 25,939 ms (*read*: blueprint/tasks/archive/walk-off-the-main-thread.md,
  2026-10-23).
- After it, the longest slice 19 ms on that mount; home's walk crossing to the walk's thread and back cost a 50 ms gap
  at 10,000 notes, brought to 6 ms (*read*: the same, 2026-10-24).
- A light listing worker answers its first request 60–70 ms after it's started, against 250–500 ms for the walk's
  worker, which loads the index and the parser (*read*: the same).
- The walk's thread adds 16 to 52 MB of resident memory, by the size of what it walks; the listing threads weren't
  measured on their own (*read*: the same). SD-T2 measures them.
- The same day, a review of the cause found more on the screen's thread than the walk: the watcher's look (a stat per
  watched folder every 2 s, per note every 30 s, its listings again), the explorer's facts of each row,
  `keepToWhatsThere` (*read*: the same). What T12 left of that is #46.

## What a slow disk does

- A network share whose server is gone, mounted to wait (NFS's `hard`, the default), holds a read until the server
  answers, however long; the thread that asked can't be interrupted meanwhile (*memory*).
- A drive asleep answers its first read after it spins up, a few seconds (*memory*).
- A folder a sync client keeps in the cloud (iCloud Drive, OneDrive, Dropbox's online-only files) answers a stat at
  once and holds a read while it downloads the file (*memory*). So a stat's answer says nothing of how long the read
  after it takes: SD-D6 gives a read its own deadline.
- FUSE mounts can be made to answer slowly on purpose, which T12 did on Linux to measure (*read*: the same task).
  macOS has no FUSE of its own; macFUSE is a separate install (*memory*). So the live tries are on Linux, the stand-in
  alone on macOS (README.md § Test strategy).

## The ways round it

- **A worker thread** (Bun's `Worker`): what T12 chose. A request past its deadline is given up on and the worker
  started afresh (`WorkerRequests`, *read*: `src/core/foundation/workers/`). A worker stuck in a read the kernel won't
  interrupt isn't freed by that; its thread stays until the read returns (*memory*), so a disk that never answers
  costs a thread each time it's given up on. SD-D6's deadlines are long (a minute) for that reason (*ours*).
- **`fs.promises`**: the followed-link probe uses it, racing a 3 s timer (*read*:
  `src/core/workspace/vaults/symlinks.ts`, `readTarget`, `PROBE_MS`). The calls run on a pool of threads shared by
  every asynchronous file call the process makes; how big Bun's pool is, and whether a stuck call holds its thread for
  good, isn't documented (*memory*). A few stuck calls could hold every later one behind them, the watcher's and a
  note's open alike, with nothing to give up on but the promise (*ours*). Not chosen as the pool (SD-D2); the probe
  stays as it is.
- **A child process**: killable even when stuck, but a process per disk read costs more than a thread at start and in
  memory, and its answers cross by a pipe (*ours*). Not considered further.
- **`statSync` with a timeout**: there isn't one; a synchronous call can't be given up on from its own thread
  (*memory*).
