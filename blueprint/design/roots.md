# Vaults

Which vault a file belongs to, what that vault answers, how it is walked, indexed and named, and where its state is
kept. "Vault" is the word users read and the design's: every folder holding a marker, home, and Elsewhere for the rest
of the file system (VV-D1–VV-D3); a pointer's word for a vault it can name is "named folder" (D79). Nothing is ever
written into a folder by opening it (D58). Links, which a vault scopes, are [links.md](links.md); going into another
vault in the TUI is [tui.md](tui.md) § Going into a vault, and looking at another vault's file without going is
§ The peek; where each file of state and cache lives is [how-it-works.md](how-it-works.md) § Storage; the commands
are [docs/manual/cli.md](../../docs/manual/cli.md).

The word root stays where agents, scripts and configs depend on it: the `--root` flag; `SLIPBOX_ROOT`; the settings
`[trust] roots`, `walk.root_markers`, `capture.location = "root"` and `links.path = "root"`; the explorer's actions
`rename_root`, `make_root` and `unmake_root`; the colour role `sidebar_root`; the command ids `root.trust` and
`root.untrust`; the state file `roots.json`; the CLI's JSON fields (`root`) and values (§ How a vault is named and
shown). The code said vault already (`core/workspace/vaults/vault.ts`, `vault.init`).

## Vaults and markers

A file's vault is the nearest folder above it holding a vault marker: `.git` (a repository's top, a worktree's or a
submodule's), `.slipbox/`, `.obsidian/` (an Obsidian vault) or `.zk/` (a zk notebook) (D69;
`core/workspace/vaults/vault.ts`,
`findVaultRoot`); else home, when it's under `~` (VV-D2); else no-vault, which users read as Elsewhere (VV-D3;
`locateVault`, `vaultOf`). Every file is in exactly one of them (VV-D4). The list of markers is `walk.root_markers`,
read from the user's own config only: a folder's config that sets it is ignored with a warning, since it decides where
vaults are. Several markers in one folder make one vault, its settings and name from `.slipbox/` (D58). A marker
inside another vault starts a vault of its own, its files its own (a worktree in `.claude/worktrees/` among them): the
outer vault's walk stops there (§ The walk).

Home is `~` by `$HOME`, or its real path when a path reaches it that way: one home, one key. It is never a marked
vault, whatever it holds (`isVaultRoot` stays false for it, `isNeverRoot`): a `.slipbox/` or a `.git` in `~` doesn't
make it another kind. `/` is never a vault; a `HOME=/` makes no home of everything.

One file has one vault, however it is opened (D80). `--root` says where to start and where a note's name is looked
for; it must be a vault itself, and a vault nested in it stays one, in the CLI as in the TUI. `--root ~` is home, and a
file of a vault in it is that vault's. Opening a file in a repository opens the repository, from its top: nothing is
asked, and nothing is written into it (D58).

A vault is never managed, and none is needed: a folder without a marker is home's or Elsewhere's. A vault answers
(D69):

- what is indexed and searched first: opening any file or folder inside a vault indexes the whole vault, not only the
  subfolder opened (§ The index, § Search scope);
- what a leading `/` is measured from, and which notes a wikilink's name can match ([links.md](links.md) § Paths,
  § Wikilinks);
- whose link convention a file follows ([links.md](links.md) § Conventions);
- whether two files travel together, and what a named folder is (§ Named folders; [links.md](links.md) § Between
  folders);
- its settings, when it holds a `.slipbox/config.toml` (§ Settings);
- which workspaces and state are the file's (§ State by vault).

Home answers the same, without a name, pointers or settings of its own (§ Home); Elsewhere answers none of what needs
an index (§ Elsewhere).

The TUI is always in one vault, home or Elsewhere: the current vault, whose tabs are shown. Choosing a file or folder
of another goes into it, its tabs becoming the TUI's; following a link to one peeks at it, going there a choice
(VV-D4, VV-D7; [tui.md](tui.md) § Going into a vault, § The peek).

## Home

Home (`~`) is a vault without a marker (VV-D2; `homeAt` in `core/workspace/vaults/vault.ts`, its mode `home`, beside
`vault` and
`folder`). Its files are those in `~` that no other vault holds: the vaults inside home are boundaries of its walk, as
nested vaults are, and a link from another vault into one of them is that vault's backlink, never home's. Its state is
keyed as any vault's, by its path (`vaultKey(~)`, the key `~` had as a plain folder: its workspaces carried over); its
settings are the user's alone (`configFilesFor` gives none of its own); it has no name and no pointers, and `init` and
`name` refuse it; its git is `~`'s own repository only, when `~` is one (`checkoutAt`). A folder of home given a
`.slipbox/` (`init`, `space v m`) has its links across the new boundary fixed, as in any vault, and `deinit` makes a
vault in home part of home again (`vaultOf` finds the vault holding it, `openVault` opens home). `/` and a link from
its top resolve from home, as from any vault's top, and a wikilink's name matches its notes. The scratch stays in the
state folder: nothing is written into `~` (D39).

**Its skip list.** Home's walk (`WalkFilter` with `{ home: true }`) applies a skip list instead of `.gitignore`, since
a dotfiles repository's `*` would empty it (`homeSkip` in `core/workspace/walk/walk.ts`): hidden folders, the system's
(`Library` on
macOS, `AppData` on Windows, at the top), `Downloads` (where `user-dirs.dirs` says, else `Downloads`), and the busy
folders anywhere (VV-D8, D237; § The walk: in home, one with no note at its top, since home reads no `.gitignore`); and
the files the explorer doesn't list, a note or a text file aside (`classify`'s binary group). A folder where another
filesystem is mounted, a share, a USB disk, an sshfs or NFS mount, is left out as `another disk` (`ANOTHER_DISK`), known
from the mount table alone (`core/workspace/vaults/mounts.ts`: `/proc/self/mounts` on Linux, one run of `mount` on
macOS, read once per
walk, `readMounts`), never looked at, nor for a marker: one that stops answering would hang whatever stats it. The skip
is recorded in the walk, so a walk kept drops a folder mounted on since, and walks one whose disk is gone. The explorer
lists it, `another disk` beside it, and only unfolding it looks in. A note over `walk.max_file_size` is listed as
skipped, not read. `reachable` refuses all of it in home: named, such a file opens, and is never indexed. `exclusion`
gives each reason, for the explorer's marks ([tui.md](tui.md) § Side panes). No watcher sees such a file, so the TUI
polls it while it's open, as it polls every open file the graph doesn't know.

**Its index, in slices.** Home is never walked when it's opened: its walk is made a slice at a time (`SlicedWalk`,
breadth first, entries by name) while nobody is working — in the TUI on the walk's own thread (§ The index) — and kept
in its cache folder (`walk.json`, `keepHomeWalk`; `core/workspace/vaults/home.ts`). Its graph is built from the walk
kept (`homeWalk`),
brought up to now as a build is (freshness checked, not assumed): each folder kept is statted; one changed since the
walk is listed again (what came and went, a folder new in it walked). Changed is a stamp other than the walk's for it:
its time and its ctime when the walk listed it, kept with it (`times`, a `Stamp`, taken before the folder is read; its
time `settled`, as the watcher stamps its folders), so a time set back counts too (`cp -a`, `rsync -a`, an archive
unpacked with its times, a disk whose clock is behind), even put back to exactly its stamp (setting a time moves the
ctime), and a folder listed within two seconds of its change is stamped to list again, a coarse clock giving the next
change the same time (its ctime counts for this when in whole seconds, a coarse clock's: `stampOf`). A walk kept by an
earlier version has no stamps: its folders are changed when newer than the walk, as then, until each is listed again and
stamped, or home is walked again — which the command line does at once, as the first time, for a walk where any folder
has no stamp, an earlier version's or one kept again from it (`homeWalkKept`, stamped), and the TUI's background index
on its next pass; a plan across home (`openVault`, the TUI's too) goes by the walk kept as it is. A walk that couldn't
read home's top holds none of home: it's no walk of home's (`fits`), as one under other settings isn't, so the TUI shows
home's top and its walk is made again, and the command line and a plan across home walk home at once; a build that
couldn't look at home's top at all keeps no walk, the one kept staying as it was. A folder that can't be read when it's
listed (a vault home's again too, or one through a link whose target is gone for now) isn't in the walk: the folder
holding it is stamped to list again, so it's tried again at each build till it can be read (a chmod moves no time the
walk keeps); so is the folder of a note that can't be looked at, and of a link whose target can't be now (gone, a disk
taken away, not searched), till it's back. One gone, or become a vault, is dropped with what it held; a vault the walk
found that is none any more is walked as home's; each note is statted again (gone, dropped; grown past the size cap,
skipped), and one that is a link kept only while the walk would keep it (`symlinkVerdict`: pointed elsewhere, it asks
again, whatever its folder's time says; § Links followed only when you say so). What changed is kept again, with the
stamps of the folders listed; so is a folder listed again for its stamp alone (set back, put back, or only its ctime
moved: a chmod; not a time moved on past the walk) with nothing in it changed, once the listing stamps it (not one it
couldn't read), or it would be listed again at every build. One whose time only moved on (a shell's history rewritten in
`~`) isn't worth writing the walk for: it's listed again at each build until something else is kept, as before the
stamps. A walk is kept by a graph built on the main thread, and by the TUI in home from the walk its walk's thread
brings up to date and hands back (`refreshHome`, T12); never by one built on a thread of a peek's backlinks or an
export's, whose walk may be older than the main thread's (`Graph.keepsWalk`). The graph's `walkedAt` is the walk's, so
the watcher lists again the folders changed since. So an agent's note made in home is there at its next command, and a
folder made a vault by hand (`git init`) leaves home. The walk is kept with its filter's settings
(`WalkFilter.signature`: the note extensions, `walk.exclude`, the root markers, where Downloads is): kept under others,
it's no walk of home's, so a `[walk]` setting changed is home never walked, its walk made again (the TUI's reload asks
for it; the background index makes a walk under way again; the CLI walks it at once). Never walked, home is its top
alone (`walkTop`): its notes and files, the vaults in it, its folders listed but not looked into.

A folder of home asked for by name is what was asked for: opened (`slipbox ~/notes`), or a file in it opened, it's
walked at once when home's walk doesn't cover it (never made, or stopped at its cap: a walk capped covers no folder
whole, since one it listed may hold folders it didn't), with home's skip list and whole, whatever it holds (D248: you
are working in it; the cap, below), and merged into home's walk as the graph is built (`Graph.askFolders`, `homeWalk`'s
`asked`), at each build after too, until home's walk covers it. Every way into a folder of home goes through one path
(`Vaults.ask`): the start, and every switch into home, a note of it opened from another vault (`intoOther`, a peek's
`o`), the way back, a folder revealed (a link to it). So do the tabs a session brings back into home: before they open,
each one's folder is asked for, a split's other window's too, as a file opened is. At the start and on a switch into
home, with the folder named (`Vaults.ask`, the session's tabs read first: `Session.toRestore`): the graph, not built
yet, is built once for them all (`Graph.askFolders`; one the build listed in a folder walked whole is covered). A
branch's, when it's checked out (`Session.openTabs`, `Vaults.askTabs`): built again once, and what follows a build
follows it (`Watch.rebuilt`: the watcher, the background parse, search). A tab in a folder home's walk hasn't reached is
a note of home's, its links and backlinks there. A file gone asks for nothing, nor one behind a link not followed, never
looked at. A graph built anew for home (a `[walk]` setting changed) carries the folders asked for (`askedFolders`). That
walk isn't kept: home's own, still made while nobody is working, covers it, and a start after finds the folder in it,
walked once. One home's skip list leaves out (`~/Downloads`, another disk), or behind a link the walk doesn't go through
(§ Links followed only when you say so), isn't walked (`walksInto`; `leftOutOfHome` says why).

The background index (`AutoIndex`, § The index) walks home first in each pass, finding the vaults in it as it did,
keeps the walk, builds home's index, then indexes the vaults it found; its progress is version 2 (`home`, `homeNotes`,
`capped`, the queue now the vaults left), and home's walk, quick beside the vaults, is made again after a restart. With
`[index] background = false` and home open, the TUI runs the same job for home alone, its place kept nowhere
(`indexJob`). Home never walked asks for the walk (`homeAgain`); when it's done, the TUI's graph is built again from it.
Until then, a folder the graph hasn't looked into is the walk's (`Graph.waitsForHomeWalk`: any but home's top and the
folders asked for by name), never the watcher's: a folder found in one isn't taken in, and one that comes into home's
top is listed and watched, not looked into, and asks for the walk again (`WatchBatch.toWalk`), the graph not built again
for it. A folder watched still has its own files taken in as they come, and a known note moved into a folder left to the
walk that the watcher sees (one come, or one in a folder of its that changed) is followed there, so it stays and the
move is seen: found by its time and size, under the same path below a folder that went (renamed or moved, the other
files known in it with them) or at the top of a folder changed since its notes went, never a copy kept with its times;
the rest of that folder stays the walk's. A note followed there is looked at every tick while no watch sees it, so a
change to it, or a move on into a folder the watcher sees, is seen at once; a move on into a folder it doesn't see waits
for the walk. Once the walk is kept, a folder that comes is taken in at once, as in a vault, within the cap. The CLI
walks home at once the first time it needs it (an agent's answer is now), and `index --refresh ~` walks it again. Home's
notes are another vault's backlinks as of its index (`Reach` reads it beside the vaults'), the relink of a vault moved
rewrites them too, and search's linked and all scopes take home as a vault (`scopeRoots`).

**The cap.** Home's index holds 10,000 notes at most, and its walk lists 5,000 folders (`HOME_LIMITS`), those nearest
the top: a walk stops past the cap, not at it, so one of exactly 10,000 notes left nothing out. What stopped it is kept
with the walk, said in a message when a walk that reached it is done, and in `space v i`, `info` and
`index --refresh ~` (`index.walked`, `index.capped`; the `--home` run's `home.capped`; the refresh's `capped`;
`describeCap`). Home opened from a walk kept that reached it says nothing more. The walk kept, brought up to now, holds
the cap too: a folder listed again walks what's new in it only as far as the room left, and says so when that runs
out. Its other files are capped as well, 10,000 nearest the top, listed for a link to name one; the walk goes on for
notes past them. What comes while home is open holds it: the watcher takes in no folder past it, and the graph no note
(`maxDirs`, `applyToGraph`'s `maxNotes`), leaving them to home's walk. Past the cap, the background index still looks
in the folders it left for vaults, a level at a time, home's skip list held (`seek`, kept with its place).

The folders asked for by name (D248) are walked whole and count against the cap, which never leaves out a note of
theirs: the merge (`homeWalk`) keeps all of theirs and as many of home's own as the room left, the deepest left out
first as the walk leaves them (`nearer`: the nearest the top kept, then by path). So home's walk, made before or
after, keeps as many fewer of its own in the graph as they hold; the walk kept is home's own still, at its cap, for a
start that asks for none. One that alone holds more than the cap is walked whole all the same, past both caps, its
notes all there and none of home's own. Its other files are held the same way. A note that comes into one while home
is open comes past `maxNotes`, home's deepest own note leaving the graph for it (`deepestOutside`); none left, it comes
past the cap. The cap's message, said as the graph built again after home's walk has it, adds that they're whole
(`describeCap`'s `asked`): `…; ~/notes, the folder open, is whole`; past the cap alone, `home's index is full:
it holds 12,345 notes, all in ~/big, the folder open — the rest aren't indexed`.

**What's shown.** The top bar names home `◈ ~`; `info` says `mode` `home`
(an addition to schema 1's values), the Info view and `stat` `home (~)`. Started in `~`, nothing opens over the
explorer: home is the vault. Each folder of home opened by name is a workspace of its own, kept beside home's own (its
top's), the top bar naming it (`◈ notes`; `folders`, by home's path for it, as `branches` keeps a branch's;
`SESSION_FOLDERS`), as it had before home was a vault; `slipbox ~`, and a switch into home by a note, bring back the
top's, and the way back the folder's it left (`App.homeFolder`). The top's tabs from before folders kept theirs are kept
as its own the first time one does. Started on a folder of home with no tabs of its own yet, the folder's own
`index.md`, `README.md` or `home.md` opens, else its first note by path, one directly in it before one in a folder of
it, never another of home's (`defaultNote`); none, nothing opens, and one home's index leaves out says why
(`~/Downloads: left out of home's index (Downloads)`; else `no notes in ~/x`). A vault's folder opens the vault's
workspace (VV-D5: a vault is one project). The explorer is home's tree from its walk, and what home's skip list leaves
out is listed there, never indexed ([tui.md](tui.md) § Side panes). A link, a backlink or a search hit from another
vault into a note of home's peeks at it as at any vault's, titled `~ › todo.md`; slipbox's own files under `~`
(`slipboxOwn`: the scratch in its state folder) are no note of home's, opened as they are, never gone into.

Not done: the vaults inside a folder home's skip list leaves out (a clone in `~/Downloads`) are no longer found by the
background index, only when opened, and nor is a vault whose own folder is hidden or is a busy folder (`~/.dotfiles`, a
repository `~/build` with no note at its top), in home or nested in a vault: the skip list and the busy folders are
checked before the markers. Link completion offers other vaults' notes, not home's. A slow disk that's home's own
filesystem still holds the TUI up where it's read on the main thread (§ The index, "Not done"). Freshness is by a
folder's time and ctime: on a file system that keeps no ctime of its own, a folder whose time is put back to exactly the
walk's stamp after its notes changed isn't listed again, its notes waiting for home's next walk or
`slipbox index --refresh ~` (the TUI's reindex reads the walk kept). The two seconds are by this machine's clock, so on
a disk whose clock is behind and whose times are coarse, a second change within the same tick of its clock is missed
too. A ctime is settled only when in whole seconds, so where a kernel moves file times once a tick (Linux before 6.13),
a time put back, the listing, and the same time put back with a note, all within that tick (a few milliseconds), is
missed as well. The watcher goes by a folder's time alone (`src/core/workspace/graph/watch.ts`), so one it polls, not
watches, put back
so while the TUI is open, waits for the next build.

## Elsewhere

Every file outside home that no vault holds is in no-vault, which users read as Elsewhere (VV-D3; `elsewhereAt` in
`core/workspace/vaults/vault.ts`, mode `folder` as the code's and the JSON's word): `/etc`, another disk, a share.
Elsewhere is opened
from a folder — the one opened, or the file's own — where its paths start (`root`), but it is one place for the machine:
one key, `elsewhere` (`ELSEWHERE_KEY`), so one workspace, one scratch and trash, wherever its files are. It isn't kept
in the machine's list (`roots.json`): there's no index to find again.

Nothing in Elsewhere needs an index, and nothing that does is offered there, each said so rather than shown empty: it
is listed a folder at a time, never walked (`isListed`: the graph lists the folder opened's notes, `listDirectory`; the
watcher watches that folder alone); no backlinks (`space l b`, the Info view's count, `slipbox backlinks`), no search
(`space f s`, `slipbox search`), no tags across it, no check of its links (`slipbox tags`, `problems`: exit 5,
`Elsewhere has no index, so no …`; `needsIndex`), no git. The context bundle leaves backlinks out, said in a warning.
Its settings are yours; `/` is the filesystem's root; a wikilink has no names to match. A peek at its file (a link from
a vault) says under a note that it has no backlinks, and why.

**What's shown.** The top bar names it `Elsewhere` (the status line, while the bar is hidden; `ELSEWHERE` in
`core/workspace/vaults/names.ts`; `rootLabel` in messages, a peek's title and the Info view), the path beside it whole:
its buffers are
keyed by their absolute paths, wherever the folder opened is. Going in says `Elsewhere — /etc/nginx`. `info` says
`vault  Elsewhere — <folder> (outside home and every vault: no index)`, `stat` and the Info view `Elsewhere`. The
explorer in Elsewhere has no tree of its own: every folder is listed a level at a time (`outsideRows`), by its whole
path, the view starting at the folder opened.

**Going in and out** (VV-D4). Choosing a file of Elsewhere's from a vault or home — `:e`, the explorer, `o` in a peek —
goes into Elsewhere as into a vault (`intoOther`, `goThere`): its tabs, `ctrl+o` back. In Elsewhere, a file of
Elsewhere's anywhere opens there: it's one place. A peek's `t` keeps Elsewhere's file as a tab read-only, marked
`Elsewhere` (`markElsewhere`); `o` on it goes into Elsewhere. Gone with the plain folder and the loose file (D58): a
loose file opened beside a vault's notes, editable, and a plain folder walked and indexed as a vault.

Not done: Windows' drives and shares (VV-D5) wait for native Windows (`14.14`–`14.17`): there, Elsewhere will be one
place for the machine, its folders by their drive.

## `.slipbox/`

`.slipbox/` is optional (D74, D79). It holds a folder's settings (`config.toml`), its format's version (`version`;
bumped only with a migration), and, optionally, its identity: the `[vault]` table's `name` and `id`, with `aliases`
and `previous_names`, read on its own and never merged into the settings (`readIdentity` in
`core/workspace/vaults/registry.ts`;
[docs/manual/configuration.md](../../docs/manual/configuration.md)). A name is letters, digits, `.`, `_` and `-`: no
spaces, `/` or `:`. The id is random, written with the name and never changed; it tells a copy of the folder from a
different folder of the same name (§ Named folders).

- **Written only when the user asks** (D74): the name and id by `slipbox init --name` and `slipbox name`, which the
  user runs; `slipbox init` without `--name` gives settings only. Nothing is written on its own into a `.slipbox/`
  made by hand, and nothing by opening a folder (D58). The identity is added to the config as text, its comments and
  layout kept; a `[vault]` table the edit can't follow is refused, to be edited by hand (`addIdentity`). Identity is
  never written from a worktree (§ Worktrees), nor for home, which `init` and `name` refuse.
- **Private:** `slipbox init --private` lists `.slipbox/` in the repository's `.git/info/exclude`, kept out of git on
  this machine; any `.slipbox/` git's exclude file keeps out is private, and its name holds on this machine only
  (§ Named folders).
- **Committed,** a `.slipbox/` is merged with its branch. There is little in it (the identity, written once, and
  settings) and nothing slipbox writes while it is used: state and caches are outside the folder, per checkout (D54).
- **Made and taken away:** `slipbox init <folder>` on a folder inside a vault (home among them) makes it a vault of its
  own, and `slipbox deinit` takes a nested vault's `.slipbox/` away, to the parent's trash, its folder part of the vault
  holding it again; a folder that is a vault by another marker (a git checkout) is refused, since it stays one. Either
  way the links that would stop reaching what they did (a `/…` path, a wikilink across the new boundary) are rewritten
  after a preview; relative links reach what they did, so taking `.slipbox/` away changes vaults, never what links
  reach (D79, D149; [tui.md](tui.md) § Files in the explorer; [docs/manual/cli.md](../../docs/manual/cli.md) § Moving,
  copying and deleting). The name goes with its `.slipbox/`, so the pointers by it, from the files this machine
  reaches, are rewritten in the same plan, as paths or the parent's pointer (D74, D75; [links.md](links.md)
  § Pointers).

## Settings

Settings apply deeper over broader: the built-in defaults, the user's config (`--config`, else `$SLIPBOX_CONFIG`,
else `config.toml` in the config folder), then the `.slipbox/config.toml` of each vault enclosing this one, broadest
first, then the vault's own (D62; `configFilesFor` in `core/workspace/vaults/vault.ts`,
`core/application/config/config.ts`). A vault
without `.slipbox/`
(a repository, an Obsidian vault) has no file of its own; home and Elsewhere take the user's alone. `slipbox info`
lists the files that applied, and a change to any of them reloads the TUI's settings.

What a folder's config can't set, because whatever is cloned brings it: a key that names a program to run (an
editor, a linter, a language server's command), `walk.root_markers`, `git.worktrees` (where slipbox makes folders,
outside the vault: [tui.md](tui.md) § Git) and `[trust]` come from the user's own config only; cloning a repository
never chooses what runs, nor where vaults are (D62, D166, D177). The layers, the keys and what only the user can set:
[docs/manual/configuration.md](../../docs/manual/configuration.md).

## The walk

One predicate, `WalkFilter` in `core/workspace/walk/walk.ts`, decides which files a vault holds, for the walk and the
watcher alike:
what the walk leaves out, the watcher doesn't subscribe to (D40).

- **Extensions:** `.md` and `.markdown`, case-insensitive (`walk.extensions`), are notes. Other files the walk passes
  are listed as the vault's files (pictures, data, code), among which a wikilink finds an attachment by its name.
- **Always skipped:** `.git`, `.slipbox`, and every entry whose name starts with a dot.
- **The busy folders** (VV-D8, D237): a folder named `node_modules`, `.venv` or `venv`, `__pycache__`, `target`,
  `build`, `dist`, `.next`, `vendor`, `Pods`, `DerivedData`, `.gradle`, `.tox`, or as a cache (`cache`, `Caches`,
  `pip-cache`, any case; the others in their case alone, so `Build` is a folder like any: `BUSY_FOLDERS`,
  `isBusyName`), at any depth, is busy when it looks generated: its `.gitignore`s ignore it, or it holds no note
  directly in it (a file of a note's extension, not hidden; its folders don't count). A notes folder called `build`,
  not ignored, is walked, indexed and written as any other. One function decides it (`isBusyFolder`), asked by the
  walk's filter (`WalkFilter.busy`, for a vault's walk and home's alike), the guards, the explorer's marks
  (`busyFolderAt`, for a folder outside the vault open), the repositories in the view, and the merge review (on a
  tree: a folder with no note at its top in it; what's tracked isn't ignored). Ignored means as the walk reads
  `.gitignore`, from the vault's top down, never a `git check-ignore` process; home reads none, so in home a busy
  name is busy with no note at its top. Whether it holds a note costs one listing of it, kept for the walk
  (`newWalk` forgets them) and asked again when the folder's mtime moved. A busy folder is left out of every walk:
  `exclusion` says `busy folder`, after `walk.exclude` and before `.gitignore` — ignored, a busy folder is busy, not
  reached (D61 still reaches what `.gitignore` alone leaves out). Such a folder is never reached (below): a file of it
  named opens, never indexed; the watcher doesn't watch it. A folder that changes kind — its first note at its top, its
  line in a `.gitignore` added or gone — is taken in or left out when the watcher next lists its parent (a change
  there) or the vault is walked again (a `.gitignore` changed is a rescan); a note added inside a busy folder alone
  moves no watched folder. The explorer lists it all the same, browsed, never indexed ([tui.md](tui.md) § Side
  panes). The busy folders whose names start with a dot (`.venv`, `.next`, `.gradle`, `.tox`, `.cache`) are left out
  as `hidden` first: the explorer lists them only with the hidden names (`files.hidden`, D250), and in a vault a note
  in one, named or linked, is reached as in any hidden folder (in home, never).
- **`.gitignore` is honoured**, nested ones included, with git's own semantics: every `.gitignore` from the vault's top
  down applies, and the deepest one with an opinion wins, so `!keep.md` re-includes; a folder excluded is never
  descended into. Case follows git's default `core.ignorecase`: insensitive on macOS, sensitive on Linux. What git
  ignores (`target/`, `dist/`, vendored trees) is what must not resolve `[[README]]`. `walk.exclude` adds
  gitignore-syntax patterns. Home has its skip list instead (§ Home).
- **Reached, then indexed:** a git-ignored file, or one under a hidden folder, isn't walked, but is indexed when it is
  reached (a note's link points at it, and then its own links reach further; it is opened in the TUI — by `:e`, or
  from its row while the explorer lists hidden names, D250 — or named to the CLI) and stays indexed after, the list
  kept with the index (D61). `.git`, `.slipbox`, a busy folder, `walk.exclude`,
  a vault of its own and, in home, all its skip list leaves out are never reached: named, such a file is read and
  nothing more: the TUI's `:e` opens it as the explorer opens its row, never indexed — a nested vault's, in that vault
  (D249). Nothing new is put where it would never be indexed: a new note (`write --create`, the TUI's typed path), a
  move or rename (`mv`, a folder given a busy name) or a copy into a busy folder is refused — the CLI's exit 5, the
  TUI's warning, as the explorer refuses one on a busy `⊘` row. The guards (`checkWritable`, `cleanTarget`,
  `copyPath`, `Files.createNote`) ask the filter (`Graph.neverIndexed`: a folder on the way whose `exclusion` is `busy
  folder` or `always skipped`, up to a root of its own), not a list of names, so the refusal follows the filter. They
  ask it of the folder as the write leaves it: the folder a note lands in holds a note then (a moved or copied folder's
  own, when it has one at its top), so a busy name there that isn't ignored is a folder like any, and `write
  build/plan.md` makes a notes `build/`; a note deeper in a generated-looking one (`target/debug/x.md`), or in an
  ignored one, is refused, said why (`git ignores it`, `no note at its top`). A file already there is edited as any
  other; `walk.exclude`'s folders and nested roots still take
  a new note (made, not indexed here). A folder listed a level at a time (Elsewhere's) reaches nothing. Reached files
  aren't watched: they are read again when the index is next built.
- **Written where `walk.exclude` leaves it out, said** (D246): the setting is yours, so a write there is never refused,
  as a busy folder's is, but the message the write gives anyway ends with where the path stands — `created drafts/x.md
  (not indexed: walk.exclude)`, `saved …`, `autosaved …`, `renamed a.md → drafts/a.md (not indexed: walk.exclude): 2
  changes in 1 file`, `copied …`, `exported … (Markdown (.md), not indexed: walk.exclude)`, `added to the scratch (not
  indexed: walk.exclude)` — at every write of the note, never as a message of its own: each save's message stands alone
  in the status line and Messages, so it says what that write did, and a note said once would read as indexed at the
  next save. `WalkFilter.notIndexed` decides it: `walk.exclude` names the path or a folder on its way, and no root
  nested on the way takes it (indexed there by its own settings); `Graph.notIndexed` adds that Elsewhere indexes
  nothing; `notIndexedSaid` words it. The TUI asks it of what each write's message names (`Files.notIndexed`: a new note
  or folder, a save, `:wa` — the one left out named, else counted — a move, a paste, a Markdown export, the scratch kept
  in the vault); a task ticked or a rename's link fixes say what they did, as before. The explorer's `⊘` row of what
  `walk.exclude` leaves out takes a new note, a new folder or a paste as the typed path does (`Files.newItemBase`: the
  row's folder, when `Graph.notIndexed` says so of the row's path); any other `⊘` row is refused as before. The command
  line: `write`, `mv` (a dry run's too), `cp` and `export` end their line so and add `notIndexed: "walk.exclude"` to
  their JSON; `capture` and `mkdir`, whose human output is a bare path for scripts, keep it so and say it as a warning
  (in human output only: the JSON's field says it there). Asked of the walk's settings, never the index, so a `capture`
  walks nothing.
- **Nested vaults are boundaries:** a subfolder holding a vault marker is a different vault, and is not walked (D69,
  D40). A fixture vault inside a repository doesn't leak into it, and a repository's notes, or an Obsidian vault's,
  stay its own.
- **Symlinks:** a link within its vault (or within home) is a second name for what's there, never walked twice; one
  leading out is followed only when you say so, and one pointing at something that isn't a file (a FIFO or a device,
  which a read would hang on), a loop or a broken link is skipped and reported (§ Links followed only when you say so).
- **Files a vault controls are read with care:** a cloned or unpacked folder can hold a FIFO or a symlink to
  `/dev/zero` where a note, `.gitignore`, `.slipbox/config.toml` or `.slipbox/version` should be. Each such read opens
  without blocking and refuses anything but a regular file, and the small files are capped at 1 MB (`readRegular` in
  `core/foundation/platform/fsutil.ts`): a hostile folder gets a warning, never a hang.
- **Size cap:** files over `walk.max_file_size` (default 4 MiB) are listed as skipped, not parsed.
- **Errors never abort:** unreadable folders and files are collected and reported as warnings.
- **Encoding:** UTF-8; invalid sequences decode to U+FFFD and the file is flagged; a BOM is noted and stripped for
  parsing only.

## Links followed only when you say so

A symlinked folder or file leading out of its vault, or out of home, is shown as a link and not read until you answer,
the first time it's opened: follow it, just look, or no (VV-D6; `core/workspace/vaults/symlinks.ts`,
`tui/following.ts`). The rules
replace D40's "a symlinked folder is never followed" and "a symlinked file only inside the root", and the CLI's refusal
of every read through a link out of the root; D220's writes stay for vaults.

- **Which links ask.** A link's scope (`linkScope`) is its vault's real path, home's for home, none in Elsewhere. A link
  whose real target is inside it is `within`: a second name for what's there, never asked about — a file kept as the
  walk kept it (a note twice dropped), a folder not walked again (`LINK_REASON.within`). The links `stow` makes in home
  (`~/.zshrc → ~/dotfiles/zsh/.zshrc`) are such. One leading out is asked about; in Elsewhere, with no vault to stay
  inside, every link is.
- **The answer** (`linkAnswer`, `setLinkAnswer`): follow or no, kept in `links.json` in the state folder, by the link's
  own path (its folder by its real path, `linkKey`) and its target's real path, never in the vault: a cloned repository
  can't bring its links trusted. A link that leads elsewhere now has no answer, so it asks again. Just looking is the
  TUI's, for this once (`Following.looking`), never kept, cleared when you go into another vault.
- **Forgetting an answer** (`answersKept`, `forgetLinkAnswer`): `space v l` (`vault.links`, `:symlinks`) lists the
  symlinks answered — the answers kept, newest first, then those looked at this once — each `link → target` and what
  was said (`followed`, `not followed`, `just looking, this once`; one that leads elsewhere now, or is gone, says so);
  `enter` forgets one (`Following.forget`): asked again when it's next opened. One followed, or looked at, is no more at
  once: the vault walked again without it (its notes out of the index and search, its folder no longer watched:
  `watcher.sync` to the walk's folders), a tab read through it left read-only (`… isn't followed now — read-only; open
  it again to choose`) and never read again through it, the explorer's rows marked again. The CLI: `slipbox symlinks`
  lists them (`--json`: `[{link, target, answer, at, now}]`), `slipbox symlinks forget <link>` forgets one by its path
  (exit 3 when nothing was said of it). Forgetting is the CLI's to do; answering stays slipbox's.
- **The walk and the watcher** (`symlinkVerdict`): a link out is gone through only when you follow it and its target has
  answered a probe (`answered`); a folder is walked under the link's name, once (`followed`: a second link to it, or
  into it, skipped as `LINK_REASON.twice`), never one holding the vault (`loop`). What isn't gone through is in
  `skipped` with the link's target (`Skipped.link`): `out` (not followed), `waiting` (followed, its target not answering
  yet), `within`, `loop`, `twice`. The watcher takes the same verdict: a followed folder adopted and watched as the walk
  walks it. `reachable` reads through followed links only (`blockingLink`). A vault is known by its real path, so one
  reached through two links is one vault; a file reached by two names is one tab, indexed once; the view uses the path
  as reached, belonging the real path.
- **Slow targets** (`probe`, `probeFollowed`): before anything reads through them, a vault's followed links' targets
  are asked whether they answer — a folder listed, a file statted — off the main thread, given up on after three
  seconds (`PROBE_MS`), asked again a minute later. The CLI asks before each command (`probeLinks`; a target given up
  on is a warning); the TUI at the start and on going into a vault, in the background, walking the vault again with
  those that answer. Never answered, a followed link is skipped as `waiting`. Only the probe is off the main thread: a
  target that answered is walked as the vault is.
- **What a yes allows** (`writesThrough`, `writeNote`'s `through`): in home, reading, the index and writing through it —
  a note's text, a new note, a new folder, in the CLI and the TUI alike (`newPath` in `tui/files.ts`); in a vault,
  reading and the index, never a write that lands outside the vault, followed or not (D220) — a file under its folder
  written as the vault's whatever its window knows of it, one the index doesn't take too (`walk.max_file_size`); in
  Elsewhere, what the file system allows. A window read through a link not followed now — looked at, or forgotten with
unsaved text — is never written through it (`App.writeBuffer`): not saved, autosaved, nor a task toggled in it, nothing
  read through it to toggle one or to ask about a change out there; it's writable again only once the link is followed
  and its target answered. Plans keep to it (`mayRewrite` in `core/rename-plan.ts`): a rename's relinking, a replace
  across files, the converter and a heading's rename leave a file whose write would land out of its vault as it is, or
  through a link where its place doesn't list it (`landsHidden`: a hidden folder, as `checkWritable` measures it), a
  `skipped` row saying so, and `applyPlan` refuses a plan holding one, or moving anything from or to outside the vault
  (`outside`), before it writes: an undo and a saved plan are checked as they're carried out. What it writes it writes
  where it was read, found before anything moves: a file reached through a link, through the link, never over it; one
  reached through a link that moves with its folder and leads elsewhere from its new place, its text read a part at a
  time from there as the disk will read it, or a followed one (its answer staying where it was), not at all — an edit
  for the file is right for no name — left, and said; nothing read, after, behind a link not followed (the index walked
  again then), nor by an undo before it refuses; a move whose note is gone since its plan writes nothing; each in a
  folder it can write and search, or nothing is written. A file reached by two names from two folders — two links, a
  note the vault reached and a link to it, a file other than a note and a link to it, or a note of another vault (or of
  home) reached through a link, which its own vault reads from its own folder — is written for neither, each reading its
  links its own way, and said; two in one folder edit it alike: written once, each name indexed again. Another name is
  never looked for behind a followed link whose target has stopped answering (`quietFollowed`). A move's source is
  checked as its destination is: a move, copy or delete whose source or destination crosses a link out of the vault, or
  out of home, is refused in the CLI and the TUI, in home too, said the same: `… resolves outside the vault` for what's
  moved, copied or deleted, `… would land outside the vault` for where it goes. A link named itself crosses nothing when
  it moves: its entry is checked, in its folder by its real path (`entryInside` in
  `core/foundation/platform/fsutil.ts`), and it's renamed
  or moved as a link (`moveLink` in `core/workspace/vaults/symlinks.ts`; D260), what it leads to staying where it is;
  its answer goes
  with it, in place of any kept where it goes — one without an answer leaves one there for where it leads, an answer
  being a place and where it leads, as a link made there by hand would find it; one that can't be kept there (the state
  folder unwritable) is said, and the index walked again, the link not followed at its new name — and a relative one
  moved to another folder is written again there to lead where it did, from its own text, the plan and its undo saying
  so (`movedLinkText`). Its plan's `move.link` says it moves as one, and its undo moves it back as one: a link put where
  something else went is judged by where it leads. A link's own relative links are left, and said, when another name the
  index holds, one the plan doesn't move with it, leads to the same file. A destination is one entry (`sameEntry`; a
  second name for its file, a hard link, is another): a link moved onto what it leads to, or onto another link to it,
  would go over something else, so it's refused as any other there is; a link there is judged by its folder, as the one
  moving is on a disk that ignores case; one whose new folder can't be made changes nothing, and one that can't be moved
  takes away the folders made for it. A link inside a folder that moves is left as the folder's move leaves it; a link
  leading to a vault, or to a folder holding one, isn't moved (`checkSource`'s `vaults`, `outside`), a vault being known
  by its real path; a copy or delete of a link out is refused still. An export's default place, beside a note reached
  through a link out of the vault, is refused; `--out` names one. Where links are looked at on a path's way
  (`blockingLink`): from the vault's or home's folder; in Elsewhere every link on the way asks, from the folder you work
  in — the TUI's folder opened, the CLI's current folder (`workDir`) — down; a path named outright outside it starts at
  its own folder, the file itself asking: what's above the folder you work in is yours to name (macOS's `/tmp` and
  `/var` are links).
- **The CLI** refuses a read through a link not followed (`refuseUnfollowed`, exit 5: `… is reached through a link
  that isn't followed (~/notes/data → /mnt/disk/data): open it in slipbox to choose`) — a note however it's named
  (`resolveNote`, Elsewhere's listing holding a linked note as any other), a snippet `capture --ref --snippet` reads —
  a write through one (`checkWritable`, exit 5: `…: reached through a link that isn't followed (…); not writing it`),
  and a vault's write through a followed one (`a link leads it out of the vault`); `mkdir` says either is outside the
  vault. `checkWritable`'s hidden folders are measured as the path is reached and where the write lands: a link into a
  hidden folder of home or of a vault is refused there as the path named there is. It never asks, nor follows unasked.
- **The TUI** asks before it opens a path through a link not followed — a note (`open`, `openInNewTab`), an explorer
  row's folder unfolded or zoomed into (`gate`): a list of three answers, `f` follow it, `l` just look, `n` no, saying
  what a yes allows here; when the target is hidden (a dot folder on its way from home) or outside home, a line over
  them says agents see what's followed (`agentsWarning`): search, the context bundle and the CLI's answers. Follow:
  kept, the target probed, the vault walked again (`walkAgain`), then what was asked done. Just look: read-only (`just
  looking: … isn't followed — read-only`), never indexed; a folder listed a level at a time. No: kept; opening it again
  asks again. A path through a link not followed opened otherwise (a workspace's tab, `:e`) isn't read, said so or
  asked. In the explorer a link row says where it leads, and whether it's followed ([tui.md](tui.md) § Side panes); out
  of the vault open, by the rule of the place it's in (`locationAt`), and unfolding one not followed there asks
  (`gate`'s `there`). Elsewhere's listing shows a linked note as any other; only opening it asks. A peek (VV-D7), and
  `t` and `ctrl+o` in one, read by the rule of the place peeked into (`Following.blockedThere`): through a link it
  hasn't followed, the peek says so instead of reading (`Not read here: …`), `t` keeps nothing, and `o` goes there,
  where opening it asks; a link of this vault's on the way asks first.

Not done:

- A "no" kept asks again at every open, as no answer does (ideas.md § Roots and vaults).
- A link not followed still has its target resolved and statted by the walk (`symlinkVerdict`) and by the explorer's
  listings: on their own threads in the TUI (§ The index), each given up on in time, but on the main thread where the
  vault open is built (the CLI, a reindex, a rescan, a vault gone into), which a mount that hangs behind one holds up.
  The probe guards followed links only.
- A followed link skipped as `loop` or `twice` is described in the explorer as `not followed`.

## The index

The index is a cache: it makes slipbox fast and gives backlinks, never decides where a link points, and can be
deleted (D61). Each vault's is in its cache folder (the link index, the search index); the parse cache is shared
(below; [how-it-works.md](how-it-works.md) § Storage). Elsewhere has none (§ Elsewhere); home's is built in slices
(§ Home).

- **On demand carries the load:** the folder opened, indexed recursively and first; folders a followed link leads
  into; paths an agent's CLI command names. Once indexed, a folder is remembered and refreshed when touched again.
  Files beyond the walk are indexed when reached (§ The walk). A vault nested in this one, or holding it, is indexed
  when a link or a backlink needs it, without having been opened on this machine.
- **In the background** (`core/workspace/graph/autoindex.ts`, `AutoIndex`): while the TUI is open and nobody is working
  (no key or
  click, and no CLI command from an agent, for `index.idle_seconds`; this vault's own index done), home is walked a
  slice at a time and its index built, then each vault found in it is indexed with its own config, so backlinks from
  vaults never opened appear by themselves (§ Home). It doesn't walk into a vault it found: the vaults nested in one are
  taken from that vault's walk. Its place is kept (`autoindex.json`; each CLI command marks `activity`): it resumes
  where it stopped, and a pass done, the next is a day later. `[index] background = false` turns it off; `slipbox
  index --home` runs it now. It leaves out what home's walk leaves out (D218). Places outside home (drives, `/tmp`) are
  indexed when opened or linked to, a vault's; Elsewhere's never. The TUI's side: [tui.md](tui.md) § Going into a
  vault.
- **Off the main thread, in the TUI** (T12; `core/workspace/walk/walk-thread.ts`): the walks the TUI makes by itself are
  made on the
  walk's own thread (`walk-worker.ts`, serving `core/workspace/walk/walk-jobs.ts`), so a folder that answers slowly (a
  share, a disk
  asleep, a folder of many thousands of files) never holds up the keys or the screen: home's walk, kept there between
  its slices and stepped a slice at a time as on the main thread, so it rests while you work; the index of each vault
  the background index finds, and home's own from its walk (`IndexJob`, `core/workspace/graph/index-job.ts`: opened,
  walked, its notes
  parsed — a small one in a single step's budget — kept there between slices as well), written to its cache there,
  home's walk kept there too (`keepHomeWalk`); the folders past home's cap, looked in for vaults; and home's walk kept,
  brought up to now when home's graph is built again after its walk. Each is the same code as on the main thread
  (`AutoIndex` takes a walker, `core/workspace/walk/walkers.ts`: `HERE` for the CLI, whose command waits for its answer
  either way),
  given what the thread can't see for itself (`core/foundation/workers/worker-context.ts`): the environment naming
  slipbox's folders, the
  root markers, the probe's answers. `AutoIndex` reads nothing of home itself: home's walk is told by its settings alone
  (`FilterSettings`), its filter made, and its location read, where it walks — and its walk, made under a filter other
  than home's when it's kept (Downloads moved meanwhile, a root marker added: the filter's signature, compared where the
  walk is), walked again, never kept under the new. The machine's lists are written on the main thread alone, from what
  the thread read of a vault it opened (`Opened`: its key, worktree, identity and real path, and the real path and
  presence of each copy the list of named folders records, `copyFacts` — one recorded since taken as it was recorded, by
  its real path, there: nothing read on the main thread; `recordRoot`'s `key`, `recordFolder`'s `known`) — a vault
  counted found once, its count kept with the place (`counted`, set afresh with each pass), so one being indexed when
  the TUI quit isn't counted again; home recorded as found apart from the vault being indexed, when it's walked again
  meanwhile. The place is written only when it changed: a tick waiting on the thread writes nothing. Nor does the thread
  write the walk a refresh makes: what changed in home's walk kept comes back unkept (`homeWalk`'s `keep`), kept by the
  TUI once it takes the answer — dropped when the graph was built since (`Graph.builds`) or the vault open changed; when
  only the folders asked for did, building nothing (home's walk covers them: a branch's tabs), asked for again with
  them, or home would stay unwalked; a file that came, went or changed in the graph meanwhile (the watcher's, slipbox's
  own write) taken in again over it, as the watcher takes one in, and one reached (20.8) that the build didn't keep
  reached again, never one of home's own. A slice or a seek has five minutes on the thread (a folder that always takes
  long, a share's thousands of files, still read), a whole walk (a vault opened and walked, home's walk kept brought up
  to now) ten; past that the thread is started afresh and the work given up on, never made on the main thread instead:
  home's walk tried again ten minutes later (`WALK_RETRY_MS`), the pass waiting for it, and said (`home's walk gave up:
  a folder didn't answer in time; it's tried again in ten minutes`) — so is home's walk kept brought up to now for its
  graph, home walked again ten minutes later (`homeAgain(true)`), the vaults of the pass indexed meanwhile; a vault left
  for the next pass; home's index said (`home's index gave up: …; it's made again at the next pass`). The explorer's
  listings have two threads of their own ([tui.md](tui.md) § Side panes).

  Not done: the rest of what reads a slow disk on the main thread still holds the TUI up while it's read — the watcher's
  polling of the vault open (a stat per watched folder every two seconds, per note every thirty; its folders listed
  again), the vault open built again (a reindex, the watcher's rescan, a vault gone into, a setting changed, a rename, a
  branch's tabs in folders of home not walked), a note's text read to parse or open it, the explorer's own tree of the
  vault open (`fromDisk`, its rows' marks) and the view's folder statted as its tree is built, slipbox's own state,
  cache and config folders (under home by default: the machine's lists, the place the background index keeps), and the
  walk at the start: a vault's before the screen is up, home's as it comes up, with the folders it asks for (its tabs').
- **Freshness is checked, not assumed:** a build lists the folders again and keeps a file's entry only while its size
  and modification time match, since a folder's own time doesn't change when a file in it is edited; a file gone is
  dropped, or paired as a move ([links.md](links.md) § Repairs). Folders open are watched. What is covered and how
  fresh it is shows in `slipbox info` and the TUI, and the CLI refreshes a path on demand.
- **A drive unplugged** is unavailable, not deleted: a vault or a named folder's copy on one (a path under `/Volumes`,
  `/media`, `/run/media` or `/mnt` that isn't there) stays listed, and links into it are broken, said so, until it
  is back; its links into other vaults drop out of their backlinks meanwhile (`unavailable` in
  `core/workspace/vaults/registry.ts`).
- **Shared by content** (`core/documents/markdown/parsecache.ts`): what a note says once parsed (links as written,
  headings, anchors,
  tags, aliases, previous names, a title of its own) is kept in one SQLite file, `parsed.db`, by its text's hash (its
  BOM aside), its format and the parser's version (`INDEX_VERSION`, bumped whenever what is extracted changes), for
  every copy on this machine: a worktree, a branch switched to, a clone parses only what no copy has (D61). No
  setting goes into the key, since parsing reads none. A title from the file's name, the file's BOM and line endings
  are the file's own, never cached. Where a link points depends on where the file is, so links are resolved, and
  backlinks derived, per vault (D76; [links.md](links.md) § Backlinks). `SLIPBOX_PARSE_CACHE=off` goes without it.

## Named folders

A named folder is a vault a pointer can name (D74; `core/workspace/vaults/folders.ts`). Its name travels with it, since
the file
holding a pointer goes to other machines:

- the name in its `.slipbox/` config, given by `slipbox init --name` or `slipbox name`;
- else, for a repository, its remote's last part (`research`: `origin`'s, else the first remote's), qualified
  (`github.com/me/research`) when a different repository this machine knows shares the short one
  (`core/workspace/links/remotes.ts`);
- never its folder's own name, nor a copy's path: neither travels. A vault with neither (`.obsidian/` or `.zk/` alone,
  a repository with no remote) is unnamed: shown by its path, and linked by relative path. Home is never named.

A repository with both is named by its `.slipbox/` name, chosen and committed with it; its remote is kept as its
qualified name. A worktree whose own `.slipbox/` has no name takes its main checkout's. An alias (`aliases`) finds the
folder as its name does; a name it had (`previous_names`) still finds it, said so (`via: "old-name"`), and the relink
rewrites the pointer. Names are compared case aside.

| Two folders named `notes` | Told apart by | A pointer means |
| --- | --- | --- |
| copies of one repository | the same remote | the repository: this machine's default copy |
| different repositories | different remotes | each by its qualified name |
| copies of one `.slipbox/` folder | the same id in `.slipbox/` | the folder: its default copy |
| different `.slipbox/` folders | different ids | ambiguous until one is renamed |

- **The default copy** of a name is the first found. When a second copy is here, the TUI asks once which one its
  links open, and remembers (D74); `slipbox folders` lists each name's copies, and `folders default` changes which
  one ([tui.md](tui.md) § Going into a vault has the TUI's). A copy is a folder by its real path: one reached through a
  symlink is the same copy. A repository's worktrees are its branches, not copies: a worktree's copy is its main
  checkout.
- **A copy gone** (moved, unplugged) stays listed, unavailable, and is no choice; lookups take another copy
  meanwhile, said so (`via: "another-copy"`).
- **A clone with a `.slipbox/` name of its own,** given to tell it from the repository it was cloned from, is still a
  copy of that repository: the lookup takes a repository's copies, one remote, as one folder, whatever their
  `.slipbox/` call them (`byRepository` in `core/workspace/vaults/folders.ts`). By the remote, a qualified pointer and a
  hosting URL open
  the repository's default copy: the one called by the remote's name (its last part, as its `.slipbox/` name, an alias
  or the remote's own), else the first found; that one not here, another copy of the repository, said so. The clone's
  own name opens the clone, and a pointer written to a copy of the same repository is no clash. Being a copy, it may be
  made the repository's default copy: `folders default` (and the TUI's `:folders-default`) takes any copy of the
  repository, under whatever name (`repositoryCopies` in `core/workspace/vaults/folders.ts`), and the repository's name,
  its full name
  and its hosting then open the clone; `slipbox folders` lists it under the repository too, `*`, with its own name. A
  default that is no copy of the repository any more (its remote changed) is passed over for the repository's first
  copy. And it may be named as its repository is (`init --name`, `name`): a copy of the same repository is no
  different folder (`folderNamed`) (DF-D30). Named alike, its copies are called by the remote's name alike, and the
  first found opens until `folders default` picks one.
- **A name for one copy only** is a private `.slipbox/` (`slipbox init --private --name research-review`): its
  pointers work on this machine only; `slipbox info` and `slipbox folders` say it is private.
- **Different folders of one name:** `slipbox init` refuses a name a different folder has here (its name, an alias or a
  name it had; a copy of the same repository is none, DF-D30), suggesting one: the folder's name, prefixed with the
  enclosing vault's (`x-plan` inside `x`), `-2`, `-3` after it while that is taken; `slipbox name` refuses it too. A
  clash found later (a folder synced or cloned in) isn't raised until it matters: following a pointer by that name lists
  each folder by its path, a repository once whatever its copies, to open what it names there, and offers renaming a
  `.slipbox/` one, the parent folder's name prefixed as a suggestion and the edit to its config shown first, since it
  may be committed. "Not now" leaves it ambiguous, picked when followed; the CLI gives the candidates, each folder's
  path (exit 4).
- **A folder renamed** keeps its old name in its config: a pointer resolves by the current name when the file is
  there, else by an old one, said so, and the relink rewrites it.
- **The lookup** (`folders.json` in the state folder) is durable: each name, its copies and the default, filled from
  the folders opened and by the background index finding `.git` and `.slipbox/`. A folder that is gone stays listed,
  unavailable, so an unplugged drive comes back. A folder no longer that one (renamed, its remote changed, its
  `.slipbox/` gone) leaves the old name's copies when it is next seen.

## How a vault is named and shown

A vault is told by the name pointers use (its `.slipbox/` name, else its remote's), else by its path (`~/…`); a worktree
of a named repository as `name@branch`, a detached head by its short commit; home as `~`, and Elsewhere as `Elsewhere`
(D77, VV-D2, VV-D3; `rootLabel` in `core/workspace/vaults/names.ts`). Never by its folder's own name, and never in a
file. The explorer's
vault rows,
`slipbox info` and the CLI's `root` and `name` show it so ([tui.md](tui.md) § Screen layout, § Side panes, § Going into
a vault;
[docs/manual/cli.md](../../docs/manual/cli.md) § `resolve`). Files in lists (backlinks, search results, pickers, hovers)
are shown by path, from the vault's top ([rendering.md](rendering.md) § Blocks and inlines).

The permanent top bar separates explorer zoom, workspace and git (VB-D3, VB-D6). A git workspace shows the vault name,
with its branch once in the git item; a home folder opened by name shows that folder, home's own workspace `~`.
The all-vault list (`space v v`, `:folders`, `slipbox vaults`) includes unnamed known vaults and saved home workspaces,
marked as home's, most recent first. Repository headers group their main checkout and linked worktrees, each row
labelled by branch and selecting that checkout's own vault/workspace. `/` filters. Pointer names and copy defaults
remain the independent `slipbox folders` list (VB-D5).


What the CLI prints for a person says vault, as the TUI and the docs do (VV-D1); its JSON keeps root in its values,
whose `schema` stays 1 (DF-D9): `info`'s `mode` is `root`, `home` or `folder` (Elsewhere); a change's `kind` is `root`
for a vault's naming, `make-root` for `init` of a folder inside a vault, `unmake-root` for `deinit`. Its reasons in
words say vault: a vault nested in another is skipped by the walk as a `nested vault`, a link out of it as
`link not followed: it leads out of the vault`; nothing to undo is "in this vault". `info` labels the vault `vault`
(Elsewhere `vault  Elsewhere — …`); `stat`'s row and the Info view's say `vault`. The renames log and the saved plans
keep the code's words, `vault`, `make-vault` and `unmake-vault`, and the CLI prints them as its JSON's, `root`,
`make-root` and `unmake-root` (`kindWord` in `cli/files.ts`). A theme slipbox ships is `built-in`, as a document type is
([docs/manual/cli.md](../../docs/manual/cli.md) § `info`, § Moving, copying and deleting, § `themes`).

## Search scope

Search ranks this vault first, then, under a divider, the vaults linked to or from it; widened to every vault this
machine knows, those join the linked ones, ranked together by score (D64, D79; `core/scope.ts`). Linked means this
vault's notes link into it by path, or its notes link here, as of its index; home is a vault to it (`scopeRoots`);
every scope leaves out worktrees, whose notes are their main checkout's, even one a note links into (by `@branch`, or
by path). Each vault is searched with its own index, caught up first (a scan where it has none), and a hit of another
vault carries its name and its path, and peeks when opened ([tui.md](tui.md) § The peek). Elsewhere has no search, said
so (§ Elsewhere). The CLI takes `--scope here|linked|all`, `here` by default, so an agent's results are predictable;
in the TUI, `ctrl+a` in search widens it a step at a time ([tui.md](tui.md) § Overlays).

## Worktrees

A linked worktree (`git worktree add`) is a vault of its own: its own state and cache, its own workspaces, scratch,
positions and indexes, since worktrees are an agent's task, each its own context (D54). Which checkout a folder is comes
from the files under `.git` (`core/git.ts`): a worktree's `.git` is a file naming `.git/worktrees/<name>`, whose
`commondir` is the repository's; a submodule's has no `commondir`, and is a repository of its own. Never a git process,
and never where the folder is: `project/worktrees/x/feat` is a worktree of `project/x` as surely as `x/.worktrees/feat`
would be.

- **State by path:** each checkout's state is its path's, the main checkout's and every worktree's apart (D76). A
  worktree moved by `git worktree move` is found by git's name for it, and its state carried to the new path, only
  when its admin folder (`.git/worktrees/<name>`) is the one recorded: its `commondir`'s inode and time, which `git
  worktree add` writes and a move leaves (`worktreeFingerprint`). A worktree removed and another added under its name
  (git reuses it) is a new one, its state its own.
- **Identity is never written from a worktree:** each would write its own, and merging the branches would conflict
  over it. A worktree whose config has none takes the main checkout's; with none there either, it has none until the
  main checkout has one, committed (`identityAt` in `core/workspace/vaults/folders.ts`).
- **A pointer's name means the main checkout** (`slipbox://x/note.md`), the stable one; a worktree's branch is named as
  one: `slipbox://x@feat/note.md` (D75; [links.md](links.md) § Pointers).
- **Backlinks don't count a worktree's links:** its notes are copies of the main checkout's ([links.md](links.md)
  § Backlinks).
- **A relative path out of the repository is taken from the main checkout:** `../y/plan.md` names the sibling
  repository beside the main one, wherever the worktree is kept ([links.md](links.md) § Paths).
- **A worktree that is gone** (merged, removed) has its cache removed at once; its state, an agent's scratch, a month
  after it was last seen (`pruneWorktrees` in `core/workspace/vaults/registry.ts`).
- The top bar, the explorer's row and the git panel show a worktree's branch (`research@refactor`, `⎇ feat`). A
  branch switch inside one checkout is one event (D153; [tui.md](tui.md) § External changes). The git panel lists the
  branches with their worktrees, makes and removes them (GIT-D9; [tui.md](tui.md) § Side panes).

## State by vault

Personal state is kept in the state folder, never in the folder it is about (D39, D76; where each file lives:
[how-it-works.md](how-it-works.md) § Storage). The vault's folder holds what is shared: its notes and its settings
(`.slipbox/config.toml`), which travel with it; whether you trust it, your workspaces there and what they share, are
yours (WSP-D1):

- **By vault:** its workspaces and what they share (`session.json`; [tui.md](tui.md) § Positions), the scratch,
  trash, undo log, staleness, moves seen and branch heads seen are kept under the vault's key (§ Storage keys): home's
  by its path, as any vault's; Elsewhere's under its one key, `elsewhere`, wherever it was opened (VV-D3). Opening
  `project/` or `project/docs/` brings back the same workspaces, since both are in the vault `project/`; a worktree,
  another path, has its own. In home, each folder of it opened by name is a workspace of its own (§ Home).
- **Reading positions are by file:** one `positions.json` for the machine, each note by its absolute path and the vault
  it was read from, so a note opened from another vault, or from a folder inside its vault, is where it was left. A
  vault's history lists its own files and those read from it. The newest 5,000 are kept.
- **The machine's vaults** (`roots.json`, `core/workspace/vaults/registry.ts`): each vault seen, home among them, by
  path, with when it
  was seen and indexed, a worktree's name and fingerprint, and its moves; never Elsewhere, which has no index to find
  again. A vault is recorded before its graph opens, so a named folder moved here by hand has its cache adopted first.
- **The answers kept beside them,** by path, never by vault: the links you followed or refused (`links.json`, § Links
  followed only when you say so), the vaults you trust (`trust.json`, [trust.md](trust.md)), and each branch's base
  (`bases.json`, by repository: [tui.md](tui.md) § Git).
- **A named folder moved by hand takes its state along** when it is sure: its `.slipbox/` id or remote at a new path,
  nothing left at the old one, and exactly one such copy gone, also when the background index found it at the new path
  first (`movedFrom` in `core/workspace/vaults/folders.ts`, `recordLocation` in `core/workspace/vaults/vault.ts`). Its
  cache, workspaces, scratch, trash,
  undo log and positions move to the new key; the move is kept with its entry in `roots.json`, for the relink, which is
  offered at once ([links.md](links.md) § Repairs). That isn't a guess, so nothing is asked. A worktree moved by
  `git worktree move` is found as § Worktrees says. Any other move (an unnamed vault, two copies gone) starts fresh;
  naming the vault (`slipbox name`) lets it be found again.
- **State does not travel between machines;** reading position is machine-local anyway.
- **Older state is moved once:** the instances' list (`vaults.json`, D59) is read into `roots.json` the first time
  slipbox runs, each instance's state and cache moved from its key to its path's, and the old list removed; a vault's
  own `positions.json` is merged into the machine's the first time it is opened. The home vault's
  `$XDG_DATA_HOME/slipbox/home/config.toml` is no longer read (D58). A plain folder's entry from before Elsewhere
  (D76) is home's when it was `~`'s, its key and state the same (`recordLocation`); any other is dropped, with its
  cache and state, a month after its folder is gone, as a worktree's is (`pruneWorktrees`).

## Storage keys

A vault's cache and state folders are named by its key, `<basename>-<hash>`: the hash the first 12 hex characters of
SHA-256 over the vault's real path; the basename, its characters outside `A-Za-z0-9._-` made `_`, is only there so a
person can find the folder (D39, D76; `vaultKey` in `core/foundation/platform/paths.ts`). Home's is `vaultKey(~)`;
Elsewhere's is
`elsewhere`, one for the machine (`ELSEWHERE_KEY`, VV-D3). Where each file lives: [how-it-works.md](how-it-works.md)
§ Storage.
