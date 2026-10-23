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
  folders (`src/core/walk.ts` `walkTop`, `tests/vault.test.ts` "home opened is never walked then": `["", "sub"]`), so
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
