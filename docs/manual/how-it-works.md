# How slipbox works

This chapter covers the few ideas the rest of slipbox rests on:

- Your files are the notes.
- The TUI and the command line share them.
- A vault gives links their meaning.
- An index keeps answers quick.
- Network requests and tool execution follow your settings and vault trust.

It explains each idea, what slipbox promises about it, and where it stops. Each idea has a chapter of its own, linked
from here, with the details.

## Your files are the notes

slipbox has no database of notes, no import and no format of its own. A note is a Markdown file in a folder. slipbox
reads it there and writes it back there.

Close slipbox and your notes are as they were. Any editor, git, a sync tool or another app can read them.

Obsidian's and zk's links, tags, aliases and link settings are read as those apps read them. So a vault or a notebook
opens unchanged ([Coming from Obsidian or zk](../guides/from-obsidian-or-zk.md)).

**Opening a folder writes nothing into it.** What slipbox keeps for itself is in four folders of its own, outside your
notes. That's its index, your workspaces, the trash and the scratch ([Where slipbox keeps
things](environment-and-storage.md#where-slipbox-keeps-things)).

It writes into your folders only what you ask for:

- a note you save
- an export
- the `.slipbox/` folder `slipbox init` makes
- a scratch you chose to keep there

## One set of files, two ways in

slipbox is one program with two faces:

- The TUI, the full screen, is for you to read and write in.
- The command line is for agents, scripts and your shell. Each command reads the files, answers, and exits.

Both read the same files, the same links and the same index. So they give the same answers. `slipbox render` draws a
note as the TUI does, and `slipbox backlinks` lists what the TUI's backlinks list.

What connects them is the disk:

- **A command sees what is saved,** never the text you have unsaved in the TUI. It writes to disk. The TUI picks the
  change up as it would any program's. It reloads the note, or asks what to do when you have unsaved changes there
  ([When a file changes on disk](editing.md#when-a-file-changes-on-disk)).
- **A command is told what the TUI holds unsaved.** A running slipbox lists those notes, and every command warns about
  them. It's advice, never a lock. A write still goes through ([Unsaved changes in a running
  slipbox](cli.md#unsaved-changes-in-a-running-slipbox)).
- **A careful writer can refuse to overwrite.** `slipbox write --if-unchanged` writes only if the note is still the one
  it read ([Writes that never clobber yours](../guides/agents.md#writes-that-never-clobber-yours)).
- **Commands can make many of the same changes.** That includes writing, ticking a task, renaming, moving and fixing
  links. The TUI owns cursor, pane, selection and prompt interaction. CLI commands can inspect Git changes and
  worktrees; scripts use Git itself for operations such as commits. `slipbox commands` lists actions beside their
  CLI equivalents where one exists.

## How slipbox writes

- **Whole, never half.** A file is written as a new file, then put in the old one's place. So a reader never sees half
  of it. Two commands writing the same note at once leave one of them, never a mix.
- **As it was, but for your change.** Line endings and a byte order mark are kept. A missing last line break is kept
  too, unless the folder's `.editorconfig` asks for one. A file that isn't valid UTF-8 is never rewritten, so no byte
  is lost.
- **Only inside the note's vault.** A write that would land outside it, through `..` or a symlink, is refused. In
  home, a link you follow is written through ([Links that lead out](vaults.md#links-that-lead-out)).
- **Shown first when it's large.** A rename, a move or a replace in every note shows each line it will change, before
  it changes any. `--dry-run` shows the same on the command line. `slipbox undo` takes the last one back.
- **Deleting moves to slipbox's trash.** A file stays there for 30 days, to be put back ([Deleting and the
  trash](files.md#deleting-and-the-trash)).
- **Autosave never writes over a change** another program made on disk. It asks instead ([Saving](editing.md#saving)).

## Vaults and links

A note's **vault** is the nearest folder above it holding `.git`, `.slipbox/`, `.obsidian/` or `.zk/`. That's a
repository, an Obsidian vault or a zk notebook. Your home folder is a vault without a marker, home: its notes are those
no other vault holds. Everything outside home and every vault is Elsewhere: one place for the machine, with its own
tabs and no index.

The vault decides:

- what `/` at the start of a link means
- where a wikilink's name is looked for
- how the links slipbox writes there look
- what is indexed and searched together

Every link is read as a file and a place in that file, whatever form it's written in. So a link works as the tool that
wrote it meant:

- a path, as on GitHub
- a wikilink by name, as in Obsidian
- a path without `.md`, as in zk

A link slipbox writes follows the vault's own convention.

You can name a folder once, with `slipbox init --name notes`. Then a pointer reaches it wherever it is on each machine:
`slipbox://notes/inbox.md`.

Renaming or moving a note rewrites every link to it that slipbox can reach. Each link keeps the form it was written in.

[Links and backlinks](links-and-vaults.md) explains link resolution; [Vaults, home and Elsewhere](vaults.md) explains
the vault model. [Working across folders and vaults](../guides/vaults.md) walks through it with examples.

## The index

slipbox keeps an index of each vault in its cache. It holds the notes' names, their links and backlinks, and their
words for search.

The TUI builds the index in the background when it opens a vault. Then it keeps it up to date as files change, whoever
changes them. A command brings it up to date before a search. Until it's built, search reads the files themselves. It
finds the same notes, more slowly ([The index](finding.md#the-index)).

When the TUI reads the whole vault again, it reads it in the background: `space v r` reindexing it, going into
another vault, `[walk]` changed, or a change outside slipbox that has it look through every folder again. Until it's
read, [Background work](screen.md#the-top-bar) (`space b`) lists `reading the vault…`, and links, backlinks and search
answer from the vault as it was, your keys going on. After a rename, or a folder moved, copied or restored, the keys
you type wait for it instead, so the next one acts on the vault as the change left it. They wait too when slipbox has
just started or you've just gone into another vault, until it's first read: there's no vault as it was to act on yet,
and `q` or `ctrl+c` quits meanwhile. Either way the [status line](screen.md#the-status-line) says `reading the vault…`,
and `esc` doesn't stop it. A vault on a slow disk, such as a network share or a drive that's asleep, that doesn't
answer within ten minutes stays as it was: a message says `reading the vault gave up: …`, and slipbox reads it again a
minute later.

When slipbox starts, it takes the screen first and reads the vault after, in the background. The note it opens, or
the tabs it brings back, say `reading the vault…` in their window until the vault is read, then show with their links
and backlinks. If the vault gave up, the note shows as its text meanwhile, its links not checked yet.

Drawing a note never waits for the disk either. What it needs from there, such as whether a link's file is there, a
picture's file, a note it embeds or the places in the [scratch](scratch-and-context.md#the-scratch), is read in the
background and kept. On a slow disk, a picture shows its `▣` line until its file is read, an embedded note shows once
it's read, and a link is drawn as found until it's checked. The note is drawn again, where you were, when they come.

The index is a copy, never the truth. Deleting the cache is always safe, and slipbox makes it again.

While you aren't working, the TUI also looks through your home folder a little at a time. It indexes home's own notes,
then the other vaults it finds there. So links from one vault to another count as backlinks everywhere.
`index.background = false` turns that off ([Home](vaults.md#home)).

## On a slow disk

A network share, a drive that's asleep or a mount that answers slowly is a slow disk. The TUI reads it away from the
screen, so the screen and your keys never stop for it. What slipbox already knew stays on the screen until the disk
answers: links, backlinks, search, the explorer's folders and the notes you have open.

What you see while it waits:

- `reading <note>…` in a window, while a note you opened is read. The keys you type meanwhile act on the note once
  it's there, and `esc` gives the read up ([Reading notes](reading.md)). A list's preview and a peek say `reading…`
  instead, and your keys go on.
- `listing…` under a folder in the explorer, while it's listed. Zooming into a folder waits for it as opening a note
  does ([The zoom](files.md#the-zoom)).
- `reading the vault…` in Background work while the TUI reads the whole vault again, and on the status line while your
  keys wait for that: when slipbox has just started, in a vault you've just gone into, after a rename or a folder moved
  ([The index](#the-index)).
- `reading notes…` on the status line, while the list of tags, a note's backlinks or a rename's preview waits for every
  note to be read. Until then, the Problems panel's and Info's counts are of the notes read so far, marked `…`.
- A picture's `▣` line, an embedded note's link and a link drawn as found, until their files are read. The note is
  drawn again, where you were, when they come.
- `⚠ disk not answering` on the [status line](screen.md#the-status-line), when the disk didn't answer within a minute
  as slipbox looked for changes ([When a file changes on disk](editing.md#when-a-file-changes-on-disk)), read a note
  changed outside it, or checked your config, git and the files you have open ([Reloading](configuration.md#reloading)).

Nothing is read while you wait instead. A read that doesn't answer in time is given up, and slipbox says so: a note you
opened, or a folder you zoomed into, after a minute, and you try again when you like; a look for changes after a
minute, and a folder listed or the whole vault after ten, each asked again a minute later.

Some things still wait for the disk, and the screen with them:

- **Writing.** A save, a rename, a move, a copy, a delete, the scratch and an export are written as you make them, so
  the screen waits until each is written. That keeps what's written in order, against another program's change and
  against quitting. Autosave waits too.
- **Starting.** slipbox reads your config and the folder you named before the screen comes up; in your home folder,
  whether your tabs' notes are still there too.
- **Watching.** slipbox asks the system to watch each folder of the vault, and on a mount that has stopped answering,
  that can wait for it.
- **Its cache.** The search index and the cache of parsed notes are read and written as they're used. They're in the
  cache folder, under your home folder unless you've moved it ([Cache](environment-and-storage.md#cache)).
- **Another vault.** A peek into another vault, and a note reached in one, read that vault while you wait.
- **A few small reads,** each when it's needed: a heading link followed, or a hover, on a note not read yet; whether a
  tab's file is still there as you go into a vault; git's checkout, for a link to GitHub or GitLab; the reason the
  status line gives for a folder the index leaves out; which version of slipbox is installed, every ten seconds.

## What reaches the network

slipbox has no account and no telemetry. Built-in background or on-demand requests include:

- the daily check for a newer release, in a release you installed, and only in the TUI; `:upgrade` asks when you ask
- installing a language server from npm, the first time one is needed
- fetching a picture on the web, which asks first by default

You can turn off each of them. A folder's own settings can't turn any of them on.

Other requests follow actions you ask for, including installation, `slipbox upgrade`, and Git fetch, pull or push.
Language servers, linters, your editor and shell commands may have network behavior of their own.
[Privacy and trust](privacy.md) describes the built-in requests, settings and tool boundaries.

## What runs

slipbox runs the programs you chose:

- git
- your editor
- language servers and linters
- your clipboard's tool
- your shell, for a command you type

A folder's own settings never name a program to run.

A folder can hold programs of its own, such as a project's tools or git hooks. In a vault you haven't trusted, none of
them runs. slipbox asks the first time it matters ([Trust](privacy.md#trust)).

Text from a note is cleaned of terminal control codes before it reaches your terminal. So a note can't move your cursor
or retitle your window.

## Where it stops

- **The TUI needs a terminal.** Started from a script, slipbox says to use a command instead, and exits.
- **The unsaved list is advice.** A command that writes a note you're editing still writes. The TUI then asks you what
  to keep.
- **Big files and big folders.** A note larger than `walk.max_file_size` (4 MiB) is listed as skipped, not read.
  Every vault's index leaves out the busy folders a tool made, such as `node_modules` and `build`, ignored or with no
  note at their top, which the explorer lists all the same. Home's index also leaves out hidden folders and `Downloads`,
  and holds 10,000 notes at most. `/` is never a vault: if you open it, it's listed a level at a time, never indexed
  whole.
- **A slow disk.** The TUI reads one away from the screen, but a save, the start and a few other reads still wait for
  it, and the screen with them ([On a slow disk](#on-a-slow-disk)).
- **A change it can't see.** On a Windows drive under WSL, slipbox notices a Windows program's change only in the notes
  it has open ([Windows, through WSL](../guides/install.md#windows-through-wsl)).
- **Most commands may still change before 1.0.** A stable few won't, and nor will the exit codes and the `--json`
  object ([Versions](versions.md)).
