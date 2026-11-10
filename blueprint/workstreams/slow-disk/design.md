# Design changes

Each change names the root's file and section. The text is what the design will say once the tasks are built, with
the choices the tasks had left open decided (SD-D11, SD-D12). None of it holds yet: the root's files change at
consolidation (SD-T12). A link in the text points from here to the root's file; consolidation writes it relative to
design/.

## ADDED design/tui.md § A slow disk

After § Asynchronous git reads.

What the TUI reads of the vault open's disk, and of its own state, cache and config folders, it reads off the screen's
thread, so a disk that answers slowly — a network share, a drive asleep, a FUSE mount — never stops the keys or the
screen (SD-D1). T12 moved the walks it makes by itself and the listings of folders outside the vault (design/roots.md
§ The index; § Side panes); this section is the rest. Writes stay on the screen's thread (below).

**The disk threads** (SD-D2; `DiskThreads` in `core/workspace/walk/walk-thread.ts`, served by `list-worker.ts`, what
they answer in `disk-jobs.ts`): two, light — no index, no parser — each started on its first request. A request goes to
the first thread free, in the order asked, so never behind one that doesn't answer while the other is free; a walk
takes a thread only while the other is left for the rest, and until then waits, the requests asked after it going past
it and a second walk waiting behind it. Once it has waited a look's deadline it's passed no more: it takes the next
thread free, unless the other is walking. A background request (the watcher's looks) takes a thread only while no other
background request holds one, the rest going past it meanwhile. They answer, the same code as the thread that asks
would run, through the seam
below, with what that thread knows and they can't see for themselves (`walkContext`); a path's own error is its answer,
and a request fails only when its thread does:

- `list`: a folder listed (`listFolder`, as the explorer's listings have it); for a folder of the vault open, each
  entry with the walk's filter's verdict on it (`exclusion`), made there;
- `stat`: a batch of paths, each one's kind, mtime, ctime and size, or its error's code; its links followed, or a
  link's own (`lstat`);
- `read`: a file's text, decoded as `readText` decodes it (its BOM, line endings, invalid UTF-8), with the stamp of the
  file it opened (`readTextStamped`), so a save renamed over it meanwhile is neither's; refused, as `readRegular`
  refuses, when it isn't a regular file;
- `access`: whether a folder can be listed and gone into, in `folderUnreadable`'s words;
- `walk`: the vault open's walk for a build (`walkVault`; `listDirectory` in Elsewhere; home's walk kept brought up to
  now, `homeWalk`), with its index's text and stamp.

Every read goes through one seam (`core/foundation/platform/disk.ts`): a folder's listing, a path's `stat` and
`lstat` (its real path, whether anything is there, whether you may use it: `folderUnreadable`'s), a file's bytes. The
CLI reads through it too, on its own thread. It keeps two listings apart (SD-T1). The walk's (`readFolder`: a walk, a
disk thread's `list`, the filter) takes the slow disk stood in for on every thread, the screen's too, as since T12, so
a walk put back on the screen's thread is slowed there and T12's checks see it. The rest (`entries`: the watcher's
listings, the explorer's tree; and every stat and read) takes it on every thread but the screen's, and a test's hold on
the threads it asks: the screen's thread reads those at once until a task moves them, and that task's held test takes
the hold there for them.

**Nobody asked, nothing waits** (SD-D3). A read on a timer or in the background never holds a key: what the screen's
thread last knew stays, and is shown, until the answer comes — the watcher's stamps, the graph (links, backlinks,
search), the explorer's rows, an open note's text. Where you'd act on what isn't read yet, it says so: a build's row
among the background tasks (`reading the vault…`, beside `Indexing`), `listing…` under a folder not listed yet,
`⚠ disk not answering` on the status line while the watcher's look doesn't answer.

**A key's own read** (SD-D4). Opening a note — as a tab, by a link, from a list, at the start — zooming into or
unfolding a folder, `:e!` and a reload by hand (`space n r`) read on a disk thread. The key waits, and the keys after
it wait their turn (`Input.handleKey`), as for a big note's parse (§ Known limits); the screen draws, `reading
<note>…` in the window the note will be in. `esc` is taken at once, out of turn: it gives the read up and leaves you
where you were. Past its deadline the read is said (`<note> didn't answer: not opened`), nothing opened. A list's
preview reads without holding the keys, `reading…` in the preview until it comes. A click while a read waits is
dropped, as during a big note's parse. At a start the tab shown is read first, then the rest in order, one at a time.
A key that needs notes not parsed yet — a rename's or a move's plan, the tags, the problems, the link forms, a
backlinks list — waits for their texts the same way (`reading notes…`), and nothing is planned from notes not read.
The open's check of the way for a link not followed is made with its read; git's keys ask their stats (git's index,
`HEAD`, the note's) and whether a file is there before opening it the same way.

**Every answer checked** (SD-D5). A request carries what it was read for, and its answer is taken only while that
holds: the watcher's `sync`s, the graph's `builds` and the vault open, a buffer's version and stamp, the tree's
settings, the view. Otherwise it's dropped, or asked again at once when only the settings moved. A build's answer
taken, what changed in the graph while it was out (the watcher's, slipbox's own writes, a file reached) is applied
again over it, as home's refresh does. A stamp is compared with what's known when it comes: an own write recorded
meanwhile (`noteOwnWrite`) decides.

**Deadlines** (SD-D6). A deadline is set by what asked, not by the request's kind: whatever a look asks (a `stat` or a
`list`), a key's read and a folder's check have a minute; the explorer's listings ten (T12's), a walk ten;
`SLIPBOX_SLOW_DISK`'s third part shortens them all. Each counts from when a thread is handed the request; a walk's from
when it was asked, its wait for a thread included, so it's answered or failed, never left waiting. A request past its
deadline is failed and its thread started afresh for the rest; it's never read on the screen's thread instead. The
watcher's look given up on says `⚠ disk not answering` once and is asked again a minute later; a key's read is said; a
build says `reading the vault gave up: a folder didn't answer in time` and the graph stays as it was. A look's batch —
one `stat` of every path it stats and a `list` of each folder it lists, asked together — is answered once all have;
once one gives up, it's failed: what of it still waits for a thread is withdrawn, never sent, and what of it was sent
is given up, its thread started afresh. A disk thread with nothing asked of it for a minute is let go of, and started
again on the next request: a request takes the first thread free, so while a vault is watched only the second is let
go of.

**What's read where:**

- **The watcher's look** (SD-D8, SD-T3; § Bun's watcher, and what covers its gaps). The watcher keeps its state and
  logic here, and its `fs.watch` registrations, whose events come here. Each tick asks its stats a hundred a request
  (`SLICE`), each taken as it answers — the watched folders' stamps, each with its `.gitignore`'s, and the notes
  followed into folders left to home's walk — the first with a `list` request of each polled folder; and every
  15th tick the sweep's stats of the known notes, a hundred a request, each asked when the last answers; a sweep still
  under way at the next 15th tick goes on, and none other starts. A tick whose answer hasn't come asks nothing new. A
  folder whose mtime moved is listed again there; the settle by stat (`flush`) asks its stats there too, a hundred a
  request, each settled as it answers, and where a note that went has gone (`movedTo`); the batch goes to the feed when
  they answer, events meanwhile waiting for the next. Each entry a listing finds is judged there with it, by the walk's
  filter (`exclusion`) and a link's verdict (`symlinkVerdict`), as the explorer's are
  (`core/workspace/graph/watch/judging.ts`), the filter made once on each thread and made again once the watcher's
  moves on (`WalkFilter.epoch`: a `.gitignore` seen changed, the mount table read again). A folder registered asks its
  stamps there — its own and its `.gitignore`'s, with the next look, a hundred a request — compared, when they come,
  with the walk's that found it (`Graph.dirStamps`); one that came is listed there a folder at a time, nearest first,
  each stamped as it's listed and watched as it answers. A look given up on keeps what answered before: what it settled
  is said, what it didn't, and the folders it hadn't listed, are pending again; a tick's folder gone or `.gitignore`
  changed stays seen, the folders not stamped yet are stamped by the next look, and the next tick asks every slice
  again. The watcher's logic is written as looks
  (`watch/reads.ts`), each yielding the batch it needs: one out at a time, a flush asked meanwhile made once it
  answers, the sweep a chain of its own that asks nothing while the looks are paused; the warning cleared only by an
  answer to a look asked after the pause. Its requests are the disk threads' background ones, one at a time, so a
  key's read finds the other thread (SD-D2's note of 2026-11-10). A test's watcher answers each at once, on the thread
  that asks, with the same code.
- **The TUI's look each second** (SD-T4; § External changes). One request a second: the open files no watcher sees,
  your config's and the vault's `.slipbox/config.toml`'s stamps, git's `HEAD`, its branch's ref, its `index.lock` and
  its rebase folders and what an operation under way leaves there, and the CLI's activity file, which the background
  index asked every quarter second. Each open file's way is checked there for a link not followed; your config and the
  vault's, and Obsidian's or zk's settings, are read again there when they moved. While git holds its lock, the lock
  alone is asked every 100 ms, one stat out at a time. What the top bar and the git panel draw of git — the branch, the
  operation under way — is what this look last found (SD-D13), never read as they're drawn.
- **A note's text** (SD-T6). A changed note's (the watcher's batch, an open note reloaded) and the background parse's
  are read on a disk thread and parsed here as before (`extractText` from the text given); the background parse reads
  the next slice's notes while one is parsed. What a hover or completion asks of a note not parsed yet is shown
  without it, and again once it's parsed; a key that needs it waits (above). An open note the watcher's batch names is
  checked against what it holds (`asRead`) with its text read there. What's drawn of every note — the Problems tab's
  count, the Info panel's backlinks and convention — counts what's parsed so far, marked as partial while notes are
  unread, and is drawn again when the parse is done (SD-D12).
- **The explorer's own tree** (SD-T7; § Side panes). The vault's own folders the tree shows are listed as the folders
  outside it are (`Listings`), each entry with the walk's verdict on it; its rows' marks are their listing's
  (`Marks.listedFacts`); the view and the trail are statted there as the tree is built, and the view gives way when
  the answer says its folder is gone. A nested vault's name, and whether a row is left out (`Paths.leftOut`), come with
  the listing. One `Listings` keeps both sides' folders, 256 at most.
- **The vault built again** (SD-T8). A reindex, the watcher's rescan, a setting of the walk changed, a vault gone into,
  a branch's tabs and the folders asked for in home read the walk and the index on a disk thread (`walk`); the graph
  stays as it was meanwhile, `reading the vault…` among the background tasks. The index crosses as its text, parsed
  here as it is now. After a rename or a folder operation (SD-D11), the build is read there too, but the keys after it
  wait their turn, as after an open, and `esc` doesn't give it up: the write is made, and the graph must follow it.
- **slipbox's own folders** (SD-T9). What's read of them on a timer or at a vault gone into — the positions, the
  session, the machine's lists, the background index's place, the answers kept for links — is read there, and link
  completion's other vaults (the machine's list, each one's index), kept from the last read meanwhile.
- **The start** (SD-D9, SD-T10). The screen is taken first; the vault's walk and index are read on a disk thread, the
  note waiting for its graph (`reading the vault…`), `q` and `ctrl+c` quitting meanwhile. Your config, the path named
  and `--base` are read before, as they say what the screen is. A vault that doesn't answer in time: its note shown as
  its text if its own read answered, its links drawn as resolved, the vault asked again a minute later and the note
  drawn again when it comes. A restart is brought back the same way.
- **What's drawn** (SD-D13; SD-T11, the last code task, measured first). A draw never reads the disk and never
  waits. What a layout asks of the disk (a `/…` link's first folder, a nested vault's file, a name's case on macOS, a
  picture), and the scratch's places, are answered from what's kept, and asked of a disk thread when they aren't, drawn
  again when they answer; meanwhile a link is drawn as resolved, and a picture's place is said.

**What stays on the screen's thread** (SD-D7). A note's save (`App.writeBuffer`: its check that the file is as read,
its atomic write, its write through a link, D220, its stamp told to the watcher), a file operation with the checks its
guards make before writing, the scratch, an export and slipbox's own state are written here: their order against the
watcher's next look and against quitting is what keeps a note safe. So does registering a folder's watch, and the
CLI's every read. Another vault's graph, built for a peek or the reach, is built here (root ideas.md § Roots and
vaults). Parsing stays here, and with it the parse cache (`parsed.db`).

## MODIFIED design/roots.md § The index

In the bullet "Off the main thread, in the TUI", the paragraph beginning "Not done:" becomes:

> The rest of what the TUI reads of the vault open, and of its own state, cache and config folders, is read off the
> main thread as well, on the disk threads ([tui.md](../../design/tui.md) § A slow disk): the watcher's looks, a
> note's text, the vault open built again, the explorer's own tree, and the walk at the start, made once the screen is
> up. Writes stay on the main thread.

Previously: "Not done: the rest of what reads a slow disk on the main thread still holds the TUI up while it's read —
the watcher's polling of the vault open (a stat per watched folder every two seconds, per note every thirty; its
folders listed again), the vault open built again (a reindex, the watcher's rescan, a vault gone into, a setting
changed, a rename, a branch's tabs in folders of home not walked), a note's text read to parse or open it, the
explorer's own tree of the vault open (`fromDisk`, its rows' marks) and the view's folder statted as its tree is built,
slipbox's own state, cache and config folders (under home by default: the machine's lists, the place the background
index keeps), and the walk at the start: a vault's before the screen is up, home's as it comes up, with the folders it
asks for (its tabs')." Until consolidation the root's paragraph stays as it is: the workstream writes only inside its
own folder, and consolidation (SD-T12) puts this text, pointing at § A slow disk, in its place.

## MODIFIED design/tui.md § Side panes: explorer, history, the git panel, Info, outline and footnotes

- In "What the walk leaves out, listed", "what's on the disk that the walk didn't give is read (`fromDisk`)" becomes
  "what's on the disk that the walk didn't give is read off the main thread, as a folder outside the vault is
  (`fromDisk`, from `Listings`; the walk's verdict on each entry made on the listing's thread: § A slow disk)".
- In "A row's marks", "What the disk says of a row (`Facts`: access, a broken link, the size, a vault's index and
  branch) is read once per row drawn, again when the tree is built again" becomes "What the disk says of a row
  (`Facts`: access, a broken link, the size, a vault's index and branch) is its folder's listing's
  (`Marks.listedFacts`), read with it off the main thread, again when the listing is".
- In the explorer's bullet, "gives way to its nearest folder still there when the tree or the breadcrumb is built
  again (`keepToWhatsThere`)" becomes "gives way to its nearest folder still there once a stat made off the main thread
  as the tree or the breadcrumb is built again says it's gone (`keepToWhatsThere`)".
- In the explorer's bullet, "on one of two listing threads, apart from the walk's" becomes "on one of the two disk
  threads (§ A slow disk), apart from the walk's" (built by SD-T2).

Previously: "what's on the disk that the walk didn't give is read (`fromDisk`)"; "What the disk says of a row
(`Facts`: access, a broken link, the size, a vault's index and branch) is read once per row drawn, again when the tree
is built again"; "gives way to its nearest folder still there when the tree or the breadcrumb is built again
(`keepToWhatsThere`)"; "on one of two listing threads, apart from the walk's".

## MODIFIED design/tui.md § Overlays

In "A file by its path", "Folders are read on the listing threads the explorer shares (T12;
`listThreads`)" becomes "Folders are read on the disk threads the explorer shares (T12, SD-D2; `diskThreads`)" (built
by SD-T2).

Previously: "Folders are read on the listing threads the explorer shares (T12; `listThreads`)".

## MODIFIED design/tui.md § External changes

"Events are debounced (`watch.debounce_ms`) and settled by `stat` (D137)" becomes "Events are debounced
(`watch.debounce_ms`) and settled by `stat`, on a disk thread (D137; § A slow disk)".

Previously: "Events are debounced (`watch.debounce_ms`) and settled by `stat` (D137)".

## MODIFIED design/tui.md § Bun's watcher, and what covers its gaps

- "So each tick stats every watched directory" becomes "So each tick stats every watched directory on a disk thread, a
  hundred a request (§ A slow disk; a tick whose answer hasn't come asks nothing new),".
- "The tick runs every `watch.poll_ms`, and every 15th tick sweeps all known notes." becomes "The tick runs every
  `watch.poll_ms`, and every 15th tick sweeps all known notes, a hundred a request, each asked when the last
  answers."

Previously: "So each tick stats every watched directory"; "The tick runs every `watch.poll_ms`, and every 15th tick
sweeps all known notes."

## MODIFIED design/tui.md § Known limits

Added, after "A big note's first open reads for a moment":

- **A save on a slow disk holds the screen for its write** (SD-D7): a note's save, a file operation, the scratch and
  slipbox's own state are written on the main thread, where their order against the watcher and quitting is kept.
- **The parse cache is read on the main thread** (SD-D12): it's in the cache folder, local by default, and goes with
  the parse, which stays.
- **The upgrade check reads on the main thread** (SD-D1's note): every ten seconds, a `readlink` in slipbox's data
  folder, where its versions are; never the vault's disk.

Previously: the section's two bullets alone.

## MODIFIED design/testing.md § The terminal tests

In "A slow disk, stood in for" (built by SD-T1, but the disk threads, SD-T2's):

- "`SLIPBOX_SLOW_DISK=<folder name>:<ms>[:<deadline ms>]`" becomes
  "`SLIPBOX_SLOW_DISK=<folder name>:<ms>[:<deadline ms>[:<stat ms>]]`".
- "makes a folder of that name take so long to list, on whichever thread lists it (`slowDisk` in
  `core/workspace/walk/walk.ts`), and shortens the walk's and the listings' threads' deadlines to the third" becomes
  "makes a folder of that name take so long to list (`slowDisk`, in the seam every read goes through:
  `core/foundation/platform/disk.ts`, each thread taking it once as it starts) — a walk's listing on whichever thread
  lists it, the main one too, so a walk put back there is slowed; the seam's other listing (`entries`: the watcher's,
  the explorer's tree) on every thread but the main one — and shortens the walk's and the disk threads' deadlines to
  the third; a fourth part, when given, makes each stat and read of a path with that folder on its way take so long
  too, on every thread but the main one (`<name>:<ms>::<stat ms>` gives one without a deadline). The main thread's
  reads but a walk's go as they did until the tasks move them, and the held tests watch it (below)".
- "the unit tests hold a folder up on a thread of their own (`setFolderReader`, a worker of their own:
  `tests/fixtures/walk/`)" becomes "the unit tests hold a folder up on a thread that takes the hold, theirs or the
  main thread (`setFolderReader` for a walk's listing, `setReadWait` for `entries` and a stat or a read through the
  seam of a path under it, each set on the thread that asks; a worker of their own: `tests/fixtures/walk/`, which
  holds a stat or a read only once its test asks); `setSlowDisk` sets a thread's slow disks, the seam's and the walk's,
  and a test sees what it sleeps by recording the sleep, never by timing it"; and "(`Hold`, on every thread at once)"
  becomes "(`Hold`, a listing, a stat or a read alike, on every thread that takes it at once)".
- Added after that paragraph: "`check:boundary` keeps the files whose reads a slow disk would hold up to the seam
  (SD-D12): those that read through it alone (`SEAM_READERS`, `scripts/disk-inventory.ts`), and those still allowed
  to read the disk themselves, each with why (`DISK_READERS`). It fails on a file of the list that reads and isn't
  allowed to, on one allowed that no longer does, and on one, or the seam, that isn't there; only a test's small tree
  written for the other rules asks to be left out (`--no-inventory`). It sees what a file imports or loads of `node:fs`
  and Bun's files, not a read through a helper (`readText`, `stamp`, `readJson`) or a call to the seam made on the
  main thread. Those the held tests find, task by task: each task's held test takes the hold on the main thread for
  the reads it moves, so a read of them left there holds the test's key past the hold's deadline (`gaveUp`). SD-T1
  moves none off the main thread, so none takes it there yet: the net grows with each task."

Previously: "`SLIPBOX_SLOW_DISK=<folder name>:<ms>[:<deadline ms>]`"; "makes a folder of that name take so long to
list, on whichever thread lists it (`slowDisk` in `core/workspace/walk/walk.ts`), and shortens the walk's and the
listings' threads' deadlines to the third"; "the unit tests hold a folder up on a thread of their own
(`setFolderReader`, a worker of their own: `tests/fixtures/walk/`)"; "(`Hold`, on every thread at once)"; no paragraph
on `check:boundary`'s list.

## MODIFIED design/how-it-works.md § The parts

In "Vaults", "the TUI makes its own walks, and lists the explorer's folders, on threads of their own (T12)" becomes "the
TUI makes its own walks on a thread of their own (T12), and reads everything else of the vault open on the disk threads
(§ A slow disk in [tui.md](../../design/tui.md))".

Previously: "the TUI makes its own walks, and lists the explorer's folders, on threads of their own (T12)".

## MODIFIED design/how-it-works.md § Module map

- The row for `walk-thread.ts` says "the walk's thread and the two disk threads (`walk-worker.ts`, `list-worker.ts`):
  asked", and cites SD-D2 beside T12 (built by SD-T2).
- A row added after `walk-jobs.ts`'s: "`core/workspace/walk/disk-jobs.ts` | SD-D2 | what the disk threads answer: a
  folder listed, paths statted, a file's text read, a folder's access, the vault walked, as the thread that asks would"
  (built by SD-T2).
- A row added after `fsutil.ts`'s: "`core/foundation/platform/disk.ts` | SD-D10 | the one seam every read of the
  disk goes through: a listing, a stat, a file's bytes; the slow disk stood in for, and a test's hold" (built by
  SD-T1).

Previously: "the walk's thread and the listings' two (`walk-worker.ts`, `list-worker.ts`): asked"; no row for
`disk-jobs.ts` or `disk.ts`.
