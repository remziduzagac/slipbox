# Files and folders

<a id="files"></a>

slipbox's notes are plain files in a folder, and you can manage them from slipbox itself. This chapter covers:

- the explorer, the panel where you do all this
- the same from anywhere, with the leader keys
- the commands that do it from the command line

Changing what is in a note is in [Editing](editing.md).

In slipbox, you can:

- make notes and folders
- rename and move them
- copy them
- delete them

What sets this apart from doing it in a file manager is the links. When a note moves or changes its name, every link to
it is rewritten to follow it. You see each change before it is made.

A deleted file goes to slipbox's trash, where you can get it back. The last rename or move can be undone.

## The explorer

The explorer is the file tree on the left.

- `space e` opens it, then puts the keys in it, then closes it.
- `≡`, at the top of the left edge, shows or hides it.
- `space shift+e` selects the note you are reading in it, unfolding its folders.

On a terminal narrower than 90 columns (`ui.narrow_width`), it opens over the note instead of beside it
([The screen](screen.md)).

While it has the keys:

| Key | What it does |
| --- | --- |
| `j` / `k`, `down` / `up` | Move the selection (nothing opens) |
| `g g` / `shift+g` | To the top / bottom |
| `enter` | Open the note in a tab (or the tab showing it). Fold or unfold a folder. Go into another vault |
| `l`, `right` | Open the note in a tab. Unfold a folder or a vault |
| `h`, `left` | Fold a folder, or go to the folder holding the selection |
| `z` | Zoom in: the view shows the selected folder (on a file, its folder) |
| `-` | Zoom out: the view shows the folder holding this one |
| `o` | Open the note in this window, in place of the one it shows |
| `s` | Open it in the other window of a split, splitting first |
| `/` | Filter: type to narrow the tree, the folders kept. `enter` opens, `esc` clears |
| `a` | Show every text file, or back to what it shows by default (below) |
| `shift+h` | Show hidden files and folders too, or hide them again (below) |
| `shift+y` | Copy the selected row's whole path |
| `.` | The selected row's menu: for a folder, Zoom in here first; Copy path among the rest |
| `esc` | Back to the note. The explorer stays open |
| `q` | Close the explorer |

With the mouse:

- A click on a folder folds or unfolds it.
- A click on a note selects it, and a double click opens it in a tab.
- A click on a folder in the breadcrumb zooms the view to it (below).
- The explorer's title has two buttons: a new note and a new folder.
- While the explorer has the keys, the selected row has a button at its end, `…`. It opens the same menu as `.`, with
  every action this chapter describes, each with its key.

A row ends with marks: what slipbox has indexed, and what git sees changed ([below](#a-rows-marks)).

### The view

The explorer shows your files as one tree, from `/` down. What you see of it is the view: one folder and what's in it.

The view starts at the folder you opened. `slipbox ~/work/kestrel/docs` shows `docs`, in the vault `kestrel`. Opened on
a note, it starts at the note's vault.

Above the tree, a breadcrumb says where the view is:

```text
~ › work › ◈ kestrel › docs ›
```

- `~` is your home folder. With the view outside it, the breadcrumb starts at `/`, and your home folder has its name.
- A vault has its icon. The vault you are in is highlighted.
- A click on a folder in it zooms the view to that folder.

You zoom in and out yourself:

- `z` zooms in on the selected folder. On a file, it zooms in on the file's folder.
- `-` zooms out a level. The folder you were in stays unfolded and selected. At `/`, there's nothing above, and
  slipbox says so.
- After zooming out, the breadcrumb keeps the folders you came from, dimmed after the view. A click on one zooms back
  in.

The view also zooms out by itself when you go somewhere outside it: you open a note there, you follow a link to a file
there, or you go into another vault. It becomes the folder holding both places, with only the paths to the two
unfolded, and the breadcrumb leads on to where you went. It never zooms in by itself. Going into a vault the view
already holds leaves the view where it is, the folders down to the vault unfolded.

Hidden folders aren't in the tree. So going into a vault inside one, such as an agent's worktree in
`.claude/worktrees/`, moves the view to that vault.

A folder you rename or move takes the view along when the view is on it. One deleted, or renamed outside slipbox,
gives way to the nearest folder still there, and slipbox says so.

Zoomed out past the vault you are in, the explorer lists folders one level at a time:

- The vault you are in is highlighted, with its tree under it.
- Another vault has its icon. `l` unfolds it in place. `enter`, or opening one of its files, goes into it
  ([Vaults, home and Elsewhere](vaults.md#switching-vaults)).
- Nothing outside the vault you are in can be renamed, moved or deleted from there.

You can open any folder you may read, inside your home folder or not. Outside home and every vault, it's
[Elsewhere](vaults.md#elsewhere), whose folders are listed a level at a time:

- A file you may not write opens read-only, and slipbox says so:
  `/etc/hosts is read-only: you may not write it (no permission)`.
- A folder you may not read says why when you open it, unfold it or zoom into it:
  `can't read ~/private: you may not read it (no permission)`.

A folder listed a level at a time is read in the background, so one on a slow disk, such as a network share or a
drive that's asleep, never stops the screen or the keys. While it's read, a dimmed `listing…` under it says so; its
rows come when it answers. One that can't be listed says why in their place, in the words opening it says:
`can't read: you may not read it (no permission)`, or `can't read: no answer in time` when it didn't answer within ten
minutes. It's read again a minute later, not before; a folder `l` refuses is read again at once, so it unfolds at the
next `l` once you may read it. Another disk mounted in a folder, such as a network share, is listed by its name alone:
nothing of it is read until you unfold it.

[Working across folders and vaults](../guides/vaults.md) shows the view at work, with examples.

### A row's marks

A row can end with marks, each in a column of its own, so they line up down the tree:

```text
◈ kestrel                main    ●
  docs                        •  ●
  node_modules                   ⊘
  private                        ⚿
  README.md                   M
```

The last column says what slipbox's index holds of the row, for links, backlinks and search:

| Mark | In ASCII | It says |
| --- | --- | --- |
| `●`, dimmed | `*` | indexed |
| `◐` | `~` | being indexed now |
| `⊘` | `-` | not indexed: busy folders, what `.gitignore` or `walk.exclude` leaves out, big notes, links not followed |
| `⚿` | `#` | you may not read it |
| `⚠` | `!` | a problem, such as a link whose target isn't there |

Most folders are indexed, so a file has a mark there only when it isn't what its folder says. A folder inside a `⊘`
folder is marked `⊘` too. With Nerd Font icons, `⚿` is a lock.

Why a row is `⊘` is said on the status line while the explorer's cursor is on it, and goes when the cursor moves off:

```text
⊘ not indexed: generated (node_modules), git-ignored
```

The reasons are:

| It says | Why |
| --- | --- |
| `generated (node_modules)` | a folder tools fill, with no note at its top; a folder in one says its name too |
| `git-ignored` | `.gitignore` leaves it out; with the one above, both are said |
| `walk.exclude` | your `walk.exclude` leaves it out |
| `hidden`, `home's Downloads`, `a system folder (Library)` | home's index leaves it out |
| `on another disk` | a folder of your home folder where a disk or a share is mounted |
| `a link not followed` | a link out of the vault or home you haven't followed |
| `a link followed, its disk not answering` | a link you follow, its disk not answering yet |
| `a link to a folder holding the vault`, `a second link to a folder followed already` | a link not walked through |
| `over walk.max_file_size` | a note too big to read |
| `past home's limit of 5,000 folders` | a folder of your home folder past where its index stopped |

The Info view (`space n i`) says it too, of the file on screen: `index: not indexed: walk.exclude`, for the file's own
`⊘` or its folder's.

The column before it is git's: `M`, `+`, `R` or `!` for a changed file, and `•` for a folder with a change in it, `o` in
ASCII ([Git](git.md)).

Before the marks, dimmed, is what describes the row: a vault's branch, a worktree's after `⎇`, where a link leads, or
`another disk` for a folder of your home folder where a disk or a share is mounted.

## What the explorer lists

The explorer shows every note, under its name with its extension (`inbox.md`). It shows every folder too, even an empty
one, so there is somewhere to make a new note.

Which other files it lists is up to `files.show` ([Configuration](configuration.md)):

- `"auto"`, the default, lists notes and data files in a folder with a `.slipbox/`. Data files are JSON, YAML, TOML,
  INI, CSV and the like. Anywhere else, such as a code repository, it lists every text file.
- `"notes"` lists notes only.
- `"renderable"` lists notes and data files.
- `"all"` lists every text file.

`a` in the explorer switches to every text file for the moment, and back.

Two more settings name files:

- `files.include` names files to list, whatever `files.show` says.
- `files.exclude` names files never to list.

Both write their patterns in `.gitignore`'s way (`"*.py"`, `"scripts/"`).

The switcher (`ctrl+p`) lists the same files, except those in a folder slipbox doesn't index (below)
([Finding things](finding.md)).

Some files are never listed:

- pictures, archives and other binary files, which slipbox doesn't open
- `.git`, git's own folder
- hidden files and folders, whose names start with `.`, unless you ask for them

`shift+h` in the explorer lists the hidden files and folders too, such as `.github` and `.env`, and hides them again.
`:hidden` does the same, and so does the UI settings list (`space u u`). Your choice is remembered for the folder. To
list them from the start, set `files.hidden = true` in your configuration, or in a vault's own `.slipbox/config.toml`
([Configuration](configuration.md)).

Hidden files and folders are not indexed, so they are marked `⊘`, and the status line says `hidden` while the cursor is
on one. `.slipbox` says `slipbox's own folder`. A hidden file you open from the explorer is indexed from then on, and
listed even while hidden files aren't, as when you open it by its path (below), except in your home folder and in
`.slipbox`. The switcher (`ctrl+p`) and search
list only what is indexed, so a hidden file shows there only once you've opened it.

Some folders are listed, but nothing in them is indexed. They are marked `⊘`:

- `node_modules` and the other folders tools fill: `venv`, `__pycache__`, `target`, `build`, `dist`, `vendor`, `Pods`,
  `DerivedData` and caches, wherever they are, when they look made by a tool: `.gitignore` leaves them out, or no note
  is directly in them (the folders in them don't count). A folder of your notes called `build`, with notes at its top
  and not ignored, is a folder like any.
- what `.gitignore` and `walk.exclude` leave out
- in your home folder, `Downloads`, the system's folders, and a folder where another disk is mounted
  ([Home](vaults.md#home))

You can unfold them and open their files. Their notes have no backlinks, search doesn't find them, and a wikilink's name
doesn't reach them. Nothing in them can be renamed, moved or deleted from the explorer, and only what `walk.exclude`
leaves out takes a new note there (below).

Nothing new goes where it would never be indexed. A new note, a move or a copy is refused, typed as a path or from the
command line, into a folder tools fill that `.gitignore` leaves out, or deeper in one with no note at its top
(`target/debug/plan.md`). A note put directly in a folder called `build` that isn't ignored makes it a folder of
notes, indexed. A note already in a folder tools fill can still be changed.

What `walk.exclude` leaves out is your own choice, so you can write there. A new note or folder there is made, typed as
a path or with its `⊘` row selected in the explorer, and a paste on that row goes there. A note there saved, or one
moved, copied, exported as Markdown or captured there, is written. The message each write gives says it isn't indexed:
`saved drafts/plan.md (not indexed: walk.exclude)`. It says so at every write, not the first alone, and adds no message
of its own. On the command line, `write`, `mv`, `cp` and `export` say it in their line, and their `--json` has
`notIndexed`. `capture` and `mkdir`, whose output is a path, say it as a warning.

You can also open a hidden or git-ignored file by its path (`:e .drafts/plan.md`), or by following a link to it. It
opens, and its links count from then on. A file in a busy folder, or in what `walk.exclude` leaves out, opens from the
explorer or by its path (`:e node_modules/pkg/README.md`), the same either way, and its links never count. Info says
why it isn't indexed.

A folder that is a vault of its own is listed with its own icon, and its files are its own: opening one, from the
explorer or by its path, goes into that vault. [Vaults, home and Elsewhere](vaults.md#switching-vaults) has what that
means.

A link (a symlink) says where it leads, dimmed, before its marks: `→ /mnt/disk/data`. One that leads out of the vault,
or out of home, isn't followed until you say so, and says that too: `not followed`, marked `⊘`. Opening it asks whether
to follow it, just look, or leave it ([Links that lead out](vaults.md#links-that-lead-out)). In Elsewhere,
every link asks.

## Making notes and folders

### A new note

Press `ctrl+n` or `space n n`, or type `:new`. In the explorer, press `n`. slipbox asks for the note's name.

It makes the note in the folder of the note you are reading. When the explorer has the keys, it makes it in the
explorer's selected folder instead, or beside the selected file. The question says where: `new note in ideas/`.

- **The name can be a path.** `coffee` makes `coffee.md`. `ideas/coffee` makes the folder `ideas` too, if it isn't
  there. A name starting with `/` is from the vault's top: `/inbox`.
- **`.md` is added**, unless the name ends in a data or code file's extension slipbox knows (`.toml`, `.json`,
  `.py`…). So `tasks.toml` is made as it is written.
- **A new note starts with its title,** `# coffee`. It opens with you typing on the line after the blank one, in the
  lens. With `editor.edit_in = "source"`, it opens in source mode instead.
- **A name that is already there** opens that file, and makes nothing.
- **A name where slipbox would never find the note** is refused: in a folder tools fill that `.gitignore` leaves out,
  or deeper in one with no note at its top, such as `target/debug/plan`.
- **A name another note has**, in another folder, would make a wikilink by that name (`[[coffee]]`) reach either of
  them. So slipbox suggests a distinct name instead, from the new note's folder (`ideas-coffee`). It says where the
  other one is. Type the name again to keep it anyway.

In a vault, nothing is ever made outside it, through a symbolic link or otherwise. In your home folder, a note or a
folder can be made through a link you follow, as a note's text is written through one; never through one you don't
([Links that lead out](vaults.md#links-that-lead-out)).

### A new folder

Press `ctrl+shift+n` or `space d n`, or type `:mkdir`. In the explorer, press `shift+n`.

The folder is made in the same place a new note would be, and its parents too. It is selected in the explorer.

## Renaming and moving

| To | In the explorer | Anywhere |
| --- | --- | --- |
| rename a note, file or folder in its folder | `r` | `space d r` (the folder) |
| move it to a folder picked from a tree | `m` | `space n shift+m` (the note), `space d m` (the folder) |
| rename or move a note by typing its new path | | `space n m`, `:rename`, `:mv` |
| move it by cutting and pasting | `x`, then `p` on the folder | `space n x` / `space d x`, then `space d p` |

`space n` acts on the note you are reading, and `space d` on its folder. When the explorer has the keys, they act on its
selected row.

- **`r`** asks for the new name, with the old one typed already. A note's `.md` is kept for you. Type `espresso`, and
  `coffee.md` becomes `espresso.md`. A name with a `/` is refused, because `m` is what moves.
- **`m`** shows the vault's folders as a tree. Its top comes first, and the folder the file is in is unfolded and
  marked `here`.
  - `left` and `right` fold and unfold.
  - Typing filters to the folders that match, under their parents. `enter` takes the first.
  - A folder can't move into itself, so it isn't offered.
- **`space n m`** asks for the note's new path from the vault's top, with its old one typed already (`ideas/coffee`).
  Change the name, the folders, or both.
  - A folder that's there, or a path ending in `/`, moves the note into it, keeping its name. `archive/` makes
    `archive/coffee.md`, and the folder is made if need be. `archive` does the same when there is such a folder.
  - `/` takes the note to the top of the vault.
  - Any other path is the note's new path. `archive/espresso` moves and renames it.
- **Cut and paste.** `x` on a row cuts it. `p` on a folder, or on a file in it, moves it there.

### The preview

Every rename and move shows what it will change before it changes anything. Its title says what moves and how much
changes: `ideas/coffee.md → archive/coffee.md: 3 changes in 2 files`.

Each row is one line of one file, before and after:

```text
index.md:12   Notes on [coffee](ideas/coffee.md).  →  Notes on [coffee](archive/coffee.md).
```

Press `enter` to do it, or `esc` to leave everything as it was.

Rows starting with `!` come first. They warn, for one, of a git repository whose files already have uncommitted
changes, so you can commit those apart.

A row starting with `skipped` is a file slipbox won't rewrite, and says why.

### What changes

- **Every link to it** changes, in this vault and in every other vault whose notes link into it. That covers links in
  notes, paths in data files, and paths in code comments.
- **Each link keeps its form.**
  - A relative path stays relative, worked out again from where the link is.
  - A link from the vault's top stays one.
  - A `#heading` stays on the end.
  - A reference link is changed where its address is defined.
  - A wikilink by name takes the new name: `[[coffee]]` becomes `[[espresso]]`. It is left as it is when only the
    folder changes.
- **The moved note's own links** to other notes, if they are relative paths, are changed to reach from its new
  folder. Nothing else in it changes.
- **A folder** takes everything in it along, pictures and hidden files included. Every link to anything in it is
  rewritten. Links between two files that move together stay as they are.
- **Open notes follow.** A window showing a moved note shows it under its new path, with its history. The open notes
  the move rewrote are reloaded.

A rename is refused, with nothing changed, when:

- the new name is taken, even by a name differing only in case
- it would leave the vault or go into a hidden folder
- it would go where nothing would find it: into a folder tools fill that `.gitignore` leaves out, deeper in one with
  no note at its top, or a folder with no note at its top renamed `build` or `target`
- a file it would rewrite or move has unsaved changes. Save first.

Renaming a heading and the links to it is in [Links and backlinks](links-and-vaults.md).

## Copying

In the explorer, `y` copies the selected note, file or folder, and `p` pastes a copy:

- `p` on the folder it is in, or on a file beside it, makes `coffee-copy.md`, then `coffee-copy-2.md`.
- `p` on another folder makes a copy there, under the same name. It is refused if that name is taken.

From anywhere:

| Key | What it does |
| --- | --- |
| `space n y` | Copies the note you are reading |
| `space d y` | Copies its folder |
| `space d p` | Pastes into the folder of the note you are reading. With the explorer's keys, into the selected one |
| `space n shift+y` | Makes a copy of the note beside it, and opens it |

A copy is the file as it is, links and all. Nothing links to it yet, and nothing is rewritten. So a relative link in a
copy pasted into another folder may no longer reach its note.

What you copied or cut is forgotten when you go into another vault.

## Deleting and the trash

1. Press `d` in the explorer, `space n d` for the note, or `space d d` for the folder. Or type `:delete`. slipbox asks
   first, and says what it costs:
   `Delete ideas/coffee.md? 3 links to it will break. It goes to the trash: u restores it.`
2. Press `y` to delete. `n` or `esc` doesn't.

A folder goes with everything in it.

Nothing is deleted outright. The file goes to this vault's trash, in slipbox's own state folder, never in your notes.
So git doesn't see it, and it isn't synced with the folder.

A note you had open keeps showing its last text, marked `✖ deleted on disk`.

Deleting is refused while a note it would take has unsaved changes.

### Getting it back

- `u` in the explorer, or `space v u`, restores what you deleted last. If nothing was deleted since slipbox started,
  or it was put back already, it opens the trash.
- `space v t` (or `:trash`) lists the trash, newest first. `enter` puts the selected item back where it was.

A restore is refused when something else is at that place now. Move it away first.

### Emptying the trash

The trash keeps what you delete for 30 days. Anything deleted longer ago is removed for good, the next time slipbox
looks in the trash or puts something in it.

To empty it sooner:

1. Go to **Empty the trash…**, the last row of the trash's list. `up` from the first row gets there, and
   `:empty-trash` opens the list on it.
2. Press `enter`. slipbox asks first: `Empty the trash? Its 3 items go for good: none can be restored.`
3. Press `y` to remove everything the list showed. `n` or `esc` leaves it as it was.

From the command line, `slipbox trash empty` lists what is in the trash, and `slipbox trash empty --yes` removes it.

What goes from the trash can't be restored. It is gone from your disk, not moved to the system's own trash.

## Undoing a rename

Press `space v shift+u`, or `shift+u` in the explorer, or type `:undo-rename`. It takes back the vault's last rename or
move, after the same kind of preview:

- Every file it rewrote gets back its text as it was.
- What moved goes back where it was.
- Open notes follow it back.

It also takes back the other changes that rewrite links across the vault, those made from the command line as well:

- a heading renamed
- a vault named or renamed (`:name`, `slipbox name`)
- links relinked or converted
- a replace in every note ([Finding things](finding.md))

The vault keeps the last 20, and each undo takes the newest. There is no redo. Do the rename again.

An undo is refused when a file it wrote has changed since. Put the file back as it was, and the undo goes through.

In a git repository, a rename is undone only on the branch it was made on.

A delete is undone from the trash (above), and a copy by deleting the copy. `u` in a note undoes changes to its text,
never to files.

## A folder of its own

A folder can become a vault of its own, with its own `.slipbox/`.

| Key | What it does |
| --- | --- |
| `v` on the folder in the explorer, or `space v m` | Makes it a vault of its own |
| `shift+v` (or `space v shift+m`) on such a folder | Makes it part of the vault holding it again |

Both show a preview of the links they fix. [Vaults, home and Elsewhere](vaults.md#giving-a-folder-slipbox) says what a
vault is, and what this changes.

## From the command line

The same operations work from the command line, for scripts and agents.

A note or folder you name is found by its path, and a note also by its name, as [The command line](cli.md) says.

A new path, for `write --create`, `mkdir`, `mv` and `cp`, is from the vault's top, wherever you are in it. A path that
starts with `./` or `../` is from the folder you are in instead.

| Command | What it does |
| --- | --- |
| `slipbox write ideas/tea '# Tea' --create` | Makes a note with that text (`.md` added). Refused if it exists |
| `slipbox write ideas/tea --create --allow-empty` | Makes an empty note, to fill later |
| `slipbox mkdir ideas/drafts` | Makes a folder, and its parents |
| `slipbox mv ideas/coffee.md archive/coffee.md` | Renames or moves a note, file or folder, links rewritten |
| `slipbox cp ideas/coffee.md` | Copies it beside itself (`coffee-copy.md`), or to a path, or a folder, given after it |
| `slipbox rm ideas/coffee.md` | Deletes it to the trash, saying how many links break |
| `slipbox trash` | Lists the trash, newest first, each item with its id |
| `slipbox trash restore ideas/coffee.md` | Puts an item back, by its path or its id |
| `slipbox trash empty --yes` | Empties the trash for good. Without `--yes`, lists what would go |
| `slipbox undo` | Takes back the last rename or move, as `space v shift+u` does |

`mv` takes the new path as `space n m` does:

- A folder that's there, or a path ending in `/`, is moved into. So `slipbox mv inbox.md archive/` makes
  `archive/inbox.md`, and `slipbox mv drafts archive/` makes `archive/drafts`.
- Any other path is the whole new path. `slipbox mv inbox.md tray` makes `tray.md`.

`cp` reads its path the same way. A copy into the folder the file is in already goes beside it as `name-copy`.

Neither writes over a file.

`mv`, `rm` and `undo` take `--dry-run`, which shows what they would do and does nothing:

```text
$ slipbox mv reading/the-long-ride.md reading/long-ride.md --dry-run
would rename reading/the-long-ride.md → reading/long-ride.md: 3 changes in 1 file
  reading/list.md:38
    - | The Long Ride | D. Okoro | 2026-09-26 | 4 | [notes](the-long-ride.md) |
    + | The Long Ride | D. Okoro | 2026-09-26 | 4 | [notes](long-ride.md) |
```

`mv` and `undo` also take `--plan`. It saves what they would do, for `slipbox apply` to carry out later. Carrying it
out is refused if a file changed in between.

[The command line](cli.md) has every command and flag.

## Keys

| Keys | What they do |
| --- | --- |
| `space e` / `space shift+e` | The explorer: open, focus, close / show the note you are reading in it |
| `ctrl+n`, `space n n` / `ctrl+shift+n`, `space d n` | A new note / folder |
| `space n m` | Rename or move the note by its path |
| `space n shift+m` / `space d m` | Move the note / the folder to a folder picked from a tree |
| `space d r` | Rename the folder |
| `space n y`, `space n x` / `space d y`, `space d x` | Copy, cut the note / the folder |
| `space d p` | Paste into the folder |
| `space n shift+y` | A copy of the note beside it, opened |
| `space n d` / `space d d` | Delete the note / the folder, to the trash |
| `space v u` / `space v t` | Restore what was deleted last / the trash, its last row emptying it |
| `space v shift+u` | Undo the last rename or move |

In the explorer:

| Key | What it does |
| --- | --- |
| `n`, `shift+n` | New note, new folder |
| `r` | Rename |
| `m` | Move |
| `y`, `x`, `p` | Copy, cut and paste |
| `d` | Delete |
| `u` | Restore |
| `shift+u` | Undo a rename |
| `.` | The menu |

[Keys](keys.md) lists every key.
