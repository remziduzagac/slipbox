---
status: done
assignee: ""
blocked_by: [SD-T1]
tracker: [gh:#46]
created: "2026-11-09"
---

# SD-T2: The listing threads become the disk threads

SD-D2, SD-D6. No caller changes but the listings': the requests the later tasks make.

## Description

- `ListThreads` (`src/core/workspace/walk/walk-thread.ts:193`) becomes `DiskThreads`, `listThreads()` the same pool
  (`diskThreads()`), still two, still a line, each slot's worker started on its first request.
- Its requests, served by `list-worker.ts` (and by `walk-jobs.ts`'s `answerWalk` for a test's worker serving both):
  `list` (as now), `stat` (a batch of paths: kind, mtime, ctime, size, or the error's code), `read` (a file's text
  decoded as `readText` decodes it, and its stamp; a FIFO or a device refused as `readRegular` refuses it), `access`
  (`folderUnreadable`'s words), `walk` (a vault's walk, as SD-T8 asks). Each with what the asking thread knows
  (`walkContext`).
- A `walk` takes a thread only while the other is left free; a second waits in the line behind the first.
- Deadlines (SD-D6, its note of 2026-11-10): each request carries the deadline of what asked it, not of its kind —
  whatever a look asks (a `stat` or a `list`) and a key's read a minute; the explorer's listings and a walk ten
  (`WALK_DEADLINES.whole`); each shortened to the third by `SLIPBOX_SLOW_DISK`.
- A look's batch (SD-D8, its note of 2026-11-10): one `stat` request holding every path the look stats and one `list`
  request for each folder it lists, asked together; the batch is answered once all have, or failed once one gives up.
  A `list` for the watcher carries the walk's filter and the links' rules (`walkContext`), and answers each entry's
  verdict with it (SD-T3).
- Measured: the TUI's resident memory with no disk thread started, one and two (`tmp`'s script, as T12's
  `stall.ts`), recorded in the log here and on #56.

## Acceptance criteria

- Each request answers what the same code answers on the screen's thread: a file, a folder, a path not there, one you
  may not read, a FIFO refused, CRLF, a BOM and invalid UTF-8 read as `readText` reads them.
- Held (`Hold`): a `stat` under `held` holds one thread, and a `stat` elsewhere asked meanwhile is answered by the
  other; a `walk` held, a `stat` asked meanwhile answered, a second `walk` waiting for the first.
- Past a shortened deadline: the request fails `deadline`, the thread is started afresh, the next request answered;
  a `list` a look asked gives up at the look's deadline, one the explorer asked at the explorer's.
- Stopped (quitting): a request asked or waiting is refused, no thread started again for it (as the listings').
- The explorer's listings' tests pass unchanged.
- `CHECKS_FOR` (`scripts/ci-scope.ts`) names the terminal checks this task's files reach; before its pull request
  merges, they run locally, listed for approval first, with its unit tests (SD-D14).

## Terminal check

None new: the explorer's slow-disk checks pass unchanged on the renamed pool.

## Decided (2026-11-09)

By the maintainer's instruction to take the recommended answer (SD-D12):

- No third thread: a walk holds one only while the other is free, and a third is a heap more (#56). What SD-T8
  measures is recorded here, not acted on without a decision.
- A disk thread with no request for a minute is let go of, and started again on the next (60–70 ms, under the
  150 ms before `listing…` shows); while a vault is watched the first is asked every two seconds, so only the second
  is let go of. A test: the second let go after the minute (its clock the test's), started again by the next request.

## Open

What the description left open, settled here for the maintainer to confirm; design.md's sections it delivers say
how.

- What the threads answer is `core/workspace/walk/disk-jobs.ts` (`answerDisk`): `list-worker.ts` serves it alone, so
  the disk threads load no index and no parser, and `walk-jobs.ts`'s `answerWalk` hands those requests to it, for a
  test's worker serving both. `DiskThreads` stays in `walk-thread.ts`, as design.md has it.
- Who asks is said with each request (`Asker`: `look`, `key`, `explorer`, `walk`), and sets its deadline
  (`DISK_DEADLINES`): a look's and a key's a minute, the explorer's and a walk's ten, each the stand-in's third part
  when it has one. `list` is the explorer's unless a look asks, so its callers (the explorer's listings, a list of
  paths) change only by the pool's name. A test's deadlines given to `setWalkWorker` are each asker's the whole
  walk's, as the stand-in's are.
- A path's own error is its answer, by its code; a request fails only when its thread does. `stat` follows links, or
  takes a link's own (`own`), for the ways the TUI's look and an open check for a link not followed (SD-T4, SD-T5).
  `read`'s stamp is the fstat of the file it opened (`readTextStamped`, `disk.readRegularStat`), not a second lookup:
  a save renamed over the note between the two would pair the old text with the new stamp, and `changedOnDisk` would
  then miss it (the review, 2026-11-10).
- `access` reads through the seam: `folderUnreadable` stats and checks access through `disk.stat` and a new
  `disk.access`, so the stand-in and a test's hold reach it on a disk thread; on the screen's thread it goes at once,
  as before, until SD-T7 asks it there. `fsutil.ts`'s `DISK_READERS` entry no longer names it.
- A walk that can't take a thread yet waits, and those asked after it go past it: a short read never waits behind a
  walk running, or one waiting less than a minute. The review (2026-11-10) found that steady requests could keep it
  waiting with no end, its deadline not yet started, and the recommended answer was taken, by the maintainer's
  standing instruction: a walk's deadline counts from when it was asked, so waiting past it fails it `deadline`; once
  it has waited a look's deadline (a minute), those asked after it no longer go past it, and it takes the next thread
  free while the other is busy. It doesn't while the other is walking: two walks would leave no thread for the rest,
  so those asked after it go past it until the first walk ends and its thread comes free.
- A look's batch (`look`): one of it that fails gives the batch up before its thread is free for the next, so what of
  it still waits for a thread is withdrawn, never sent; and what of it was sent is given up (the batch's signal, as
  the review asked), each thread started afresh as past a deadline and free at once. Its `list` carries what the
  explorer's does (`walk`, `hidden`); each entry's verdict with the walk's filter and the links' rules is SD-T3's, with
  the watcher's look.
- `walk` answers `walkVault`, `listDirectory` (Elsewhere) or `homeWalk` (what changed handed back unkept, as the walk's
  thread's `home`), with the index's stamp and then its text when it's named. Nothing asks it yet (SD-T8). A hold
  reaches a walk's listings and its `.gitignore`'s read, not its stats, and Elsewhere's `listDirectory` still lists
  with node:fs: SD-T8's, when it moves the build.
- Idle: a thread let go of after `IDLE_MS` with nothing asked, its timers given (`timers`), so the test's clock runs
  the minute. A request takes the first thread free, so while a vault is watched only the second is let go of.
- `CHECKS_FOR`: `walk-thread.ts` and `disk-jobs.ts` join the listings' entry, which adds `Elsewhere` and `marks` to
  what `walk-thread.ts` reached since T12, though the listing threads were in it. Each later task adds its features'
  checks as it moves its reads there; once every read goes through the disk threads, the two leave the entry and run
  every check, as the seam does.
- The tests that named `ListThreads` and `listThreads` (`walk-thread.test.ts`, `open-path.test.ts`) name the pool
  anew; their names and what they assert are unchanged.
- Measured (notes.md, 2026-11-10; on #56): the TUI on the demo vault, medians of five runs, 218.3 MB resident with no
  disk thread, 218.6 with one, 219.6 with two, 208.1 once both were stopped. The script was `tmp`'s, as T12's
  `stall.ts`, and not kept.

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("The disk threads", "Deadlines").
- Rests on: SD-D2, SD-D6, T12 (`ListThreads`, `list-worker.ts`, `worker-context.ts`, `WorkerRequests`); #56.
