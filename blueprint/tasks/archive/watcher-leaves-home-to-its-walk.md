---
status: done
assignee: claude-16
blocked_by: []
tracker: [gh:#16]
created: "2026-10-23"
---

# T19: Before home's first walk, the watcher takes in no folder whole

Until home's first walk is made, a folder the watcher finds and isn't watching is left to that walk, never read whole
on the spot.

## Description

Before home's walk is kept, its graph is its top alone (`walkTop`): `~`'s notes, its folders listed but not looked into,
and the folders asked for by name walked whole (D248). The watcher watches those folders. When one of them is listed
again (its time moved, or it changed in the two seconds before slipbox started, `SETTLE_MS`), every folder in it that
isn't watched yet is taken in with all it holds (`adoptTree`), and so is a folder that comes into home's top: home's
walk, meant to be made a slice at a time while nobody is working (VV-D2), is made at once, in pieces, by the watcher.

Before home's first walk, such a folder is home's walk's to read, and the watcher doesn't look into it: one in a
folder the graph hasn't looked into is left to the walk, and one that comes into home's top is watched, not looked
into, and listed by the graph, which asks for the walk again (`walkHomeAgain`), as design/roots.md § Home says. In a
folder asked for by name, which is whole, and once home's walk is kept, a folder that comes is taken in as before.

## Acceptance criteria

- A test: home not walked, a file saved in a top folder holding folders, a top folder touched just before the watcher
  starts, and a new top folder holding notes: none of their folders' notes is reported, and the new top folder is
  listed and watched, nothing in the graph built again. It fails without the fix.
- A folder of home polled (its watch failed) doesn't ask again at every tick.
- A folder made in a folder asked for by name is still taken in at once; once home's walk is kept, a folder that comes
  is taken in as before.
- design/roots.md § Home says it; the manual and the changelog say what users see.

## Out of scope

- How the watcher treats a walked home past its cap (`maxDirs`).

## References

- Delivers: design/roots.md § Home (§ Its index, in slices).
- Rests on: VV-D2, D248, D40.

## Log

- 2026-10-23: Reproduced on `dev` (be3674a) with a script driving `VaultWatcher` over an unwalked home's graph, as
  `src/tui/watch.ts` starts it (`tmp/issue/repro.ts`, not committed). The issue's own case doesn't happen as written: a
  shell's history rewritten in `~` takes nothing in, because `walkTop` lists home's top folders into the graph's
  folders (`src/core/workspace/walk/walk.ts` `walkTop`, `tests/vault.test.ts` "home opened is never walked then": `["",
  "sub"]`), so
  the watcher watches each, not looked into. The same happens one level down: a file saved in `~/Documents` lists it
  again (`lookAgain`), and each folder in it, not watched, is taken in whole (`flush` → `adoptTree`), every note in it
  reported created (`Documents/d0/sub/n0.md`…); a top folder made in the two seconds before the start, the same at the
  first tick; a new top folder, `~/cloned/x/y/deep.md`, taken in whole from its event.
- 2026-10-23: The terminal checks work around it: `homeFolders` and the marks check in
  `tests/terminal/checks/vaults.ts` date home's top and their folders an hour back, "a folder that came in it taken in
  with its notes … whatever home's walk has done".
- 2026-10-23: Codex agreed with the cause, and corrected the plan: keep the watcher's shallow listing of a folder (its
  own files after a missed event; a polled folder's only way to see new notes), and guard only the folders it would
  take in whole. Taken: before home's first walk the watcher still lists a folder it watches, and reports that folder's
  own files.
- 2026-10-23: Fixed. `Graph.waitsForHomeWalk(rel)` (`src/core/graph.ts`): home not walked, any folder but its top and
  those asked for by name (D248). The watcher's `leftToWalk` option (`src/core/watch.ts`, given it by
  `src/tui/watch.ts`'s `startWatcher`): a folder found that it isn't watching (`found`: from an event, a second look,
  or a polled folder) is taken in only when no walk is to look into it. Left to the walk, a folder come into home's top
  asks for it (a rescan: the graph, built again, lists it and the watcher watches it, not looked into; `walkHomeAgain`);
  one in a folder left to the walk asks for nothing, since the walk asked for at the start, or the walk kept brought up
  to now (a folder changed since it began is listed again), takes it.
- 2026-10-23: That leaves out a `left` set (my first plan): with a rescan only for a folder come into home's top, a
  polled folder of home finds the same folders at every tick without asking again, so there's nothing to remember.
  It also ends a loop the old code had in that state: a polled top folder's new folder was watched alone and a rescan
  asked; the graph built again (`walkTop`) didn't list it, `sync` closed the watch, and the next tick did it again.
- 2026-10-23: Tests. `before home's first walk, the watcher looks into no folder its graph hasn't …` in
  tests/vault.test.ts: touched just before the start, a file saved in a top folder, a folder come into home's top, a
  polled top folder over three ticks, a folder made in one asked for, home walked. Mutation-checked: with every folder
  adopted, with no rescan for a folder come into home's top, with the polled branch as it was, with the folders asked
  for not exempt, and with a walked home not exempt, it fails each time. `home never walked, its watcher leaves what the
  walk is to look into …` in tests/tui.test.ts checks the wiring: it fails without the `leftToWalk` line.
- 2026-10-23: A side effect to know: a rescan before home's walk builds the graph from home's top again, so a note that
  came by its event in a top folder (`~/Documents/letter.md`) leaves the graph until the walk. Any rescan did that
  before; a folder come into home's top is one more reason for one, as design/roots.md § Home already says it is.
- 2026-10-23: Tried live (this worktree's slipbox, `HOME` a scratch build of the reference set, `bun
  scripts/build-home.ts`, `[index] background = false`, `idle_seconds = 86400`), with `~/journal/2025/m01…m12/` added:
  60 notes a folder down, dated an hour back. The rescan, as first built, had two costs: a folder come into home's top
  built the graph again from home's top, so `journal/saved.md`, come by its event, left the switcher (5 notes, then 3)
  until the walk; and before the walk every build walks the folders asked for by name again, whole, on the screen's
  thread. Changed: the watcher names such a folder in its batch (`WatchBatch.toWalk`), `applyToGraph` lists it
  (`graph.dirs`, as `Files.addFolders` does for a folder made in the TUI), and the TUI watches it, not looked into, and
  asks for the walk again (`walkHomeAgain`); nothing is built again. design/roots.md § Home said "the watcher's rescan";
  it says this now.
- 2026-10-23: Live again, on the fix, the switcher's count after each step: at the start 3 (home's top);
  `~/.zsh_history` rewritten by temp and rename, 3; `~/journal/saved.md` saved, 5 (it and `journal/index.md`, journal's
  own; none of the 60); `~/cloned/x/deep.md` made, 5, `cloned` in the explorer `◐` like the other top folders, nothing
  dropped; `~/cloned/top.md` saved, 6 (cloned watched); `~/journal/2026/m01/day-1.md`, 6. `idle_seconds = 2` saved, the
  TUI reloaded it and walked home while nobody worked: 69, `cloned/x/deep.md` and `journal/2026/m01/day-1.md` among
  them, `walk.json` kept. The release (`slipbox` 0.4.1-preview, installed) on the same steps: 3, 3, then 65 (all 60 read
  at once), then 66 (`cloned/x/deep.md` read whole).
- 2026-10-23: Tests changed to match: the vault test checks the batch names `cloned` and asks no rescan, and that
  `applyToGraph` lists it without a build; the TUI test that nothing in the graph is dropped and `cloned` is watched (a
  note saved in it comes). Mutation-checked again, ten ways: those above, and `applyToGraph` ignoring `toWalk`, the
  feed's merge dropping it, the TUI not watching it, and the rescan of the first plan, each failing a test. The TUI test
  caught the last only once Documents was dated back after its note came: a folder changed in the last two seconds is
  listed again at every tick, which brought the dropped note straight back.
- 2026-10-23: Passing: the two tests; tests/vault.test.ts `-t "[Ww]atch|home|VV-D2|poll|adopt|moved in"` (58) and
  tests/tui.test.ts `-t "home|[Ww]atch|polled|on disk|VV-D2"` (38); the terminal checks `home:`, `marks:` and
  `vaults: home` (7, `SLIPBOX_TERMINAL_JOBS=2`). The comments of `homeFolders` and the marks check, which dated folders
  back to dodge this, say why they still do: a folder changed just before the start has its own notes taken in.
- 2026-10-23: Codex reviewed the diff, two findings, both taken. 1: the TUI's `sync` against `graph.dirs` on a
  `toWalk` batch closed the watches of folders the watcher had taken in inside a folder asked for (they're in no
  `graph.dirs`), so a note made later in one wasn't seen. Now the watcher watches such a folder itself when it finds it
  (`found` → `ask`), as the graph will list it, and the TUI only asks for the walk; no `sync`. 2: a batch held while git
  writes could list a folder gone since, or become a vault: `applyToGraph` lists one only while home's walk would go
  into it (`walksInto`). Its other points: the polled case now closes the folder's own watch first, so the listing is
  all there is, in a test of its own; and a folder that comes after its parent was listed by a walk under way waits for
  the walk kept to be brought up to now (its parent's time moved since the walk began), as before: `homeAgain` doesn't
  start a second pass while one is under way.
- 2026-10-23: Tests after the review: tests/vault.test.ts `before home's first walk, the watcher looks into no folder
  …` (events and second looks; a stale name not listed) and `before home's first walk, a folder of home polled …`
  (home's top and Documents polled alone); tests/tui.test.ts `home never walked, its watcher leaves what the walk is to
  look into …` and `home never walked, a folder come into its top leaves the rest watched as it was …` (Codex's
  sequence: a folder taken in inside `~/notes`, asked for, a folder come into home's top, then a note in the first).
  Mutation-checked thirteen ways (tmp script, not committed): every folder adopted; a folder come into home's top
  neither named nor watched; the polled branch as it was; named but not watched, polled and not; the folders asked
  for, or a walked home, not exempt; `applyToGraph` ignoring `toWalk`, or listing it without looking again; the TUI's
  wiring gone; the feed's merge dropping `toWalk`; the rescan of the first plan; the TUI's `sync` back. Each fails a
  test.
- 2026-10-23: Live on the final code, the scratch home reset: 3, 3, 5, 5 (`cloned` listed `◐`, nothing dropped), 6
  (`cloned/top.md`), 6 (`journal/2026/…` left to the walk), as before the review. Codex's sequence live too:
  `slipbox ~/journal` (66 notes, journal walked whole), `journal/fresh/sub/a.md` made (67, taken in), `~/cloned2` made
  (67), `journal/fresh/sub/b.md` made (68: still seen).
- 2026-10-23: Passing on the final code: the four tests; tests/vault.test.ts
  `-t "[Ww]atch|home|VV-D2|poll|adopt|moved in|applied|feed"` (63) and tests/tui.test.ts
  `-t "home|[Ww]atch|polled|on disk|VV-D2|git|switch"` (72); the seven terminal checks; the typecheck (the scratch home
  under `tmp/` left out of it: its reference-set code is broken on purpose), the lint, `check:boundary`, `check:size`
  and `check:docs`.
- 2026-10-23: The code-review skill's review, eleven findings, each looked at:
  1. A folder renamed or moved within home lost its notes: the folder found was left to the walk. Taken: `flush`
     decides the folders it leaves last, and when a known note went in the same batch it takes them in whole after all
     (a renamed `~/notes`, asked for, keeps its notes under the new name, and the graph sees the move).
  2. A named folder the graph didn't list (become a vault, gone) stayed watched. Taken: the watcher no longer watches a
     folder when it names it; the TUI watches what the graph listed (`VaultWatcher.watch`, which closes nothing).
  3. Naming skipped home's cap (`maxDirs`). Taken: `found` names a folder only within it.
  4. With watching degraded, a polled folder named the same folders at every tick. Taken: each folder is named once
     (`named`, forgotten when it goes), and none while watching is degraded.
  5. A folder left to the walk, removed, was said deleted as a file. Taken, narrowly: a path gone where the walk is to
     look, not a note and never a file known, says nothing. Not made general: the watcher's files are not brought up to
     date by `sync`, so in a vault a rule as broad could keep a real file's going from the graph.
  6. A `sync` while git held the batch closed the new folder's watch, and nothing watched it again. Taken with 2: it's
     watched when the batch is applied, never before.
  7. The manual's sentence and design/tui.md's line said more than holds. Taken: rewritten (a note at home's top, in a
     folder directly in it, or in the folder you opened comes; deeper waits).
  8. Listing a folder laid out every open note again. Taken: no note came, so `applyToGraph` doesn't say structural;
     the TUI refreshes the explorer alone (link resolution doesn't read `graph.dirs`).
  9. Each second look listed the folders left again, to stat each and leave it. Taken: `lookAgain` skips them.
  10. The listing repeated `Files.addFolders`, with another rule. Taken in part: it's `Graph.listForWalk` now; its rule
      stays its own: `addFolders`' (`admits`) is for a folder made in the TUI in any vault, this one is whether home's
      walk goes in (`walksInto`), as `walkTop` lists.
  11. Naming was written twice. Taken: `found` and `ask`, shared by the polled branch and `flush`.
- 2026-10-23: Seen while testing, not changed: renaming a watched folder reports `<folder>/<its name>` deleted as a file
  (Bun's event for the folder itself), on dev too; and where a rename is reported by its new name alone, its notes wait
  for the walk, since nothing in that batch says a note went. A folder named while home's top is polled alone isn't seen
  to go, so one made again under the same name waits for the walk.
- 2026-10-23: Tests after the review: the two vault tests gained a folder gone before it's watched and made again
  (named again), a folder become a vault or gone (not listed), a folder left to the walk removed (nothing said), the
  folder asked for renamed (its notes under the new name, nothing named), home's cap, and watching degraded; the TUI
  test, a folder become a vault (neither listed nor watched) and the explorer's row. Twenty mutations, each failing a
  test (`tmp/issue/mutations.sh`, not committed). Five separate runs of each file, all passing (`--rerun-each` can't
  run tests/tui.test.ts: its sandbox is made once per file). The neighbouring tests (63 and 132), the seven terminal
  checks and the checks pass again. Live: home 3, 5, 5, 6, and 5 once `~/cloned` was removed; `slipbox ~/journal`, 65
  notes, `mv ~/journal ~/diary`: 65, under `diary/`.
- 2026-10-23: Codex's second look, at the review's fixes, three findings, taken. P1: any known note going took in every
  folder left in that batch, so deleting `~/a.md` while a large folder came read it whole again. Now a folder is taken
  in only where a note that went is, under the same path below where it was or the same name (`movedInto`, a few
  looked at). P2: folders named and not yet watched held no room under home's cap, so several named at once, or while
  git held the batch, could pass it. They count now (`room`), and `watch` holds the cap too. P2: second looks skipped
  the folders they left, so a note moved into a new folder, seen only by a second look, lost its way. They're kept
  (`leftSeen`) for the next `flush` to look at only when a note went, which also keeps the review's 9.
- 2026-10-23: Tests for those: a known note gone as a folder comes into home's top (named, not read); polled
  Documents' note moved into a folder made in it (taken in, the move seen); a folder named holding its room, and
  `watch` refusing one past the cap. Twenty-five mutations, each failing a test, five separate runs of each file
  passing; the neighbouring tests (63, 132), the seven terminal checks, the typecheck, the lint and `check:docs` pass.
  A second look at a watched folder keeping what it left isn't pinned by a test: its events find the same folder.
- 2026-10-23: Done; draft pull request into `dev` for the maintainer's review.
- 2026-10-23: The pull request's own review (the maintainer's review loop), round 1, CI green on #42: the code-review
  skill and Codex, each on `git diff origin/dev...` without the other's findings. Codex's three, each reproduced with a
  script (`tmp/issue/repro-r1.ts`) before the fix:
  - Verified, fixed: a folder a second look left could be taken in after it became a link out of home that isn't
    followed: moving a known note to where the link leads read the whole target through it (`Documents/new/a.md`,
    `Documents/new/deep/secret.md` reported). `movedInto` looks again first: a folder the walk takes, and a link only
    when it's followed; and what second looks leave is forgotten at the next tick.
  - Verified, fixed: a file of the same name was enough: a known `~/index.md` gone as `~/bulk/` came with its own
    `index.md` read all of `bulk` whole. A note moved is now the same file, by its time and size, which a move keeps.
  - Verified, fixed: a note moved under another name (`~/a.md` to a new `~/Documents/new/b.md`) was said gone and
    never found; on dev the folder was taken in. `movedInto` also looks at the folder's top, by time and size. A note
    moved and renamed deeper in a new folder waits for the walk; design/roots.md § Home says only what holds.
  Tests: `before home's first walk, a folder a known note was moved into is taken in …` in tests/vault.test.ts; each
  of the three fixes undone fails it.
- 2026-10-23: Round 1, the code-review skill's twelve, merged with Codex's (its 1, a name taken for a move, is Codex's
  second), each checked against the code:
  - Verified, fixed (2, 5, 6, 10): a move into a folder left to the walk took that folder in whole — `mv ~/Documents
    ~/Docs` read all of `Docs/**`, a note moved into `~/Documents/proj` all of `proj` — and each batch with a note gone
    probed every folder seen for it, on the screen's thread. Now no folder is taken in for a move: the moved notes
    alone are found where they went (`movedTo`, by time and size, below a folder that went or at the folder's top) and
    reported there; the rest stays the walk's. A renamed folder costs a probe per note it held, a folder found one
    listing of its top.
  - Verified, fixed (3): second looks come after the tick's batch, so a move's two ends could land in two batches.
    The notes that went and the folders second looks left are kept for a tick (`recentlyWent`, `leftSeen`), and a
    second look finding a folder as a note went lately asks for a batch.
  - Verified, fixed (7): a batch held while git wrote, applied after home's walk, listed its folder and asked for a
    second whole walk (`homeAgain` resets a pass that's done). `Graph.listForWalk` lists nothing once home is walked,
    and the TUI then asks for no walk.
  - Verified, fixed (8): a folder named that the graph didn't take (a vault since, gone, past the cap) stayed named for
    good, never named again and holding its room. The watcher keeps one map of the folders it left (`left`), and
    `watchNamed`, given what the graph listed, forgets every name it's given.
  - Verified, fixed (9): the rule for a gone folder said nothing for any path where the walk looks, so a file the graph
    knew and the watcher didn't (one reached, 20.8) went unsaid. Now only a folder the watcher found and left goes
    unsaid (`left`).
  - Verified, fixed (11, 12): design/tui.md said more than holds; rewritten. The tests' copies of `look` and `until`
    are one helper each (`watchHome`, a describe's `until`). The prefix match repeated in watch.ts is left: each loop
    runs over its own map.
  - Not fixed (4): the folder asked for by name, renamed, isn't asked for under its new name: its notes are followed
    there, but a folder made in it later waits for the walk, and a build before the walk drops them. On dev a build
    drops them as well, and it lasts until home's walk, made the first time nobody works; carrying the folder asked
    for over would need the graph told of folder renames, more than this issue asks.
  - Fixing them found two more, fixed: the end of a batch named again a folder that a second look had found, once it
    was watched since, or gone.
- 2026-10-23: Tests for round 1: `… a folder a known note was moved into is taken in …` (now: a note moved under another
  name, a same-named note, a link not followed, a note moved into a folder that was there with its ends a tick apart,
  a top folder renamed with notes below it never read), the renamed folder asked for, the polled cap, and the TUI's
  batch after the walk. Thirty mutations, each failing a test (`tmp/issue/mutations.sh`); the step for a move's ends a
  tick apart caught its mutation only once Documents was dated back and its earlier second looks forgotten. Passing:
  the neighbouring tests (64, 132), the seven terminal checks, the typecheck, the lint, `check:boundary`,
  `check:size`. Live on the scratch home: 3, 5 (`journal/saved.md`), 5 after `mkdir ~/journal/new && mv
  ~/journal/saved.md ~/journal/new/kept.md` (found there), 5 after `mv ~/journal ~/diary` (`diary/index.md`,
  `diary/new/kept.md`; `diary` listed `◐`; none of the 60 below read). Seen, not changed: the explorer still lists
  `journal` after the rename; a folder gone stays in `graph.dirs` until the graph is built again, on dev too.
- 2026-10-23: Round 2 (on 67d2cbb), Codex's three, each reproduced by a new test before its fix
  (`before home's first walk, a move is followed whatever its batches …`, tests/vault.test.ts):
  - Verified, fixed: a folder renamed with its two ends in two batches lost the folder that went (kept per batch), so
    only its top was looked at: `kept/sub/deep.md` renamed to `zettel/` wasn't followed. The folders that went are
    kept a tick, as the notes are (`recentlyGone`).
  - Verified, fixed: a note found gone only by the batch's last look (a rename reported by its new name alone) wasn't
    kept as gone, and that look came after moves were followed: `~/a.md` moved to a new `~/dest/b.md`, the batch
    naming `dest` alone, wasn't followed. The last look (`vanished`) runs first now, and keeps what it finds gone.
  - Verified, fixed: following notes into a renamed folder looked only at the folder, not at the folders between it and
    each note, so a vault made in it (`kept2/sub/.slipbox`) had its notes said home's. A note is followed only while
    home's walk would go into its folder (`walksInto`, each folder on the way, links too).
  Each fix undone fails the test.
- 2026-10-23: Round 2, the code-review skill's ten (on 67d2cbb), merged with Codex's: its 1 (a note found gone by the
  batch's last look, never followed), 2 (a folder renamed in two batches) and 6 (a path below the folder not looked at)
  are Codex's three, fixed above. The rest:
  - Verified, fixed (3): the design said a note moved into a folder left to the walk is followed there, but only a
    folder the watcher sees is looked in (one come, or one in a folder of its that changed): `mv ~/a.md
    ~/Documents/proj/a2.md`, proj there before and Documents unchanged, waits for the walk. design/roots.md and
    design/tui.md say only that.
  - Verified, fixed (4): a renamed folder's notes were followed only if the first that went was found under the new
    name, so a note of it deleted alone a moment before kept the rest from being followed. The first twenty are tried.
  - Verified, fixed (8): a known note going in a top folder had every folder in it listed for where it went (500
    folders, 25,000 stats), on the screen's thread. Only a folder changed since a little before the note went is
    listed now; the paths found are counted once.
  - Verified, fixed (9): the folders left stayed known once home was walked, and each gone path ran over them all. They
    are forgotten at the first `sync` with nothing left to a walk, and only a folder gone is looked for among them.
  - Verified, fixed (10): the rule for which named folders are listed lived in the graph and again in the TUI.
    `applyToGraph` returns what it listed (`listed`), and the TUI watches that.
  - Not fixed (5): a note followed into a folder left to the walk is known, but its folder isn't watched, so a change to
    it is seen by the sweep of known notes (every fifteenth tick, half a minute by default), and a note made beside it
    waits for the walk. Watching that folder would take its own files in at its next change, more than the note.
  - Not fixed (7), in part: a copy kept with its times (`cp -p`) in a folder changed since, its note deleted, is taken
    for the note's move, and a relink offered. With 8 a copy in a folder unchanged since isn't. On dev the folder was
    taken in whole and the graph, pairing by content, took the same move.
- 2026-10-24: Tests for round 2: the batches test gained a folder whose note was deleted alone before its rename; the
  moves test a copy kept with its times in a folder unchanged since. Thirty-five mutations, each failing a test; five
  runs of the four vault tests passing. One run of five, at a load near 20, failed a vault test; at a load under 10,
  five more passed. A step that could depend on the setup's speed (touched/ changed within two seconds of the graph's
  build) now sets touched/'s time itself. The neighbouring tests (65, 132), the seven terminal checks, the typecheck,
  the lint, `check:boundary` and `check:size` pass.
- 2026-10-24: The maintainer asked for a terminal check of every case, the live tries' among them. Four, in
  tests/terminal/checks/vaults.ts (`UNWALKED_HOME`, home never walked, the watcher looking again every 200 ms):
  `home: before its first walk, a note saved in a folder of home comes, nothing a folder down …` (a folder made just
  before the start, `~/.zsh_history` rewritten, `~/journal/saved.md`); `… a folder come into home's top is listed ◐ …`
  (`~/cloned`, a note saved in it, home walked once nobody works); `… a note moved is followed where it went …` (into
  a folder that was there, under another name into one made, its folder renamed, a copy kept with its times, a
  same-named note); `home: a folder opened by name before home's walk …` (a folder made in it, renamed with a vault
  made in it). Undoing the fix (every folder taken in, as on dev) fails three of the four; the opened folder's passes
  on dev too, which took it in whole. Moves not followed fails two; a vault made in a renamed folder, the moves kept no
  tick, and a copy taken for a move fail one each. Under a load of 32 one of the four failed once; at under 10 all
  passed. Found writing them: a note followed into a folder left to the walk and moved on from there isn't seen to go
  (its folder isn't watched), so the moves check moves its notes from journal, which is.
- 2026-10-24: What a terminal check can't drive, tested by unit tests alone: a folder polled because its watch failed,
  and watching degraded (the system's watch limit); home's cap (5,000 folders); a folder named and gone before the TUI
  watched it, or become a vault, or a batch applied after home's walk (each needs git's index lock held between the
  batch and its applying); a move's two ends in two batches, and a rename reported by its new name alone (the order
  events come in); a folder a second look found, become a link before a note went (between two looks); a folder whose
  first note went alone a moment before its rename (the order notes go in one batch); a folder left to the walk
  removed (nothing is said either way).
- 2026-10-24: examples/home/CASES.md lists the case (§ links/roots, Home before its first walk), its tests and checks.
- 2026-10-24: C4 gained a folder come into home's top while a folder taken in inside the one opened is watched, and a
  note saved there after. With the TUI's `sync` on a named folder put back, C4 still passes (by the time the note comes
  the folder is watched again); the TUI test T2 is what fails then. Live on a fresh build of the reference set
  (`tmp/issue/home2`): `slipbox ~/journal`, 10 notes; `mv ~/journal ~/diary` with `diary/2025/m02/.slipbox` made at
  once: 7, `diary/2025/m01/day-1.md` followed, m02's notes none of home's, `diary` listed `◐`. Passing: the eleven home
  and marks terminal checks, the neighbouring tests (65, 132), tests/home.test.ts, the terminal-coverage and docs tests,
  the typecheck, the lint, `check:boundary`, `check:size`.
- 2026-10-24: Round 3 (on 65ee507). Codex hit its usage limit before reviewing (it resets at 1:41); its review of this
  round comes after. The code-review skill's fourteen, each checked; its altitude finding (11: drop following moves,
  leave them to home's walk and the graph's pairing by content) went to the maintainer, who chose to keep following
  them and fix the round.
  - Verified, fixed (1): a folder named for the walk was never where notes that went could be — a polled top folder's
    listing named it and didn't keep it, and `watchNamed` forgot it — so a rename whose new name came first, or by the
    polled listing, lost its notes. A folder found and left, named or not, stays a candidate for a tick (`leftSeen`),
    watched or not. Tests: the batches test's `fifth` renamed `sixth`, the new name's batch first; a new test, `… the
    folder opened by name renamed while home's top is polled …`.
  - Verified, fixed (2): a copy kept with its times of a folder that went (`cp -a`), in a folder seen lately, took its
    notes. Every candidate, and each note followed into it, now needs the folder changed (its ctime: a rename changes
    that, not its mtime) after a little before the note went; a folder found in the batch itself is new. Test: the
    moves test's `Archive` moved out of home, `Documents/archive-bak` its copy, another note gone a moment before. Found
    making it: `rm -rf` reports each note before its folder, so a folder deleted is never one that went with its notes:
    only a folder moved is; the step moves `Archive` out of home. C3 does the same with `~/archive`.
  - Verified, fixed (3), for what home's files are: the files known in a folder that went weren't said gone, nor
    followed. They are now, in a vault too (a folder deleted there left its files in the graph). Home's walk leaves
    pictures out ("not a note or text file"), so the case is a data or text file, not an embed's picture. A file
    followed is said once, though a later batch in the tick looks again. Test: the batches test's `kept/sub/table.csv`.
  - Verified, fixed (4): a batch both rescanning and naming (two merged while git wrote) never forgot its names. The
    TUI applies the names after a rescan too. Test: T1, a merged batch.
  - Verified, fixed (5): the batch's own look named a polled top folder for the walk whenever an event named it. A
    polled folder is passed over, as a watched one is. Test: B, an event naming polled Documents.
  - Verified, fixed (6, 7, 8): a spread of every note that went, a bucket copied at each insert, the folders that went
    filtered again for each candidate, and a candidate's `walksInto` before its time: now a loop, a push, once per
    folder, and the time first. The spread of `adoptTree`'s files is dev's, left.
  - Verified, fixed (9, 10, 12): a second look ran a folder's marker checks again though it was left before; moves were
    kept in a vault, and in home once walked, where none is followed; `sync` guessed whether home was walked from a key.
    The watcher is given `walkPending` (the TUI: home's walk still to make), in home only with `leftToWalk`.
  - Fixed in part (13): `flush` settles in two passes (`settle`), the paths then the moves followed, with no flags; the
    batch's folders are named after (`found` once more there, on purpose: each name takes its room).
  - Fixed in part (14): `forget` uses home.ts's `under`; `unwatchTree`'s own prefix test is dev's, its root case not
    the same, left.
  - Not fixed (11): the maintainer's choice, above.
  Mutations: 42, each failing a test once two steps were made sharper (the polled folder named once with room left;
  the copy step with another note gone at the real time — removing the per-note guard then failed it, so it stays).
  Five separate runs of each file pass; the neighbouring tests (66, 132), tests/home.test.ts, the terminal-coverage and
  docs tests, the eleven home and marks terminal checks, the typecheck, the lint, `check:boundary` and `check:size`.
- 2026-10-24: CI on 3c91025: every job passed but the terminal checks on ubuntu-24.04-arm, where C2 timed out on
  `space e` the second time: the explorer, shown but not focused, while home's walk built the graph again. The step
  needs no key: the explorer still shown says when home is walked, and with no key pressed nobody is working. C2 now
  waits for `cloned`'s `●` without one; three runs pass here.
- 2026-10-24: Round 3, Codex's (after its limit reset, on bea450d), two and a wording:
  - Verified, fixed: `Graph.listForWalk` took a folder already in `graph.dirs` without looking again, so one listed,
    then gone and made again as a vault while git held its batch, was listed and watched inside the vault. It looks
    every time now. Test: A, `cloned` made a vault after it was listed.
  - Verified, fixed: a note followed into a folder left to the walk, moved on from there, was seen to go only by the
    sweep of known notes, every fifteenth tick, by when where it went was no candidate any more: lost until the walk.
    Such a note is looked at every tick now (`followed`) until its folder is watched or it goes: moved on into a folder
    the watcher sees, it's followed again, and a change to it is seen at once, not in half a minute. A move on into a
    folder no watch sees still waits for the walk; design/roots.md says so. Tests: M (`Documents/new/b.md` moved on to
    a new `Documents/again/c.md`) and C3 (`journal/2025/kept.md` moved on to a new `journal/new/b.md`). Undone, M
    fails; C3 can still pass, the sweep finding the note in time by chance, as with C4 and T2.
  - Fixed: examples/home/CASES.md said the folder opened by name stays whole renamed or not; renamed, its notes are
    followed, no more.
- 2026-10-24: Passing after Codex's round 3: five separate runs of each test file; forty-four mutations, each failing a
  test; the neighbouring tests (66, 132), tests/home.test.ts, the terminal-coverage and docs tests, the eleven home and
  marks terminal checks, the typecheck, the lint, `check:boundary`, `check:size` and `check:docs`.
