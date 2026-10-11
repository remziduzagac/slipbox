# Links and roots

slipbox reads the links your notes already have, written the way GitHub, Obsidian or zk write them, and follows them
from one folder into another. This chapter covers following a link, every form a link can take and where each one lands,
the folders that give links their meaning (roots), the names that let a link reach another folder wherever it is,
writing links, backlinks, and how slipbox keeps links working when notes move.

## Links that work as they are

Open a folder of notes and its links work as they are. In a repository, `[Coffee](ideas/coffee.md)` opens
`ideas/coffee.md`, as it does on GitHub. In an Obsidian vault, `[[coffee]]` finds `coffee.md` wherever it is in the
vault, as Obsidian does. In a zk notebook, `[Coffee](ideas/coffee)` finds the note without its `.md`. Nothing has to be
converted or set up first, and opening a folder writes nothing into it.

A link to a note in another folder works too. A relative path, `[the site's plan](../code/website/docs/plan.md)`, works
while the two folders sit side by side. A pointer, `[the site's plan](slipbox://website/docs/plan.md)`, names the other
folder instead of saying where it is, so it keeps working when that folder moves, or sits somewhere else on another
machine.

Two ideas sit behind this. A **root** is the folder a note belongs to: it decides what a link like `/plan.md` or
`[[plan]]` means. A **name** is what a pointer calls a folder by. Both are explained below, as the links need them.

## Following a link

Put the cursor on a link and press `enter`. `g f`, `g x`, `space l f` and a click on the link do the same. If the cursor
isn't on a link, `enter` follows the first link on its row.

- `ctrl+enter` (`space l t`) follows the link into a new tab, as a browser's ctrl+click does.
- `ctrl+w f` (`space l s`) follows it into the other window of a split, splitting first.
- `tab` and `shift+tab` (also `] l` and `[ l`, `space l n` and `space l p`) move the cursor to the next or previous
  link.
- `ctrl+o` goes back to where you were, and `space h n` forward again: see [History](finding.md#history).
- `y l` (`space l y`) copies the link's target: the full path of the file it reaches, or the link as written.

In source mode and in the lens, where you see the Markdown itself, `enter` reads the link around the cursor from the
text. A link inside an embedded note is followed from that note, as if you had opened it.

What happens depends on what the link reaches:

| The link reaches | Following it |
| --- | --- |
| a note | opens it, at the heading or block the link names |
| a heading in this note | moves the cursor to it |
| a folder | shows the folder in the explorer, unfolded and selected |
| a note not written yet | asks for the new note's name, typed already: `enter` makes it |
| a data, text or code file | opens it in slipbox; a line fragment (`#L42`) opens it at that line |
| a picture or another binary file | copies its path |
| a web address | copies the address: slipbox opens no browser, which over SSH would open on the wrong machine |
| a picture on the web | fetches it to draw it, after asking by default (`render.images_remote`) |
| a footnote reference | moves to the footnote's definition |
| a tag | lists the notes that carry it |
| a note in another root | switches to that root, with the note open: see [Switching roots](#switching-roots) |
| one of several notes | lists them, to pick the one you meant |

How pictures, embedded notes and pictures on the web are drawn is in [Reading](reading.md); the setting is in
[Configuration](configuration.md).

## The forms a link takes

Whatever form a link is written in, slipbox reads it as a file and, optionally, a place in it. The screen shows the link
as the note writes it: slipbox never rewrites a link for display.

### Paths

A Markdown link's destination is a path. These are the forms slipbox reads, written from a note in `~/notes`:

| Written as | Reaches |
| --- | --- |
| `[t](ideas/coffee.md)` | the file relative to the note: the form slipbox writes unless the folder says otherwise |
| `[t](/ideas/coffee.md)` | the file from the root; if the root has nothing there, the filesystem's `/ideas/coffee.md` |
| `[t](ideas/coffee)` | without an extension: the file as written, else `ideas/coffee.md`, else the folder |
| `[t](ideas/)` | a folder |
| `[t](~/notes/ideas/coffee.md)` | the file from your home folder |
| `[t](/home/you/notes/ideas/coffee.md)` | the absolute path, when nothing in the root is at `/home/…` |
| `[t](file:///home/you/notes/ideas/coffee.md)` | a file URL |
| `[t](<cold brew.md>)`, `[t](cold%20brew.md)` | a name with spaces, in angle brackets or percent-encoded |

A few things hold for every path:

- A note is found by its name whatever the case, on every filesystem: `[t](Inbox.md)` reaches `inbox.md`.
- A path may leave the root (`../website/docs/plan.md`, `~/…`, an absolute path): it reaches the file in whichever root
  holds it, and following it switches to that root. Such links work while the folders are laid out the same way;
  [Names and pointers](#names-and-pointers) has the form that doesn't depend on it.
- Nothing inside code is a link: not in a code span, not in a fenced block. Nor is a link in an HTML comment, or one
  whose bracket is escaped (`\[t](x.md)`). A destination with a bare space in it (`[t](my plan.md)`) isn't a link
  either, as CommonMark says.
- Reference links (`[t][ref]` with `[ref]: ideas/coffee.md` elsewhere) are links like any other.

### Wikilinks

A wikilink is Obsidian's form: double brackets around a note's name.

| Written as | Reaches |
| --- | --- |
| `[[coffee]]` | the note whose file name, without its extension, is `coffee`, anywhere in the root |
| `[[ideas/coffee]]` | the note at that path from the root, or the one whose path ends so |
| `[[coffee.md]]` | the same note: an extension is allowed |
| `[[coffee\|how I brew]]` | the note, shown as "how I brew" |
| `[[coffee#Brewing]]` | the note, at its heading "Brewing" |
| `[[coffee#^ratio]]` | the note, at the block marked `^ratio` |
| `[[#Brewing]]` | a heading of this note |
| `[[./coffee]]`, `[[../coffee]]` | a path from this note, never a name |
| `![[coffee]]`, `![[beans.png]]` | embedded: the note, or a picture, drawn in place |

Names are compared without regard to case: `[[Coffee]]` reaches `coffee.md`. A note also answers to the names its front
matter gives under `aliases:` (or `alias:`), after every file name. A picture or other file (`![[beans.png]]`) is looked
for beside the note, then from the root, then by its name anywhere in the root, as Obsidian finds one; a Markdown
export's copies, in a folder ending `.export.assets`, are left out. In a table cell, write the `|` before the shown
text as `\|`.

When two notes share a name, slipbox takes the one whose name has the same case as the link, then the one in the linking
note's own folder, then the one in the deepest folder the two share, then the one with the shortest path. That is how
Obsidian's default setting writes links, so a vault opens unchanged. If two candidates are still equal, slipbox doesn't
guess: following the link lists them to pick from.

A wikilink is read within its root. A root nested inside this one ends its names: a link into it needs a path
(`[[nested/coffee]]`). A file that belongs to no root has no names to look in, so its wikilinks reach nothing; slipbox
says so when you follow one, and what would make the folder a root.

### Headings, blocks and lines

The part after `#` is a place in the file:

- **A heading,** by GitHub's form of it (`#cold-brew`, a repeated heading numbered as GitHub numbers it,
  `#cold-brew-1`), or by its text (`#Cold%20brew`, `<#Cold brew>`). A wikilink names a heading by its text
  (`[[coffee#Cold brew]]`), and can go down a path of them (`[[coffee#Methods#Cold brew]]`). An explicit id comes first:
  `## Cold brew {#cold}`, or an HTML `<a id="cold">`.
- **A block,** `#^ratio`: the paragraph or list item that ends with `^ratio`, or has it alone on the line after it.
- **Lines,** as GitHub writes them: `#L42`, `#L42-L50`, `#L42C5-L45C10`.

If two headings have the same text, the first one is used, and slipbox says so. A heading or block that isn't there
opens the note where you last left it (at its top, the first time), and for a heading slipbox says it isn't there.

### Links in front matter

A wikilink in a note's front matter is a link, as Obsidian's properties hold them: `related: "[[coffee]]"`, or a list of
them. It is followed, counted as a backlink, rewritten when its note is renamed, and drawn as a link where the
properties are shown. A Markdown link, a bare path or a web address in front matter is a value, not a link.

### Links to the repository's own hosting

In a git repository, a link to one of the repository's own files on GitHub, GitLab or Bitbucket, such as
`https://github.com/you/website/blob/main/docs/plan.md`, opens the file in your copy, as long as the address names one
of the repository's remotes (or a named folder's, below). A link to the repository's own page opens its README. If the
address names another branch than the one checked out, the link is still followed, and slipbox says which branch it
names, since the file may differ there. Such links count as backlinks, and a rename rewrites the path in the address,
leaving the rest as it was.

### Links in code and data files

Code and data files have links of their own: a path in a code comment, a reference in a JSON schema. They are followed
and counted as backlinks like a note's; [Code](code.md) and [Reading](reading.md) describe them.

## Where a link lands

While the cursor is on a link in a rendered note, the status line names it and says whether it resolves:
`→ ideas/coffee.md (resolved)`, or `(unresolved)`, `(ambiguous)`, `(external)`. When a tie between two notes of one name
decided where it went, it says that too: `→ [[coffee]] (resolved, the shortest path of 2 named so)`.

`shift+k` on a link opens a small window with what the link lands on: the heading's section, the block, or the top of
the note, titled with its path. `g d` follows the link, as `enter` does.

Links are drawn in the theme's link colour. One that reaches nothing has a colour of its own (red in most themes), and
so does one that several notes answer to.

A link won by where it is written (the note in the deepest shared folder, or the one with the shortest path) is
**fragile**: a note of the same name written nearer would take it, without a word. Such a link is among the note's
problems, as information, with the path that names the note for sure; `space c a` on the link writes that path, and
`slipbox problems` lists every fragile link in the root. And when a note you make or remove sends an existing link by
name somewhere else, slipbox says so in a message, even though no link broke.

From the command line, `slipbox resolve <link> --from <note>` follows a link as the TUI does, and `slipbox links <note>`
lists a note's links, each with how it landed and how sure that is. Both are in [The command line](cli.md).

## Roots

A note's root is the nearest folder above it that holds one of these:

- `.git`: a git repository (or a worktree, or a submodule);
- `.slipbox/`: a folder you gave slipbox's own settings;
- `.obsidian/`: an Obsidian vault;
- `.zk/`: a zk notebook.

So a repository is a root, and so is a vault or a notebook, with nothing to set up. The root decides:

- what `/` at the start of a path starts from, and which notes a wikilink's name can match;
- how the links slipbox writes there look (see [Conventions](#how-a-folder-writes-links));
- what is indexed and searched first: opening any note or folder in a root opens the whole root;
- its settings, when it has a `.slipbox/config.toml` (see [Configuration](configuration.md));
- its session, its trash and its history, which slipbox keeps in its own state folder, never in yours.

A note has one root however you open it: opening a file deep in a repository opens the repository, from its top. The
status line shows which root you are in, by its name (below) or its path, and `space v i` (`slipbox info`) tells you
more about it. On the command line, a command works in the root of the note it names, or of the current folder; `--root`
says where to start ([The command line](cli.md)).

A few rules keep roots predictable:

- **Your home folder and `/` are never roots,** whatever they hold.
- **A root inside a root is a root of its own.** A repository cloned into your notes folder keeps its notes to itself:
  the outer root doesn't index them, and its names don't reach them. The explorer shows such a folder with its own icon.
- **Several markers in one folder make one root,** its settings and name from `.slipbox/`.
- **Which markers count** is `walk.root_markers`, which only your own config may set, since it decides where roots are.

### A plain folder

A folder with no marker above it works too. The folder you opened stands in for a root: its notes are listed, indexed
and searched, and it has its own session. In it, `/` means the filesystem's root, wikilinks have no names to look in,
and the links slipbox writes follow your own setting, else its default (see [Conventions](#how-a-folder-writes-links)).

Your home folder or `/`, opened as a folder, is listed a level at a time and never walked or indexed as a whole; its
search reads the files instead.

A file outside every root, opened by following a link to it, opens beside the root you are in. Its own links can't be
followed from there, except web addresses and pointers: open its folder to follow them.

### Giving a folder `.slipbox/`

`.slipbox/` is optional. It holds a folder's own settings, `.slipbox/config.toml`, and, if you choose, its name.

- `slipbox init` in a folder gives it a `.slipbox/` with settings only. `slipbox init --name notes` names it too.
- `slipbox init --private` adds `.slipbox/` to the repository's `.git/info/exclude`, so it stays on this machine and out
  of git.
- In the TUI, `space v m` (`:init`) in a plain folder asks whether to give it one, and goes into it as a root.

A committed `.slipbox/` travels with the folder: it holds only settings and the name, never anything slipbox writes as
you work.

Inside a root, a folder can become a root of its own: select it in the explorer and press `v`, or `space v m`, or run
`slipbox init <folder>`. Links that would stop reaching what they did, such as a `/…` path or a wikilink by name across
the new boundary, are rewritten first, after a preview. `shift+v` in the explorer, `space v shift+m` or
`slipbox deinit <folder>` turns it back into a plain folder: its `.slipbox/` goes to the trash, and the links are
rewritten the other way. A git repository stays a root whatever you do, so it can't be made a plain folder.

### Switching roots

The TUI is always in one root. Opening a note of another root switches to it: by following a link or a pointer into it,
a backlink from it, a search hit, or a root picked in the explorer or from `space v v`. slipbox becomes that root's, as
if you had started it there: its settings, its index, its session with its tabs, and the note open where the link
pointed. A message names the root you are now in.

- **Back returns.** `ctrl+o` from the first place you visited in a root takes you back to the root before, at the note
  and place you left. A chain of switches unwinds one at a time.
- **Unsaved notes stop a switch.** slipbox refuses to leave a root while a note in it is unsaved, and names it: save it
  (`:wa` saves them all) or revert it first.
- **The explorer lists other roots** below the one you are in: the one you started in, and the folder of a file open
  beside this root. `:pin-root` keeps the current root in that list after you leave it.
- **Starting in a plain folder,** such as `slipbox ~`, shows the named folders first when there are any, so you can go
  into one.

### Worktrees

A git worktree (made with `git worktree add`) is a root of its own, with its own session, scratch and history: a
worktree is usually a separate task, often an agent's. The status line shows it by its repository's name and its branch,
`website@fix-menu`.

A worktree's notes are copies of the main checkout's, so their links don't count as backlinks. A pointer by the
repository's name means its main checkout; a pointer with a branch (below) reaches the worktree that has that branch. A
relative path out of the repository, from a worktree, is read from the main checkout, so `../shared/plan.md` names the
folder beside the main checkout wherever the worktree is kept. [Git](git.md) covers the worktrees list.

## Names and pointers

A relative link to another folder, `../code/website/docs/plan.md`, breaks when either folder moves, and works on another
machine only if the folders sit the same way there. A **pointer** names the folder instead:

```text
slipbox://website/docs/plan.md
```

slipbox looks up the folder named `website` on this machine, wherever it is, and opens `docs/plan.md` in it.

### A folder's name

A folder's name travels with it, since the note holding a pointer goes to other machines. It is:

- the name in its `.slipbox/`, given with `slipbox init --name` or `slipbox name`;
- else, for a git repository, the last part of its remote's address (`origin`'s, else the first remote's): a clone of
  `github.com/you/website` is `website`. When two different repositories known here share that short name, each is also
  known by its full one, `github.com/you/website`.

Never the folder's own name, and never its path: neither travels. A folder with neither, such as an Obsidian vault or a
zk notebook on its own, or a repository with no remote, has no name; links reach it by relative path, and the status
line shows its path.

A name is letters, digits, `.`, `_` and `-`, compared without regard to case. It lives in `.slipbox/config.toml`:

```toml
[vault]
id = "3f9c2a7be1d04c55"         # written with the name: tells a copy of this folder from another folder
name = "notes"                  # what pointers call it: slipbox://notes/inbox.md
aliases = ["n"]                 # other names it answers to
previous_names = ["old-notes"]  # names it had: pointers by them still find it
```

slipbox writes this table only when you ask: `slipbox init --name`, `slipbox name`, or `space v n` (`:name`) in the TUI,
never by opening a folder.

- **Renaming a folder's name** (`slipbox name journal`, `space v n`) keeps the old one in `previous_names`, after a
  preview: pointers by it still find the folder, and slipbox says so when you follow one. The relink rewrites them (see
  [Repairs](#repairs)).
- **Naming a repository** that has no `.slipbox/` gives it one, to hold the name. A name chosen in `.slipbox/` wins over
  the remote's.
- **A name another folder here already has** is refused; `slipbox init` suggests another.
- **A private name** (`slipbox init --private --name notes-review`) is in a `.slipbox/` kept out of git, so its pointers
  work on this machine only. slipbox says so when it writes one.

In the explorer, `shift+r` on a nested root's row names it. `space v i` shows the root you are in: its name, and the
other copies of it this machine knows.

### Pointers

A pointer is a Markdown link whose destination is `slipbox://`, the folder's name, and a path in it:

```text
slipbox://notes/ideas/coffee.md
slipbox://notes/ideas/coffee#brewing
slipbox://website@fix-menu/docs/plan.md
slipbox://github.com/you/website/docs/plan.md
```

- The path is read as a Markdown link's path: without an extension it finds the note, and it may name a folder. It can't
  climb out of the named folder.
- `@branch` names the repository at that branch: the copy or worktree that has it checked out, else the file as it is on
  that branch, read from git and shown read-only.
- Following a pointer into another folder switches to it, as following a path does.
- A name this machine doesn't know, or a folder that isn't here, is said: "`notes` isn't on this machine yet: open it,
  or let the index find it". A pointer never offers to make a note.
- A name that two different folders have lists both, to open the one meant, and offers to rename one of them.

A pointer is always a Markdown link, also in a folder that writes wikilinks: a wikilink reads no pointer. `:e` takes a
pointer (`:e slipbox://notes/inbox.md`), and so does every `slipbox` command that takes a note.

### Copies of a folder

The same folder can be on a machine twice: a repository cloned twice, or a synced notes folder and its backup. slipbox
tells copies of one folder (the same remote, or the same `id` in `.slipbox/`) from different folders that happen to
share a name.

- **Copies** are one folder: its pointers open the default copy, the first one found. When slipbox opens a second copy,
  it asks once which one links should open, and remembers. `space v shift+v` (`:folders-default`) or
  `slipbox folders default <name> <path>` changes it later.
- **A copy that isn't here,** moved or on a drive that is unplugged, is skipped: another copy answers meanwhile, and
  slipbox says so.
- **Different repositories** with one short name are told apart by their full names.
- **Different `.slipbox/` folders** with one name stay ambiguous until one is renamed: following a pointer by that name
  asks which, and offers the renaming.

`space v v` (`:folders`) lists the named folders this machine knows, the ones seen last first, and `enter` goes into
one; `ctrl+o` comes back. `slipbox folders` lists them with their copies.

### A named folder moved

Moving or renaming a named folder on disk needs no link edited: its pointers name it, and slipbox finds it again. Only
relative links between it and other folders break, and the relink offers each one's pointer (see [Repairs](#repairs)).

When you open a named folder where it now is, and slipbox is sure it is the same folder (its id or remote at the new
place, and nothing left at the old one), its session, scratch, trash and reading positions come along, and a message
says so. If the move broke links in or out of it, their fix is previewed at once. An unnamed folder moved by hand starts
afresh; naming it lets slipbox find it the next time.

slipbox learns where folders are by opening them, and from the background index (see [Backlinks](#backlinks)).

## How a folder writes links

Each root has one **convention**: how the links slipbox makes there are written. It has three parts:

- **style:** a Markdown link, `[Coffee](ideas/coffee.md)`, or a wikilink, `[[coffee]]`;
- **path:** relative to the note, from the root (`/ideas/coffee.md`), or by name (a wikilink's only);
- **extension:** `.md` kept or dropped.

Each part comes from the first of these that says:

1. your setting, `[links]`, in the root's `.slipbox/config.toml` or else your own config
   ([The links' convention](configuration.md#the-links-convention) has its values);
2. the settings of the app that owns the folder:
   - Obsidian's `.obsidian/app.json`: `useMarkdownLinks` (wikilinks unless it is `true`) and `newLinkFormat`
     (`shortest`, the default, by the note's name; `relative`, from the note; `absolute`, from the vault's top). A
     Markdown link keeps `.md` and a wikilink drops it. A Markdown link is always a path, so `shortest` says nothing
     about one;
   - zk's `.zk/config.toml`: `link-format` (`markdown`, the default, a path from the note; `wiki`, a path from the
     notebook's top; a template of your own says nothing) and `link-drop-extension` (dropped unless it is `false`);
3. the folder's notes, when one form has two-thirds or more of their links to the root's own notes;
4. else slipbox's own: a Markdown link, relative, `.md` kept.

The style is found first, then the path and extension for that style: an app's as it writes that style, the notes'
counted among their links of that style.

So an Obsidian vault gets wikilinks by name, a zk notebook Markdown links without `.md`, and a repository whatever its
notes already use. A folder mixing forms, with none at two-thirds, gets slipbox's own unless you set one. A Markdown
link is never by name: slipbox reads its destination as a path.

A plain folder has no root to read names or `/` from. There your setting applies where it can, else slipbox's own:
`style = "wiki"` writes a Markdown link, and `path = "root"` or `"name"` a relative one (a wikilink you type stays one,
its path relative); `extension` is as you set it.

`slipbox info` says each part and where it came from: in an Obsidian vault, "wikilinks, by name, without .md", from
Obsidian's `.obsidian/app.json`; in a repository, which share of its notes' links decided each part. The Info view
(`space n i`) shows the same in its Links section, and `y` there copies it.

The convention decides only the links slipbox makes (the scratch's `path:line` references aren't links). A rename
keeps each existing link in the form it was written in.

## Writing links

There are three ways to have slipbox write a link for you, all in the root's convention.

- **The link picker:** `space l i` (`:link`) lists the root's notes and files. Pick one, and the link goes in at the
  cursor while you type; while you read, it goes after the word under the cursor, and the note is saved.
- **Completion:** typing `](` or `[[` in a note opens a list of the files a link could reach, narrowed as you type;
  `tab` or `enter` puts the chosen one in. After `](` the list includes other roots' notes, as of their last indexing.
  [Editing](editing.md) has completion's keys.
- **The command line:** `slipbox link <note> --from <note>` prints the link slipbox would write, for an agent to use.

A Markdown link's text is the note's title. A wikilink has none, and is written by name where that name reaches the note
from where you are; otherwise by its path from the root, or a relative path (`[[../coffee]]`). It is never written by a
name that would land on another note.

A link to a file in another folder is written by how the two folders travel:

1. in the folder's own convention, when one copy of a folder carries both files: the same repository, a repository and a
   submodule it records, or (outside git) one folder inside the other;
2. as a pointer, when the file is in a named folder;
3. otherwise as a relative path, which works while the folders are laid out alike.

If the pointer's name belongs to more than one folder here, slipbox asks before writing it: rename one of the folders
first, write the full name (a repository's), or write the short one as it is. `esc` writes nothing. A private name is
written, and said: that pointer works on this machine only.

## Backlinks

`space l b` (or `g r`) lists the notes that link to the one you are reading, each with its line and the link's text;
`enter` opens one at the link. `space l l` lists this note's own links, each with whether it resolves; `enter` follows
one. The Info view (`space n i`) counts both. From the command line: `slipbox backlinks <note>` and
`slipbox links <note>`.

Backlinks are worked out from slipbox's index, never stored in your files. They include:

- links from notes, embeds and pictures, links in front matter, data files' references and code comments' paths;
- links from other roots into this one: by path (relative, `~/`, absolute, a file URL), by pointer, or by this
  repository's own hosting address. Each is shown by its path, `~/code/website/README.md`.

A note's links to itself don't count, and neither do a worktree's (its notes are copies). In the TUI, a note's unsaved
text counts as you type; the command line reads the files as saved.

Another root's links count as of its last indexing, and only for roots this machine knows, while they are there: a root
on a drive that is unplugged drops out until the drive is back. A root nested in this one, or holding it, is indexed as
soon as a link or a backlink needs it.

**The background index** finds the rest. While the TUI is open and nobody is working (no key, no click, and no command
from an agent for `index.idle_seconds`, 30 by default), slipbox walks your home folder a little at a time for roots, and
indexes each, so backlinks from folders you never opened here appear by themselves. It skips hidden folders,
`node_modules` and the like, picks up where it stopped, and once it has been through, waits a day before the next pass.
`index.background = false` turns it off ([Configuration](configuration.md)); `slipbox index --home` runs it now. Folders
outside your home folder, such as other drives, are indexed when you open them or follow a link into them.

## Links kept through renames and moves

Renaming or moving a note in slipbox rewrites every link to it, wherever slipbox reaches one: in this root, in other
roots, in data files and code comments. A moved note's own relative links are rewritten too, so they still reach what
they did. Each link keeps the form it was written in:

- a wikilink stays a wikilink, a path a path, with or without its extension as written;
- a `/…` path stays from the root, a `~/` path from the home folder, an absolute path absolute, a file URL a URL;
- a pointer stays a pointer, while the note stays in that folder;
- a hosting address keeps its form, only its path changed;
- a wikilink by name stays a name, unless another note has the new name or the note leaves the root.

You always see a preview first: every line that will change, in every root. `enter` does it, `esc` leaves everything as
it was. The keys are `space n m` (`:rename`, `:mv`) for the note's path, and `r` and `m` in the explorer; the command is
`slipbox mv`. [Files](files.md) describes renaming, moving and the preview in full.

Renaming a heading rewrites the links to it the same way: `space n h` for the heading the cursor is under, `r` in the
outline, `slipbox rename-heading`. `space v shift+u` (`slipbox undo`) takes back the last rename, move, naming or
relink.

## Repairs

### A note moved outside slipbox

A note moved by another program (an editor, a file manager, an agent, git) breaks the path links to it, as it should:
slipbox never quietly sends a broken link somewhere else. But it notices the move, by the note's text leaving one place
and arriving at another within a minute, or by git's renames after a pull or a merge. A broken link to a note that moved
says where it went, and slipbox offers the fix once for each batch of moves: the relink, previewed, nothing written
until you say.

`space l r` (`:relink`) relinks the note you are reading; `slipbox relink` relinks every note. The relink rewrites, each
in its own form:

- links broken by a move slipbox saw, to where the file is now;
- pointers by a name their folder had, to its name now;
- relative paths into a named folder that doesn't travel with this one, to pointers.

Before a merge, slipbox can show the links the merge would break: see [Git](git.md).

### Links that name a folder the old way

`[[notes:coffee]]` and `[t](notes:coffee.md)` are an older way of naming a folder, and aren't links. Where a folder this
machine knows has that name, slipbox flags them and offers the pointer that is one; `space c a` writes it, a Markdown
link with its heading or block kept.

### Links that reach nothing

A link that reaches nothing is drawn in the broken-link colour, and the status line says `(unresolved)` while the cursor
is on it. It is one of the note's problems: a warning for a missing file, information for a note not written yet (shown
when you set `diagnostics.severity` to `info`: see [Configuration](configuration.md)). `space n q` lists this note's
problems, `space v p` the whole root's, broken links among them; [Code](code.md) describes the Problems panel.
`slipbox problems` lists the root's broken, ambiguous and fragile links, and the notes nothing links to.

A link into a drive that isn't plugged in is broken until the drive is back, and slipbox says why.

## Converting a folder's links

If you would rather a folder's links were plain relative paths, as GitHub and most tools read them, slipbox can convert
them. Nothing asks you to: it is there if you want it.

`:convert-links` in the TUI converts every note's links; `:convert-links <note>` one note's. From the command line:
`slipbox convert-links [note]`.

- Each wikilink becomes a relative Markdown link, an embed an image link, its shown text kept:
  `[[coffee#Brewing|how I brew]]` becomes `[how I brew](ideas/coffee.md#brewing)`. Without shown text, the text is the
  link as it was drawn.
- Each link written from the root (`/ideas/coffee.md`) becomes relative.
- Headings and blocks are checked to exist. A link that reaches nothing is left as it is, and listed.
- A link several notes answer to is a row of its own at the top of the preview: `enter` lists the notes, to pick one.
- Wikilinks in code and in front matter stay as they are.

The preview shows every line first, and `space v shift+u` (`slipbox undo`) takes it back. In an Obsidian vault, set
`links.style = "markdown"` in the folder's `.slipbox/config.toml` afterwards, or new links will still be written as
wikilinks, as Obsidian's own setting says.

## Tags

A note's tags are its front matter's `tags:` (or `tag:`), a list or a string split at commas and spaces, and the `#tags`
in its text. A tag in the text is letters, digits, `_`, `-` and `/`, written after a space or at the start of a line,
and not digits alone. Nothing in code is a tag, nor `#` inside a word or an address (`page#part`), nor a heading's `#`.
A colour such as `#0a84ff` written in the text is a tag too; put it in a code span to keep it out.

`/` nests tags: `#coffee/brewing` is under `#coffee`, and listing `#coffee` includes it. `#Coffee` and `#coffee` are one
tag, shown as it was first written.

Following a tag lists the notes that carry it. Listing every tag, and searching by one, is in
[Finding things](finding.md#tags).
