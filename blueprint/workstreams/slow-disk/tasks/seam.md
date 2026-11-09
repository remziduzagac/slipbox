---
status: todo
assignee: ""
blocked_by: []
tracker: [gh:#46]
created: "2026-11-09"
---

# SD-T1: Every read the workstream moves through one seam

SD-D10. No behaviour changes: what the tests and the terminal checks can hold grows.

## Description

- `src/core/workspace/walk/io/folders.ts`'s folder reader (`folderReader`, `readFolder`, `setFolderReader`) grows into
  `src/core/foundation/platform/disk.ts`: a folder's listing, a path's `stat` and `lstat`, a file's bytes
  (`readRegular`'s open without blocking, `fstat`, read). `readFolder` and `slowDisk` stay where they're imported
  from, re-exported.
- The reads README.md § The inventory lists call it instead of `node:fs` directly: `watch.ts` and `watch/*.ts`,
  `buffer.ts`'s `load` and `changedOnDisk` (through `fsutil.ts`'s `readText` and `stamp`), `explorer-disk.ts`,
  `marks.ts`, `navigation.ts`, `vault-feed.ts`'s and `git.ts`'s `HEAD` reads, `settings.ts`'s stamps,
  `graph-refresh.ts`'s activity stat.
- `SLIPBOX_SLOW_DISK` slows a stat or a read of a path with the named folder on its way, as it slows that folder's
  listing now. `Hold` (`tests/fixtures/walk/slow.ts`) holds them the same, on every thread that takes the hold: the
  screen's, the walk's thread's and the listing threads' test workers (`slow-worker.ts`).

## Acceptance criteria

- A unit test: a stat and a read of a file under `held`, on a thread of the test's and here, wait until the hold is
  let go, and answer what `statSync` and `readText` answer; under any other folder, at once.
- A check, as `check:boundary` is one, that the files the inventory names read the disk only through the seam
  (**Open**: worth its upkeep, or the reviews enough).
- Every existing test and terminal check passes unchanged; `bun run check` passes.

## Terminal check

None new: `slow-disk.ts`'s ten checks pass unchanged with the stand-in slowing stats and reads too.

## Open

- One delay for every kind of read, or a listing's and a stat's apart: a walk stats each file, so a check whose vault
  is under the slow folder takes their sum to start.
- Whether the CLI's reads through the seam cost anything measurable (`bun scripts/bench.ts`).

## References

- Delivers: design.md § MODIFIED design/testing.md § The terminal tests; § MODIFIED design/how-it-works.md § Module
  map (the seam's row).
- Rests on: SD-D10, D262, T12 (`tests/fixtures/walk/`), #75.
