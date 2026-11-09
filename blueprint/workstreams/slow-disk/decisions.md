# Decisions: a slow disk never freezes the screen

**Proposed, none recorded.** Each entry below is what this draft proposes, with what could have been chosen instead.
A decision is recorded only once the maintainer agrees (blueprint/README.md § How things are recorded): then each is
dated, its "Proposed" mark goes, and the open questions in [README.md](README.md) it settles are said under it. Until
then they may change; after, they're never rewritten, only noted.

## SD-D1: The parts, in order (proposed)

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

## SD-D2: One pool, the disk threads (proposed)

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

## SD-D3: Nobody asked, nothing waits (proposed)

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

## SD-D4: A key's own read: the key waits, the screen draws (proposed)

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

## SD-D5: Every answer checked against what it was asked under (proposed)

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

## SD-D6: Deadlines, and giving up (proposed)

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

## SD-D7: Writes stay on the screen's thread (proposed)

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

## SD-D8: The watcher's state and logic stay; its reads go (proposed)

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

## SD-D9: The start takes the screen first (proposed)

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

## SD-D10: The tests' seam (proposed)

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
