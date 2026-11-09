---
status: todo
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
- Deadlines (SD-D6): `stat`, `read` and `access` a minute; `list` and `walk` ten (`WALK_DEADLINES.whole`); each
  shortened to the third by `SLIPBOX_SLOW_DISK`.
- Measured: the TUI's resident memory with no disk thread started, one and two (`tmp`'s script, as T12's
  `stall.ts`), recorded in the log here and on #56.

## Acceptance criteria

- Each request answers what the same code answers on the screen's thread: a file, a folder, a path not there, one you
  may not read, a FIFO refused, CRLF, a BOM and invalid UTF-8 read as `readText` reads them.
- Held (`Hold`): a `stat` under `held` holds one thread, and a `stat` elsewhere asked meanwhile is answered by the
  other; a `walk` held, a `stat` asked meanwhile answered, a second `walk` waiting for the first.
- Past a shortened deadline: the request fails `deadline`, the thread is started afresh, the next request answered.
- Stopped (quitting): a request asked or waiting is refused, no thread started again for it (as the listings').
- The explorer's listings' tests pass unchanged.

## Terminal check

None new: the explorer's slow-disk checks pass unchanged on the renamed pool.

## Open

- Whether a third thread is worth it while a walk holds one (measured after SD-T8).
- Whether an idle disk thread is let go of after a while (#56's "released when unused"): the watcher's look asks every
  two seconds, so it's idle only while no vault is watched.

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("The disk threads", "Deadlines").
- Rests on: SD-D2, SD-D6, T12 (`ListThreads`, `list-worker.ts`, `worker-context.ts`, `WorkerRequests`); #56.
