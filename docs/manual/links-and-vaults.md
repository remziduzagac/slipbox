# Links and vaults

slipbox reads the links your notes already have, written the way GitHub, Obsidian or zk write them. It follows them
from one folder into another.

This chapter covers:

- following a link
- every form a link can take, and where each one lands
- the folders that give links their meaning (vaults)
- the names that let a link reach another folder, wherever it is
- writing links
- backlinks
- how slipbox keeps links working when notes move

## Links that work as they are

Open a folder of notes, and its links work as they are:

- In a repository, `[Coffee](ideas/coffee.md)` opens `ideas/coffee.md`, as it does on GitHub.
- In an Obsidian vault, `[[coffee]]` finds `coffee.md` wherever it is in the vault, as Obsidian does.
- In a zk notebook, `[Coffee](ideas/coffee)` finds the note without its `.md`.

Nothing has to be converted or set up first. Opening a folder writes nothing into it.

A link to a note in another folder works too:

- A relative path, `[the site's plan](../code/website/docs/plan.md)`, works while the two folders sit side by side.
- A pointer, `[the site's plan](slipbox://website/docs/plan.md)`, names the other folder instead of saying where it is.
  So it keeps working when that folder moves, or sits somewhere else on another machine.

Two ideas sit behind this:

- A **vault** is the folder a note belongs to. It decides what a link like `/plan.md` or `[[plan]]` means.
- A **name** is what a pointer calls a folder by.

Both are explained below, as the links need them.

## Following a link

Put the cursor on a link and press `enter`. `g f`, `g x`, `space l f` and a click on the link do the same. If the cursor
isn't on a link, `enter` follows the first link on its row.

| Key | Does |
| --- | --- |
| `ctrl+enter` (`space l t`) | Follows the link into a new tab, as a browser's ctrl+click does |
| `ctrl+w f` (`space l s`) | Follows it into the other window of a split, splitting first |
| `tab`, `shift+tab` (also `] l` and `[ l`, `space l n` and `space l p`) | Moves to the next or previous link |
| `ctrl+o` | Goes back to where you were ([History](finding.md#history)) |
| `space h n` | Goes forward again |
| `y l` (`space l y`) | Copies the link's target: the full path of the file it reaches, or the link as written |

In source mode and in the lens, you see the Markdown itself. There, `enter` reads the link around the cursor from the
text.

A link inside an embedded note is followed from that note, as if you had opened it.

What happens depends on what the link reaches:

| The link reaches | Following it |
| --- | --- |
| a note | opens it, at the heading or block the link names |
| a heading in this note | moves the cursor to it |
| a folder | shows the folder in the explorer, unfolded and selected |
| a note not written yet | asks for the new note's name, typed already. `enter` makes it |
| a data, text or code file | opens it in slipbox. A line fragment (`#L42`) opens it at that line |
| a picture or another binary file | copies its path |
| a web address | copies the address. slipbox opens no browser, which over SSH would open on the wrong machine |
| a picture on the web | fetches it to draw it, after asking by default (`render.images_remote`) |
| a footnote reference | moves to the footnote's definition |
| a tag | lists the notes that carry it |
| a note in another vault, or a file of Elsewhere's | reads it in a peek, at the place the link names (below) |
| one of several notes | lists them, to pick the one you meant |

[Reading](reading.md) describes how pictures, embedded notes and pictures on the web are drawn.
[Configuration](configuration.md) has the setting.

### A peek at another vault

Following a link never moves you to another vault. A note there opens in a peek: a large floating window over the one
you are in, the note drawn as it would be there. Your tabs, your vault and your place stay as they were.

A peek is for reading. `/` finds in it, and you can select and copy, but you can't edit it.

| Key | Does |
| --- | --- |
| `o` | goes there: into the note's vault, with its own tabs, as [switching vaults](#switching-vaults) does |
| `t` | keeps it as a tab in this vault, read-only, the tab marked with its vault's name (`kestrel: sync.md`) |
| `z` | fills the screen, or makes it most of the screen again |
| `esc` | closes it. You are where you were |

The links in a peek are read in the note's own vault:

- A link to another note of that vault moves the peek there. `ctrl+o` goes back, inside the peek.
- A link to a note of the vault you are in closes the peek and opens the note in your tabs, as usual.
- A link to a third vault moves the peek there.

Under the note, the peek lists its backlinks, when its vault has an index. Most do, once the background index has
been through (see [Backlinks](#backlinks)). A vault without one yet says so: `o` goes there, and finds them.

The same peek opens for a backlink from another vault, for another vault's hit in a search widened with `ctrl+a`, and
for a file of [Elsewhere's](#elsewhere) that a link reaches. With the mouse, a click on such a link peeks, and `ctrl+click`
goes there at once. `ctrl+enter` still follows a link of this vault into a new tab.

## The forms a link takes

Whatever form a link is written in, slipbox reads it as a file and, optionally, a place in it. The screen shows the link
as the note writes it. slipbox never rewrites a link for display.

### Paths

A Markdown link's destination is a path. These are the forms slipbox reads, written from a note in `~/notes`:

| Written as | Reaches |
| --- | --- |
| `[t](ideas/coffee.md)` | the file relative to the note: the form slipbox writes unless the folder says otherwise |
| `[t](/ideas/coffee.md)` | the file from the vault's top, else the filesystem's `/ideas/coffee.md` |
| `[t](ideas/coffee)` | without an extension: the file as written, else `ideas/coffee.md`, else the folder |
| `[t](ideas/)` | a folder |
| `[t](~/notes/ideas/coffee.md)` | the file from your home folder |
| `[t](/home/you/notes/ideas/coffee.md)` | the absolute path, when nothing in the vault is at `/home/…` |
| `[t](file:///home/you/notes/ideas/coffee.md)` | a file URL |
| `[t](<cold brew.md>)`, `[t](cold%20brew.md)` | a name with spaces, in angle brackets or percent-encoded |

A few things hold for every path:

- A note is found by its name whatever the case, on every filesystem. `[t](Inbox.md)` reaches `inbox.md`.
- A path may leave the vault (`../website/docs/plan.md`, `~/…`, an absolute path). It reaches the file in whichever
  vault holds it, and following it reads the file there in a peek ([A peek at another vault](#a-peek-at-another-vault)).
  Such links work while the folders are laid out the same way. [Names and pointers](#names-and-pointers) has the form
  that doesn't depend on it.
- Nothing inside code is a link, neither in a code span nor in a fenced block.
- A link in an HTML comment isn't one, nor is a link whose bracket is escaped (`\[t](x.md)`).
- A destination with a bare space in it (`[t](my plan.md)`) isn't a link, as CommonMark says.
- Reference links (`[t][ref]` with `[ref]: ideas/coffee.md` elsewhere) are links like any other.

### Wikilinks

A wikilink is Obsidian's form: double brackets around a note's name.

| Written as | Reaches |
| --- | --- |
| `[[coffee]]` | the note whose file name, without its extension, is `coffee`, anywhere in the vault |
| `[[ideas/coffee]]` | the note at that path from the vault's top, or the one whose path ends so |
| `[[coffee.md]]` | the same note. An extension is allowed |
| `[[coffee\|how I brew]]` | the note, shown as "how I brew" |
| `[[coffee#Brewing]]` | the note, at its heading "Brewing" |
| `[[coffee#^ratio]]` | the note, at the block marked `^ratio` |
| `[[#Brewing]]` | a heading of this note |
| `[[./coffee]]`, `[[../coffee]]` | a path from this note, never a name |
| `![[coffee]]`, `![[beans.png]]` | embedded: the note, or a picture, drawn in place |

Names are compared without regard to case, so `[[Coffee]]` reaches `coffee.md`. A note also answers to the names its
front matter gives under `aliases:` (or `alias:`), after every file name.

A picture or other file (`![[beans.png]]`) is looked for in this order, as Obsidian finds one:

1. beside the note
2. from the vault's top
3. by its name anywhere in the vault

A Markdown export's copies are left out. They're in a folder ending `.export.assets`, or beside the export they belong
to (`book.assets/` beside `book.md`).

In a table cell, write the `|` before the shown text as `\|`.

When two notes share a name, slipbox takes the first of these:

1. the one whose name has the same case as the link
2. the one in the linking note's own folder
3. the one in the deepest folder the two share
4. the one with the shortest path

That is how Obsidian's default setting writes links, so an Obsidian vault opens unchanged. If two candidates are still
equal, slipbox doesn't guess. Following the link lists them to pick from.

A wikilink is read within its vault. A vault nested inside this one ends its names, so a link into it needs a path
(`[[nested/coffee]]`).

A file that belongs to no vault has no names to look in, so its wikilinks reach nothing. When you follow one, slipbox
says so, and says what would make the folder a vault.

### Headings, blocks and lines

The part after `#` is a place in the file:

- **A heading,** by GitHub's form of it (`#cold-brew`), or by its text (`#Cold%20brew`, `<#Cold brew>`). A repeated
  heading is numbered as GitHub numbers it: `#cold-brew-1`. A wikilink names a heading by its text
  (`[[coffee#Cold brew]]`), and can go down a path of them (`[[coffee#Methods#Cold brew]]`). An explicit id comes
  first: `## Cold brew {#cold}`, or an HTML `<a id="cold">`.
- **A block,** `#^ratio`: the paragraph or list item that ends with `^ratio`, or has it alone on the line after it.
- **Lines,** as GitHub writes them: `#L42`, `#L42-L50`, `#L42C5-L45C10`.

If two headings have the same text, the first one is used, and slipbox says so.

A link to a heading or block that isn't there opens the note at its top. slipbox says which heading or block it didn't
find.

### Links in front matter

A wikilink in a note's front matter is a link, as Obsidian's properties hold them. It can be one wikilink,
`related: "[[coffee]]"`, or a list of them. Such a link is:

- followed
- counted as a backlink
- rewritten when its note is renamed
- drawn as a link where the properties are shown

A Markdown link, a bare path or a web address in front matter is a value, not a link.

### Links to the repository's own hosting

In a git repository, a link to one of the repository's own files on GitHub, GitLab or Bitbucket opens the file in your
copy. An example is `https://github.com/you/website/blob/main/docs/plan.md`. This works as long as the address names one
of the repository's remotes, or a named folder's (below).

- A link to the repository's own page opens its README.
- If the address names another branch than the one checked out, the link is still followed. slipbox says which branch
  it names, since the file may differ there.
- Such links count as backlinks.
- A rename rewrites the path in the address, leaving the rest as it was.

### Links in code and data files

Code and data files have links of their own: a path in a code comment, a reference in a JSON schema. They're followed
and counted as backlinks, as a note's are. [Code](code.md) and [Reading](reading.md) describe them.

## Where a link lands

While the cursor is on a link in a rendered note, the status line names it and says whether it resolves. It says
`→ ideas/coffee.md (resolved)`, or `(unresolved)`, `(ambiguous)` or `(external)`.

Sometimes a tie between two notes of one name decided where the link went. Then the status line says that too:
`→ [[coffee]] (resolved, the shortest path of 2 named so)`.

`shift+k` on a link opens a small window with what the link lands on: the heading's section, the block, or the top of
the note. The window is titled with the note's path.

For a heading or block that isn't there, the window says so. It also says that the link opens the note at its top, and
shows that top.

`g d` follows the link, as `enter` does.

Links are drawn in the theme's link colour. A link that reaches nothing has a colour of its own, red in most themes. So
does a link that several notes answer to.

### Fragile links

A link won by where it is written is **fragile**. It won either as the note in the deepest shared folder, or as the one
with the shortest path. A note of the same name written nearer would take it, without a word.

- A fragile link is among the note's problems, as information, with the path that names the note for sure.
- `space c a` on the link writes that path.
- `slipbox problems` lists every fragile link in the vault.

A note you make or remove may send an existing link by name somewhere else. slipbox then says so in a message, even
though no link broke.

### From the command line

- `slipbox resolve <link> --from <note>` follows a link as the TUI does.
- `slipbox links <note>` lists a note's links, each with how it landed and how sure that is.

Both are in [The command line](cli.md).

## Vaults

A note's vault is the nearest folder above it that holds one of these:

| Marker | The folder is |
| --- | --- |
| `.git` | a git repository (or a worktree, or a submodule) |
| `.slipbox/` | a folder you gave slipbox's own settings |
| `.obsidian/` | an Obsidian vault |
| `.zk/` | a zk notebook |

So a repository is a vault, and so is an Obsidian vault or a zk notebook, with nothing to set up.
[Vaults, home and Elsewhere](../guides/vaults.md) walks through vaults with drawings and examples.

A note under no marker is in home, your home folder's own vault, when it's in your home folder (below). Outside both,
it's in [Elsewhere](#elsewhere), which has no index.

The vault decides:

- what `/` at the start of a path starts from, and which notes a wikilink's name can match
- how the links slipbox writes there look (see [Conventions](#how-a-folder-writes-links))
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

Home is walked a little at a time while nobody is working, by the background index (see [Backlinks](#backlinks)), or
by the TUI while home is open and the background index is off. Until then, home is its top folder alone, and the folder
you opened: `slipbox ~/notes` walks `~/notes` at once, so its notes, and the vaults in it, are there, and its own note
opens, one directly in it before one in a folder of it. `slipbox ~/notes/inbox.md` walks the note's folder the same
way, and so does going into a folder of home from another vault, by opening a note of it or following a link to it.
The walk is kept, so opening home never walks it again: the files it found are looked at, and a folder that changed is
listed again. A folder whose time was set back after its notes changed, as unpacking an archive with its times does,
isn't, and its notes wait for the next walk. The command line walks home the first time it needs to, and
`slipbox index --refresh ~` walks it again. Changing `walk.extensions`, `walk.exclude` or `walk.root_markers` walks
home again too.

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
- The links slipbox writes follow your own setting, else its default (see [Conventions](#how-a-folder-writes-links)).
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

- `o` in a peek at one of its notes ([A peek at another vault](#a-peek-at-another-vault))
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
  them (see [Repairs](#repairs)).
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

Only relative links between it and other folders break. The relink offers each one's pointer (see [Repairs](#repairs)).

You may open a named folder where it now is. If slipbox is sure it's the same folder, its session, scratch, trash and
reading positions come along, and a message says so. slipbox is sure when the folder's id or remote is at the new
place, and nothing is left at the old one.

If the move broke links in or out of the folder, their fix is previewed at once.

An unnamed folder moved by hand starts afresh. Naming it lets slipbox find it the next time.

slipbox learns where folders are by opening them, and from the background index (see [Backlinks](#backlinks)).

## How a folder writes links

Each vault has one **convention**: how the links slipbox makes there are written. It has three parts:

| Part | Is |
| --- | --- |
| style | a Markdown link, `[Coffee](ideas/coffee.md)`, or a wikilink, `[[coffee]]` |
| path | relative to the note, from the vault's top (`/ideas/coffee.md`), or by name (a wikilink's only) |
| extension | `.md` kept or dropped |

Each part comes from the first of these that says:

1. your setting, `[links]`, in the vault's `.slipbox/config.toml` or else your own config
   ([The links' convention](configuration.md#the-links-convention) has its values)
2. the settings of the app that owns the folder: Obsidian's `.obsidian/app.json`, or zk's `.zk/config.toml` (below)
3. the folder's notes, when one form has two-thirds or more of their links to the vault's own notes
4. else slipbox's own: a Markdown link, relative, `.md` kept

The style is found first. Then the path and extension are found for that style. For an app, that's as it writes that
style. For the folder's notes, they're counted among the notes' links of that style.

In Obsidian's `.obsidian/app.json`, `useMarkdownLinks` gives wikilinks unless it is `true`. `newLinkFormat` gives the
path:

| `newLinkFormat` | Means |
| --- | --- |
| `shortest` (the default) | by the note's name |
| `relative` | from the note |
| `absolute` | from the vault's top |

Obsidian's Markdown links keep `.md`, and its wikilinks drop it. A Markdown link is always a path, so `shortest` says
nothing about one.

In zk's `.zk/config.toml`, `link-format` says how links are written:

| `link-format` | Means |
| --- | --- |
| `markdown` (the default) | a path from the note |
| `wiki` | a path from the notebook's top |
| a template of your own | says nothing |

`link-drop-extension` drops the extension unless it is `false`.

So the conventions come out like this:

- An Obsidian vault gets wikilinks by name.
- A zk notebook gets Markdown links without `.md`.
- A repository gets whatever its notes already use.
- A folder mixing forms, with none at two-thirds, gets slipbox's own unless you set one.

A Markdown link is never by name. slipbox reads its destination as a path.

Elsewhere has no vault to read names or `/` from. There, your setting applies where it can, else slipbox's own:

- `style = "wiki"` writes a Markdown link.
- `path = "root"` or `"name"` writes a relative one. A wikilink you type stays one, its path relative.
- `extension` is as you set it.

`slipbox info` says each part and where it came from. For example:

- In an Obsidian vault, it says "wikilinks, by name, without .md", from Obsidian's `.obsidian/app.json`.
- In a repository, it says which share of its notes' links decided each part.

The Info view (`space n i`) shows the same in its Links section. `y` there copies it.

The convention decides only the links slipbox makes. The scratch's `path:line` references aren't links. A rename keeps
each existing link in the form it was written in.

## Writing links

There are three ways to have slipbox write a link for you, all in the vault's convention.

- **The link picker:** `space l i` (`:link`) lists the vault's notes and files. Pick one, and the link goes in at the
  cursor while you type. While you read, it goes after the word under the cursor, and the note is saved.
- **Completion:** typing `](` or `[[` in a note opens a list of the files a link could reach, narrowed as you type.
  `tab` or `enter` puts the chosen one in. After `](` the list includes other vaults' notes, as of their last indexing.
  [Editing](editing.md) has completion's keys.
- **The command line:** `slipbox link <note> --from <note>` prints the link slipbox would write, for an agent to use.

A Markdown link's text is the note's title. A wikilink has none. A wikilink is written:

- by name, where that name reaches the note from where you are
- otherwise by its path from the vault's top, or a relative path (`[[../coffee]]`)

It is never written by a name that would land on another note.

A link to a file in another folder is written by how the two folders travel:

1. in the folder's own convention, when one copy of a folder carries both files. That's the same repository, a
   repository and a submodule it records, or (outside git) one folder inside the other.
2. as a pointer, when the file is in a named folder
3. otherwise as a relative path, which works while the folders are laid out alike

If the pointer's name belongs to more than one folder here, slipbox asks before writing it. You can:

- rename one of the folders first
- write the full name (a repository's)
- write the short one as it is

`esc` writes nothing.

A private name is written, and slipbox says that pointer works on this machine only.

## Backlinks

`space l b` (or `g r`) lists the notes that link to the one you are reading, each with its line and the link's text.
`enter` opens one at the link. One from another vault is read in a peek there
([A peek at another vault](#a-peek-at-another-vault)).

`space l l` lists this note's own links, each with whether it resolves. `enter` follows one.

The Info view (`space n i`) counts both. From the command line, use `slipbox backlinks <note>` and
`slipbox links <note>`.

Backlinks are worked out from slipbox's index, never stored in your files. They include:

- links from notes, embeds and pictures
- links in front matter
- data files' references and code comments' paths
- links from other vaults into this one: by path (relative, `~/`, absolute, a file URL), by pointer, or by this
  repository's own hosting address

A link from another vault is shown by its path, `~/code/website/README.md`.

A note's links to itself don't count. Neither do a worktree's, since its notes are copies.

In the TUI, a note's unsaved text counts as you type. The command line reads the files as saved.

Another vault's links count as of its last indexing. They count only for vaults this machine knows, while those
vaults are there. A vault on a drive that is unplugged drops out until the drive is back.

A vault nested in this one, or holding it, is indexed as soon as a link or a backlink needs it.

**The background index** finds the rest. It runs while the TUI is open and nobody is working. Nobody is working when
there's no key, no click, and no command from an agent for `index.idle_seconds`, 30 by default.

Then slipbox walks your home folder a little at a time. It indexes home's own notes first (see [Home](#home)), then
each vault it found there. So backlinks from folders you never opened here appear by themselves, and from the notes in
your home folder that no other vault holds.

The background index:

- skips what home's index leaves out: hidden folders, `Downloads`, `node_modules` and the like
- picks up where it stopped
- once it has been through, waits a day before the next pass

`index.background = false` turns it off ([Configuration](configuration.md)). `slipbox index --home` runs it now.

Folders outside your home folder, such as other drives, are indexed when you open them or follow a link into them.

## Links kept through renames and moves

Renaming or moving a note in slipbox rewrites every link to it, wherever slipbox reaches one: in this vault, in other
vaults, in data files and code comments. A moved note's own relative links are rewritten too, so they still reach what
they did.

Each link keeps the form it was written in:

- A wikilink stays a wikilink, and a path a path, with or without its extension as written.
- A `/…` path stays from the vault's top, a `~/` path from the home folder, an absolute path absolute, and a file URL
  a URL.
- A pointer stays a pointer, while the note stays in that folder.
- A hosting address keeps its form, with only its path changed.
- A wikilink by name stays a name, unless another note has the new name or the note leaves the vault.

| To rename or move | Keys | Command |
| --- | --- | --- |
| a note, by its path | `space n m` (`:rename`, `:mv`), or `r` and `m` in the explorer | `slipbox mv` |
| a heading | `space n h` for the heading the cursor is under, or `r` in the outline | `slipbox rename-heading` |

You always see a preview first, with every line that will change, in every vault. `enter` does it, and `esc` leaves
everything as it was. [Files](files.md) describes renaming, moving and the preview in full.

Renaming a heading rewrites the links to it the same way.

`space v shift+u` (`slipbox undo`) takes back the last rename, move, naming or relink.

## Repairs

### A note moved outside slipbox

A note moved by another program breaks the path links to it, as it should. That program may be an editor, a file
manager, an agent or git. slipbox never quietly sends a broken link somewhere else.

But slipbox notices the move, in one of two ways:

- by the note's text leaving one place and arriving at another within a minute
- by git's renames after a pull or a merge

A broken link to a note that moved says where it went. slipbox offers the fix once for each batch of moves. The fix is
the relink, previewed, with nothing written until you say.

`space l r` (`:relink`) relinks the note you are reading. `slipbox relink` relinks every note.

The relink rewrites these, each in its own form:

- links broken by a move slipbox saw, to where the file is now
- pointers by a name their folder had, to its name now
- relative paths into a named folder that doesn't travel with this one, to pointers

Before a merge, slipbox can show the links the merge would break ([Git](git.md)).

### Links that name a folder the old way

`[[notes:coffee]]` and `[t](notes:coffee.md)` are an older way of naming a folder, and aren't links.

Where a folder this machine knows has that name, slipbox flags them and offers the pointer that is one. `space c a`
writes it: a Markdown link, with its heading or block kept.

### Links that reach nothing

A link that reaches nothing is drawn in the broken-link colour. While the cursor is on it, the status line says
`(unresolved)`.

It is one of the note's problems:

| The link reaches | The problem is |
| --- | --- |
| a missing file | a warning |
| a note not written yet | information, shown when you set `diagnostics.severity` to `info` |

[Configuration](configuration.md) has that setting.

- `space n q` lists this note's problems.
- `space v p` lists the whole vault's, broken links among them. [Code](code.md) describes the Problems panel.
- `slipbox problems` lists the vault's broken, ambiguous and fragile links, and the notes nothing links to.

A link into a drive that isn't plugged in is broken until the drive is back, and slipbox says why.

## Converting a folder's links

If you would rather a folder's links were plain relative paths, as GitHub and most tools read them, slipbox can convert
them. Nothing asks you to. It's there if you want it.

In the TUI, `:convert-links` converts every note's links, and `:convert-links <note>` one note's. From the command line,
run `slipbox convert-links [note]`.

- Each wikilink becomes a relative Markdown link, and an embed an image link, with its shown text kept.
  `[[coffee#Brewing|how I brew]]` becomes `[how I brew](ideas/coffee.md#brewing)`.
- Without shown text, the text is the link as it was drawn.
- Each link written from the vault's top (`/ideas/coffee.md`) becomes relative.
- Headings and blocks are checked to exist. A link that reaches nothing is left as it is, and listed.
- A link several notes answer to is a row of its own at the top of the preview. `enter` lists the notes, to pick one.
- Wikilinks in code and in front matter stay as they are.

The preview shows every line first. `space v shift+u` (`slipbox undo`) takes it back.

In an Obsidian vault, set `links.style = "markdown"` in the folder's `.slipbox/config.toml` afterwards. If you don't,
new links will still be written as wikilinks, as Obsidian's own setting says.

## Tags

A note's tags are:

- its front matter's `tags:` (or `tag:`), a list or a string split at commas and spaces
- the `#tags` in its text

A tag in the text is letters, digits, `_`, `-` and `/`. It's written after a space or at the start of a line, and it
isn't digits alone.

These aren't tags:

- anything in code
- `#` inside a word or an address (`page#part`)
- a heading's `#`

A colour such as `#0a84ff` written in the text is a tag too. Put it in a code span to keep it out.

`/` nests tags. `#coffee/brewing` is under `#coffee`, and listing `#coffee` includes it.

`#Coffee` and `#coffee` are one tag, shown as it was first written.

Following a tag lists the notes that carry it. [Finding things](finding.md#tags) covers listing every tag, and
searching by one.
