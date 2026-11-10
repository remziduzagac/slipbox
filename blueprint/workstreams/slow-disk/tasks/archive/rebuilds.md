---
status: done
assignee: ""
blocked_by: [SD-T3, SD-T4, SD-T5]
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
- A rename's and a folder operation's build (`renaming.ts:206`, `:220`; `mutations/files.ts:102`, `:148`;
  `mutations/rename/rename-apply.ts:319`, `:421`), SD-D11: read on a disk thread too, the keys after it waiting their
  turn as after an open, `reading the vault…` in the status line, `esc` not giving it up; the write stays on the
  screen's thread.
- The index crosses as its text, parsed here as it is now (`readJson`, `refresh.ts:186`).
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
- Held: a rename with a folder of the vault under `held` — the rename written at once, `reading the vault…`, a frame
  drawn and `j` waiting; let go, `j` acts on the graph the rename made, the link to the renamed note followed.
- Past a shortened deadline: `reading the vault gave up: …`, the graph as it was.
- Mutation: the walk made here again, the first test fails (checked once).
- `CHECKS_FOR` (`scripts/ci-scope.ts`) names the terminal checks this task's files reach; before its pull request
  merges, they run locally, listed for approval first, with its unit tests (SD-D14).

## Terminal check

`slow disk: the vault open reindexed on a slow disk — its links and backlinks stay while it's read, every key
answered; a note added meanwhile there once read`.

## Decided (2026-11-09)

By the maintainer's instruction to take the recommended answer (SD-D11, SD-D12):

- A rename's and a folder operation's build: on a disk thread, the keys after it waiting (SD-D11). The next key must
  see the graph the write made; the build kept on the screen's thread would leave every rename on a slow disk a
  freeze, and one in the background would let the next key act on paths that are gone.
- The index across threads: as its text. The screen's thread parses it today after reading it; as text it does the
  same minus the read, where a structured copy would add the copy on top of a parse on the thread. The gap at 10,000
  notes is recorded here.

## Measured (2026-11-10)

A vault of 10,000 notes in 100 folders, its index 10 MiB, on a local disk (Linux): the screen's thread's longest gap
taken with a 1 ms timer, five or six runs each.

- Built here whole, as before: 54–62 ms.
- The walk and the index's text crossing from a disk thread: 3–6 ms; the graph then built here from them: 25–29 ms,
  of which the index's text parsed is 18–19 ms.
- The index alone crossing as its text: 3–4 ms, then parsed here (18–19 ms); parsed on the thread and sent whole
  instead: 13–18 ms as it crosses. The text is kept (SD-D12): about the same in all, and the parse stays where it was.

## Open

What the description left open, settled here for the maintainer to confirm; design.md's section it delivers says how.

- `Builds` (`src/tui/app/runtime/builds.ts`, `app.watch.builds`) asks the builds. A build a TUI graph asks of itself
  without a walk given (`build(useCache, "lazy")`) goes to it through `Graph.rebuilder`, set for the vault open's
  graph (`Builds.adopt`, from `followGraph` and a vault gone into). That covers the watcher's rescan (`applyToGraph`),
  the folders of home asked for (`askFolders`: a vault gone into, a branch's tabs) and core's file operations'
  builds (`mutations/files.ts`, `rename-apply.ts`), core none the wiser. A build that parses every note (`"all"`, the
  CLI's `openGraph`) is never sent there, and the CLI has no `rebuilder`.
- The walk is asked as `DiskThreads.walk`, not as a background request. SD-D2 already leaves the other thread free
  while a walk holds one; in the background line it would hold the watcher's looks, asked behind it, past their
  minute.
- A key's build's walk takes a disk thread at once (`WalkAsk.key`: urgent from the start), not waiting for both to be
  free: the thread SD-D2 keeps free is for the keys, and every key is waiting on this walk. Found rebasing onto SD-T9:
  going into a vault whose state folder is on a slow disk, the session read held one thread, the vault's first walk
  waited behind it, and the keys with it, though its notes were on a local disk. Two walks still never hold both.
- A key's build: every build asked inside `Builds.forKey` is a key's, whether through the rebuilder or asked
  outright. That covers a rename's `apply`, a folder restored from the trash and one pasted (`files.ts`), and the
  vault's own config renamed (a graph made anew). The keys after it wait (`reads.hold`); `reading the vault…` takes
  the watcher's place in the status line, or stands alone when no note is open. It can't be stopped from the
  background tasks either.
- A graph never built (`builds === 0`: a vault gone into, until its first answer) has every build asked of it a
  key's, whatever asks it: a note named, the tabs brought back, or neither. Before, only its default note held the
  keys, so with a note named or the tabs brought back a rename planned from the empty graph and rewrote none of the
  links to what it moved. Every key waits, not only those that need the graph: which keys read it is no smaller a
  list than all of them. `esc` gives up a key's read, as before, but not the build, so the keys after it still wait;
  `q` and `ctrl+c` wait too, up to the walk's deadline on a disk that doesn't answer.
- A build not a key's can be stopped from the background tasks (`space b`): the graph stays as it was. A graph
  never built can't have its build stopped, as it's a key's: it would stay empty, nothing reading it again. Chosen
  over stopping it and asking again a minute later, which would leave the keys acting on an empty vault for that
  minute.
- A setting of the walk changed, and the vault's own config renamed, make a graph anew (`fresh`), the old one kept
  until it's built. A fresh ask takes the place of the one out, carrying what that one was asked; any other ask
  meanwhile waits for it and is asked once more, all of them as one build.
- Given up on: `reading the vault gave up: <why>; it's read again in a minute`, and asked again a minute later
  (`BUILD_AGAIN_MS`) while the vault and its graph are the same: everything it was asked, what only waited for it
  (`after`: the graph's errors, the offer to relink what moved, home's walk asked again, the default note) too, as one
  build — joining the one out then, if there is one. No longer a key's, but for a graph never built. For a graph never
  built, what's asked to follow it in that minute joins them (`Builds.later`): run at once, it would find none of the
  vault's notes. Found under load: a vault gone into whose session read answered, or was given up, after its first
  walk was, opened no note, then or once it was read.
- An answer is taken while the vault open and its graph are the ones it was asked under (`current`). When something
  else built that graph meanwhile (`Graph.builds` moved: home's refresh from the background index's walk), it's read
  once more, with what it was asked, then taken whatever was built meanwhile (`readAgain`): SD-D5's ask again,
  bounded, so a busy home never keeps a key's build, and the keys, waiting. A graph made anew is never read again for
  it: the graph built meanwhile is the one it replaces. `takeAgain` is shared with home's refresh (`homeBuilt`): what
  changed meanwhile is applied again over the new build, a file reached (20.8) reached again. Chosen over taking the
  first answer at once, which could drop folders home's refresh had just walked.
- An answer that can't be taken — `keepHomeWalk`, the build, `takeAgain` or what follows a build throwing — is said,
  `reading the vault failed: <error>; :reindex tries again`, every ask settled and the keys let go; it isn't asked again
  by itself, as the same answer would fail the same way. What follows an ask (`andThen`) that throws is said as a
  key's error is, the rest followed all the same. A rejection past both is caught (`broke`), said the same way.
- A graph made anew answering asks of the graph as it was (a reindex, a rescan, the folders asked for, merged into
  it) follows a build's own follow-up too (`Watch.rebuilt`: the watcher synced, search started again), after its
  asker's (`followGraph`).
- A vault gone into: its new graph is empty until built. Its default note, the graph's errors, the offer to relink
  what moved, and home's walk asked again wait for the build (`Builds.after`); the keys wait with them (above), so
  `reading the vault…` is in the status line, with a note open or none.
- The moves: the thread that walks reads, with the index, the text of each new note whose size is a vanished
  indexed note's, and sends its hash (`movedHashes`, sent only when there are some). `detectMoves` takes them and
  reads nothing here; a note not hashed there isn't a move.
- Home's refresh after its walk asks the walk's thread for its index with the walk (`homeWalk`'s `index`), so
  `homeBuilt` reads neither (README § 3's last line).
- `refresh.ts` and `home/cache.ts` stat through the seam and leave `DISK_READERS` for `SEAM_READERS`, with
  `builds.ts`.
- A test's App builds here, at once, unless it sets `watch.builds.offThread`; the TUI's follows
  `explorer.listings.offThread`.
- Left on the screen's thread, for later tasks or consolidation to place:
  - git's renames at a build (`catchUpWithGit`) and the branch it reads (`branchNow`);
  - a file reached's stat (`reachable`);
  - whether each path changed meanwhile is there (`takeAgain`'s `exists`, a stat each);
  - `vaults.ts`'s checks that a tab's file, or one a switch opens or offers a peek at, is there;
  - the CLI's builds, and another vault's graph (a peek's, the reach's), as design.md's "What stays on the screen's
    thread" says;
  - the index written at the end of the background parse (SD-D7).
- Found by the held tests, not in the inventory: the search index catching up (`IndexJob.step`,
  `src/core/workspace/search/indexing/files.ts:95`) reads each new or changed note's text here in 12 ms slices after
  a build, and a change the graph hears of is indexed here at once (`src/tui/workspace/search/search.ts:66`). The
  tests wait for it before they hold (`whenIndexed`). No task names it yet.
- The terminal check runs with `SLIPBOX_SLOW_DISK=slowdisk:5000` and the watcher off, so the note added meanwhile
  comes with the reindex's walk alone. The start's build lists the folder on the screen's thread too: that waits for
  SD-T10.

## References

- Delivers: design.md § ADDED design/tui.md § A slow disk ("The vault built again").
- Rests on: SD-D3, SD-D5, SD-D6, SD-D7; D40; VV-D2; T12 (`homeBuilt`, `Graph.builds`).
