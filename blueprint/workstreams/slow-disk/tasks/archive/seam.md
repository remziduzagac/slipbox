---
status: done
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
- `SLIPBOX_SLOW_DISK=<name>:<ms>[:<deadline>[:<stat ms>]]`: its listing delay as now; a fourth part slows each stat
  and read of a path with the named folder on its way, none when it's left out. `Hold`
  (`tests/fixtures/walk/slow.ts`) holds a listing, a stat or a read alike, on every thread that takes the hold: the
  screen's, the walk's thread's and the listing threads' test workers (`slow-worker.ts`).

## Acceptance criteria

- A unit test: a stat and a read of a file under `held`, on a thread of the test's and here, wait until the hold is
  let go, and answer what `statSync` and `readText` answer; under any other folder, at once.
- `check:boundary` holds a list of the inventory's files still allowed to import `node:fs`'s reads (a stat, a
  listing, a file's text, an existence or access check), each with why: the task that moves it (`graph-resolve.ts`,
  `graph-lookup.ts`, `links.ts`, `refresh.ts`, `home/cache.ts`, `images.ts`, `opening.ts`, `vaults.ts` among them),
  or the decision that keeps it (SD-D7's guards before a write in `mutations/files.ts` and
  `mutations/rename/rename-apply.ts`, a save in `saving.ts`; SD-D9's `prepare` in `run.ts`). It fails on a file of the
  inventory that imports a read and isn't listed, and on one listed that no longer does; each later task removes its
  files' entries. Its tests: a read imported in a file not listed fails it, and so does an entry left for a file that
  reads nothing.
- What the check doesn't see, said beside it: a read through a helper (`fsutil.ts`'s `readText`, `stamp`,
  `readJson`), or a call to the seam made synchronously on the screen's thread. The held-folder tests find those: a
  read left on the screen's thread holds their key past the hold's deadline (`gaveUp`).
- `bun scripts/bench.ts` before and after, within its noise: the CLI calls the seam's functions directly.
- A `CHECKS_FOR` entry for `src/core/foundation/platform/disk.ts`, naming the slow-disk checks.
- Every existing test and terminal check passes unchanged; `bun run check` passes.
- `CHECKS_FOR` (`scripts/ci-scope.ts`) names the terminal checks this task's files reach; before its pull request
  merges, they run locally, listed for approval first, with its unit tests (SD-D14).

## Terminal check

None new: `slow-disk.ts`'s ten checks pass unchanged, their stand-in given no fourth part.

## Decided (2026-11-09)

By the maintainer's instruction to take the recommended answer (SD-D12):

- A check for the seam: `check:boundary`, as above. Amended from the review (2026-11-10, SD-D12's note): an allow
  list that shrinks, seeing direct imports only; the held tests see the rest.
- The stand-in's delays apart: a stat's and a read's a fourth part, so T12's checks run unchanged and a walk doesn't
  take a listing's delay per file.
- The CLI's cost: measured with `bench.ts`, as above.

## Open

What the description left open, settled here for the maintainer to confirm; design.md's sections it delivers say
how.

- The seam holds more than the description names: whether anything is at a path (`exists`, `existsSync`'s answer), a
  path's real path (`realpath`) and a file's whole bytes (`readFile`, as git's `HEAD` is read), each waiting as a stat
  does, since the check counts an existence check and a real path as reads. `readRegular` lives there, `fsutil.ts`
  re-exporting it; `readText` and `stamp` read through it.
- A file the description names went to the seam whole: `vault-feed.ts`'s note stats and git's lock and rebase folders
  beside `HEAD`; `git.ts`'s checkout reads beside `HEAD`'s; `graph-refresh.ts`'s two checks of a file reached beside
  the activity file's stat. The TUI's `watch.ts` (§ 2 and § 4: `asRead`'s `existsSync`) stays listed, for SD-T6.
- The check's list is every source file README.md § The inventory names, and `watch/*.ts`: `SEAM_READERS`, those that
  read through the seam alone (moved here, or importing no read of their own), and `DISK_READERS`, the rest, each with
  why. It holds in a tree with the seam: the boundary tests' small trees, which write some of the same files for the
  other rules, aren't held to it; in one with the seam, a file of the list that isn't there fails it too.
- A stat or a read is slowed, and held, when a folder of the name is anywhere on the path's way, the path itself
  included; a listing as before, by the folder's own name. A test's wait for a stat or a read (`setReadWait`) is apart
  from its folder reader (`setFolderReader`): a test's App on the main thread takes it only when the test asks, so the
  existing tests run as they did; `slow-worker.ts` takes both.

## References

- Delivers: design.md § MODIFIED design/testing.md § The terminal tests; § MODIFIED design/how-it-works.md § Module
  map (the seam's row).
- Rests on: SD-D10, D262, T12 (`tests/fixtures/walk/`), #75.
