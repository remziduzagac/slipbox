# Files

slipbox's notes are plain files in a folder, and you can manage them from slipbox itself: make notes and folders,
rename and move them, copy them, and delete them. What sets this apart from doing it in a file manager is the links:
when a note moves or changes its name, every link to it is rewritten to follow it, and you see each change before it
is made. A deleted file goes to slipbox's trash, where you can get it back, and the last rename or move can be undone.
This chapter covers the explorer, the panel where you do all this; the same from anywhere with the leader keys; and
the commands that do it from the command line. Changing what is in a note is in [Editing](editing.md).

## The explorer

The explorer is the file tree on the left. `space e` opens it, then puts the keys in it, then closes it; `≡` at the
top of the left edge shows or hides it. `space shift+e` selects the note you are reading in it, unfolding its folders.
On a terminal narrower than 90 columns (`ui.narrow_width`), it opens over the note instead of beside it
([The screen](screen.md)).

While it has the keys:

| Key | What it does |
| --- | --- |
| `j` / `k`, `down` / `up` | move the selection (nothing opens) |
| `g g` / `shift+g` | to the top / bottom |
| `enter` | open the note in a tab of its own (or the tab showing it); on a folder, fold or unfold it |
| `l`, `right` | open the note in a tab; unfold a folder |
| `h`, `left` | fold a folder, or go to the folder holding the selection |
| `o` | open the note in this window, in place of the one it shows |
| `s` | open it in the other window of a split, splitting first |
| `/` | filter: type to narrow the tree, the folders kept; `enter` opens, `esc` clears |
| `a` | show every text file, or back to what it shows by default (below) |
| `.` | the selected row's menu |
| `esc` | back to the note; the explorer stays open |
| `q` | close the explorer |

With the mouse, a click on a folder folds or unfolds it, a click on a note selects it, and a double click opens it in
a tab. The explorer's title has two buttons, a new note and a new folder. While the explorer has the keys, the
selected row has a button at its end, `…`, which opens the same menu as `.`: every action this chapter describes,
each with its key.

The row `..` at the top goes up to the folder holding this one: [Links and roots](links-and-roots.md) has what that
means when the folder is a root. A file git sees as changed is marked at the end of its row ([Git](git.md)).

## What the explorer lists

The explorer shows every note, under its name with its extension (`inbox.md`), and every folder, even an empty one,
so there is somewhere to make a new note. Which other files it lists is up to `files.show`
([Configuration](configuration.md)):

- `"auto"`, the default: notes and data files (JSON, YAML, TOML, INI, CSV and the like) in a folder with a `.slipbox/`,
  and every text file anywhere else, such as a code repository.
- `"notes"`: notes only.
- `"renderable"`: notes and data files.
- `"all"`: every text file.

`a` in the explorer switches to every text file for the moment, and back. `files.include` names files to list
whatever `files.show` says, and `files.exclude` files never to list, both in `.gitignore`'s way of writing patterns
(`"*.py"`, `"scripts/"`). The switcher (`ctrl+p`) lists the same files ([Finding things](finding.md)).

Some files are never listed:

- pictures, archives and other binary files, which slipbox doesn't open;
- hidden files and folders (a name starting with `.`), and what `.gitignore` leaves out;
- `node_modules`, and what `walk.exclude` leaves out.

You can still open a hidden or git-ignored file by its path (`:e .drafts/plan.md`), or by following a link to it. It
opens, and its links count from then on. A file under `node_modules` or `walk.exclude` doesn't open.

A folder that is a root of its own is listed with its own icon, and its files are its own: [Links and
roots](links-and-roots.md) has what that means.

## Making notes and folders

**A new note:** `ctrl+n`, `space n n` or `:new`, or `n` in the explorer. slipbox asks for its name, and makes it in the
folder of the note you are reading, or in the explorer's selected folder (beside the selected file) when the explorer
has the keys. The question says where: `new note in ideas/`.

- **The name can be a path.** `coffee` makes `coffee.md`; `ideas/coffee` makes the folder `ideas` too, if it isn't
  there. A name starting with `/` is from the root: `/inbox`.
- **`.md` is added**, unless the name ends in a data or code file's extension slipbox knows (`.toml`, `.json`,
  `.py`…): `tasks.toml` is made as it is written.
- **A new note starts with its title,** `# coffee`, and opens with you typing on the line after the blank one.
- **A name that is already there** opens that file, and makes nothing.
- **A name another note has**, in another folder, would make a wikilink by that name (`[[coffee]]`) reach either of
  them. slipbox suggests a distinct name instead, from the new note's folder (`ideas-coffee`), and says where the
  other one is. Type the name again to keep it anyway.

Nothing is ever made outside the root, through a symbolic link or otherwise.

**A new folder:** `ctrl+shift+n`, `space d n` or `:mkdir`, or `shift+n` in the explorer. It is made in the same place
a new note would be, its parents too, and it is selected in the explorer.

## Renaming and moving

| To | In the explorer | Anywhere |
| --- | --- | --- |
| rename a note, file or folder in its folder | `r` | `space d r` (the folder) |
| move it to a folder picked from a tree | `m` | `space n shift+m` (the note), `space d m` (the folder) |
| rename or move a note by typing its new path | | `space n m`, `:rename`, `:mv` |
| move it by cutting and pasting | `x`, then `p` on the folder | `space n x` / `space d x`, then `space d p` |

`space n` acts on the note you are reading and `space d` on its folder; with the explorer's keys, on its selected row.

- **`r`** asks for the new name with the old one typed already. A note's `.md` is kept for you: type `espresso`, and
  `coffee.md` becomes `espresso.md`. A name with a `/` is refused: `m` moves.
- **`m`** shows the root's folders as a tree: the root first, the folder the file is in unfolded and marked `here`.
  `left` and `right` fold and unfold; typing filters to the folders that match, under their parents, and `enter`
  takes the first. A folder can't move into itself, so it isn't offered.
- **`space n m`** asks for the note's new path from the root, its old one typed already (`ideas/coffee`): change the
  name, the folders, or both. A folder that's there, or a path ending in `/`, moves the note into it, keeping its
  name: `archive/` makes `archive/coffee.md` (the folder is made if need be), as does `archive` when there is such a
  folder, and `/` takes it to the top of the root. Any other path is the note's new path: `archive/espresso` moves
  and renames it.
- **Cut and paste.** `x` on a row cuts it, and `p` on a folder (or on a file in it) moves it there.

### The preview

Every rename and move shows what it will change before it changes anything. Its title says what moves and how much
changes (`ideas/coffee.md → archive/coffee.md: 3 changes in 2 files`), and each row is one line of one file, before
and after:

```text
index.md:12   Notes on [coffee](ideas/coffee.md).  →  Notes on [coffee](archive/coffee.md).
```

`enter` does it; `esc` leaves everything as it was. Rows starting with `!` come first: they warn, for one, of a git
repository whose files already have uncommitted changes, so you can commit those apart. A row starting with
`skipped` is a file slipbox won't rewrite, and says why.

### What changes

- **Every link to it**, in this root and in every other root whose notes link into it: links in notes, paths in data
  files, and paths in code comments.
- **Each link keeps its form.** A relative path stays relative, worked out again from where the link is; a link from
  the root stays one; a `#heading` stays on the end; a reference link is changed where its address is defined. A
  wikilink by name takes the new name (`[[coffee]]` becomes `[[espresso]]`), and is left as it is when only the
  folder changes.
- **The moved note's own links** to other notes, if they are relative paths, are changed to reach from its new
  folder. Nothing else in it changes.
- **A folder** takes everything in it along, pictures and hidden files included. Every link to anything in it is
  rewritten; links between two files that move together stay as they are.
- **Open notes follow.** A window showing a moved note shows it under its new path, its history with it, and the open
  notes the move rewrote are reloaded.

A rename is refused, with nothing changed, when the new name is taken (by a name differing only in case, too), when
it would leave the root or go into a hidden folder, or when a file it would rewrite or move has unsaved changes: save
first. Renaming a heading and the links to it is in [Links and roots](links-and-roots.md).

## Copying

`y` in the explorer copies the selected note, file or folder, and `p` pastes a copy:

- `p` on the folder it is in (or on a file beside it) makes `coffee-copy.md`, then `coffee-copy-2.md`;
- `p` on another folder makes a copy there, under the same name; refused if that name is taken.

`space n y` and `space d y` copy the note you are reading, or its folder, and `space d p` pastes into the folder of
the note you are reading (with the explorer's keys, into the selected one). `space n shift+y` makes a copy of the note
beside it and opens it.

A copy is the file as it is, links and all. Nothing links to it yet, and nothing is rewritten: a relative link in a
copy pasted into another folder may no longer reach its note. What you copied or cut is forgotten when you go into
another root.

## Deleting and the trash

`d` in the explorer, `space n d` (the note), `space d d` (the folder) or `:delete` deletes. slipbox asks first, and
says what it costs: `Delete ideas/coffee.md? 3 links to it will break. It goes to the trash: u restores it.` `y`
deletes; `n` or `esc` doesn't. A folder goes with everything in it.

Nothing is deleted outright. The file goes to this root's trash, in slipbox's own state folder, never in your notes
(so git doesn't see it, and it isn't synced with the folder). A note you had open keeps showing its last text, marked
`✖ deleted on disk`. Deleting is refused while a note it would take has unsaved changes.

To get something back:

- `u` in the explorer, or `space v u`, restores what you deleted last. With nothing deleted since slipbox started
  (or put back already), it opens the trash.
- `space v t` (or `:trash`) lists the trash, newest first: `enter` puts the selected item back where it was.

A restore is refused when something else is at that place now: move it away first.

The trash keeps what you delete for 30 days. Anything deleted longer ago is removed for good, the next time slipbox
looks in the trash or puts something in it. To empty it sooner:

- **Empty the trash…** is the last row of the trash's list: `up` from the first row gets there, and `:empty-trash`
  opens the list on it. `enter` asks first (`Empty the trash? Its 3 items go for good: none can be restored.`), and
  `y` removes everything the list showed. `n` or `esc` leaves it as it was.
- `slipbox trash empty` lists what is in the trash, and `slipbox trash empty --yes` removes it.

What goes from the trash can't be restored: it is gone from your disk, not moved to the system's own trash.

## Undoing a rename

`space v shift+u` (`shift+u` in the explorer, or `:undo-rename`) takes back the root's last rename or move, after the
same kind of preview: every file it rewrote gets back its text as it was, and what moved goes back where it was. Open
notes follow it back.

- It takes back the other changes that rewrite links across the root too: a heading renamed, a folder named, links
  relinked or converted, and a replace in every note ([Finding things](finding.md)). Those made from the command line
  as well.
- The root keeps the last 20, and each undo takes the newest. There is no redo: do the rename again.
- It is refused when a file it wrote has changed since. Put the file back as it was, and the undo goes through.
- In a git repository, a rename is undone only on the branch it was made on.

A delete is undone from the trash (above), and a copy by deleting the copy. `u` in a note undoes changes to its text,
never to files.

## A folder of its own

A folder can become a root of its own, with its own `.slipbox/`: `v` on it in the explorer, or `space v m`. `shift+v`
(or `space v shift+m`) on such a folder makes it a plain folder again. Both show a preview of the links they fix.
[Links and roots](links-and-roots.md) says what a root is, and what this changes.

## From the command line

The same operations, for scripts and agents. A note or folder you name is found by its path (or, for a note, by its
name), as [The command line](cli.md) says. A new path, for `write --create`, `mkdir`, `mv` and `cp`, is from the
root, wherever you are in it, unless it starts with `./` or `../`: then it is from the folder you are in.

| Command | What it does |
| --- | --- |
| `slipbox write ideas/tea '# Tea' --create` | makes a note with that text (`.md` added); refused if it exists |
| `slipbox write ideas/tea --create --allow-empty` | makes an empty note, to fill later |
| `slipbox mkdir ideas/drafts` | makes a folder, and its parents |
| `slipbox mv ideas/coffee.md archive/coffee.md` | renames or moves a note, file or folder, links rewritten |
| `slipbox cp ideas/coffee.md` | copies it beside itself (`coffee-copy.md`), or to a path given after it |
| `slipbox rm ideas/coffee.md` | deletes it to the trash, saying how many links break |
| `slipbox trash` | lists the trash, newest first, each item with its id |
| `slipbox trash restore ideas/coffee.md` | puts an item back, by its path or its id |
| `slipbox trash empty --yes` | empties the trash for good; without `--yes`, lists what would go |
| `slipbox undo` | takes back the last rename or move, as `space v shift+u` does |

`mv` takes the new path as `space n m` does: a folder that's there, or a path ending in `/`, is moved into, so
`slipbox mv inbox.md archive/` makes `archive/inbox.md`. Any other path is the whole new path:
`slipbox mv inbox.md tray` makes `tray.md`. It never writes over a file.

`mv`, `rm` and `undo` take `--dry-run`, which shows what they would do and does nothing:

```text
$ slipbox mv reading/the-long-ride.md reading/long-ride.md --dry-run
would rename reading/the-long-ride.md → reading/long-ride.md: 3 changes in 1 file
  reading/list.md:38
    - | The Long Ride | D. Okoro | 2026-09-26 | 4 | [notes](the-long-ride.md) |
    + | The Long Ride | D. Okoro | 2026-09-26 | 4 | [notes](long-ride.md) |
```

`mv` and `undo` also take `--plan`, which saves what they would do for `slipbox apply` to carry out later, refused if
a file changed in between. [The command line](cli.md) has every command and flag.

## Keys

| Keys | What they do |
| --- | --- |
| `space e` / `space shift+e` | the explorer: open, focus, close / show the note you are reading in it |
| `ctrl+n`, `space n n` / `ctrl+shift+n`, `space d n` | a new note / folder |
| `space n m` | rename or move the note by its path |
| `space n shift+m` / `space d m` | move the note / the folder to a folder picked from a tree |
| `space d r` | rename the folder |
| `space n y`, `space n x` / `space d y`, `space d x` | copy, cut the note / the folder |
| `space d p` | paste into the folder |
| `space n shift+y` | a copy of the note beside it, opened |
| `space n d` / `space d d` | delete the note / the folder, to the trash |
| `space v u` / `space v t` | restore what was deleted last / the trash, its last row emptying it |
| `space v shift+u` | undo the last rename or move |

In the explorer: `n` and `shift+n` new, `r` rename, `m` move, `y` `x` `p` copy, cut and paste, `d` delete, `u`
restore, `shift+u` undo a rename, `.` the menu. [Keys](keys.md) lists every key.
