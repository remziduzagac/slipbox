---
status: done
assignee: claude-9
blocked_by: []
tracker: [gh:#9]
created: "2026-10-23"
---

# T12: A slow disk never freezes the screen while a vault or home is walked

The TUI's walks, and the explorer's listings, read the disk on the main thread: a folder that answers slowly holds up
the keys and the screen for as long as it takes. They move off it.

## Description

Home's walk runs in slices while nobody is working (`SlicedWalk.step`, asked by `AutoIndex` from `tui/watch.ts`), but a
slice can't be cut short inside one folder's read, so one folder that answers slowly (a network share, a sleeping USB
disk, a folder of many thousands of files) freezes the screen for the whole read. The background index walks each
vault it finds in one go (`AutoIndex.open` → `Graph.build` → `walkVault`), and the explorer lists folders outside the
vault's own tree with `readdirSync` as it builds its rows (`Explorer.outsideRows`). Mount points of other disks under
home are skipped already (VV-D2, `ANOTHER_DISK`); a slow disk that is home's own filesystem, or a slow folder in it,
still blocks.

## Acceptance criteria

- A walk the TUI makes while it's running reads the disk off the main thread: keys and redraws go on while a slow
  folder is read. A test with a read held up on purpose fails without the fix.
- A result made obsolete while it was read (the folder collapsed or changed, the vault left, the walk's settings
  changed) is dropped, never applied.
- What a walk includes is unchanged: its order, the skip list, the busy folders, links and their answers, the caps
  (existing tests pass unchanged).
- Before and after: the main thread's longest stall during home's walk of a wide folder and of a delayed one, and the
  memory held, recorded here.
- design/roots.md says where the walks run, and drops the "Not done" line this delivers; CHANGELOG says it.

## Out of scope

- The CLI's walks: a command has no screen to freeze, and waits for its answer either way.
- A link's target resolved and statted by the walk (design/roots.md § Links followed only when you say so, "Not done"),
  except as far as the walk moving off the main thread takes it with it.

## References

- Delivers: design/roots.md § Home ("Not done": every walk of home runs on the main thread); design/roots.md § The
  index; design/tui.md § Side panes (the explorer's listing).
- Rests on: (D40), (VV-D2), (VV-D6), (D232); #9.

## Log

- 2026-10-23: Read the walk's paths in the TUI. On the main thread today: home's idle slices (`SlicedWalk.step` in
  `AutoIndex.stepHome`, 15 ms every 250 ms while nobody works; `listDir` reads a whole folder with `readdirSync`, a
  `statSync` per note, the busy-name and marker checks, `symlinkVerdict`'s `realpathSync`/`statSync`); the background
  index's vaults, each walked whole in one slice (`AutoIndex.open` → `Graph.build` → `walkVault`); home's walk kept,
  brought up to now at every build of home's graph (`keptWalk`: a `statSync` per folder and per note kept, a
  `SlicedWalk` run to its end for the folders changed); every rebuild of a vault's graph (`walkVault`: a rescan, a
  reload, a vault switched to, a setting changed); the explorer's rows outside the vault's own tree (`outsideRows`:
  `readdirSync`, then a `statSync` per link, `isVaultRoot` per folder). The start's walk (`openGraph` in
  `tui/run.ts`'s `prepare`) runs before the screen is up.
- 2026-10-23: What a worker would need from the main thread: the probe's answers (`answered` reads a module-level map
  only the main thread fills), the root markers (`setRootMarkers`), and the same state and config folders (the
  worker's environment); `links.json` is read again by its mtime, so a worker reads the answers the TUI wrote.
- 2026-10-23: Reproduced on `dev`'s code with a delayed filesystem: a FUSE passthrough mounted as home itself, whose
  listing of `slow/` takes 3 s and each stat under it 0.3 s, and `AutoIndex` stepped as the TUI steps it (`step(15)`
  every 250 ms): one slice held the main thread 25,939 ms, a 5 ms timer saw the same lag. A local folder of 20,000
  notes: the longest slice 75–90 ms. Valid.
- 2026-10-23: Codex, challenging the cause: right, and more on the main thread than the walk — the watcher's polling
  (a stat per watched folder every 2 s, per note every 30 s; its relistings), the folders asked for by name walked
  whole, `startWalk`'s own reads, `reachable`, the explorer's per-row metadata (`leftOut`, `linkOf`, `rootName`,
  `keepToWhatsThere`), `AutoIndex.seekIn`. On the plan: step the walk on the thread a slice at a time (so it rests
  while you work, as now), the thread writes nothing an obsolete answer would leave behind, no fallback to the main
  thread, a deadline that recovers from a request that never ends, a separate worker or bounded async reads for the
  explorer.
- 2026-10-23: Asked the maintainer: the walks and the explorer's listings in this task; the watcher's polling, the
  vault open's rebuilds (reindex, rescan, a vault switched to, settings, renaming), a note's text read to parse or
  open it, and the walk at start (before the screen) to a follow-up issue. A folder being listed shows a dim
  `listing…` row under it, only after about 150 ms.
- 2026-10-23: The walk thread: `core/walk-worker.ts` (a build entry point, D232) serving `core/walk-jobs.ts`, asked by
  `core/walk-thread.ts` through one `WorkerRequests`. Home's walk is a `SlicedWalk` kept on the thread and stepped
  there by each `step(15)` (a request per slice, so it rests while you work); a vault's walk, home's walk kept
  brought up to now (`homeWalk` with `keep` false: what changed comes back `unkept`, kept by the main thread once it
  takes the answer) and a folder past the cap (`vaultsPastCap`, from `AutoIndex.seekIn`) are a request each. Each
  request carries what the thread can't see: the environment naming slipbox's folders (Bun 1.4.2 gives a worker the
  environment the process started with — checked), the root markers, the probe's answers (`probeAnswers`,
  `takeProbeAnswers`). Deadlines: a slice or a seek 60 s, a whole walk 10 minutes; past one the thread is started
  afresh, the walk given up on and said (`home's walk gave up: a folder didn't answer in time; …`), never walked on
  the main thread instead. `AutoIndex` takes a walker (`core/walkers.ts`: `HERE`, the CLI's, by default); the TUI's
  idle jobs take the thread's. `Graph.build` takes a vault's walk given. Home's graph built again after its walk
  (`Watch.homeIndexed`) asks the thread, and drops the answer when the graph was built since (`Graph.builds`), the
  folders asked for changed, or the vault open did.
- 2026-10-23: Tests (`tests/walk-thread.test.ts`), with a worker whose listing of a `slow` folder takes 400 ms
  (`tests/fixtures/walk/`) and the main thread's walk held up the same (`setFolderReader`): home's walk stepped by the
  TUI's job never holds a slice over 100 ms, and a key pressed meanwhile is handled and drawn at once; the background
  index's vault with a slow folder the same; home's refresh dropped after a reindex and after going into another
  vault; a stuck folder given up on at the deadline and said; and the thread's walk equal to the walk here for every
  case (the skip list, busy folders, a nested vault, a marker of the config's own, links followed — the probe's
  answer carried — and not, a note too large, caps of notes and folders, a vault's `.gitignore`, the walk kept
  brought up to now, a folder past the cap). Mutation-checked: with the TUI's jobs walking here again, the first two
  fail (a 406 ms slice). The three TUI tests that stepped the idle job in a loop now await its answers (`stepToEnd`,
  `Watch.homeRefreshed`).
- 2026-10-23: After, measured the same way with fresh caches (`tmp`'s `stall.ts`): the slow mount's longest slice
  19 ms (was 25,939), the 20,000-note folder's 35 ms (was 90): what's left is the main thread building home's graph
  from 10,000 notes, CPU and no disk. Memory: RSS grows 16 MB more on the slow mount (the thread's own heap), 45 MB
  against 39 on the wide folder; the main heap the same within a few MB.
- 2026-10-23: The explorer's listings: a folder listed a level at a time (`outsideRows`) is built from its listing
  (`core/listing.ts`: its entries with what its rows and their marks read of each — a folder or a file, a link's target
  and key, a vault's name and branch, one you may not read, a busy folder), read on two listing threads of their own
  (`ListThreads`, the walk worker's `list`) and kept by `Listings` (`tui/listings.ts`): at most 256 folders, read again
  in the background once a second old as the tree is built again, an answer drawn only when it changed, dropped for
  a folder let go of or read under settings changed since. A link's state is read here from the answers kept
  (`linkStateAt`, by the key the listing read), so a link followed shows at once. `listing…` after 150 ms;
  `can't read: …` when a listing fails or doesn't answer in a minute; neither opened nor marked. The marks of a listed
  row come from its listing (`Marks.listedFacts`). A test's App lists at once on the main thread
  (`AppOptions.listOffThread`, set by `tui/run.ts`), so the 91 explorer tests and the 20 marks tests run as they were,
  and pass. `folderUnreadable` moved to `core/fsutil.ts` for the listing to use.
- 2026-10-23: Tests: a folder beside the vault listed slowly — a tree built in under 100 ms, `listing…` after 150 ms, a
  key handled and drawn at once, then its rows, the `listing…` row never opened; an answer for a folder folded again
  kept, one for a folder let go of dropped, one under changed settings read again; a listing that doesn't answer in
  time says so; and the rows and their marks off the thread equal to those listed here, and the marks from a listing
  equal to those the marks read from the disk themselves (vaults with a name, a repository's branch, links followed,
  within, broken, a busy folder and one with a note, hidden names shown and not, data and binary files, a folder you
  may not read). Mutation-checked: with the listing read here again, the first fails (a 402 ms tree build).
- 2026-10-23: Live, on the reference set (`build-home.ts`), with home a FUSE mount whose `hobbies/` lists in 1 s, each
  stat under it 0.1 s, the background index on (`idle_seconds = 1`), halden open, a key's answer timed by herdsman
  (`ctrl+p` until the switcher shows): the release (0.4.1-preview) 484, 284, 35, 191, 27,566, 81, 84, 110 ms; this
  branch with the walks on the thread 31, 30, 339, 3,814, 38, 134, 31, 33 ms. What was left was the background index
  indexing the vaults it found on the main thread (measured: opening one up to 4.1 s — its config, git — and a slice
  of parsing up to 7.1 s): asked, the maintainer took it into this task.
- 2026-10-23: The background index's indexing on the walk's thread: `IndexJob` (`core/index-job.ts`) opens a vault
  found (`isVaultRoot`, `rootAt`, its config), walks and builds it, then parses its notes a slice at a time — home's
  own from its walk the same — kept on the thread between slices (`index` op), written to its cache there.
  `AutoIndex` steps it through the walker (`SteppedIndex`; `HERE` for the CLI); the machine's lists stay the main
  thread's, recorded from what the thread read (`Opened`: key, worktree, identity, real path; `recordRoot`'s `key`,
  `recordFolder`'s `known`). A vault is counted found once opened, as before; one that isn't a vault any more is let
  go of. Home's index given up on is said as its walk is (`home's index gave up: …; it's made again at the next pass`).
  The walk worker's `vault` op went: the index walks the vault itself.
- 2026-10-23: Live again, the same way: 37, 32, 42, 30, 30, 37, 33, 36 ms while home was walked and indexed, then 20
  more while the vaults were (two found, one indexed meanwhile): 28–138 ms. The explorer, a FUSE folder listing in
  1 s mounted beside a vault, unfolded from the view a folder up: the release's first key 2,150 ms, this branch's
  34–152 ms, `listing…` on the screen 450 ms after unfolding it, then its rows.
- 2026-10-23: Codex's review of the diff, each finding checked against the code and fixed, each fix with a test that
  fails without it (mutation-checked, `tmp`'s runner): (1) main-thread reads left on these paths — `homeAt` (a
  `realpathSync` of home) at every slice of `stepHome`, a listed vault row's `vaultKey` in its marks, and
  `recordFolder`'s scan of every known copy when a vault found was recorded: home's location made once
  (`AutoIndex.home`), the listing carries the vault's key, and the vault is recorded as found by `IndexJob` on the
  thread that opened it, as `AutoIndex.open` did before and a CLI command does beside the TUI (`recordRoot` and
  `recordFolder` back as they were); (2) home's refresh could put a walk read before a watcher batch over it — it
  checked `builds`, which a batch doesn't move: the TUI counts the batches it applies, and a refresh that saw one
  come is asked again, three times at most; (3) `Listings.forget` had no caller: a folder moved forgets its
  listings and reads its old and new folders again (`followMove`), a file operation reads the vault's listed folders
  again (`afterFileOp`, `Listings.stale`, which drops a read under way); (4) past 256 folders the cap could let go of
  one the tree shows and read it again in a loop: the folders the tree last asked for are never let go of
  (`newTree`); (5) rows coming above the selection moved it onto another row: kept by its path; (6) hidden names
  were read (stat, markers, busy check) before the explorer filtered them, so a hidden link that hangs could hold up
  its folder's listing: `listFolder` filters first (`listsName`, moved to `core/listing.ts`; `files.hidden` in the
  request and the listing's settings).
- 2026-10-23: The maintainer's review loop (`/code-review` and Codex, independently, until a round finds nothing real)
  runs on the draft pull request once its CI is green; this round's `/code-review` waits for it.
- 2026-10-23: The terminal checks again, under a load of 30 on 10 cores: 23 of 24, the worktree's view check failing
  — its explorer on `~/work` empty after going into the worktree. Read against the code, a real gap whatever the
  load: a folder's first listing answered after the settings it was read under changed (the worktree's own config)
  was dropped, and nothing asked for it again until the tree was built again for another reason. Fixed: such an
  answer is read again at once under the settings now; test `a folder's first listing answered under settings since
  changed …`. And a second, from the deadline test: a folder listed before, read again and its thread giving no
  answer (a fresh worker slow to start), had its good listing replaced by `can't read: no answer in time`: now it
  stays as it was listed, and only a first listing says it couldn't be read. The deadline test starts both listing
  threads first, so a thread's start under load isn't taken for a folder that doesn't answer, and the 300-folder
  test asks that none was let go of rather than that none is being read again (they're over a second old by then
  under this load).
- 2026-10-23: Rerun with the load under 10 (the main session's instruction: `nice -n 10`, one test command at a
  time): the 15 walk-thread tests pass; mutation-checked, the two fixes above fail their tests when undone. The
  worktree check still failed, its screen showing `listing…` for `~/work`: a fresh TUI's first listing waited for a
  listing thread to start, and that thread was the whole walk worker (the index and the parser loaded with it): 250–500
  ms to its first answer under load, against 9–54 once running. The listings have a light worker of their own now
  (`core/list-worker.ts`, a build entry point; the context in `core/worker-context.ts`): 60–70 ms to the first answer,
  under the 150 ms before `listing…` shows. And the check waits for `~/work`'s rows, listed off the main thread now,
  rather than asserting them as the breadcrumb changes. The touched features' terminal checks: 24 of 24, at a load of
  20.
- 2026-10-23: Done, every acceptance criterion checked above; the draft pull request into `dev` carries it, the
  maintainer's merge its acceptance. A follow-up issue holds what this leaves on the main thread.
