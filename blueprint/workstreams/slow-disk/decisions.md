# Decisions: a slow disk never freezes the screen

**All agreed, on 2026-11-09.** Each entry says what was chosen, with what could have been chosen instead, and how it
was agreed: SD-D2, SD-D3, SD-D4, SD-D6, SD-D7 and SD-D9 by the maintainer's answers ([README.md](README.md)
§ Questions answered, the option recommended in each); SD-D1, SD-D5, SD-D8 and SD-D10 by the maintainer, as proposed;
SD-D11 and SD-D12, the questions the tasks had left open, by the maintainer's instruction to take the recommended
answer; SD-D13 and SD-D14, and the notes of 2026-11-10 under SD-D1, SD-D6, SD-D8 and SD-D12, the same way, from the
design's review; the notes under SD-D10 and SD-D14, from SD-T1's; SD-D15, the start's choices, the same way, as SD-T10
was built; SD-D16, SD-T6's, the same way, as it was built. An entry is never rewritten; a dated note goes under it
(blueprint/README.md § How things are recorded).

## SD-D1: The parts, in order (2026-11-09)

Agreed: its last part by question 6, answered (a), what drawing a note reads in this workstream as its last code
task, measured first; the order and what stays out as proposed.

**Decision:** The workstream moves off the screen's thread every read README.md § The inventory lists, but writes
(SD-D7), in this order: the tests' seam (SD-T1) and the disk threads (SD-T2), which everything uses; the watcher's look
(SD-T3) and the TUI's look each second (SD-T4), which stop the screen every second or two whatever you do; opening a
note (SD-T5); then a changed note's text and the background parse (SD-T6), the explorer's own tree (SD-T7), the vault
built again (SD-T8) and slipbox's own folders (SD-T9), in any order; the start (SD-T10) once a note's open and a build
are off the thread; what drawing a note reads (SD-T11) last. Each task is a pull request of its own. Staying: writes,
the CLI, another vault's graph (a peek's, the reach's), parsing the vault's notes, the parse cache, registering a
folder's watch.

**Why:** The looks run whether or not you do anything, so on a slow disk they're what you feel first and most; opening
a note is the next thing everyone does. Everything after them is felt when something happens (a build, a folder
unfolded), less often. Small steps keep each review to one kind of read, and each can ship alone.

**Not chosen:** one change for all of it (one review of everything, nothing shipped until all is); the start first,
as the issue lists it last (it's felt once a session, the looks every two seconds).

> **Note (2026-11-10), by the maintainer's instruction to take the recommended answer, from the review:** the inventory
> grows by what it had missed, each read moved by the task of its area: the watcher's checks of each entry it lists and
> of where a note went (SD-T3); the open files' links, the config read again, git's state for what's drawn and the
> tool's settings (SD-T4); the open's links and git's keys' reads (SD-T5); `asRead` and what's drawn of every note
> (SD-T6); the nested vaults' names and what's left out (SD-T7); completion's other vaults (SD-T9); the scratch's places
> (SD-T11). Staying out, with the rest: the upgrade check every ten seconds, which reads slipbox's data folder, said as
> a known limit.

## SD-D2: One pool, the disk threads (2026-11-09)

Agreed: question 1, answered (a).

**Decision:** The two listing threads T12 made (`ListThreads`, `src/core/workspace/walk/walk-thread.ts:193`, served by
`list-worker.ts`) become the disk threads, and take every read this workstream moves, as requests: `list` (as now),
`stat` (a batch of paths: each one's kind, mtime, ctime and size, or its error's code), `read` (a file's text decoded
as `readText` decodes it, and its stamp), `access` (a folder's: `folderUnreadable`'s words), `walk` (the vault open's
walk for a build). Each slot's worker starts on its first request, as now; requests wait in one line, each going to a
thread once one is free. A long request (`walk`) takes a thread only while the other is left for the rest, so a short
read never waits behind a walk. The walk's thread keeps what it does (home's walk, the background index).

**Why:** No new worker: the listing threads are light (no index, no parser; 60–70 ms to a first answer, T12), already
never behind a folder that doesn't answer while the other thread is free, already carry the context a thread can't
see for itself (`walkContext`). The walk's thread is busy with background work whose requests may take five minutes
each on a slow disk: a reindex behind them would wait that long.

**Cost:** A walk holding one thread and a folder that doesn't answer holding the other leave every other read waiting
for a deadline. Every session starts one disk thread (the watcher's first look), where today the listings start one
only when the explorer lists outside the vault.

**Not chosen:** a thread per feature — the watcher's, the vault's, the listings' — each its own heap (#56); the walk's
thread for every read, behind the background index; the runtime's own asynchronous reads (`fs.promises`, as the
followed links' probe uses, `src/core/workspace/vaults/symlinks.ts:401`): a read a hung disk never answers keeps one
of the runtime's own threads, which can't be given up on per request (*memory*, research.md), and the walk's, the
listing's and the watcher's code is synchronous and shared with the CLI (T12: the same code wherever it runs).

> **Note (2026-11-10), from SD-T3's review, settled by the maintainer's standing instruction to take the recommended
> answer:** the watcher's requests are the disk threads' background ones (`LookAsk.background`): one at a time, the
> rest going past them meanwhile, so the watcher's tick (a stat and a listing of each polled folder) and its sweep
> never hold both threads, and a key's read (opening by path, an explorer listing) finds the other free. Chosen over
> keeping one thread for what a key asks, which would also keep the watcher off the second thread while a walk holds
> the first. A walk holding one thread and a watcher's request the other still leaves a key waiting, as SD-D2's cost
> says.

## SD-D3: Nobody asked, nothing waits (2026-11-09)

Agreed: question 3, answered (a).

**Decision:** A read on a timer or in the background — a look, a build, the background parse, a folder of the tree
read again — never holds a key. The screen's thread keeps what it last knew and shows it: the watcher's stamps, the
graph (links, backlinks, search), the explorer's rows, an open note's text. Where you'd act on something not read yet,
it says so: a build's background task row (`reading the vault…`, beside `Indexing`), `listing…` under a folder not
listed yet (T12's), `⚠ disk not answering` on the status line while a look doesn't answer.

**Why:** What was there a moment ago is right almost always, and a change on disk is seen a look later, as now when
an event is dropped. An emptied explorer or backlinks list would look like something deleted.

**Cost:** For as long as a slow disk takes, the screen can show what has changed on it since; the marks say a read is
out, not what it will find.

**Not chosen:** emptying what's being read until it answers; a window saying the disk is being waited for.

## SD-D4: A key's own read: the key waits, the screen draws (2026-11-09)

Agreed: question 2, answered (a).

**Decision:** A read a key asks for and acts on — a note opened (as a tab, by a link, from a list, at the start), a
folder zoomed into or unfolded (`folderUnreadable`), `:e!` and a reload by hand — is made on a disk thread. The key
waits for it, and the keys after it wait their turn (`Input.handleKey`'s line), as they wait for a big note's parse
(`views.parses`, D120); the screen draws meanwhile, `reading <note>…` where the note will be. `esc` gives it up: it's
taken at once, not in the line, and leaves you where you were. Past its deadline it's said (`<note> didn't answer: not
opened`) and nothing opens. A list's preview reads without holding the keys: `reading…` in the preview until it comes.

**Why:** Keys typed after an open are meant for the note opened: acting on the window you were in would type into
the wrong note. The keys already wait this way for a big note's parse and for a git read (design/tui.md § Asynchronous
git reads), so it's nothing new to learn. A preview follows the selection, which must keep moving.

**Cost:** On a slow disk the keys after an open wait, as now, though the screen draws and `esc` answers. `esc` taken
out of the line is a special case in the key handling.

**Not chosen:** the keys acting on the window you were in until the note is read, the tab appearing then; opening a
tab at once with its text empty, filled when read (a cursor and a reading position on nothing).

## SD-D5: Every answer checked against what it was asked under (2026-11-09)

Agreed as proposed.

**Decision:** Each request carries what it was read for, and its answer is taken only while that still holds: the
watcher's `sync`s (a look's stamps), the graph's `builds` and the vault open (a build's walk), a buffer's version and
stamp (a note's text), the tree's settings and the listing's number (a folder's rows), the view (a zoom's check).
Otherwise it's dropped, or asked again at once when only the settings moved (as `Listings.answered` does). What
changed in the graph while a build was out — the watcher's, slipbox's own writes, a file reached — is applied again
over it, as home's refresh does (`GraphRefresh.homeBuilt`, `since`). A stamp is compared with what's known when the
answer comes, never when it was asked: an own write (`noteOwnWrite`) recorded meanwhile decides.

**Why:** T12's rule, made general: an answer is about the world it was asked in, and the world moves while a slow disk
is read. Comparing when it comes keeps a save made meanwhile from being taken for an agent's change.

**Cost:** Every answer's path needs its generation and a race test; a build dropped on a busy vault is asked again.

**Not chosen:** taking every answer, the next look or build putting it right (a note shown stale, a save taken for a
conflict).

## SD-D6: Deadlines, and giving up (2026-11-09)

Agreed: question 7, answered (a).

**Decision:** A request a thread doesn't answer in time is failed, the thread started afresh for the requests behind
it (`WorkerRequests`), and the read never made on the screen's thread instead. A look's batch, a key's read and a
folder's check have a minute; a sweep is cut in slices so no one request holds thousands of stats; a walk has ten
minutes (`WALK_DEADLINES.whole`, T12's); a listing keeps its ten. Given up on: a look says `⚠ disk not answering`
once, and is asked again a minute later (`RETRY_MS`); a key's read is said, nothing opened; a build is said as home's
walk is (`reading the vault gave up: a folder didn't answer in time`) and the graph stays as it was.
`SLIPBOX_SLOW_DISK`'s third part shortens them all, for the terminal checks. Every number is ours, set from what each
read is for.

**Why:** A look is due every two seconds, and its answer is stale long before a minute; a person waiting on a note
gives up before it with `esc`. A walk's ten minutes are T12's, for a big vault on a slow share. Never falling back to
the screen's thread is T12's rule: falling back is the freeze.

**Cost:** A share that wakes up after more than a minute misses a look, and is looked at again a minute later.

**Not chosen:** five minutes for everything, as a slice of home's walk; three seconds, as a followed link's probe
(VV-D6), which a disk waking up can miss.

> **Note (2026-11-10), by the maintainer's instruction to take the recommended answer, from the review:** a deadline is
> set by what asked, not by the request's kind. Whatever a look asks — a `stat` or a `list` — has a minute, and a key's
> read a minute; the explorer's listings keep T12's ten, and a walk has ten. "A listing keeps its ten" above means the
> explorer's.

## SD-D7: Writes stay on the screen's thread (2026-11-09)

Agreed: question 4, answered (a).

**Decision:** A note's save (`App.writeBuffer`: its check that the file is as it was read, its atomic write, D220's
write through a link, its stamp told to the watcher), a file operation and the checks its guards make just before
writing (`checkWritable`, `cleanTarget`, `Files.createNote`), the scratch, an export and slipbox's own state are
written on the screen's thread, as now. The reads a build makes after a write (a rename's, a folder moved) are SD-T8's.

**Why:** A save's order against the watcher's next look (its own write ignored once, by its stamp) and against a quit
is what keeps a note from being lost or rewritten unseen; its check and its write must see the same disk.
design/how-it-works.md § Client interaction and future gateway boundary keeps saves synchronous, and asynchronous
saves are the roadmap's Later item on gateway execution.

**Cost:** A save on a slow disk still holds the screen for its write, said as a known limit (design/tui.md § Known
limits).

**Not chosen:** a writer thread for everything; slipbox's own state alone on a writer thread (question 4).

## SD-D8: The watcher's state and logic stay; its reads go (2026-11-09)

Agreed as proposed.

**Decision:** `VaultWatcher` keeps its state and its logic on the screen's thread — the known stamps, own writes, the
folders left to home's walk, the debounce — and `fs.watch`'s registrations, whose events come here. Each look asks one
batch of the disk threads: the watched folders' stamps, their `.gitignore`s', the followed notes', the polled
folders' listings and, in slices, the sweep's. When it answers, it's compared with what's known then; a look whose
answer hasn't come asks nothing new. A folder whose mtime moved is listed there, and the settle by stat (`flush`) asks
its stats there too: the batch goes to the feed when they answer, events meanwhile waiting for the next.

**Why:** The watcher's state is the graph's and the saves' as much as its own (`known`, `noteOwnWrite`, `heard`,
`sync`, `walkPending`): mirrored on another thread, each would race its copy. Only its reads wait on the disk.

**Cost:** A look's answer lands up to a deadline late; a burst of events waits for the settle's answer before it's a
batch.

**Not chosen:** the whole watcher on a thread of its own, its batches sent here (its state mirrored, own writes
crossing threads before their events).

> **Note (2026-11-10), by the maintainer's instruction to take the recommended answer, from the review:** a look's
> batch, in the disk threads' terms (SD-T2), is one `stat` request holding every path the look stats and one `list`
> request for each folder it lists, asked together, each with the look's minute; the look's answer is in once all have
> answered or one has given up. Each entry a listing or the settle finds is judged on the listing's thread with it, as
> the explorer's are (SD-T7): the walk's filter (`exclusion`), a link's verdict (`symlinkVerdict`) and where a note that
> went has gone (`movedTo`).

> **Note (2026-11-10), from SD-T3's review:** a look's stats go a hundred a request (`SLICE`), as the sweep's do: a
> tick's (each watched folder's stamp with its `.gitignore`'s, the notes followed), the stamps of the folders
> registered, a settle's. Each slice is taken as it answers, and a flush wanted meanwhile runs between two slices, not
> after the last. One given up on keeps what answered before it; the next tick starts after it and goes round to it, so
> a slice that never answers keeps none behind it from being looked at, and the folders still unstamped are stamped by
> the next look. The polled folders are still listed every tick (SD-D12's answer for SD-T3), but last, in a request of
> their own: a polled folder is most often a network mount, and one that doesn't answer costs only its listing, asked
> again at the next tick. As one request, a tick of a vault with thousands of folders on a slow disk could miss its
> minute every time, and keep nothing it had read.

## SD-D9: The start takes the screen first (2026-11-09)

Agreed: question 5, answered (a).

**Decision:** `prepare` (`src/tui/shell/terminal/run.ts:62`) no longer builds the vault's graph: the screen is taken
first, and the vault's walk and index read on a disk thread (SD-T8's build), home's as now with the folders its tabs
are in. The note opened waits for the graph, `reading the vault…` in its window, the keys after it waiting as SD-D4
has them; `q` and `ctrl+c` quit meanwhile. What's read before the screen stays: your config (it says the keys, the
theme, where state is), the folder or file named, `--base`.

**Why:** On a slow disk, nothing on the terminal for as long as the walk takes looks like a hang, and can't be left
but by killing it. A note drawn before its graph would draw its links unresolved, then again: waiting as a big note
waits keeps one drawing, right.

**Cost:** A start on a fast disk draws its first frame before its note; the note comes when the graph does, as now.

**Not chosen:** the note drawn at once, its links dim until checked; the start as now.

## SD-D10: The tests' seam (2026-11-09)

Agreed as proposed.

**Decision:** Every read this workstream moves goes through one module of the core
(`src/core/foundation/platform/disk.ts`, growing from `src/core/workspace/walk/io/folders.ts`'s folder reader): a
folder's listing, a path's `stat` and `lstat`, a file's bytes (`readRegular`). The stand-in (`SLIPBOX_SLOW_DISK`)
slows, and the tests' hold (`Hold`, `tests/fixtures/walk/slow.ts`) holds, any of them on a path with the named folder
on its way, on every thread: the screen's, the disk threads', the walk's. A test's App reads on the screen's thread
unless asked (`AppOptions.listOffThread`, renamed for what it covers), as T12's listings do.

**Why:** A test must fail without the fix, so the hold has to reach the read wherever it's made: today only listings
go through the folder reader, and the watcher, a note's load and the explorer's marks call `statSync`, `readdirSync`
and `readText` directly. Reading on the screen's thread in a test's App keeps thousands of tests as they are; the
moved paths have their own tests and the terminal checks run the TUI as shipped.

**Cost:** One more indirection on reads the CLI makes too. The suite's TUI tests run the screen's-thread path, not the
shipped one.

**Not chosen:** a FUSE mount in CI (a privilege the runners don't give, and none on macOS); timing the reads (#75);
every test's App on threads.

> **Note (2026-11-10), from SD-T1's review, settled by the maintainer's standing instruction to take the recommended
> option:** the seam keeps two listings apart. A walk's listing (`readFolder`: a walk, the explorer's listing threads,
> the filter) takes the stand-in on every thread, the screen's too, as since T12: a walk put back on the screen's thread
> is slowed there, and T12's checks see it. The rest — the listings SD-T1 moves to the seam (`entries`: the watcher's,
> the explorer's tree) and every stat and read — take it on every thread but the screen's, each thread reading it once
> as it starts (a test sets a thread's own with `setSlowDisk`). A test takes the hold on the threads it asks it of
> (`setFolderReader` for a walk's listing, `setReadWait` for the rest), its walk's worker holding a stat or a read
> only once asked. So the screen's thread reads those as it did until a task moves them: that task's held test takes
> the hold there for the reads it moves, and the net grows task by task.

## SD-D11: A rename's build: on a disk thread, the keys after it waiting (2026-11-09)

Agreed by the maintainer's instruction to take the recommended answer.

**Decision:** After a rename or a folder operation (`renaming.ts:206`, `:220`; `mutations/files.ts:102`, `:148`;
`mutations/rename/rename-apply.ts:319`, `:421`), the vault's walk and index are read on a disk thread (SD-T8's `walk`),
and the keys after it wait their turn, as after a note opened (SD-D4); the screen draws, `reading the vault…` in the
status line. The write itself stays on the screen's thread (SD-D7), and `esc` doesn't give the build up: the write is
made, and the graph must follow it. Past its deadline the build is said, the graph as the write left it, the vault asked
again a minute later.

**Why:** The next key must see the graph the write made — a link followed to the note renamed, a second rename
planned from the new paths. Waiting keeps that; the disk thread keeps the screen drawing and `q` answering.

**Cost:** On a slow disk the keys after a rename wait for the vault to be read, as now, though the screen draws.

**Not chosen:** the build kept on the screen's thread as part of the key's write (every rename on a slow disk a
freeze, as now); the build in the background as a reindex is (the next key acting on paths that are gone).

## SD-D12: The tasks' own questions (2026-11-09)

Agreed by the maintainer's instruction to take the recommended answer. Each was left open in its task when the design
was drafted; the task's file says it as decided.

- **SD-T1, a check for the seam:** `check:boundary` refuses an import of `node:fs`'s reads (a stat, a listing, a
  file's text, an existence or access check) in the files README.md § The inventory names, writes left alone. Why: a
  test's App reads on the screen's thread (SD-D10), so a read put back there passes every test but its own; only a
  check sees it. Not chosen: the reviews alone.
- **SD-T1, the stand-in's delays:** apart. `SLIPBOX_SLOW_DISK` keeps its listing delay; a fourth part gives each stat
  and read under the folder its own, none when it's left out. Why: T12's ten checks run unchanged, and a walk, which
  stats each file, doesn't take a listing's delay per file. Not chosen: one delay for every kind of read.
- **SD-T1, the CLI's cost:** the CLI calls the seam's functions directly, on its own thread; `bun scripts/bench.ts`
  before and after, within its noise, is the task's acceptance.
- **SD-T2, a third disk thread:** none; two. Why: a walk holds one only while the other is free, so a short read
  always has one; a third is a heap more (#56). What SD-T8 measures is recorded, not acted on without a decision.
- **SD-T2, an idle disk thread:** let go of after a minute without a request, started again on the next (60–70 ms,
  under the 150 ms before `listing…` shows). Why: #56 asks for unused workers released; while a vault is watched the
  first is asked every two seconds, so only the second is ever let go of. Not chosen: kept for the session.
- **SD-T3, the sweep's slice:** a hundred notes a request, each asked when the last answers; a sweep still under way
  at the next fifteenth tick goes on, and none other starts. Why: a count needs no clock in a test (#75); a hundred
  stats fit the minute's deadline at T12's slow mount's 0.3 s a stat; asked back to back, a fast disk sweeps as quickly
  as now. Not chosen: a slice by time on the thread.
- **SD-T3, polled folders:** listed every tick, in the tick's batch, as now. Why: a tick whose answer hasn't come asks
  nothing new, so a slow disk slows the looks by itself; listing less often would only slow a fast disk's news.
- **SD-T4, git's lock while git writes:** asked on its own every 100 ms, one stat out at a time. Why: autosave and the
  watcher's news wait on it (`5.10`); folded into the look each second, a save after a commit would wait up to a
  second more on any disk.
- **SD-T5, a click while a note is read:** dropped, as during a big note's parse (`mouse.ts:73`). Why: it would land
  on a screen about to change; one rule for both waits. Not chosen: taken after the read.
- **SD-T5, the session's tabs brought back:** the tab shown first, then the rest in order, one at a time. Why: the
  note on the screen comes first, and a thread stays free for the watcher's first look and a key's read. Not chosen:
  all at once on both threads.
- **SD-T6, how far ahead the background parse reads:** the next slice's notes, asked while this one is parsed. Why:
  two slices' texts in memory at most, and no new setting. Not chosen: a byte budget.
- **SD-T6, notes not parsed yet, asked for:** a key that needs them — a rename's or a move's plan, the tags, the
  problems, the link forms, a backlinks list (`Graph.entry`, `ensureAll`) — waits for their texts, read on the disk
  threads, as an open does (SD-D4: `reading notes…`, `esc` giving it up), and a plan is never made from notes not
  read. What a hover or completion asks is shown without it, and again once it's parsed. Why: a list or a rename made
  from part of the vault would be wrong without saying so. Not chosen: read on the screen's thread, as now.
- **SD-T7, the vault's own folders kept:** in the same `Listings` as the folders outside it, its 256 kept shared.
  Why: one cache and one limit, the folder shown longest ago let go of first, whichever side of the vault it's on.
- **SD-T8, the index across threads:** sent as its text, parsed on the screen's thread. Why: the screen's thread parses
  it today, after reading it (`readJson`, `refresh.ts:186`); sent as text, it does the same minus the read, where a
  structured copy would add the copy on top of a parse on the thread. SD-T8 records the gap at 10,000 notes.
- **SD-T9, what the measurement finds:** a read of slipbox's own folders made on a timer or at a vault gone into moves
  in this task, as the others do; one made before the screen is up stays (SD-D9).
- **SD-T9, the parse cache:** stays on the screen's thread, said as a known limit (design/tui.md § Known limits).
  Why: it's in the cache folder, local by default, and its SQLite calls are synchronous; moving it moves the parse,
  which this workstream leaves out. Not chosen: a task of its own here.
- **SD-T10, a start whose vault doesn't answer:** the note shown as its text if its own read answered, its links
  drawn as resolved until the graph says otherwise, the vault asked again a minute later and the note drawn again
  when it comes; if the note's read gave up too, nothing opened, said. Why: the note asked for is what's of use while
  the vault doesn't answer; an empty window leaves nothing to do but quit. Not chosen: nothing opened.
- **SD-T10, a restart:** brought back as a start is, its tabs' places kept. Why: one path; a restart is a start with
  its session.
- **SD-T11, a link not checked yet:** drawn as resolved until said otherwise. Why: most links resolve, so the drawing
  changes only for the few that don't. Not chosen: dim until checked (every link changing on a slow disk).
- **SD-T11, pictures:** in SD-T11. Why: the same kind of read, measured with the rest, under one rule for what
  drawing asks. Not chosen: a step under the roadmap's Images (`12.x`).

> **Note (2026-11-10), by the maintainer's instruction to take the recommended answer, from the review:**
>
> - **The check for the seam** can't refuse every read in the inventory's files: some keep theirs until their task
>   lands (`graph-resolve.ts`, `graph-lookup.ts`, `links.ts`, `refresh.ts`, `home/cache.ts`, `images.ts`,
>   `opening.ts`, `vaults.ts`), and some for good — SD-D7's guards before a write (`mutations/files.ts`,
>   `mutations/rename/rename-apply.ts`), a save (`saving.ts`), and SD-D9's `prepare` (`run.ts`). So `check:boundary`
>   holds a list of the files still allowed to import `node:fs`'s reads, each with why (the task that moves it, or the
>   decision that keeps it), shrinking as each task lands; it fails on a file of the inventory that reads and isn't
>   listed, and on one listed that no longer needs to be. What it sees is direct imports only: a read through a
>   helper (`fsutil.ts`'s `readText`, `stamp`, `readJson`), or a call to the seam made synchronously on the screen's
>   thread, passes it. Those are caught by the held-folder tests: the hold reaches the seam on every thread, so a read
>   left on the screen's thread holds the key past the hold's deadline, and its test sees `gaveUp`. The check keeps
>   the list honest; the tests show the reads moved. This replaces the first bullet's "Why" above.
> - **What's drawn of every note** never waits for it. The Problems tab's count, the Info panel's backlinks and
>   convention, and whatever else is drawn from `ensureAll`, count what's parsed so far, marked as partial while
>   notes are unread, and are drawn again when the parse is done. A key that needs every note still waits for them,
>   as above.

## SD-D13: What's drawn is kept (2026-11-10)

Agreed by the maintainer's instruction to take the recommended answer, from the review.

**Decision:** A draw never reads the disk and never waits. What the top bar and the git panel show of git — the
branch (`headOf`), the operation under way (`operationOf`) — is kept, and the TUI's look each second (SD-T4) brings
it up to date off the screen's thread; the draws read what's kept. A count of every note is of what's parsed so far,
marked partial (SD-D12's note). The scratch's places, the nested vaults' names, what's left out, a picture, a link's
target and the tool's settings (`toolSays`) are read the same way: kept, asked of a disk thread, drawn again when
they answer.

**Why:** A frame is drawn many times a second; one read of a slow disk in it stops every frame. Git's state changes
when git runs, which the look sees within a second.

**Cost:** What's drawn of git can be a second behind; a count can be short while the vault is parsed, said so.

**Not chosen:** reading in the draw, with a cache of half a second (as `operationNow` does), which still stops a frame
whenever the cache runs out.

## SD-D14: Each task's terminal checks run before it merges (2026-11-10)

Agreed by the maintainer's instruction to take the recommended answer, from the review.

**Decision:** Pull requests skip the terminal job (D266). So before each task's pull request merges, the terminal
checks it reaches run locally — listed for the maintainer's approval first (D207) — as well as its unit tests. Each
task adds `CHECKS_FOR` entries in `scripts/ci-scope.ts` for the files it moves, and SD-T1 for
`core/foundation/platform/disk.ts`, so the checks it reaches are named.

**Why:** Every task changes where a read is made under the slow-disk checks; a pull request merged with them broken
turns `dev` red for everyone after it.

**Cost:** A local run of the reached checks per task, minutes each.

**Not chosen:** CI's run after the merge alone.

> **Note (2026-11-10), from SD-T1's review:** `core/foundation/platform/disk.ts` has no `CHECKS_FOR` entry. Every
> feature reads through it, so a change to it alone reaches every check, never the slow disk's alone
> (`tests/terminal-coverage.test.ts` holds it there). And the maintainer gave the workstream a standing go: the checks a
> task reaches run without a list asked for first; where a task reaches every check, the slow-disk checks and those of
> the features its files touch run, and `dev`'s full run covers the rest after the merge.

## SD-D15: The start's choices (2026-11-10)

Agreed by the maintainer's instruction to take the recommended answer, as SD-T10 was built: what its description left
open.

**Decision:**

- **The note waits in its window.** A note the start reads before the graph is built is placed in its window as it's
  read, the window saying `reading the vault…` until the graph's first build answers (`Builds.awaited`), its place kept
  for the layout then. Given up, it's shown as its text, and stays shown while the vault is read again.
- **`q` and `ctrl+c` quit while a graph has never been built,** out of turn, at the start and in a vault gone into
  alike (`Builds.unbuilt`); `ctrl+q` too. Any other key waits, as SD-T8 has it.
- **`esc` gives up the note's read, not the vault's:** the window left empty, the keys still waiting for the vault.
- **The session isn't saved over while its tabs come back** (`Session.coming`), at the start, a restart or a vault gone
  into: a quit, or the save a second after a change, before they're in would keep none of them. Saved once they are.
- **Nothing is caught up with a graph of no notes:** the search index starts once the graph is first built, not before
  (`Search.start`).
- **`no notes in …` is said only when the vault's own note is none,** once the graph says so; a note named that can't
  be opened says why, as any key's read does, and `esc` says nothing.

**Why:** A window that says what it waits for keeps the screen and the note it will show apart: no half-drawn note, no
links drawn then drawn again (SD-D9). Waiting for the vault can last its walk's ten minutes on a disk that doesn't
answer; quitting is what's left to do, and an empty graph is no reason to hold `q` back. Placing the note as it's read,
beside the walk, brings the note as soon as the graph comes. A quit while the tabs were coming saved none, and the next
start brought none back; a search index caught up with an empty graph dropped every note, then indexed them all again
on the screen's thread.

**Cost:** A vault gone into on a slow disk quits on `q` rather than waiting for its first read, as SD-T8 had it. While
the tabs come back, a change to the session isn't saved until they're in.

**Not chosen:** the tab placed only once the graph is built (the note's read made after the walk, not beside it); `q`
quitting at the start alone; `esc` closing the window that waits.

## SD-D16: How SD-T6 reads a note's text (2026-11-10)

Agreed by the maintainer's instruction to take the recommended answer, the questions SD-T6 left open as it was built.

**Decision:**

- **The transport:** the look's jobs (`notes`, `texts`), in a background request with a look's minute: no new kind of
  request, and one at a time across the pool, so a key's read always finds a thread (SD-D2's note).
- **A slice:** the next notes not parsed yet, up to 50, of one folder; one slice out, the next asked once fewer than
  50 texts wait to be parsed, so two slices' texts at most. A slice given up on is said, and its notes put aside a
  minute; a big note's read given up on, the same.
- **A batch:** one batch's texts out at a time; those received meanwhile wait and go together after it. A note the
  graph took in meanwhile (a save of slipbox's own, a file reached) is left as it is. Given up on: said once, the
  status line's `⚠ disk not answering` until a batch answers, and the batch read again a minute later with those
  received since.
- **An open file:** checked and reloaded from the batch's read only while its stamp is as it was when the batch was
  asked; otherwise it was saved, read again or opened since, and what was read is older.
- **What waits for every note:** a rename's preview and the relink offered after moves made elsewhere
  (`Renaming.preview`, which every rename, move, relink and conversion plan goes through), the tags' lists and the
  backlinks list. What's drawn, a completion and the Problems and Info panels use what's parsed so far, their counts
  marked `…`.
- **Where it doesn't reach yet:** what else asks of a note not parsed yet reads it here, as before — a key's one
  entry (a heading link followed, a hover), a note typed into before it's parsed, writing a link in the folder's
  convention (`Linking`), another vault's graph parsed here, and the reads of the vault built again (`takeAgain`).
  The task's Open lists them.

**Why:** Each keeps a moved read as small as the one it replaces, and a key never acts on part of the vault without
waiting for the rest (SD-D12). Folders apart, because a slow folder is most often a mount: its notes' request holds
only its own.

**Cost:** A vault's notes in one slow folder, before the others in the walk's order, hold the parse there up to a
minute before it goes on with the rest. A count drawn while the parse goes on is short, marked `…`.

**Not chosen:** a request per note (thousands of requests at a vault's open); a key that acts on part of the vault and
says so (a rename that misses links); reading here once a request gives up (SD-D6).
