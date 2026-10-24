# Vaults, home and Elsewhere

A vault determines a file's search and link context, settings and session. The explorer's view is the part of the
filesystem you are looking at; changing that view does not combine independent vaults.

This chapter explains the model and its rules. For a practical session moving between two places, follow
[Working across folders and vaults](../guides/vaults.md).

## Vaults

A note's vault is the nearest folder above it that holds one of these:

| Marker | The folder is |
| --- | --- |
| `.git` | a git repository (or a worktree, or a submodule) |
| `.slipbox/` | a folder you gave slipbox's own settings |
| `.obsidian/` | an Obsidian vault |
| `.zk/` | a zk notebook |

So a repository is a vault, and so is an Obsidian vault or a zk notebook, with nothing to set up.
[Working across folders and vaults](../guides/vaults.md) walks through vaults with drawings and examples.

A note under no marker is in home, your home folder's own vault, when it's in your home folder (below). Outside both,
it's in [Elsewhere](#elsewhere), which has no index.

The vault decides:

- what `/` at the start of a path starts from, and which notes a wikilink's name can match
- how the links slipbox writes there look (see [Conventions](links-and-vaults.md#how-a-folder-writes-links))
- what is indexed and searched first. Opening any note or folder in a vault opens the whole vault.
- its settings, when it has a `.slipbox/config.toml` (see [Configuration](configuration.md))
- its session, its trash and its history, which slipbox keeps in its own state folder, never in yours

A note has one vault, however you open it. Opening a file deep in a repository opens the repository, from its top.

The status line shows which vault you are in, by its name (below) or its path. `space v i` (`slipbox info`) tells you
more about it.

On the command line, a command works in the vault of the note it names, or of the current folder. `--root` says where
to start ([The command line](cli.md)).

A few rules keep vaults predictable:

- **Your home folder is a vault without a marker,** home, whatever it holds (below). `/` is never a vault.
- **A vault inside a vault is a vault of its own.** A repository cloned into your notes folder keeps its notes to
  itself. The outer vault doesn't index them, and its names don't reach them. The explorer shows such a folder with its
  own icon. The vaults in your home folder are their own the same way.
- **A vault's index leaves out the busy folders,** `node_modules`, `build`, `vendor` and the like, when they look made
  by a tool: `.gitignore` leaves them out, or no note is directly in them. It leaves out what `.gitignore` and
  `walk.exclude` leave out too. The explorer lists them, marked `⊘` ([What the explorer
  lists](files.md#what-the-explorer-lists)).
- **Several markers in one folder make one vault.** Its settings and name come from `.slipbox/`.
- **Which markers count** is `walk.root_markers`. Only your own config may set it, since it decides where vaults are.

### Home

Your home folder, `~`, is a vault of its own, home. Its notes are those in your home folder that no other vault holds:
a list at its top, a letter in `Documents`. Start slipbox in your home folder, or open a note of home's, and home is
the vault you are in. The status line names it `~`. A link from another vault to a note of home's opens it in a peek,
as any other vault's does: `~ › todo.md`, and `o` goes into home.

Home is a vault as the others are. Its notes have backlinks, `/` starts from your home folder, and a wikilink's name
matches its notes. It has its own session, with its tabs, and each folder of it you open by name, such as
`slipbox ~/notes`, keeps tabs of its own there: open `~/work` and `~/notes` in turn, and each brings back what you had
open in it. `slipbox ~` brings back home's own. Its settings are your own config, since it has no `.slipbox/` to hold
any. It has git only when your home folder is itself a repository.

Home's index leaves out what isn't your notes:

- what the explorer doesn't list as a note or a text file, such as pictures and archives
- hidden folders: `.cache`, `.config`, `.local` and every other folder whose name starts with a dot
- the system's folders: `Library` on macOS, `AppData` on Windows
- `Downloads`, where your desktop keeps it
- the busy folders, wherever they are: `node_modules`, `.venv`, `venv`, `__pycache__`, `target`, `build`, `dist`,
  `.next`, `vendor`, `Pods`, `DerivedData`, `.gradle`, `.tox`, and caches, when no note is directly in them
- a folder where another disk is mounted, such as a network share, a USB disk or an `sshfs` mount. slipbox knows it
  from the system's list of mounts and never looks into it, so a share that stops answering can't hold slipbox up
- notes larger than `walk.max_file_size`, which are listed as skipped, not read

A file there still opens, from the explorer or by its path (`:e Downloads/list.md`, `:e .config/git/config`), and is
read again when it changes on disk, but it is never indexed. The explorer lists those folders, marked `⊘`, except the
hidden ones, and says `another disk` beside a mounted one. Unfolding it looks in.
`slipbox ~/Downloads` says why its notes aren't indexed: `~/Downloads: left out of home's index (Downloads)`.

Home is walked a little at a time while nobody is working, by the background index (see
[Backlinks](links-and-vaults.md#backlinks)), or
by the TUI while home is open and the background index is off. Until then, home is its top folder alone, and the folder
you opened: `slipbox ~/notes` walks `~/notes` at once, so its notes, and the vaults in it, are there, and its own note
opens, one directly in it before one in a folder of it. `slipbox ~/notes/inbox.md` walks the note's folder the same
way, and so does going into a folder of home from another vault, by opening a note of it or following a link to it.
Meanwhile a note saved at home's top, in a folder directly in it, or anywhere in the folder you opened comes as it's
saved; one deeper waits for the walk. The walk is kept, so opening home never walks it again: the files it found are
looked at, and a folder that changed is listed again. A folder whose time was set back after its notes changed, as
unpacking an archive with its times does, isn't, and its notes wait for the next walk. The command line walks home the
first time it needs to, and `slipbox index --refresh ~` walks it again. Changing `walk.extensions`, `walk.exclude` or
`walk.root_markers` walks home again too.

Home's index holds 10,000 notes at most, and its walk lists 5,000 folders at most, those nearest the top first.
slipbox says so when it stops there, in a message, in `space v i`, in `slipbox info` and in
`slipbox index --refresh ~`.

The folder you opened is indexed whole, however deep it is. Its notes count toward the 10,000: home's deepest other
notes make room for them, so a full home still holds 10,000. A note you make in it while home is full is indexed too,
and home's deepest other note leaves for it. A folder that holds more than 10,000 notes by itself is indexed whole all
the same, and home then holds its notes and no others. When home is full, the message adds that the folder is whole:
`~/notes, the folder you opened, is whole`.

### Elsewhere

A file outside your home folder and outside every vault is in Elsewhere: another drive, a share, `/etc`. Elsewhere is
one place for the whole machine. It has one set of tabs, wherever its files are, and your own settings.

Open a folder or a file there (`slipbox /etc/nginx`), or choose one in the explorer, and slipbox is in Elsewhere. The
status line says so: `Elsewhere ‹ /etc/nginx/nginx.conf ›`. Going into a vault brings back that vault's tabs, and coming
back brings back Elsewhere's.

Elsewhere has no index, so what needs one isn't there. slipbox says so, rather than showing an empty list:

- no backlinks (`space l b`, the Info view and `slipbox backlinks` say why)
- no search across it (`space f s`, `slipbox search`)
- no tags across its notes, and no check of their links (`slipbox tags`, `slipbox problems`)
- no git

In Elsewhere:

- A relative link is read from the note's folder, and `/` means the filesystem's root.
- Wikilinks have no names to look in.
- The links slipbox writes follow your own setting, else its default (see
  [Conventions](links-and-vaults.md#how-a-folder-writes-links)).
- The explorer lists a folder a level at a time. Nothing is walked.

A file of Elsewhere's that a link reaches from a vault is read in a peek, titled `Elsewhere › /etc/hosts`, which says
it has no backlinks. Its relative links are followed from its folder there. `o` goes into Elsewhere, to edit it.

### Links that lead out

A symlinked folder or file that leads out of its vault, or out of your home folder, isn't followed until you say so.
The explorer shows where it leads, and that it isn't followed: `data → /mnt/disk/data not followed`. In Elsewhere,
with no vault to stay inside, every link is shown that way.

The first time you open one, from the explorer or by its path, slipbox asks:
`~/notes/data → /mnt/disk/data leads out of notes: follow it?` (in Elsewhere, `… is a link: follow it?`).

| Answer | Does |
| --- | --- |
| Follow it (`f`) | reads it as part of the vault you are in: indexed, searched, its links counted as backlinks |
| Just look (`l`) | opens it read-only, this once. Nothing of it is indexed. A folder is listed a level at a time |
| No (`n`) | leaves it unfollowed. Opening it again asks again |

Just looking lasts until you go into another vault. While it lasts, the explorer says `just looking` on the link's
row.

What following allows depends on where the link is:

- **In home,** slipbox reads, indexes and writes through it.
- **In a vault,** it reads and indexes through it, but never writes to a file it leads to outside the vault. A link
  that a pull can change could otherwise lead a save to `~/.bashrc`. So a rename, a replace across files and
  `convert-links` leave a note out there as it is, and their preview says so. A note or folder out there isn't moved
  out of it, and an export of one goes only where `-o` says.
- **In Elsewhere,** it reads and writes as the file system allows.

In home, writing through a link covers a note's text, a new note and a new folder. Moving, copying or deleting across
it is refused, from the explorer and on the command line alike. In Elsewhere, every link on a path's way asks, from
the folder you opened, or on the command line the folder you're in, down to the file. A path you name outside that
folder asks only about the file itself.

A write never lands in a hidden folder of your home folder, or of a vault, through a link: slipbox refuses it there as
it refuses it named directly.

A peek, and `t` and `ctrl+o` in one, read another vault's note only as that vault would. If a link there on the way
isn't followed, the peek says so instead of reading it, and `o` goes there, where opening it asks. A link of the vault
you're in asks first, as opening it would. In the explorer, a link in a folder outside the vault you're in says whether
it's followed where it is, and unfolding one that isn't asks.

The answer is kept for that link and the place it leads, in `links.json` in slipbox's own state folder, never in the
vault. So a repository you clone can't bring its links already followed, and if a link later leads somewhere else,
slipbox asks again.

To take an answer back, press `space v l` (`:symlinks`). It lists the links you've answered, each with where it leads
and what you said: `followed`, `not followed`, or `just looking, this once`. `enter` forgets the one selected, and
opening it asks again. A link you followed is followed no more at once: its notes leave the index and search, its
folder is no longer watched, a tab you had open through it turns read-only, and the explorer marks it `not followed`.
On the command line, `slipbox symlinks` lists them and `slipbox symlinks forget <link>` forgets one.

Agents see what is followed: it's in search, in the context bundle and in the command line's answers. When a link leads
to a hidden folder (`~/.ssh`, `~/.aws`) or outside your home folder, the question says so.

A link within its own vault, or within your home folder, is a second name for what's already there, like the links
`stow` makes (`~/.zshrc → ~/dotfiles/zsh/.zshrc`). slipbox never asks about it, and indexes what it leads to once. The
explorer shows where it leads, and opening a link to a folder shows that folder.

A followed link on a slow disk, such as a network share, is read in the background. If it doesn't answer within three
seconds, slipbox gives up on it for now and says so, and the explorer says `not answering` on its row. It's asked
again a minute later.

On the command line, a path through a link that isn't followed is refused (exit 5), however the note is named, and so
is a snippet `capture --snippet` would read through one. The command line never follows a link on its own: answer in
the TUI first.

### Giving a folder `.slipbox/`

`.slipbox/` is optional. It holds a folder's own settings, `.slipbox/config.toml`, and, if you choose, its name.

- `slipbox init` in a folder gives it a `.slipbox/` with settings only. `slipbox init --name notes` names it too.
- `slipbox init --private` adds `.slipbox/` to the repository's `.git/info/exclude`. So it stays on this machine and
  out of git.
- In the TUI, `space v m` (`:init`) in Elsewhere asks whether to give the folder you opened one, and goes into it as a
  vault.

A committed `.slipbox/` travels with the folder. It holds only settings and the name, never anything slipbox writes as
you work.

Inside a vault, a folder can become a vault of its own. Select it in the explorer and press `v`, or `space v m`. Or run
`slipbox init <folder>`.

Some links would stop reaching what they did, such as a `/…` path or a wikilink by name across the new boundary. They
are rewritten first, after a preview.

To make the folder part of the vault holding it again, press `shift+v` in the explorer or `space v shift+m`, or run
`slipbox deinit <folder>`. Its `.slipbox/` goes to the trash, and the links are rewritten the other way.

A git repository stays a vault whatever you do, so it can't be made part of the vault holding it.

### Switching vaults

The TUI is always in one vault, or in Elsewhere. Going into another vault switches to it. You go into one, or into
Elsewhere, by any of these:

- `o` in a peek at one of its notes ([A peek at another vault](links-and-vaults.md#a-peek-at-another-vault))
- `ctrl+click` on a link into it
- a vault, or a file of one, picked in the explorer
- a repository or a worktree in the git panel, `o` on it, or a branch's `[Open]` ([Git](git.md))
- a named folder picked from `space v v`
- `:e` with the path of one of its notes, or a pointer

Following a link, a pointer, a backlink or a search hit into another vault only peeks at the note. Nothing switches
until you choose to go.

slipbox becomes that vault's, as if you had started it there. You get:

- its settings
- its index
- its session, with its tabs
- the note open where you were reading it

A message names the vault you are now in.

- **Back returns.** `ctrl+o` from the first place you visited in a vault takes you back to the vault before. You are
  at the note and place you left. A chain of switches unwinds one at a time.
- **Unsaved notes stop a switch.** slipbox refuses to leave a vault while a note in it is unsaved, and names the note.
  Save it (`:wa` saves them all) or revert it first.
- **The explorer shows where you went.** It's one tree: going into a vault outside its view zooms the view out to the
  folder holding both, the two unfolded and the vault you are in now highlighted ([Files](files.md#the-view)).
- **The named folders** are a key away: `space v v` lists them, wherever you started, and `enter` goes into one.

### Worktrees

A git worktree (made with `git worktree add`) is a vault of its own, with its own session, scratch and history. That's
because a worktree is usually a separate task, often an agent's.

The status line shows a worktree by its repository's name and its branch: `website@fix-menu`.

A worktree's notes are copies of the main checkout's, so their links don't count as backlinks.

- A pointer by the repository's name means its main checkout.
- A pointer with a branch (below) reaches the worktree that has that branch.
- A relative path out of the repository, from a worktree, is read from the main checkout. So `../shared/plan.md` names
  the folder beside the main checkout, wherever the worktree is kept.

[Git](git.md) covers the worktrees list.


## Names and pointers

A relative link to another folder, `../code/website/docs/plan.md`, breaks when either folder moves. It works on another
machine only if the folders sit the same way there.

A **pointer** names the folder instead:

```text
slipbox://website/docs/plan.md
```

slipbox looks up the folder named `website` on this machine, wherever it is, and opens `docs/plan.md` in it.

### A folder's name

A folder's name travels with it, since the note holding a pointer goes to other machines. The name is:

- the name in its `.slipbox/`, given with `slipbox init --name` or `slipbox name`
- else, for a git repository, the last part of its remote's address (`origin`'s, else the first remote's)

A clone of `github.com/you/website` is `website`. When two different repositories known here share that short name,
each is also known by its full one, `github.com/you/website`.

A name is never the folder's own name, and never its path, since neither travels.

A folder with neither has no name. That's the case for an Obsidian vault or a zk notebook on its own, or a repository
with no remote. Links reach such a folder by relative path, and the status line shows its path.

A name is letters, digits, `.`, `_` and `-`, compared without regard to case. It lives in `.slipbox/config.toml`:

```toml
[vault]
id = "3f9c2a7be1d04c55"         # written with the name: tells a copy of this folder from another folder
name = "notes"                  # what pointers call it: slipbox://notes/inbox.md
aliases = ["n"]                 # other names it answers to
previous_names = ["old-notes"]  # names it had: pointers by them still find it
```

slipbox writes this table only when you ask, never by opening a folder. You ask with `slipbox init --name`,
`slipbox name`, or `space v n` (`:name`) in the TUI.

- **Renaming a folder's name** (`slipbox name journal`, `space v n`) keeps the old one in `previous_names`, after a
  preview. Pointers by the old name still find the folder, and slipbox says so when you follow one. The relink rewrites
  them (see [Repairs](links-and-vaults.md#repairs)).
- **Naming a repository** that has no `.slipbox/` gives it one, to hold the name. A name chosen in `.slipbox/` wins
  over the remote's.
- **A name another folder here already has** is refused. `slipbox init` suggests another.
- **A private name** (`slipbox init --private --name notes-review`) is in a `.slipbox/` kept out of git. So its
  pointers work on this machine only, and slipbox says so when it writes one.

In the explorer, `shift+r` on a nested vault's row names it.

`space v i` shows the vault you are in: its name, and the other copies of it this machine knows.

### Pointers

A pointer is a Markdown link whose destination is `slipbox://`, the folder's name, and a path in it:

```text
slipbox://notes/ideas/coffee.md
slipbox://notes/ideas/coffee#brewing
slipbox://website@fix-menu/docs/plan.md
slipbox://github.com/you/website/docs/plan.md
```

- The path is read as a Markdown link's path. Without an extension it finds the note, and it may name a folder. It
  can't climb out of the named folder.
- `@branch` names the repository at that branch. That's the copy or worktree that has it checked out. Else it's the
  file as it is on that branch, read from git and shown read-only.
- Following a pointer into another vault reads the file in a peek, as following a path does. `:e` with a pointer goes
  there.
- If this machine doesn't know the name, or the folder isn't here, slipbox says so:
  "`notes` isn't on this machine yet: open it, or let the index find it". A pointer never offers to make a note.
- If two different folders have the name, slipbox lists each by its path, to open the one meant. It offers to rename
  one of them.

A pointer is always a Markdown link, also in a folder that writes wikilinks. A wikilink reads no pointer.

`:e` takes a pointer (`:e slipbox://notes/inbox.md`), and so does every `slipbox` command that takes a note.

### Copies of a folder

The same folder can be on a machine twice. Examples are a repository cloned twice, or a synced notes folder and its
backup.

slipbox tells copies of one folder from different folders that happen to share a name. Copies have the same remote, or
the same `id` in `.slipbox/`.

- **Copies** are one folder. Its pointers open the default copy, the first one found. When slipbox opens a second copy,
  it asks once which one links should open, and remembers. `space v shift+v` (`:folders-default`) or
  `slipbox folders default <name> <path>` changes it later.
- **A copy that isn't here,** moved or on a drive that is unplugged, is skipped. Another copy answers meanwhile, and
  slipbox says so.
- **A clone given a `.slipbox/` name of its own,** to tell it from the repository it was cloned from, is still a copy
  of that repository. A pointer by the repository's full name (`slipbox://github.com/you/website/…`), and a link to its
  hosting, open the repository's default copy. That's the one called by the remote's name, not the renamed clone. The
  clone's own name opens the clone.

  Being a copy, the clone can be made the repository's default copy
  (`slipbox folders default website ~/src/website-spike`, or `:folders-default`). It can also be named as the
  repository is (`slipbox name website` in it, or `init --name website`), since it is no different folder.
- **Different repositories** with one short name are told apart by their full names.
- **Different `.slipbox/` folders** with one name stay ambiguous until one is renamed. Following a pointer by that name
  asks which, and offers the renaming.

`space v v` (`:folders`) lists the named folders this machine knows, the ones seen last first. `enter` goes into one,
and `ctrl+o` comes back. `slipbox folders` lists them with their copies.

### A named folder moved

Moving or renaming a named folder on disk needs no link edited. Its pointers name it, and slipbox finds it again.

Only relative links between it and other folders break. The relink offers each one's pointer (see
[Repairs](links-and-vaults.md#repairs)).

You may open a named folder where it now is. If slipbox is sure it's the same folder, its session, scratch, trash and
reading positions come along, and a message says so. slipbox is sure when the folder's id or remote is at the new
place, and nothing is left at the old one.

If the move broke links in or out of the folder, their fix is previewed at once.

An unnamed folder moved by hand starts afresh. Naming it lets slipbox find it the next time.

slipbox learns where folders are by opening them, and from the background index (see
[Backlinks](links-and-vaults.md#backlinks)).


## Read another vault without leaving

A link into another vault can open a read-only peek. `esc` closes it, `t` keeps it in a tab, and `o` goes into that
vault. See [Following a link](links-and-vaults.md#following-a-link) for the complete behavior.

The explorer's zoom and breadcrumbs are described in [Files and folders](files.md#the-view). The vault's boundary
and the explorer's visible folder are separate concepts.
