---
status: active
created: "2026-11-09"
---

# SD: A slow disk never freezes the screen

Issue #46. T12 (#9) moved the TUI's own walks, the background index's indexing and the explorer's listings outside
the vault open off the screen's thread, onto the walk's thread and two listing threads. Everything else that reads the
vault open's disk, or slipbox's own folders under home, still reads it on the screen's thread: on a network share, a
drive asleep or a FUSE mount that answers slowly, the screen and the keys stop for as long as each read takes, every
two seconds while the watcher looks. This workstream moves those reads off it.

**Agreed on 2026-11-09; being built.** The maintainer answered its seven questions that day, each with the
option recommended (§ Questions answered), and agreed its other decisions as proposed; the questions its tasks had
left open were decided with the recommendation, by the maintainer's instruction to take the recommended answer
(§ Decisions). Reviewed on 2026-11-10: the inventory grew, and the review's choices are recorded as notes under the
decisions they change and as SD-D13 and SD-D14. SD-T1, the seam, SD-T2, the disk threads, and SD-T3, the watcher's
look, are done (2026-11-10); the other tasks are `todo`.

- [requirements.md](requirements.md): its goals, what it builds on, its acceptance criteria, its change to the root's
  requirements.
- [design.md](design.md): its changes to the root's design.
- [decisions.md](decisions.md): SD-D1 to SD-D14, agreed on 2026-11-09 and 2026-11-10.
- [tasks/](tasks/README.md): SD-T1 to SD-T12, in order: SD-T1 to SD-T3 `done`, the rest `todo`.
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

Each read was checked against `dev` at `0df9a0a6` (2026-11-09), and again at `9912f519` after the review
(2026-11-10). The issue named files before the code was organized:
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
- each entry those listings and the settle find, asked of the walk's rules as the walk asks them **(not in #46)**:
  the filter (`WalkFilter.exclusion`, `src/core/workspace/walk/filtering/filter.ts:162`: a nested vault's marker
  looked for, `:176`, `:188`; a busy folder statted and listed for a note at its top, `notesIn`, `:223`, `:229`; a
  `.gitignore` read, `gitignoreFor`, `:273`), a link's verdict (`WatchDirectories.symlinkKept` → `symlinkVerdict`,
  `src/core/workspace/walk/traversal/symlinks.ts:29`: a `realpath` and a `stat`, `:32`, `:38`), and where a note that
  went has gone (`WatchReconciliation.movedTo`, `watch/reconciliation.ts:24`, from `watch.ts:331`: each candidate
  statted, `existsSync`, each folder it may be in listed, `:34`, `:64`, `:72`);
- registering a folder (`WatchDirectories.watchDir`, `watch/directories.ts:124`), at the start and at each `sync`
  after a build: two `stat`s per folder (its `.gitignore`'s, `startStamp`'s); a folder that came (`adoptTree`) listed
  with all it holds **(not in #46)**.

The batch then goes to `VaultFeed.receive` (an `existsSync` of git's `index.lock`) and `applyToGraph`
(`src/core/workspace/vaults/vault-feed.ts:29`): a `stat` per changed note, and its text read and parsed (§ 4).

### 2. The TUI's look, every second, and the background index's, every quarter second

`Watch.startPolling` (`src/tui/app/runtime/watch.ts:204`), every second:

- `Watch.poll` (`watch.ts:232`): a `stat` of each open file no watcher sees (`NoteBuffer.changedOnDisk`,
  `src/tui/documents/buffers/buffer.ts:271`): the scratch, a reached file, one of home's skip list; all of them when
  the watcher is degraded; and after every build, every open file (`Watch.rebuilt` → `poll(true)`). Each one's way
  checked first for a link not followed (`following.blocked` → `unfollowedLink`, `watch.ts:244`,
  `src/core/workspace/vaults/symlinks.ts:297`: an `lstat` of each folder on its way, `:310`) **(not in #46)**. One
  changed is read again (`reloadBuffer` → `NoteBuffer.load`, § 4);
- `Settings.changedOnDisk` (`src/tui/app/settings/settings.ts:188`): a `stat` of your config and the vault's
  `.slipbox/config.toml`; one moved, both read and parsed again (`Settings.reload`, `:198` → `loadConfig`, from
  `watch.ts:210`) **(not in #46)**;
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

- a reindex (`vault.reindex`, `src/tui/actions/workspace/actions-files.ts:95`);
- the watcher's rescan (`applyToGraph`'s `rescan`, `vault-feed.ts:38`; a `.gitignore` changed, HEAD moved on its
  branch with renames);
- a setting of the walk changed (`settings.ts:244`);
- a vault gone into (`Vaults.switchVault` → `Vaults.ask` → `Graph.askFolders`, `src/tui/workspace/vaults/vaults.ts:91`);
- a branch's tabs brought back in home (`Vaults.askTabs`, `vaults.ts:103`);
- a rename or move that takes vaults or the vault's own config with it (`src/tui/workspace/explorer/renaming.ts:206`,
  `:220`), and a folder moved or deleted (`src/core/workspace/mutations/files.ts:102`, `:148`;
  `mutations/rename/rename-apply.ts:319`, `:421`).

Home's refresh after its walk on the thread (`GraphRefresh.homeBuilt`, `graph-refresh.ts:295`) is given the walk,
but still reads the index and its stamp here.

### 4. A note's text read

- **The background parse** (`parseInSlices`, `graph-refresh.ts:44`): a big note's text read here before and after
  its parse on the parse threads, and `Graph.parseSome` (`refresh.ts:356`) → `entry` → `extractNote`, reading each
  small note's text in twelve-millisecond slices; one read can't be cut short. The index written at its end
  (`writeCache`, `refresh.ts:384`).
- **A changed note**: the watcher's batch (`applyToGraph` → `Graph.updateFile` → `extractNote`,
  `src/core/workspace/graph/feed.ts:73`); an open one reloaded (`Watch.reloadBuffer`, `watch.ts:409` →
  `NoteBuffer.load`, `buffer.ts:230`); before that, since `9912f519`, an open one the batch names checked against what
  it holds (`asRead`, `src/tui/app/runtime/watch.ts:457`, from `:386`: a `stat` and its whole text read), after an
  `existsSync` of it (`:383`).
- **Opening it**: `Opening.buffer` (`src/tui/documents/buffers/opening.ts:106`): `NoteBuffer.load` (its text, its
  stamp), `lockedSaid` (an access check), `vaultOf` (each folder above it asked for a marker), its way checked for a
  link not followed (`following.blocked`, `lookedAt`: `opening.ts:124`, `:150` → `unfollowedLink`) **(not in #46)**,
  and `:e!` and a reload by hand (`actions-edit.ts:259`, `saving.ts:140`); a list's preview
  (`src/tui/shell/overlays/preview.ts:115`) and a peek (`peek/opening.ts:69`) the same.
- **On demand**: `Graph.entry` parses a note not parsed yet when a backlink, hover or completion asks for it, and
  `ensureAll` (`refresh.ts:369`) every one when the tags, the problems, the link forms or a note's backlinks are asked
  of the graph here (`src/core/workspace/graph/graph.ts:469`, `:483`, `:492`, `:515`); `reachFile` (`refresh.ts:278`)
  reads a folder to find a name's case (`onDisk`) and stats the file.

### 5. The explorer's own tree of the vault open

- `fromDisk` (`src/tui/workspace/explorer/explorer-disk.ts:42`): `readdirSync` of the view's folder and of each one
  unfolded under it, at every build of the tree, with the walk's filter asked of each entry (a `.gitignore` read, a
  busy name's folder listed for a note: `holdsNotes`).
- `Marks.factsOf` (`src/tui/workspace/explorer/marks.ts:290`), each row not listed by a listing thread: `lstat`,
  `existsSync`, an access check and a `stat` for a note's size; for a vault's row, its key (a `realpath`), its branch
  (git's `HEAD`) and whether its index is in the cache folder.
- `Navigation.keepToWhatsThere` (`src/tui/workspace/explorer/navigation.ts:214`): a `stat` of the view and of the
  trail at every build of the tree (`explorer.ts:253`).
- The nested vaults' names (`rows/tree.ts:177` → `rootRows`, `:38` → `Paths.rootName` → `vaultName`,
  `src/core/workspace/walk/listing.ts:83`: the nested vault's config read and its checkout looked for), and in
  Elsewhere its top listed (`tree.ts:49`), at every build of the tree **(not in #46)**.
- `Paths.leftOut` (`src/tui/workspace/explorer/rows/paths.ts:55`): a `stat` of the path (`:69`) and the walk's filter
  asked of each folder on its way, for each row's path (`rowPath`, `:38`) and the tree's top (`leftOutAt`,
  `tree.ts:27`) **(not in #46)**.
- `folderUnreadable` (`src/core/foundation/platform/fsutil.ts:347`): a folder checked when you zoom into it
  (`navigation.ts:88`), unfold it (`actions/items.ts:279`) or open slipbox on it (`app/runtime/startup.ts:69`).

### 6. slipbox's own folders

Under home by default (XDG's), so a home on a network share is a slow disk for each: the activity file every quarter
second (§ 2), the config's stamps every second (§ 2), the index and home's walk kept (`index.json`, `walk.json`) at
every build (§ 3), the positions and the session at a vault gone into (`PositionStore`, `Session`), the machine's
lists (`registry.ts`, `folders.ts`) and the background index's place (`autoindex.json`) as the background index
records what it found, and the answers kept for links followed (`links.json`, read again when its mtime moved).
Link completion reads the machine's list (`readRoots`), looks for each other vault's folder (`existsSync`) and reads
its index whole (`index.json`), once per completion (`src/tui/documents/editing/completion/items.ts:50`–`:55`)
**(not in #46)**.

Not § 6's, and kept: the upgrade check every ten seconds (`src/tui/app/distribution/update-observation.ts:71` →
`lookUnderneath` → `currentVersion`, `src/core/application/distribution/install.ts:25`: a `readlink` of the
installer's `current`) reads slipbox's data folder, where its versions are, not the vault or its state, cache or
config. It stays on the screen's thread, said as a known limit (SD-D1, note of 2026-11-10) **(not in #46)**.

### 7. The start

`prepare` (`src/tui/shell/terminal/run.ts:62`) builds a vault's graph (`openGraph`, `:115`: the walk and the index)
before the screen is taken; home's graph is built as the screen comes up (`Vaults.ask` → `Graph.askFolders` →
`homeWalk`), with the folders its tabs are in.

### 8. What's drawn (not in #46)

What a note's layout asks of the disk as it's drawn: a `/…` link checked for its first folder (`existsSync`,
`src/core/workspace/graph/graph-resolve.ts:298`); a link into a nested vault statted (`graph-lookup.ts:249`); on a
disk that folds case (macOS's), a name's case found by listing each folder on its way (`onDisk`,
`src/core/workspace/links/links.ts:264`); a picture's file statted and read (`src/tui/documents/media/images.ts:93`,
`:101`). And the Problems panel, given the vault's lint findings, reads and parses each file they name, once
(`src/tui/documents/diagnostics/problems.ts:83`).

What the bars and panels read as they're drawn, every frame for the top bar:

- **Git's state.** The top bar's where you are (`src/tui/shell/screen/topbar/where.ts:22`, `:23`): `Git.branch` →
  `headOf` (`src/core/workspace/git/git.ts:85`: a `stat` of `HEAD`, read when it moved), and `operationStatus` →
  `operationNow` → `operationOf` (`src/core/workspace/git/branches/gitrebase.ts:82`: git's rebase folders and
  `MERGE_HEAD` and the like looked for and read, at most every half second or when git's news came,
  `operation-status.ts:15`). The git panel's head and standing the same (`views/panel/draw-git.ts:73`, `:132`).
- **Counts of every note.** The Problems tab's title (`draw-problems.ts:31` → `Problems.count`, `problems.ts:320` →
  `graph.problems`), and the Info panel's backlinks (`src/tui/documents/tools/info/info.ts:180`) and convention
  (`:190` → `conventionOf` → `linkForms`, `src/core/workspace/links/convention.ts:180`): `ensureAll`, every note not
  parsed yet read (§ 4). The convention also reads Obsidian's or zk's settings (`toolSays`, `convention.ts:112`).
- **The scratch's places.** Each `At:` place checked as the scratch is drawn (`problems.ts:154` → `Scratch.places`,
  `src/tui/app/scratch/scratch.ts:35`: its file statted and read, `:42`, `:51`), again every two seconds at most.

### 9. A key's other reads (not in #46)

- **Link completion**: the convention's tool settings (`toolSays`, as above) and other vaults' notes (§ 6).
- **Git's keys**: before each git read, `beginGitRead` (`src/tui/workspace/git/gitquery.ts:7`: a `stat` of git's
  index, `HEAD` read, the note's `stat`, `:15`, `:22`, `:27`); and a file looked for before it's opened from the git
  panel, a merge or the log (`existsSync`: `src/tui/workspace/git/git.ts:254`, `:371`, `:439`;
  `views/panel/gitview.ts:307`, `:317`; `views/log/log.ts:162`).

## Approach

The rules, each an agreed decision:

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
  made on the screen's thread instead. Its deadline is set by what asked, not by its kind: whatever a look asks (a
  `stat` or a `list`) and a key's read a minute; the explorer's listings and a walk ten (T12's); `SLIPBOX_SLOW_DISK`'s
  third shortens them all.
- **Writes stay (SD-D7).** A note's save, a file operation (with the checks its guards make before writing), the
  scratch and an export are written on the screen's thread, as now.
- **The watcher stays, its reads go (SD-D8).** The watcher's state and logic stay on the screen's thread; each look
  asks its reads of the disk threads — its stats a hundred a request, a `list` request of each folder it lists — and
  compares each answer with what's known when it comes; a look whose answer hasn't come asks nothing new. Each
  entry's verdict (the filter's, a link's) is made with its listing, on the listing's thread.
- **The screen first (SD-D9).** The start takes the screen, then reads the vault: its note waits for its graph
  (`reading the vault…`), as a big note waits for its parse; `q` quits meanwhile.
- **The tests' seam (SD-D10).** Every read moved goes through one module, which the stand-in (`SLIPBOX_SLOW_DISK`) and
  the tests' hold (`Hold`) reach on every thread; a test's App reads on the screen's thread unless asked, as T12's
  listings do (`AppOptions.listOffThread`).
- **What's drawn is kept (SD-D13).** A draw never reads the disk and never waits: git's `HEAD` and the operation under
  way are kept, the look each second bringing them up to date; a count of every note is of what's parsed so far,
  marked as partial while notes are unread, and drawn again when the parse is done.
- **Terminal checks before a merge (SD-D14).** Pull requests skip the terminal job (D266), so before each task's pull
  request merges, the terminal checks it reaches run locally, listed for approval first (D207), beside its unit tests.

By area:

- **§ 1, the watcher's look** (SD-T3): each tick on a disk thread, a hundred stats a request, each taken as it answers
  — the folders' stamps, the `.gitignore`s', the followed notes'; the polled folders' listings in a request of their
  own — and the sweep in slices, carried on from where it was when the next is due. The relisting and the settle by
  stat asked there too, each entry's verdict and a move's search with them; the batch delivered when they answer.
  Shown: nothing (the last look stands). Not answering: `⚠ disk not answering` on the status line, said once in
  Messages, looked at again a minute later. The registration's stamps are asked there and compared with the walk's
  (`Graph.dirStamps`, made on the thread) when they come; the registration itself stays.
- **§ 2, the TUI's look** (SD-T4): the open files' stamps and their ways' links, the config's and git's `HEAD` and
  operation asked of a disk thread in one request a second, the config and the tool's settings read again there when
  they moved; the activity file's stamp with them, not every quarter second on its own. What's drawn of git (§ 8)
  reads what this look last found (SD-D13). Shown: nothing. Not answering: said once in Messages, beside the
  watcher's, looked at again a minute later; the status line's indicator is the watcher's (§ 1).
- **§ 4, opening a note** (SD-T5): SD-D4's rule; `vaultOf`, `lockedSaid` and the way's links answered with the read.
  A list's preview reads on the thread without holding the keys: `reading…` in the preview until it comes. Git's keys
  (§ 9) ask their stats and a file's presence the same way.
- **§ 4, a changed note and the background parse** (SD-T6): the text read on a disk thread, parsed here as now
  (`extractText` from the text given), `asRead`'s check with it; the background parse reads ahead of its slice and
  parses what came. What's drawn of every note counts what's parsed, marked partial (§ 8, SD-D12).
- **§ 5, the explorer's own tree** (SD-T7): the vault's own folders listed through `Listings` like the others, the
  walk's filter's verdict on each entry made on the thread; its rows' marks from their listings
  (`Marks.listedFacts`), the nested vaults' names and what's left out with them; the view's and the trail's stat
  asked there; a zoom's check SD-D4's.
- **§ 3, the vault built again** (SD-T8): the walk and the index's read on a disk thread (`walk`), the graph kept as
  it was meanwhile; the answer taken only while `builds` and the vault open haven't moved, the watcher's changes since
  applied again over it.
- **§ 6, slipbox's own folders** (SD-T9): what's read of them on a timer or at a switch, and completion's other
  vaults, on a disk thread; their writes stay (SD-D7, question 4). The upgrade check stays, a known limit.
- **§ 7, the start** (SD-T10): SD-D9.
- **§ 8, what's drawn** (SD-T11; git's state SD-T4's, the counts SD-T6's): the answers a layout needs, and the
  scratch's places, kept and asked of a disk thread; in this workstream as its last code task, measured first
  (question 6).
- **§ 9, a key's other reads**: completion's in SD-T9 (other vaults) and SD-T4 (the tool's settings, kept); git's keys
  in SD-T5.

## Tasks

In SD-D1's order, most felt first: SD-T1, then SD-T2, which everything uses; then SD-T3, SD-T4 and SD-T5, the looks
that freeze the screen every second or two whatever you do and opening a note, in any order; then SD-T6 to SD-T9, in
any order; SD-T10 once SD-T5 and SD-T8 are in; SD-T11 last of the code; SD-T12 at the end. Each task's `blocked_by`
says the same. Each is shippable alone: its own pull request into `dev`, its test, its terminal check run before it
merges (SD-D14), its design text.

- [SD-T1](tasks/archive/seam.md): every read the workstream moves through one seam the stand-in and the hold reach.
  `done`
- [SD-T2](tasks/archive/disk-threads.md): the listing threads become the disk threads: stat, read, access, walk.
  `done`
- [SD-T3](tasks/archive/watcher-look.md): the watcher's look every two seconds, and its settle, on the disk threads.
  `done`
- [SD-T4](tasks/archive/tui-look.md): the TUI's look every second, what's drawn of git, and the activity file.
  `done`
- [SD-T5](tasks/opening-a-note.md): a note opened reads on a disk thread; the key waits, `esc` gives it up. `todo`
- [SD-T6](tasks/note-text.md): a changed note's text, and the background parse's, read on the disk threads. `todo`
- [SD-T7](tasks/explorer-tree.md): the explorer's own tree of the vault open listed and marked off the thread. `todo`
- [SD-T8](tasks/rebuilds.md): the vault open built again from a walk and an index read on a disk thread. `todo`
- [SD-T9](tasks/own-folders.md): slipbox's own state, cache and config folders read off the thread. `todo`
- [SD-T10](tasks/start.md): the start takes the screen first, then reads the vault. `todo`
- [SD-T11](tasks/drawing.md): what drawing reads: links' targets, pictures, the scratch's places, the Problems'. `todo`
- [SD-T12](tasks/docs.md): the user docs, the design consolidated, the workstream closed. `todo`

## Decisions

In [decisions.md](decisions.md), all agreed on 2026-11-09. By the answers below:

- **SD-D2**, one pool: the listing threads become the disk threads; a walk holds one of them at most (question 1).
- **SD-D3**, nobody asked, nothing waits: the screen's thread keeps what it knew, marked where you act on it
  (question 3).
- **SD-D4**, a key's own read: the key waits, the screen draws, `esc` gives it up (question 2).
- **SD-D6**, deadlines: a look or a key's read a minute, a walk or a listing ten; never done on the screen's thread
  instead (question 7).
- **SD-D7**, writes stay on the screen's thread: saves, file operations, the scratch, exports (question 4).
- **SD-D9**, the start takes the screen first; its note waits for the graph (question 5).

By the maintainer, as proposed:

- **SD-D1**, the parts and their order: the inventory above, moved in the tasks' order; what stays named; what
  drawing a note reads last (question 6).
- **SD-D5**, every answer checked against what it was asked under; changes meanwhile applied again.
- **SD-D8**, the watcher's state and logic stay; its reads go, a look's stats a hundred a request.
- **SD-D10**, one seam for the tests; a test's App reads here unless asked.

By the maintainer's instruction to take the recommended answer, for the questions the tasks had left open:

- **SD-D11**, a rename's or a folder operation's build: on a disk thread, the keys after it waiting as after an open;
  the write stays on the screen's thread, and `esc` doesn't give the build up.
- **SD-D12**, the rest, one line each, each said in its task: a boundary check for the seam; the stand-in's stat and
  read delay apart from its listing's; two disk threads, the idle one let go of after a minute; the sweep a hundred
  notes a request; git's lock asked on its own; a click dropped while a note is read; the tab shown first at a start;
  the parse reading a slice ahead; a key needing notes not parsed yet waiting for them; one `Listings` for every
  folder; the index sent as its text; the parse cache a known limit; a start whose vault doesn't answer showing its
  note's text; a link not checked yet drawn as resolved; pictures in SD-T11.

From the review, on 2026-11-10, by the maintainer's instruction to take the recommended answer:

- Notes under **SD-D1** (the inventory's new reads, each in its task; the upgrade check a known limit), **SD-D6** (a
  deadline set by what asked), **SD-D8** (a look's batch in the disk threads' terms; each entry's verdict made with
  its listing) and **SD-D12** (the boundary check an allow list that shrinks, and what it doesn't see; a draw needing
  every note never waits).
- **SD-D13**, what's drawn is kept: git's state from the look, counts of what's parsed marked partial.
- **SD-D14**, each task's reached terminal checks run before it merges; `CHECKS_FOR` names them.

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
  the folder's time (design/testing.md § The terminal tests), then what the read was for on the screen. CI runs them
  on Linux and macOS after a merge, not on the pull request (D266): before each task's pull request merges, the checks
  it reaches run locally (SD-D14: by the maintainer's standing go, unasked; where a task reaches every check, the
  slow-disk checks and those of the features its files touch, `dev`'s full run the rest after the merge), and the task
  adds `CHECKS_FOR` entries (`scripts/ci-scope.ts`) for the files it moves. `disk.ts` has none: every feature reads
  through it, so a change to it reaches every check.
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

The maintainer answered each on 2026-11-09 with the option recommended, (a) in every one. The tasks' own questions
were decided the same day with the recommendation (SD-D11, SD-D12): none is left open.

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
