# Requirements

## Goals

- **A slow disk never freezes the screen.** No read of the vault open's disk, or of slipbox's own state, cache and
  config folders, that runs on a timer or in the background holds up the keys or the screen while the TUI is up: the
  watcher's looks, the TUI's look each second, a changed note's text, the background parse, the vault built again,
  the explorer's own tree, what slipbox reads of its own folders (issue #46; SD-D1–SD-D3).
- **A key's own read waits for it, never the screen.** Opening a note, zooming into a folder, reloading a note by hand:
  the key, and the keys after it, wait for the read while the screen draws and says what's read; `esc` gives it up
  (SD-D4).
- **Never read on the screen's thread instead.** A read that doesn't answer in time is given up on, said, and asked
  again later (SD-D6), as T12's walks are.
- **What you see is never older than it says.** An answer that comes after the vault open, the graph, a note or the
  settings it was read for have moved is dropped or asked again, never applied (SD-D5).
- **The start shows the screen first** (SD-D9).

## Non-goals

- Writes: a note's save, a file operation, the scratch, an export, slipbox's own state (SD-D7).
- The CLI, whose command waits for its answer either way.
- Another vault's graph, built for a peek or the reach (root ideas.md § Roots and vaults).
- Parsing the vault open's notes on another thread, and the parse cache (`parsed.db`) asked as they're parsed.
- Registering a folder's watch (`fs.watch`) off the screen's thread.
- A real slow disk in CI: the stand-in and the hold stand in for one (SD-D10).

## Builds on

- design/roots.md § The index, "Off the main thread, in the TUI": T12's walk thread and listing threads, their
  deadlines (`WALK_DEADLINES`), their context (`worker-context.ts`), `Graph.builds` and home's refresh replaying what
  changed meanwhile.
- design/tui.md § Side panes, the explorer: `Listings`, `listing…`, `can't read: …`, the rows a listing gives
  (`ON_THE_ROW`), `Marks.listedFacts`.
- design/tui.md § External changes and § Bun's watcher, and what covers its gaps: the look, the sweep, the settle by
  stat, own writes ignored once (D137).
- design/tui.md § Known limits and design/how-it-works.md § Performance, measured: a big note's parse on threads, the
  keys waiting for it (D120).
- design/tui.md § Asynchronous git reads: a key that waits for its read, cancelled by `esc`, checked against the view
  and the vault when it answers.
- design/how-it-works.md § Client interaction and future gateway boundary: saving through `App.writeBuffer`,
  synchronously; asynchronous saves are Later.
- design/testing.md § The terminal tests ("A slow disk, stood in for") and § Strategy, "Waiting and measurement":
  the stand-in, the hold, no clock in a unit test.
- D40 (one walk for the index and the watcher), D137 (the watcher), D120, D220 (writes through a link), D262 (a
  thread held by the test, on its own clock), VV-D2 (home's walk), VV-D6 (links followed, their probe), VV-D8.

## Acceptance criteria

- **The inventory's reads are off the screen's thread.** Every read README.md § The inventory lists, but those
  SD-D7 keeps, goes through the seam (SD-D10) to a disk thread; a test per area holds it (`Hold`) and has a key
  handled and drawn meanwhile, and fails with the read back on the screen's thread (checked by undoing it once).
- **The looks.** With the vault's folder held: the watcher's looks, its settle by stat and the TUI's look each second
  go on asking without a key waiting; let go, a note an agent wrote meanwhile is seen and an open one reloaded. A look
  that doesn't answer in time says `⚠ disk not answering` once, and the next answer clears it.
- **Opening a note.** Held: the tab says `reading <note>…`, keys typed after the open act on the note once it's
  read, `esc` gives it up and leaves you where you were; past the deadline it's said and not opened.
- **The vault built again.** Held: a reindex, a rescan, a setting of the walk changed, a vault gone into and a
  branch's tabs leave the graph and the tree as they were until the build answers, saying `reading the vault…`; an
  answer for a vault left, or a graph built since, is dropped; a change the watcher took in meanwhile survives it.
- **The explorer's own tree.** Held: a folder of the vault unfolded says `listing…` after a moment and its rows come
  when it answers; its rows' marks are its listing's; the view on a folder deleted gives way when the stat answers.
- **The start.** Held: the screen comes up, the note says `reading the vault…`, `q` quits; let go, the note is drawn
  with its links checked.
- **Races.** For each kind of answer, a test that lets the hold go after its world moved, and finds it dropped.
- **Deadlines.** For each kind of request, a test past a shortened deadline: given up on, said, never read on the
  screen's thread instead.
- **Terminal checks.** A `slow disk: …` check per task in `tests/terminal/checks/slow-disk.ts`, passing on Linux and
  macOS in CI; T12's ten pass unchanged. Pull requests skip the terminal job (D266), so before each task's pull
  request merges, the terminal checks it reaches run locally, as well as its unit tests (SD-D14 and its note); each
  task adds `CHECKS_FOR` entries in `scripts/ci-scope.ts` for the files it moves, and `disk.ts`, which every feature
  reads through, has none, so a change to it reaches every check.
- **What's drawn.** A draw never reads the disk: git's state is the look's, a count of every note is of what's parsed
  so far, marked partial (SD-D13). Held, the top bar, the Problems tab and the Info panel draw at once.
- **Memory.** The disk threads' cost measured with one and two started, recorded in SD-T2 and on #56.
- **The design says so.** design/roots.md's "Not done" goes; design/tui.md says where each read is made, what's shown
  while it's out, and what stays; design/testing.md says what the stand-in and the hold reach. The user docs and the
  CHANGELOG say what you'll notice.

## Changes

### ADDED requirements.md § Quality goals

After "Fast at 5,000 notes, and on a big note":

- **A slow disk never freezes the screen** (SD-D1–SD-D9). What the TUI reads of the vault open's disk, or of its own
  folders, on a timer or in the background never holds up the keys or the screen: what it knew stays on the screen
  until the read answers. A read a key asks for is that key's: the keys after it wait for it while the screen draws,
  and `esc` gives it up. Nothing that doesn't answer in time is read on the screen's thread instead. Writes stay where
  they are (SD-D7). Checked by a held folder in the unit tests and a slow disk stood in for in the terminal checks
  (design/testing.md § The terminal tests).
