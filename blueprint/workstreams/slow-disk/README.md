---
status: draft
created: "2026-11-09"
---

# SD: A slow disk never freezes the screen

Issue #46. T12 (#9) moved the TUI's own walks, the background index's indexing and the explorer's listings outside
the vault open off the screen's thread, onto the walk's thread and two listing threads. Everything else that reads the
vault open's disk, or slipbox's own folders under home, still reads it on the screen's thread: on a network share, a
drive asleep or a FUSE mount that answers slowly, the screen and the keys stop for as long as each read takes, every
two seconds while the watcher looks. This workstream moves those reads off it.

**A draft: design only, nothing built.** The maintainer answered its seven questions on 2026-11-09, each with the
option recommended (§ Questions answered), which agrees six of its decisions; four stay proposed (§ Decisions). Its
tasks wait for the design to be agreed.

- [requirements.md](requirements.md): its goals, what it builds on, its acceptance criteria, its change to the root's
  requirements.
- [design.md](design.md): its changes to the root's design, with what each task leaves **Open**.
- [decisions.md](decisions.md): SD-D1 to SD-D10; six agreed on 2026-11-09, four proposed.
- [tasks/](tasks/README.md): SD-T1 to SD-T12, in order, each `todo`.
- [notes.md](notes.md): how it was drafted, and what was checked against the code.
- [research.md](research.md): what's known of slow disks and of the ways round them, with provenance.

## Goal

No read of the vault open's disk, or of slipbox's own folders, that runs on a timer or in the background holds up the
keys or the screen: the screen's thread keeps what it last knew, and shows it, until the read answers. A read a key
asks for (a note opened, a folder zoomed into) is that key's own: the key waits for it, as a key waits for a big note's
parse (D120), while the screen draws and `esc` gives it up. Nothing is ever read on the screen's thread instead when a
thread doesn't answer: it's said, and asked again later.

## Scope

In: every read listed below, of the vault open (a vault, home or Elsewhere) and of slipbox's own state, cache and
config folders, made by the TUI while its screen is up — and the start's walk, moved after the screen comes up.

Out:

- **Writes.** A note's save (`App.writeBuffer`), a file operation, the scratch and an export stay on the screen's
  thread (SD-D7).
- **The CLI.** A command has no screen to freeze and waits for its answer either way (T12's rule; `HERE` in
  `src/core/workspace/walk/walkers.ts`).
- **Another vault's graph.** A peek's (`src/tui/documents/navigation/peek/synchronization.ts:107`) and the reach's
  (`src/core/workspace/links/reach.ts:225`) build another vault's graph on the screen's thread: root ideas.md § Roots
  and vaults keeps that open ("A peek's cost and freshness"); the backlinks' thread (#10) already serves part of it.
- **The parse cache.** `parsed.db` (SQLite, in the cache folder) is asked as each note is parsed, on whichever thread
  parses it. Moving parsing of the vault open is not this workstream's; it's said as a limit.
- **Registering a folder's watch.** `fs.watch` stays on the screen's thread, where its events are taken in; on a mount
  that hangs, registering can hang with it (Risks).

## The inventory: what still reads the disk on the screen's thread

Each read was checked against `dev` at `0df9a0a6` (2026-11-09). The issue named files before the code was organized:
`src/core/watch.ts` is now `src/core/workspace/graph/watch.ts` with its parts in `watch/`, `src/tui/run.ts` is
`src/tui/shell/terminal/run.ts`, and the walk's thread is `src/core/workspace/walk/walk-thread.ts`. What the issue
didn't list is marked **(not in #46)**.

### 1. The watcher's look, every two seconds

`VaultWatcher.pollTick` (`src/core/workspace/graph/watch.ts:148`), every `watch.poll_ms` (2,000 ms):

- a `stat` of every watched folder (`dirMtime`), every tick;
- a `stat` of every watched folder's `.gitignore` (`WatchDirectories.gitignoreStamp`, `watch/directories.ts:16`),
  every tick **(not in #46)**;
- a `stat` of each note followed into a folder left to home's walk (`state.followed`), every tick;
- each polled folder (one whose watch failed) listed with `readdirSync`, and a `stat` per note in it, every tick;
- every 15th tick (thirty seconds), the sweep: a `stat` of every known note (`statOrNull`), thousands in a big vault;
- `lookAgain` (`watch.ts:252`): each folder whose mtime moved listed again with `readdirSync`;
- `flush` (`watch.ts:313`), after every batch of events too, not only the look: `WatchReconciliation.settle` and
  `vanished` (`watch/reconciliation.ts:86`, `:188`) settle each pending path by `stat`, `existsSync` and
  `readdirSync` **(the events' half not in #46)**;
- registering a folder (`WatchDirectories.watchDir`, `watch/directories.ts:124`), at the start and at each `sync`
  after a build: two `stat`s per folder (its `.gitignore`'s, `startStamp`'s); a folder that came (`adoptTree`) listed
  with all it holds **(not in #46)**.

The batch then goes to `VaultFeed.receive` (an `existsSync` of git's `index.lock`) and `applyToGraph`
(`src/core/workspace/vaults/vault-feed.ts:29`): a `stat` per changed note, and its text read and parsed (§ 4).

### 2. The TUI's look, every second, and the background index's, every quarter second

`Watch.startPolling` (`src/tui/app/runtime/watch.ts:204`), every second:

- `Watch.poll` (`watch.ts:232`): a `stat` of each open file no watcher sees (`NoteBuffer.changedOnDisk`,
  `src/tui/documents/buffers/buffer.ts:271`): the scratch, a reached file, one of home's skip list; all of them when
  the watcher is degraded; and after every build, every open file (`Watch.rebuilt` → `poll(true)`). One changed is
  read again (`reloadBuffer` → `NoteBuffer.load`, § 4);
- `Settings.changedOnDisk` (`src/tui/app/settings/settings.ts:188`): a `stat` of your config and the vault's
  `.slipbox/config.toml` **(not in #46)**;
- `Git.checkHead` → `VaultFeed.checkHead` (`vault-feed.ts:199`): `existsSync` of `index.lock`, `rebase-merge` and
  `rebase-apply`, a `stat` and a read of `HEAD`, a read of the branch's ref or `packed-refs`
  (`src/core/workspace/git/git.ts:85`, `:111`) **(not in #46)**; while git holds its lock, `waitForGit` looks every
  100 ms (`vault-feed.ts:144`).

`GraphRefresh.startAutoIndex` (`src/tui/app/runtime/graph-refresh.ts:221`), every 250 ms: `nobodyWorking`
(`:172`) stats the CLI's activity file in slipbox's state folder **(not in #46)**.

### 3. The vault open built again

`Graph.build` → `GraphRefresh.build` (`src/core/workspace/graph/refresh.ts:165`), all of it on the screen's thread:
the walk (`walkVault`; `listDirectory` in Elsewhere; in home, `homeWalk` → `keptWalk`,
`src/core/workspace/vaults/home/cache.ts:78`, a `stat` of every folder and note of home's walk kept, the changed
ones listed, and the folders asked for walked to their end), the index read (`readJson` of `index.json`, megabytes
in a big vault) and its stamp, the moves found by reading each new note's text (`moves/reconcile.ts:38`), git's
renames (`catchUpWithGit`), and the index written when it changed. Made by:

- a reindex (`vault.reindex`, `src/tui/actions/workspace/actions-files.ts:91`);
- the watcher's rescan (`applyToGraph`'s `rescan`, `vault-feed.ts:38`; a `.gitignore` changed, HEAD moved on its
  branch with renames);
- a setting of the walk changed (`settings.ts:244`);
- a vault gone into (`Vaults.switchVault` → `Vaults.ask` → `Graph.askFolders`, `src/tui/workspace/vaults/vaults.ts:91`);
- a branch's tabs brought back in home (`Vaults.askTabs`, `vaults.ts:103`);
- a rename or move that takes vaults or the vault's own config with it (`src/tui/workspace/explorer/renaming.ts:206`,
  `:220`), and a folder moved or deleted (`src/core/workspace/mutations/files.ts:102`, `:148`;
  `rename/rename-apply.ts:319`, `:421`).

Home's refresh after its walk on the thread (`GraphRefresh.homeBuilt`, `graph-refresh.ts:295`) is given the walk,
but still reads the index and its stamp here.

### 4. A note's text read

- **The background parse** (`parseInSlices`, `graph-refresh.ts:44`): a big note's text read here before and after
  its parse on the parse threads, and `Graph.parseSome` (`refresh.ts:356`) → `entry` → `extractNote`, reading each
  small note's text in twelve-millisecond slices; one read can't be cut short. The index written at its end
  (`writeCache`, `refresh.ts:384`).
- **A changed note**: the watcher's batch (`applyToGraph` → `Graph.updateFile` → `extractNote`,
  `src/core/workspace/graph/feed.ts:73`); an open one reloaded (`Watch.reloadBuffer`, `watch.ts:403` →
  `NoteBuffer.load`, `buffer.ts:230`).
- **Opening it**: `Opening.buffer` (`src/tui/documents/buffers/opening.ts:106`): `NoteBuffer.load` (its text, its
  stamp), `lockedSaid` (an access check), `vaultOf` (each folder above it asked for a marker), and `:e!` and a reload
  by hand (`actions-edit.ts:259`, `saving.ts:140`); a list's preview (`src/tui/shell/overlays/preview.ts:115`) and a
  peek (`peek/opening.ts:69`) the same.
- **On demand**: `Graph.entry` parses a note not parsed yet when a backlink, hover or completion asks for it;
  `reachFile` (`refresh.ts:278`) reads a folder to find a name's case (`onDisk`) and stats the file.

### 5. The explorer's own tree of the vault open

- `fromDisk` (`src/tui/workspace/explorer/explorer-disk.ts:42`): `readdirSync` of the view's folder and of each one
  unfolded under it, at every build of the tree, with the walk's filter asked of each entry (a `.gitignore` read, a
  busy name's folder listed for a note: `holdsNotes`).
- `Marks.factsOf` (`src/tui/workspace/explorer/marks.ts:290`), each row not listed by a listing thread: `lstat`,
  `existsSync`, an access check and a `stat` for a note's size; for a vault's row, its key (a `realpath`), its branch
  (git's `HEAD`) and whether its index is in the cache folder.
- `Navigation.keepToWhatsThere` (`src/tui/workspace/explorer/navigation.ts:214`): a `stat` of the view and of the
  trail at every build of the tree (`explorer.ts:243`).
- `folderUnreadable` (`src/core/foundation/platform/fsutil.ts:347`): a folder checked when you zoom into it
  (`navigation.ts:88`), unfold it (`actions/items.ts:279`) or open slipbox on it (`app/runtime/startup.ts:69`).

### 6. slipbox's own folders

Under home by default (XDG's), so a home on a network share is a slow disk for each: the activity file every quarter
second (§ 2), the config's stamps every second (§ 2), the index and home's walk kept (`index.json`, `walk.json`) at
every build (§ 3), the positions and the session at a vault gone into (`PositionStore`, `Session`), the machine's
lists (`registry.ts`, `folders.ts`) and the background index's place (`autoindex.json`) as the background index
records what it found, and the answers kept for links followed (`links.json`, read again when its mtime moved).

### 7. The start

`prepare` (`src/tui/shell/terminal/run.ts:62`) builds a vault's graph (`openGraph`, `:115`: the walk and the index)
before the screen is taken; home's graph is built as the screen comes up (`Vaults.ask` → `Graph.askFolders` →
`homeWalk`), with the folders its tabs are in.

### 8. Drawing a note, and the Problems panel (not in #46)

What a note's layout asks of the disk as it's drawn: a `/…` link checked for its first folder (`existsSync`,
`src/core/workspace/graph/graph-resolve.ts:298`); a link into a nested vault statted (`graph-lookup.ts:249`); on a
disk that folds case (macOS's), a name's case found by listing each folder on its way (`onDisk`,
`src/core/workspace/links/links.ts:264`); a picture's file statted and read (`src/tui/documents/media/images.ts:93`,
`:101`). And the Problems panel, given the vault's lint findings, reads and parses each file they name, once
(`src/tui/documents/diagnostics/problems.ts:83`).

## Approach

The rules, each a decision, agreed or proposed as § Decisions says:

- **Where reads go (SD-D2).** The two listing threads T12 made become *the disk threads*: one pool, light (no index,
  no parser), each slot's worker started on its first request, one line, a request going to a thread once one is free
  — so never behind a folder that doesn't answer while the other is free. They take every read below, as requests:
  `list` (as now), `stat` (a batch of paths), `read` (a file's text, decoded as `readText` decodes it, with its
  stamp), `access` (a folder's), `walk` (the vault open's walk, for a build). A long request (a walk) holds one thread
  at most, so a short one never waits behind it. The walk's thread keeps the background work it has.
- **Nobody asked: nothing waits (SD-D3).** A read on a timer or in the background never holds a key: the screen's
  thread keeps what it last knew (the watcher's stamps, the graph, the tree, a note's text) and shows it, marked where
  you'd act on it: the background task's row for a build (`reading the vault…`), T12's `listing…` for a folder not
  listed yet.
- **A key's own read (SD-D4).** Opening a note, zooming into a folder, a reload by hand: the read goes to a disk
  thread; the key waits for it, and the keys after it wait their turn (`Input.handleKey`'s line), as they wait for a
  big note's parse (D120); the screen draws, `reading <note>…` where the note will be; `esc` gives it up.
- **Every answer checked (SD-D5).** Each request carries what it was asked under — the watcher's `sync`s, the graph's
  `builds`, the vault open, a buffer's version and stamp, the tree's settings — and an answer whose world moved is
  dropped, or asked again, as `Graph.builds` and `Listings.answered` do now. What changed in the graph while a build
  was read is applied again over it, as home's refresh does (`homeBuilt`'s `since`).
- **Deadlines (SD-D6).** A request that doesn't answer in time is given up on, its thread started afresh, and never
  made on the screen's thread instead: a look or a key's read a minute, a walk ten (T12's); `SLIPBOX_SLOW_DISK`'s
  third shortens them all.
- **Writes stay (SD-D7).** A note's save, a file operation (with the checks its guards make before writing), the
  scratch and an export are written on the screen's thread, as now.
- **The watcher stays, its reads go (SD-D8).** The watcher's state and logic stay on the screen's thread; each look
  asks one batch of the disk threads and compares the answer with what's known when it comes; a look whose answer
  hasn't come asks nothing new.
- **The screen first (SD-D9).** The start takes the screen, then reads the vault: its note waits for its graph
  (`reading the vault…`), as a big note waits for its parse; `q` quits meanwhile.
- **The tests' seam (SD-D10).** Every read moved goes through one module, which the stand-in (`SLIPBOX_SLOW_DISK`) and
  the tests' hold (`Hold`) reach on every thread; a test's App reads on the screen's thread unless asked, as T12's
  listings do (`AppOptions.listOffThread`).

By area:

- **§ 1, the watcher's look** (SD-T3): one batch per tick on a disk thread — the folders' stamps, the `.gitignore`s',
  the followed notes', the polled folders' listings — and the sweep in slices, carried on from where it was when the
  next is due. The relisting and the settle by stat asked there too; the batch delivered when they answer. Shown:
  nothing (the last look stands). Not answering: `⚠ disk not answering` on the status line, said once in Messages,
  looked at again a minute later. The registration's stamps come from the walk (`Graph.dirStamps`, made on the
  thread) or are asked there; the registration itself stays.
- **§ 2, the TUI's look** (SD-T4): the open files' stamps, the config's and git's `HEAD` asked of a disk thread in
  one request a second; the activity file's stamp with them, not every quarter second on its own. Shown: nothing.
- **§ 4, opening a note** (SD-T5): SD-D4's rule; `vaultOf` and `lockedSaid` answered with the read. A list's preview
  reads on the thread without holding the keys: `reading…` in the preview until it comes.
- **§ 4, a changed note and the background parse** (SD-T6): the text read on a disk thread, parsed here as now
  (`extractText` from the text given); the background parse reads ahead of its slice and parses what came.
- **§ 5, the explorer's own tree** (SD-T7): the vault's own folders listed through `Listings` like the others, the
  walk's filter's verdict on each entry made on the thread; its rows' marks from their listings
  (`Marks.listedFacts`); the view's and the trail's stat asked there; a zoom's check SD-D4's.
- **§ 3, the vault built again** (SD-T8): the walk and the index's read on a disk thread (`walk`), the graph kept as
  it was meanwhile; the answer taken only while `builds` and the vault open haven't moved, the watcher's changes since
  applied again over it.
- **§ 6, slipbox's own folders** (SD-T9): what's read of them on a timer or at a switch, on a disk thread; their
  writes stay (SD-D7, question 4).
- **§ 7, the start** (SD-T10): SD-D9.
- **§ 8, drawing a note** (SD-T11): the answers a layout needs kept and asked of a disk thread; in this workstream as
  its last code task, measured first (question 6).

## Tasks

In order, most felt first: SD-T1 and SD-T2 first, which everything uses; then SD-T3 and SD-T4, the looks that freeze
the screen every second or two whatever you do, and SD-T5, opening a note; SD-T6 to SD-T9 after them, any order;
SD-T10 after SD-T5 and SD-T8; SD-T11 last of the code; SD-T12 at the end. Each is shippable alone: its own pull
request into `dev`, its test, its terminal check, its design text.

- [SD-T1](tasks/seam.md): every read the workstream moves through one seam the stand-in and the hold reach. `todo`
- [SD-T2](tasks/disk-threads.md): the listing threads become the disk threads: stat, read, access, walk. `todo`
- [SD-T3](tasks/watcher-look.md): the watcher's look every two seconds, and its settle, on the disk threads. `todo`
- [SD-T4](tasks/tui-look.md): the TUI's look every second (open files, config, HEAD) and the activity file. `todo`
- [SD-T5](tasks/opening-a-note.md): a note opened reads on a disk thread; the key waits, `esc` gives it up. `todo`
- [SD-T6](tasks/note-text.md): a changed note's text, and the background parse's, read on the disk threads. `todo`
- [SD-T7](tasks/explorer-tree.md): the explorer's own tree of the vault open listed and marked off the thread. `todo`
- [SD-T8](tasks/rebuilds.md): the vault open built again from a walk and an index read on a disk thread. `todo`
- [SD-T9](tasks/own-folders.md): slipbox's own state, cache and config folders read off the thread. `todo`
- [SD-T10](tasks/start.md): the start takes the screen first, then reads the vault. `todo`
- [SD-T11](tasks/drawing.md): what drawing a note reads: links' targets, pictures, the Problems' notes. `todo`
- [SD-T12](tasks/docs.md): the user docs, the design consolidated, the workstream closed. `todo`

## Decisions

In [decisions.md](decisions.md). Agreed on 2026-11-09, by the answers below:

- **SD-D2**, one pool: the listing threads become the disk threads; a walk holds one of them at most (question 1).
- **SD-D3**, nobody asked, nothing waits: the screen's thread keeps what it knew, marked where you act on it
  (question 3).
- **SD-D4**, a key's own read: the key waits, the screen draws, `esc` gives it up (question 2).
- **SD-D6**, deadlines: a look or a key's read a minute, a walk or a listing ten; never done on the screen's thread
  instead (question 7).
- **SD-D7**, writes stay on the screen's thread: saves, file operations, the scratch, exports (question 4).
- **SD-D9**, the start takes the screen first; its note waits for the graph (question 5).

Still proposed, no question having asked them:

- **SD-D1**, the parts and their order: the inventory above, moved in the tasks' order; what stays named. Its last
  part is settled (question 6: what drawing a note reads is in, as the last code task); the order and what stays out
  aren't.
- **SD-D5**, every answer checked against what it was asked under; changes meanwhile applied again.
- **SD-D8**, the watcher's state and logic stay; its reads go, one batch per look.
- **SD-D10**, one seam for the tests; a test's App reads here unless asked.

## Test strategy

- **Held, never timed** (design/testing.md § The terminal tests, "A slow disk, stood in for"; #75). Each moved read
  gets a unit test in its feature's file: a folder named `held` on the way of what's read, held by `Hold` on every
  thread — the screen's thread's reads through the seam too (SD-T1), so the code as it was waits on it. The test
  sets off the read (a look, a key, a build); while `held.waiting` is at least one, a key (`ctrl+p`) is handled and
  its frame drawn; the hold is let go, and what the read was for arrives (a change seen, the note opened, the rows
  listed, the graph built); `held.gaveUp` is 0. No clock: what went on is told by what's still held.
- **Fails without the fix.** Each test is checked by putting its read back on the screen's thread once: the key is
  then handled only after the hold gives up (`gaveUp` 1, its frame late), and the test fails.
- **Races, one test each.** The hold let go after the world moved — a `sync`, a build, the vault left, the tab
  closed, the note typed into, the settings changed — and the answer dropped or asked again, never applied.
- **Giving up.** The hold kept past a deadline shortened for the test (`setWalkWorker`'s deadlines, as T12's tests
  do): said, never read on the screen's thread instead, asked again later.
- **Terminal checks.** `tests/terminal/checks/slow-disk.ts` gains a check per task (`slow disk: …`), with the stand-in
  reaching stats and reads (SD-T1): keys pressed while a slow folder is read, each answered within a bound short of
  the folder's time (design/testing.md § The terminal tests), then what the read was for on the screen. Listed for
  the maintainer's approval before they run (D207); CI runs them on Linux and macOS.
- **Live.** Each task tried live on a FUSE mount that answers slowly, on Linux, as T12 was (the longest stall of the
  screen's thread, before and after, in the task's log); macOS has no FUSE of its own, so the stand-in alone there.
- **What stays.** The watcher's, the explorer's, the vaults' and the CLI's tests pass unchanged.

## Risks

- **An answer older than the state it lands in.** A look's stamps read before a save of ours, a build's walk before
  the watcher's batch, a note's text before you typed into it. SD-D5's generations and replay answer each; every one
  gets a race test. The subtle one: a save while a look is out. The look's stamp is the save's or the one before;
  either way the own-write stamp (`noteOwnWrite`) decides, as now, but only if it's compared when the answer comes,
  not when it was asked.
- **Memory (#56).** No new worker idles: the disk threads are T12's listing threads, each slot started on its first
  request; but the watcher's look starts one in every session, where the listings start one only when the explorer
  lists outside the vault, and a second starts whenever two requests overlap. SD-T2 measures one and two started
  (T12 measured the walk's thread at 16 to 52 MB of RSS; a listing thread is lighter) and records it on #56.
- **What crosses between threads.** A vault's walk and its index, sent across whole, cost the screen's thread to take
  in: T12 measured a 50 ms gap when home's walk of 10,000 notes crossed twice, and kept it on the walk's thread. A
  build's walk must cross once (the graph is here); SD-T8 measures it, and sends the index as its text if that's
  cheaper.
- **A thread a disk never lets go.** On a hard NFS mount a read can wait in the kernel for good; ending the worker
  can't end that read. `WorkerRequests` lets go of it and starts another (*memory*: the old thread stays until the
  disk answers). A disk that never answers is asked again only a minute later, so threads leak at most one a minute
  while it's gone.
- **macOS and Linux.** macOS's watcher drops events for a moment whenever a watch is added or removed, which the look
  makes up for (design/tui.md § Bun's watcher): a look that answers late makes up for them late, never not at all.
  Case-folding lookups (`onDisk`) run on macOS alone. A registration on a hung mount (inotify's on Linux, FSEvents'
  on macOS) stays on the screen's thread. The stand-in behaves the same on both; a real slow disk is tried on Linux.
- **The tests' App and the TUI part ways.** A test's App reading on the screen's thread (SD-D10) keeps the suite's
  thousands of tests as they are, but they then don't run the shipped path: each moved read's own tests and the
  terminal checks do (T12 made the same choice).

## Questions answered

The maintainer answered each on 2026-11-09 with the option recommended, (a) in every one. A task's own questions stay
in its file: SD-T8's, on a rename's and a folder operation's build, is asked when it starts.

1. **Which threads read for the screen?** (a) The listing threads become the disk threads, one pool for every read of
   the vault open, a walk holding one at most (recommended: no new worker, one set of deadlines, already never behind
   a folder that doesn't answer); (b) a thread per feature — the watcher's, the vault's, the listings' (each its own
   heap, against #56); (c) the runtime's own asynchronous reads (`fs.promises`, as the followed links' probe does):
   no worker, but a read a hung disk never answers keeps one of the runtime's threads for good, can't be given up on
   per request, and the walk's code is synchronous, shared with the CLI.

   **Answered: (a)**, one pool: the listing threads become the disk threads, a walk holding one at most (SD-D2).

2. **When you open a note on a slow disk, what do the keys do?** (a) They wait for it, the screen drawing
   `reading <note>…`, `esc` giving it up (recommended: what you type lands in the note you opened, as with a big
   note's parse, D120); (b) they act on the window you were in until it's read, the tab appearing then; (c) as now,
   the screen stopped until it's read.

   **Answered: (a)**, the keys wait, `reading <note>…` drawn, `esc` giving it up (SD-D4).

3. **While the vault is built again, what does the screen show?** (a) Everything as it was, a background task's row
   saying `reading the vault…` (recommended: links, backlinks and the tree stay usable); (b) the explorer and
   backlinks emptied until it's built; (c) as now, the screen stopped.

   **Answered: (a)**, everything as it was, a background task's row saying `reading the vault…` (SD-D3).

4. **Should anything slipbox writes move off the screen's thread?** (a) Nothing in this workstream: saves, file
   operations, the scratch, exports and slipbox's own state are written as now, a save's cost on a slow disk said as
   a limit (recommended: a write's order against the watcher and a quit is what keeps a note safe; asynchronous saves
   are the roadmap's Later item on gateway execution); (b) slipbox's own state written on a timer (what you're
   reading, positions, the index) moves to a disk thread, notes' saves stay; (c) everything, saves included.

   **Answered: (a)**, nothing in this workstream; a save on a slow disk is a known limit (SD-D7).

5. **What does the start show while it reads the vault?** (a) The screen at once, the note waiting for its graph
   (`reading the vault…`), `q` quitting (recommended: no half-drawn note, its links checked when it's drawn); (b) the
   screen at once, the note drawn at once, its links drawn unchecked (dim) until the graph comes; (c) as now, nothing
   on the screen until the vault is read.

   **Answered: (a)**, the screen at once, the note waiting for its graph, `q` quitting (SD-D9).

6. **Is what drawing a note reads this workstream's?** (a) Yes, as its last code task, after measuring how often it
   reads a slow disk (recommended: a picture or a `/…` link on a share stops every frame that draws it); (b) a
   follow-up issue, this workstream ending at the start.

   **Answered: (a)**, yes, as the last code task, measured first (SD-T11; SD-D1's last part).

7. **A deadline for a look and for a key's read: how long?** (a) A minute each, a walk ten as T12's (recommended: a
   look is due every two seconds and stale long before a minute, and a person waiting on a note gives up before it
   with `esc`); (b) five minutes, as a slice of home's walk; (c) three seconds, as a followed link's probe (VV-D6),
   which a share waking up can miss.

   **Answered: (a)**, a minute for a look and a key's read, ten for a walk and a listing (SD-D6).
