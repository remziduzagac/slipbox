# How slipbox works

The few ideas the rest of slipbox rests on: your files are the notes, the TUI and the command line share them, a root
gives links their meaning, an index keeps answers quick, and nothing leaves your machine or runs without your say. This
chapter explains each, what slipbox promises about it, and where it stops. Each idea has a chapter of its own, linked
from here, with the details.

## Your files are the notes

slipbox has no database of notes, no import and no format of its own. A note is a Markdown file in a folder, and slipbox
reads it there and writes it back there. Close slipbox and your notes are as they were, for any editor, git, a sync tool
or another app to read. Obsidian's and zk's links, tags, aliases and link settings are read as those apps read them, so
a vault or a notebook opens unchanged ([Coming from Obsidian or zk](../guides/from-obsidian-or-zk.md)).

**Opening a folder writes nothing into it.** What slipbox keeps for itself (its index, your sessions, the trash, the
scratch) is in four folders of its own, outside your notes ([Where slipbox keeps
things](configuration.md#where-slipbox-keeps-things)). It writes into your folders only what you ask for: a note you
save, an export, the `.slipbox/` folder `slipbox init` makes, and a scratch you chose to keep there.

## One set of files, two ways in

slipbox is one program with two faces. The TUI, the full screen, is for you to read and write in. The command line is
for agents, scripts and your shell: each command reads the files, answers, and exits. Both read the same files, the same
links and the same index, so they give the same answers: `slipbox render` draws a note as the TUI does, and
`slipbox backlinks` lists what the TUI's backlinks list.

What connects them is the disk:

- **A command sees what is saved,** never the text you have unsaved in the TUI. It writes to disk, and the TUI picks the
  change up as it would any program's: it reloads the note, or asks what to do when you have unsaved changes there
  ([When a file changes on disk](editing.md#when-a-file-changes-on-disk)).
- **A command is told what the TUI holds unsaved.** A running slipbox lists those notes, and every command warns about
  them. It's advice, never a lock: a write still goes through ([Unsaved changes in a running
  slipbox](cli.md#unsaved-changes-in-a-running-slipbox)).
- **A careful writer can refuse to overwrite.** `slipbox write --if-unchanged` writes only if the note is still the one
  it read ([Writes that never clobber yours](../guides/agents.md#writes-that-never-clobber-yours)).
- **What you change in the TUI, a command can change too:** writing, ticking a task, renaming, moving, fixing links.
  What only the TUI has is the interaction itself (the cursor, panes, selections and prompts) and git, which a script
  runs itself. `slipbox commands` lists each action beside the command that does the same.

## How slipbox writes

- **Whole, never half.** A file is written as a new file, then put in the old one's place, so a reader never sees half
  of it. Two commands writing the same note at once leave one of them, never a mix.
- **As it was, but for your change.** Line endings and a byte order mark are kept, and a missing last line break too,
  unless the folder's `.editorconfig` asks for one. A file that isn't valid UTF-8 is never rewritten, so no byte is
  lost.
- **Only inside the note's root.** A write that would land outside it, through `..` or a symlink, is refused.
- **Shown first when it's large.** A rename, a move or a replace in every note shows each line it will change before it
  changes any, `--dry-run` shows the same on the command line, and `slipbox undo` takes the last one back.
- **Deleting moves to slipbox's trash,** where a file stays for 30 days, to be put back ([Deleting and the
  trash](files.md#deleting-and-the-trash)).
- **Autosave never writes over a change** another program made on disk: it asks instead ([Saving](editing.md#saving)).

## Roots and links

A note's **root** is the nearest folder above it holding `.git`, `.slipbox/`, `.obsidian/` or `.zk/`: a repository, a
vault, a notebook. The root decides what `/` at the start of a link means, where a wikilink's name is looked for, how
the links slipbox writes there look, and what is indexed and searched together. A folder with none of these works too,
as a plain folder.

Every link, whatever form it's written in, is read as a file and a place in that file. So a link works as the tool that
wrote it meant: a path as on GitHub, a wikilink by name as in Obsidian, a path without `.md` as in zk. A link slipbox
writes follows the root's own convention. A folder you name once, `slipbox init --name notes`, is reached by a pointer,
`slipbox://notes/inbox.md`, wherever it is on each machine. Renaming or moving a note rewrites every link to it that
slipbox can reach, each in the form it was written in.

[Links and roots](links-and-roots.md) explains all of it.

## The index

slipbox keeps an index of each root in its cache: the notes' names, their links and backlinks, and their words for
search. The TUI builds it in the background when it opens a root, then keeps it up to date as files change, whoever
changes them; a command brings it up to date before a search. Until it's built, search reads the files themselves and
finds the same notes, more slowly ([The index](finding.md#the-index)).

The index is a copy, never the truth: deleting the cache is always safe, and slipbox makes it again. While you aren't
working, the TUI also looks through your home folder for other roots and indexes them, so that links from one root to
another count as backlinks everywhere; `index.background = false` turns that off.

## What reaches the network

slipbox has no account and no telemetry. It reaches the network in three cases only, each of which you can turn off: the
daily check for a newer release (in a release you installed, and only in the TUI), installing a language server from npm
the first time one is needed, and fetching a picture on the web, which asks first by default. A folder's own settings
can't turn any of them on. Beyond these, it downloads only when you ask: installing it, and `slipbox upgrade`.
[Privacy](privacy.md) lists each case and what it sends.

## What runs

slipbox runs the programs you chose: git, your editor, language servers and linters, your clipboard's tool, and your
shell for a command you type. A folder's own settings never name a program to run. A folder can hold programs of its
own, such as a project's tools or git hooks; in a root you haven't trusted, none of them runs, and slipbox asks the
first time it matters ([Trust](code.md#trust)). Text from a note is cleaned of terminal control codes before it reaches
your terminal, so a note can't move your cursor or retitle your window.

## Where it stops

- **The TUI needs a terminal.** Started from a script, slipbox says to use a command instead, and exits.
- **The unsaved list is advice.** A command that writes a note you're editing still writes; the TUI then asks you what
  to keep.
- **Big files and big folders.** A note larger than `walk.max_file_size` (4 MiB) is listed as skipped, not read. Your
  home folder and `/` are never roots: opened, they're listed a level at a time, never indexed whole.
- **A change it can't see.** On a Windows drive under WSL, slipbox notices a Windows program's change only in the notes
  it has open ([Windows, through WSL](../guides/install.md#windows-through-wsl)).
- **Most commands may still change before 1.0;** a stable few, the exit codes and the `--json` object won't
  ([Versions](versions.md)).
