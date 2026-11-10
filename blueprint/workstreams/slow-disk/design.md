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
thread free, unless the other is walking; so does a key's build's walk from the start, every key waiting for it
(SD-T8). A background request (the watcher's looks) takes a thread only while no other background request holds one,
the rest going past it meanwhile. They answer, the same code as the thread that asks
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
disk thread's `list` — the explorer's own tree's too — the filter) takes the slow disk stood in for on every thread,
the screen's too, as since T12, so a walk or a listing put back on the screen's thread is slowed there and the checks
see it. The rest (`entries`: the watcher's listings; and every stat and read) takes it on every thread but the
screen's, and a test's hold on the threads it asks: the screen's thread reads those at once until a task moves them,
and that task's held test takes the hold there for them.

**Nobody asked, nothing waits** (SD-D3). A read on a timer or in the background never holds a key: what the screen's
thread last knew stays, and is shown, until the answer comes — the watcher's stamps, the graph (links, backlinks,
search), the explorer's rows, an open note's text. Where you'd act on what isn't read yet, it says so: a build's row
among the background tasks (`reading the vault…`, beside `Indexing`), `listing…` under a folder not listed yet,
`⚠ disk not answering` on the status line while the watcher's look, or the TUI's look each second, doesn't answer.

**A key's own read** (SD-D4). Opening a note — as a tab, by a link, from a list, at the start — zooming into or
unfolding a folder, `:e!` and a reload by hand (`space n r`) read on a disk thread. The key waits, and the keys after it
wait their turn (`Input.handleKey`), as for a big note's parse (§ Known limits); the screen draws, `reading <note>…` in
the window the note will be in. `esc` is taken at once, out of turn: it gives the read up and leaves you where you were.
Past its deadline the read is said (`<note> didn't answer: not opened`), nothing opened. The keys typed meanwhile are
dropped when the read is given up, fails or opens nothing. A list's preview and a peek read without holding the keys,
`reading…` in the preview or the peek until it comes; a newer selection, or another peek, drops its answer, the read
itself withdrawn while it waits for a thread, else left to finish, its thread not started afresh; they're read in the
background, on one thread at most. A step back or forward in a peek stays where it is until the place is read; a place
gone since is said and let go of. A click while a read waits is dropped, as during a big note's parse. When the
session's tabs are brought back, the tab shown is read first — a vault gone into with a file named, the tab with it —
the keys waiting for it alone; then the rest in order, one at a time, in the background, on one thread at most. None of
them readable, the vault's own note opens, as when none was kept. A key that needs notes not parsed yet — a rename's or
a move's plan, the tags, the problems, the link forms, a backlinks list — waits for their texts the same way (`reading
notes…`), and nothing is planned from notes not read. The open's check of the way for a link not followed is made with
its read, a preview's and a peek's with theirs (`answerOpen`, `key-jobs.ts`): a link of the vault's that keeps an open
or a peek asks its question then, as opening it here would, and the file is read again once answered; a note open
already has its way checked again before a key shows it, since a link followed may lead elsewhere now; a preview says it
isn't followed. What a key does once its note is open — its line found, a new note typed into — waits for it. git's keys
ask their stats (git's index, `HEAD`, the note's) and whether a file is there before opening it the same way; the stats
are asked again once, in the background, when all a git read reads is in, before it's shown.

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
watcher's look, or the TUI's, given up on says `⚠ disk not answering` once and is asked again a minute later; a key's
read is said; a build says `reading the vault gave up: a folder didn't answer in time` and the graph stays as it was.
A look's batch — one `stat` of every path it stats and a `list` of each folder it lists, asked together — is answered
once all have; once one gives up, it's failed: what of it still waits for a thread is withdrawn, never sent, and what
of it was sent is given up, its thread started afresh. A disk thread with nothing asked of it for a minute is let go
of, and started again on the next request: a request takes the first thread free, so while a vault is watched only
the second is let go of.

**What's read where:**

- **The watcher's look** (SD-D8, SD-T3; § Bun's watcher, and what covers its gaps). The watcher keeps its state and
  logic here, and its `fs.watch` registrations, whose events come here. Each tick asks its stats a hundred a request
  (`SLICE`), each taken as it answers — the watched folders' stamps, each with its `.gitignore`'s, and the notes
  followed into folders left to home's walk — and last, in a request of their own, a `list` of each polled folder, so
  one that doesn't answer (a network mount, most often) costs only its listing, asked again at the next tick; and every
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
  changed stays seen, the folders not stamped yet are stamped by the next look, and the next tick starts after the
  slice given up on and goes round to it, no slice across the end, so one that never answers keeps none behind it from
  being looked at. The watcher's logic is written as looks (`watch/reads.ts`), each yielding the batch it needs: one
  out at a time, a flush asked meanwhile made once it answers — or, a look in slices (a tick's, the stamps'), between
  two of its slices — the sweep a chain of its own that asks nothing while the looks are paused; the warning cleared
  only by an answer to a look asked after the pause. Its requests are the disk threads' background ones, one at a
  time, so a key's read finds the other thread (SD-D2's note of 2026-11-10). A test's watcher answers each at once, on
  the thread that asks, with the same code.
- **The TUI's look each second** (SD-T4; § External changes). One batch a second, never two out, asked as one request,
  so a look holds one disk thread — a background one, as the watcher's are, with its second batch, the feed's question
  and git's lock, so the two looks never hold both threads: git's state where the vault is, read whole there as the
  screen's thread read it — the checkout, `HEAD` and its commit, its `index.lock`, its rebase folders and what an
  operation under way leaves there; each open file of the vault's way checked there for a link not followed, the file
  statted only when there's none; then a `stat` of the open files no watcher sees, of your config's and the vault's
  `.slipbox/config.toml`, of the CLI's activity file (which the background index statted every quarter second) and of
  Obsidian's or zk's settings — their folder by whether it's there (Obsidian rewrites what's in `.obsidian/` while it
  runs), their settings file by its mtime. Your config and the vault's are read and parsed there when their stamps
  moved, and Obsidian's or zk's settings with them, a second batch. What comes back is taken against what's there then
  (SD-D5): nothing for a vault left, a file's stamp only for a buffer still open and as it was, a way only while the
  answers to links are as they were, git's state only when no question of it asked later has been answered first — so
  `HEAD` never moves back, and an operation a key read at once isn't drawn over. A batch the watcher brings asks git's
  state there before it's applied (D153), one question out at a time; while git holds its lock, the lock alone is
  asked every 100 ms, one stat out at a time. What the top bar and the git panel draw of git — the branch, the
  operation under way — and the tool's settings the links' convention says are what this look last found (SD-D13),
  never read as they're drawn; a key that acts on the operation reads it at once. A key that ran git (a checkout, a
  pull, a merge, a rebase's step) asks a look and goes on once it has answered and a switch is done, as on the
  screen's thread. Given up on, a minute on, it's said once in Messages, the status line says `⚠ disk not answering`
  as for the watcher's until a look answers, and nothing is asked for a minute (SD-D6): no look, nor the feed's
  question (its batches applied as git was last seen); a look wanted meanwhile is asked once the minute is over.
  Before a look has answered, and while it's given up on, the activity file's stamp isn't known, and the background
  index waits (20.9). A test's App looks on the screen's thread, at once, as before.
- **A note's text** (SD-T6, SD-D16). The look jobs carry it (`notes`: a note's stat and text from one open,
  `walk.max_file_size` at most, as the walk takes it; `texts`: a note's text), in a background request with a look's
  minute, read by `core/workspace/walk/io/notes.ts`, which holds no parser. The watcher's batch (`VaultFeed`): its
  changed notes and the open files it names read in one request before it's applied (`Texts`,
  `tui/app/runtime/texts.ts`), the graph parsing each from the text given (`extractRead`); one batch's out at a time,
  those received meanwhile applied after it, a note changed in the graph meanwhile (a save of slipbox's own) left as
  it is, and an answer for a vault left dropped. An open file is checked against what it holds (`asRead`) and reloaded
  from what was read, unless it was saved, read again or opened since (its stamp moved): then what was read is older.
  Given up on, the batch is said once (`⚠ disk not answering` until one answers), held, and read again a minute later,
  never here. An open file the look each second found changed, and the graph doesn't know, is read there before it's
  reloaded. The background parse (`parseInSlices`) asks the next slice's texts — up to 50 notes of one folder, so a
  slow folder holds no other's in its request — while what's given is parsed: one slice out, two slices' texts at
  most; `Graph.parseSome` parses only the notes whose texts were given (`NoteTexts`, `core/workspace/graph/texts.ts`).
  A big note's text is read there before and after its parse on the parse threads. A slice given up on is said and put
  aside a minute. What's drawn (`drawApp`), a completion and the Problems and Info panels ask of the notes
  `partially`: a note not parsed yet is its stub, every note's list is of those parsed so far, a heading link into one
  isn't checked yet, and the Problems tab's `All (n…)`, the Info panel's backlinks and convention are marked `…` until
  the parse is done. A key that needs every note — a rename's or a relink's preview (`Renaming.preview`), the tags'
  lists, the backlinks list — waits for the parse to have them all (`KeyReads.notes`): the keys after it wait,
  `reading notes…` on the status line, `esc` gives it up; a slice given up on meanwhile is said. Anything else that
  asks of a note not parsed yet reads it here, as before (the task's Open says which).
- **The explorer's own tree** (SD-T7; § Side panes). The vault's own folders the tree shows — the view's, and each
  unfolded under it — are listed as the folders outside it are (`Listings`: kept, read again once a second old as the
  tree is built, and however old, the tree built again for it, once a vault one shows unmarked has its index said
  written, its row's mark the listing's — `onIndexWritten`, said by a write on the screen's thread and where a peek's or
  the background index's thread's is recorded; `Listings.indexed` drops a read under way then, a first one too; drawn
  only when the listing's digest changed), with the walk's filter
  (`list`'s `own`: its settings and its epoch, the filter made once on each thread, as the watcher's judging is): each
  entry with the walk's verdict on it (`exclusion`: a busy folder's note looked for, the `.gitignore`s read, a nested
  vault's marker, all there) and a note the walk didn't give over `walk.max_file_size` said (the notes it gave there
  named to the thread, `own.walked`, never statted). Another disk mounted at an entry is never looked at: its verdict is
  its name's, `walk.exclude`'s and the `.gitignore`s' holding it (`mountExclusion`). `fromDisk` builds what the walk
  didn't give from those listings, nothing read on the screen's thread; under a folder whose listing hasn't come, or
  gave no answer, its unfolded folders are listed for their rows' marks alone, since which of them is a link the walk
  followed is that listing's to say. Every row a listing gave carries what it read (`TreeRow.listed`) — where a link
  leads, a nested vault's own name, its branch and whether its index is in the cache folder — and its marks are the
  listing's (`Marks.listedFacts`; home's own row above the view, no vault's by a marker, has its index and branch read
  here, as the vault open's row always had); a row of the vault's own tree whose folder's listing hasn't come is drawn
  as the walk gave it, by its folder's name for a nested vault, unmarked, and nothing is read for it. A folder not
  listed yet keeps the walk's rows, `listing…` first under it after a moment; one whose thread gave no answer says so
  there (`can't read: no answer in time`), read again a minute later. Whether a path is left out (`Paths.leftOut`: a
  row's path, `rowPath`, and the tree's top, `leftOutAt`) is the verdict of the listing of the folder holding each
  folder on its way; while that listing is read, by the name alone (git's and slipbox's own folders, a hidden name,
  `walk.exclude`, a folders-only pattern only for a path the walk doesn't know as a file), else not known yet. A folder
  kept unfolded, or a row to select, stored by its path while its verdict wasn't known is moved to its row's path once
  the listing says (`Paths.rekey`, as the tree is built), and back if that changes. The view and the trail are statted
  there as the tree is built — they and the folders above them, one request out at a time — and the view gives way when
  the answer says its folder is gone, only while the view and the trail are those it asked about. A zoom (`z`, `-`, the
  breadcrumb, `shift+h` out of a hidden folder), `l` on a folder whose listing hasn't come and the start's folder ask
  `access` as a key's own read (`KeyReads.folder`): `can't read …` said as before, once it answers, and what the key
  does after the zoom done only then; the start's once what it opens is in (SD-T10). One `Listings` keeps both sides'
  folders, 256 at most; a folder listed on both (a nested vault's, unfolded, a path in it asked) is kept once for each.
- **The vault built again** (SD-T8; `Builds`, `tui/app/runtime/builds.ts`). A reindex, the watcher's rescan, a setting
  of the walk changed, a vault gone into, a branch's tabs and the folders asked for in home read the walk and the index
  on a disk thread (`walk`, a walk's ten minutes to answer); the graph stays as it was meanwhile, `reading the vault…`
  among the background tasks, where it can be stopped. A build the TUI's graph asks of itself without a walk given —
  the rescan's, the folders asked for, a file operation's — goes there through `Graph.rebuilder`; the CLI has none,
  and builds as before. The index crosses as its text, parsed here as it is now, with the hashes of the new notes a
  move could be (a vanished note's size) read beside it, so the moves are found without a read here; home's refresh
  after its walk takes its index from the walk's thread the same way. An answer is taken only while the vault open
  and its graph are the ones it was asked under. When something else has built that graph since (`Graph.builds`:
  home's refresh), it's read once more, then taken whatever was built meanwhile, so a busy vault never keeps it out;
  a graph made anew is never read again for it. What the graph took in meanwhile — the watcher's changes, slipbox's
  own saves, a file reached — is taken in again over it, as home's refresh does (`since`). Asked again while one is
  out, it's asked once more when that answers, every ask meanwhile as one; a setting of the walk, which makes the
  graph anew, takes the place of the one out, and what a build of the graph as it was follows (`Watch.rebuilt`) still
  follows when one was asked of it too. Given up on (SD-D6): `reading the vault gave up: …; it's read again in a
  minute`, the graph as it was, and asked again a minute later, while the vault and its graph are the same, with all
  it was asked, what waited for it too, as one build — and, for a graph never built, what's asked to follow it in that
  minute: a vault gone into whose session answers then opens its own note once it's read. An answer that can't be taken,
  a step of building from it failing, is said (`reading the vault failed: …; :reindex tries again`), every key let go. A
  vault gone into has a graph never built until its first answer: the keys wait for it as for a key's build, whether a
  note was named, the tabs brought back or neither, `reading the vault…` in the status line, `esc` not letting them go,
  and the background tasks can't stop it — they'd act on an empty graph, a rename rewriting none of the links to what it
  moves. Its note opens once it's built. A key's build's walk takes a disk thread at once, as a key's read does, not
  waiting for the other to be free: the thread SD-D2 keeps free is the keys', and every key is waiting on this walk —
  going into a vault, slipbox's own folders on a slow disk (SD-T9) would otherwise hold it, and the keys, behind them.
  After a rename or a folder operation (SD-D11), the build is read there
  too, but the keys after it wait their turn, as after an open, `reading the vault…` in the status line, and `esc`
  doesn't give it up, nor can the background tasks: the write is made, and the graph must follow it. So does the
  vault walked again for a link followed or forgotten (VV-D6), its target answering as slipbox starts among them: the
  next key finds what's through it, or no longer does — a list of notes opened then, all of them. Measured at
  10,000 notes (an index of 10 MiB, a local disk): the walk and the index's text crossing hold the screen's thread
  3–6 ms, the graph built from them here 25–29 ms, 18 of it the index parsed; built here whole, as before, 54–62 ms.
  The index sent parsed would hold it 13–18 ms as it crosses, saving no more than the parse.
- **slipbox's own folders** (SD-T9). What's read of them at a vault gone into, as the Vaults window opens and as a
  link's completion asks is read there (`own`), what was read last used meanwhile. Going into a vault, its session and
  the vault's positions of before 21.8 are a key's read no key waits for: the keys go on in the vault gone into once its
  graph is first built (SD-T8), and its
  tabs open where they were left once it answers — not over a tab opened meanwhile, though the note the switch was for
  opens and is shown all the same, unless you opened it yourself meanwhile; the recents of the moment first, a UI
  override set meanwhile kept; its session isn't saved until then. The machine's positions are carried over from the
  vault left — moved along with a vault moved by hand, as the file's are — and your config is what the TUI's look last
  read by its stamp, neither read again. The Vaults window lists the vaults last read (`Vaults — reading the list…` the
  first time), then what the disk says, its filter and pick kept; a link's completion offers this vault's notes and the
  other vaults' last read, then theirs as read — in the background, one read out at a time, a list opened meanwhile
  taking its answer and then one more read, and built only for a list still open. The answers kept for links followed
  (`links.json`) are statted by the TUI's look and read there when they moved, a read older than an answer written here
  dropped; a write reads the file first and keeps what it wrote. Measured on a home answering in 100 ms an op (SD-T9's
  log), a vault gone into holds the screen about 5 s less, the Vaults window opened again not at all; what still holds
  it there is the writes with the reads that merge them (below), the search index (§ Known limits) and the vault's index
  (SD-T8).
- **The start** (SD-D9, SD-T10; SD-D15). The screen is taken first: `prepare` builds no graph, and the App asks the
  vault's first build of `Builds` as it starts (`Vaults.ask`), its walk and index read on a disk thread as SD-T8 reads
  a vault gone into's — home's with the folder opened and its tabs' (`homeWalk`). Your config, the path named, `--base`,
  the machine's list recorded and the session (for the folders of home its tabs are in) are read before, as they say
  what the screen is. What the start opens is a key's own read, made meanwhile (`openInitialWindows`): the note named,
  the session's tabs (a restart's, its window's), or, once the graph says which, the vault's own note — none, said. A
  note read before its graph is built waits for it: its window says `reading the vault…` (`Builds.awaited`), its place
  kept for the layout to come, and the keys after it wait (SD-T8's first build). `q`, `ctrl+c` and `ctrl+q` quit at
  once, out of turn, while the vault open's graph has never been built (`Builds.unbuilt`), a vault gone into's too;
  `esc` gives up the note's read, the window left empty, the vault read all the same. The explorer's view goes to the
  folder opened, and what's said when nothing opens is said, once what the start opens is in. While the session's tabs
  are coming back it isn't saved over (`Session.coming`): a quit before they came keeps them for the next start.
  Nothing acts on a graph of no notes: the search index isn't caught up with it (`Search.start`; it would let go of
  every note it holds), and home's walk asked again, the graph's errors and the offer to relink what a move broke
  follow the first build (`Builds.after`). A vault that doesn't answer in time: its note shown as its text if its own
  read answered (`awaited` no longer), its links drawn as resolved, the vault asked again a minute later and the note
  drawn again when it comes; its read given up too, both said, nothing opened. A restart is brought back the same way.
- **What's drawn** (SD-D13; SD-T11, the last code task, measured first). A draw never reads the disk and never
  waits. What a layout asks of the disk (a `/…` link's first folder, a nested vault's file, a name's case on macOS, a
  picture), and the scratch's places, are answered from what's kept, and asked of a disk thread when they aren't, drawn
  again when they answer; meanwhile a link is drawn as resolved, and a picture's place is said.

**What stays on the screen's thread** (SD-D7). A note's save (`App.writeBuffer`: its check that the file is as read,
its atomic write, its write through a link, D220, its stamp told to the watcher), a file operation with the checks its
guards make before writing, the scratch, an export and slipbox's own state are written here: their order against the
watcher's next look and against quitting is what keeps a note safe. So is what slipbox's own state reads to merge
with another slipbox's before it's written: the positions and the session saved, the machine's lists, the background
index's place. So does registering a folder's watch, and the
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
- In the explorer's bullet, "Until a folder's first listing answers, nothing is under it" becomes "Until a folder's
  first listing answers, nothing is under it but, in the vault's own tree, the rows the walk gave" (built by SD-T7).
- In the explorer's bullet, "a folder you may not read says why when it's opened on, unfolded or zoomed into" becomes
  "a folder you may not read says why when it's opened on, unfolded or zoomed into — as its folder's listing read it,
  else asked as a key's own read (§ A slow disk)" (built by SD-T7).

Previously: "what's on the disk that the walk didn't give is read (`fromDisk`)"; "What the disk says of a row
(`Facts`: access, a broken link, the size, a vault's index and branch) is read once per row drawn, again when the tree
is built again"; "gives way to its nearest folder still there when the tree or the breadcrumb is built again
(`keepToWhatsThere`)"; "on one of two listing threads, apart from the walk's"; "Until a folder's first listing answers,
nothing is under it"; "a folder you may not read says why when it's opened on, unfolded or zoomed into".

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
- **The search index is opened on the main thread** (SD-T9): a vault gone into opens its own (`search.db`) and keeps
  it current with SQLite's calls, which wait; it's in the cache folder, local by default.
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
- In the paragraph on `app/runtime/watch.ts`, after its `GraphRefresh` sentence: "Its `Builds` collaborator in
  `builds.ts` builds the vault open again from a walk and an index read on a disk thread: what's asked, the answer
  checked and taken, a key's build holding the keys after it (SD-D5, SD-D11)" (built by SD-T8).

Previously: "the walk's thread and the listings' two (`walk-worker.ts`, `list-worker.ts`): asked"; no row for
`disk-jobs.ts` or `disk.ts`; no sentence on `Builds`.
