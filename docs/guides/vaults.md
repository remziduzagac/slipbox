# Vaults, home and Elsewhere

slipbox works in vaults. A vault is a folder whose files belong together: a git repository, an Obsidian vault, a zk
notebook. You don't have to make one, or pick one: slipbox finds it from the file you open. Every file on your machine
belongs to exactly one place: a vault, your home folder, or, outside both, Elsewhere.

This guide explains each of them, with examples:

- what a vault is, and how slipbox finds one
- home, your home folder's own vault, and Elsewhere, the rest of the machine
- going from one vault into another, each with its own tabs
- the explorer: one tree of your files, and the view of it you zoom in and out of
- links into other vaults, read in a peek without leaving where you are
- symlinks, followed only once you say so
- four worked examples: a folder of repositories, an agent's worktree, a notes vault inside a repository, and a file
  in `/etc`

## If you know Obsidian or VS Code

slipbox's vaults are unlike other tools' folders, in a few ways worth knowing first:

- **You open a file or a folder, not a vault.** slipbox finds the vault it belongs to. Open a folder deep inside a
  repository, and you're in the repository, the explorer showing that folder.
- **A vault ends where another begins.** In Obsidian, everything under the vault's folder is in it. In slipbox, a
  folder inside it with a marker of its own, such as a git repository you cloned there, is a vault of its own.
- **There's no workspace of several folders.** A vault is one folder. The explorer shows the folders around it, other
  vaults among them, and you go into the one you want.
- **Following a link never moves you.** A link into another vault opens a peek: you read the note there, and stay
  where you are until you choose to go.
- **Every file has a place.** A file outside your home folder and outside every vault is in Elsewhere, which has tabs
  of its own and no index.
- **A symlink leading out waits for a yes.** slipbox doesn't read through a symlink out of a vault, or out of home,
  until you say it may.

## The places on one machine

Take Sam, whose home folder holds notes, three repositories and two hobbies' notebooks:

```text
/
├── etc/hosts                          Elsewhere
├── mnt/backup/                        Elsewhere
└── home/sam/                          home: the vault ~
    ├── todo.md                        home's
    ├── household/bike-insurance.md    home's
    ├── Downloads/                     home's, but left out of its index
    ├── notes/                         a vault: .slipbox/
    ├── hobbies/
    │   ├── cooking/                   a vault: .obsidian/
    │   └── cycling/                   a vault: .zk/
    └── work/
        ├── infra/                     a vault: .git
        ├── kestrel/                   a vault: .git
        └── product/                   a vault: .git
```

Each of the three kinds of place has its own tabs. They differ in the rest:

| | A vault | Home | Elsewhere |
| --- | --- | --- | --- |
| What it is | a folder holding a marker | `~`, less the vaults in it | everything else |
| Its tabs | its own | its own, and each folder's you open by name | one set for the machine |
| Backlinks and search | yes | yes, less its skip list | no: it has no index |
| Its settings | yours, then its `.slipbox/config.toml` | yours | yours |
| Its git | when it's a repository | when `~` is a repository | none |
| The status line says | its name or its path, with the branch | `~` | `Elsewhere` |

## What a vault is

A file's vault is the nearest folder above it that holds one of these:

| Marker | The folder is |
| --- | --- |
| `.git` | a git repository, a worktree or a submodule |
| `.slipbox/` | a folder you gave slipbox's own settings (`slipbox init`) |
| `.obsidian/` | an Obsidian vault |
| `.zk/` | a zk notebook |

slipbox looks from the file up, a folder at a time, and the first marker wins. It stops at your home folder and at
`/`: neither is ever a vault by a marker, whatever it holds.

```text
~/work/kestrel/          .git: the vault kestrel
├── README.md
└── docs/
    └── sync.md
```

So these all work in the vault kestrel:

```bash
slipbox ~/work/kestrel/docs/sync.md       # sync.md open, in kestrel
slipbox ~/work/kestrel/docs               # kestrel, the explorer showing docs
cd ~/work/kestrel/docs && slipbox search retry   # all of kestrel searched
```

A vault keeps, for itself alone:

- its tabs, its splits and where you were in each note
- its index: the notes' names, links and words, which backlinks, search and link checks read
- its settings, when it has a `.slipbox/config.toml`
- its git, when it's a repository
- its scratch, its trash and its undo history

What slipbox makes of it, the index, the tabs, the scratch and the rest, it keeps in its own folders, never in the
vault. So opening a vault writes nothing into it
([Where slipbox keeps things](../manual/configuration.md#where-slipbox-keeps-things)).

The vault also decides what a link means. `/plan.md` starts from its top folder, and `[[plan]]` matches the notes in
it.

A vault is called by its name, when it has one: the name in its `.slipbox/`, else its repository's, from its remote.
A clone of `github.com/kestrel-labs/kestrel` is `kestrel`. Otherwise it's called by its path, such as
`~/hobbies/cooking`. The status line shows it, with a repository's branch: `kestrel · main`.

`space v i` says which vault you are in, and so does `slipbox info` there:

```text
vault     /home/sam/work/kestrel
name      kestrel
```

Which markers count is `walk.root_markers`, in your own config ([Configuration](../manual/configuration.md)).

## Every file in exactly one vault

For any file, slipbox takes the first of these:

1. the nearest folder above it holding a marker
2. else home, when it's in your home folder
3. else Elsewhere

So a vault ends where another begins. A vault inside a vault is a vault of its own:

```text
~/notes/                      the vault notes: .slipbox/
├── inbox.md                  notes'
└── tools/
    └── site-generator/       a vault of its own: .git
        └── README.md         site-generator's, not notes'
```

The clone keeps its files to itself:

- Search in `notes` doesn't find them, until you widen it with `ctrl+a`.
- A wikilink's name doesn't reach into it: `[[README]]` in `notes` doesn't find the clone's `README.md`. A path does,
  `[[tools/site-generator/README]]`, and following it opens a peek (below).
- The explorer marks the clone's folder `◈`, as a vault.

An agent's git worktree in `.claude/worktrees/` is a vault inside its repository in the same way.

Several markers in one folder make one vault. A repository holding `.obsidian/` is one vault, not two.

### Making a folder a vault, or not

A folder inside a vault becomes a vault of its own when you give it a `.slipbox/`:

- `v` on the folder in the explorer, or `space v m`
- `slipbox init <folder>` on the command line, with `--name` to name it

Some links would stop reaching what they did, such as a `/…` path or a wikilink by name across the new edge. slipbox
rewrites them first, after a preview. `shift+v` in the explorer, `space v shift+m` or `slipbox deinit` makes the folder
part of the vault holding it again. A git repository stays a vault whatever you do.

## Home

Your home folder, `~`, is a vault without a marker: home. Its files are those in your home folder that no other vault
holds:

```text
~/                              home
├── todo.md                     home's
├── household/
│   └── bike-insurance.md       home's
├── Downloads/                  home's, but left out of its index
├── .config/                    hidden: left out of its index, and not listed
├── notes/                      not home's: the vault notes
└── work/kestrel/               not home's: the vault kestrel
```

So the notes you keep loose, a to-do list at the top or a letter in `Documents`, have backlinks and are searched
together, as any vault's are. Start slipbox in `~`, or open one of those notes, and you're in home. The status line
says `~`.

Home is a vault as the others are, with three differences:

- **Its settings are your own config.** It has no `.slipbox/` to hold any, and `slipbox init ~` is refused.
- **It has git only when `~` is itself a repository**, a dotfiles repository, say.
- **Its index leaves out what isn't your notes.** That's its skip list.

Home's skip list:

- hidden folders: `.cache`, `.config`, `.local` and every other folder whose name starts with a dot
- the system's folders at its top: `Library` on macOS, `AppData` on Windows
- `Downloads`, where your desktop keeps it
- the busy folders, wherever they are: `node_modules`, `.venv`, `venv`, `__pycache__`, `target`, `build`, `dist`,
  `.next`, `vendor`, `Pods`, `DerivedData`, `.gradle`, `.tox`, and caches, when no note is directly in them
- a folder where another disk is mounted, such as a network share: slipbox never looks into it, so one that stops
  answering can't hold it up
- files that aren't notes or text, such as pictures and archives
- notes larger than `walk.max_file_size`, listed as skipped and not read

`walk.exclude` in your config leaves out more. Home reads no `.gitignore`, since a dotfiles repository's `*` would
leave it empty.

A file there still opens, and it's read again when it changes on disk. It's never indexed. The explorer lists those
folders, marked `⊘`, all but the hidden ones.

Home is indexed a little at a time, while nobody is working: no key, no click and no command from an agent for
`index.idle_seconds`, 30 seconds by default. Until then, home is its top folder alone, and backlinks and search find
more as it goes. The explorer, too, lists the vaults deeper in home as the walk finds them. A folder of home you open
by name, `slipbox ~/work`, or go into from another vault, is walked at once: its notes and the vaults in it are there
from the start, and it keeps its own tabs. slipbox keeps the walk, so this happens once: opening home again looks only
at what changed.

Home's index holds 10,000 notes at most, and its walk lists 5,000 folders, those nearest the top. slipbox says so when
it stops there. A folder you open by name is indexed whole all the same, home's deepest notes making room for it.
[Home](../manual/links-and-vaults.md#home) has the rest.

## Elsewhere

Everything outside your home folder that no vault holds is in Elsewhere: `/etc`, another drive, a network share,
`/tmp`.

```text
/
├── etc/nginx/nginx.conf       Elsewhere
├── mnt/backup/2025/           Elsewhere
└── tmp/build.log              Elsewhere
```

Elsewhere is one place for the whole machine, with one set of tabs and your own settings. Open `/etc/hosts` today and
`/mnt/backup/plan.md` tomorrow, and both are Elsewhere's tabs.

Elsewhere has no index. slipbox never walks it: the explorer lists it a folder at a time, as you open them. So what
needs an index isn't there, and slipbox says so, rather than showing you an empty list:

| You ask for | slipbox says |
| --- | --- |
| backlinks, `space l b` | `no backlinks in Elsewhere: it has no index — a note in a vault or home has them` |
| search, `space f s` | `Elsewhere has no index to search — search finds in a vault or home: …` |
| the vault's problems, `space v p` | `Elsewhere has no index: no check of its notes' links` |
| `slipbox backlinks`, `search`, `tags`, `problems` | exit 5: `Elsewhere has no index, so no backlinks: …` |

Nor has it git of its own: the git panel lists the repositories in the explorer's view instead.

In Elsewhere:

- A relative link is read from the note's folder, and `/` at a path's start is the filesystem's root.
- A wikilink has no names to look in, so it reaches nothing. Following one says so.
- Every symlink asks before slipbox reads through it (see [Symlinks](#symlinks-followed-once-you-say-so)).

`slipbox info` there says:

```text
vault     Elsewhere — /etc/nginx (outside home and every vault: no index)
```

To give a folder there an index, make it a vault. `space v m` in Elsewhere asks whether to give the folder you opened
a `.slipbox/`, and then goes into it.

## Going into a vault

slipbox is in one place at a time: a vault, home or Elsewhere. Its tabs are the ones you see, and the status line names
it. You go into another by choosing it:

- in the explorer, `enter` on a vault's row, or opening one of its files
- `o` in a peek at one of its files (below)
- in the git panel, `o` on a repository or a worktree, or a branch's `[Open]`
- `space v v`, which lists the named folders this machine knows
- `:e` with a path or a pointer into it
- `ctrl+click` on a link into it

Following a link, a backlink or a search hit into it only peeks. Nothing switches until you choose to go.

Going in, slipbox becomes that vault's, as if you had started it there. You get its settings, its index, its tabs as
you left them, and the file you chose, open. A message says where you are: `kestrel — /home/sam/work/kestrel`.

- **`ctrl+o` comes back.** From the first place you visit in a vault, it takes you back to the vault before, at the
  note and the place you left. A chain of vaults unwinds one at a time.
- **Unsaved notes stop you.** slipbox won't leave a vault while a note in it has unsaved changes, and names the note.
  Save it (`:wa` saves them all), or revert it.
- **What you copied or cut** in the explorer is forgotten.

So each place's work stays apart. The tabs you had open on kestrel's code are there when you go back into kestrel, and
your notes' tabs when you go back into `notes`.

## The explorer: one tree, and the view

The explorer shows your files as one tree, from `/` down. What you see of it is the view: one folder and what's in it.
There's no list of vaults beside the tree. Each vault is where it is in it.

The view starts at the folder you opened, or at the vault of the note you opened. Above the tree, the breadcrumb says
where the view is:

```text
~ › work › ◈ kestrel › docs ›
```

- `~` is your home folder. With the view outside it, the breadcrumb starts at `/`, and your home folder has its name.
- A vault has its mark, `◈`. The vault you are in is highlighted.
- The view's own folder is bold.

You zoom in and out yourself:

| Press | To |
| --- | --- |
| `z` | zoom in: the view shows the selected folder, or a selected file's folder |
| `-` | zoom out a level. The folder you were in stays unfolded, and selected |
| a click on a folder in the breadcrumb | zoom the view to it |

After you zoom out, the breadcrumb goes on, dimmed, to the folders you came from: `~ › work › ◈ kestrel › docs`, the
view at `kestrel`. A click on one zooms back in.

Here kestrel is open, and `-` has zoomed the view out to `~/work`. The breadcrumb ends at `◈ kestrel`, where the view
came from. Another repository, infra, is beside kestrel, and each says its branch:

![The explorer zoomed out to ~/work, its breadcrumb reading ~ › work › ◈ kestrel. Two repositories, infra and kestrel,
are marked ◈ with their branch, main. kestrel, the vault open, is unfolded: its folders marked ● as indexed, build,
node_modules, tmp and vendor marked ⊘ as not indexed, and docs and src marked • for their
changes](../images/vaults-explorer.png)

The view also zooms out by itself, when you go somewhere outside it: you open a note there, you follow a link to a file
there, or you go into another vault. It becomes the folder holding both places, with only the paths to the two
unfolded, and the breadcrumb leads on to where you went. It never zooms in by itself.

Zoomed out past the vault you are in, the explorer lists folders a level at a time:

- The vault you are in is highlighted, with its tree under it.
- Another vault has its mark. `l` unfolds it in place, to look in. `enter`, or opening one of its files, goes into it.
- Nothing outside the vault you are in can be renamed, moved or deleted from there. Go into its vault first.

Hidden folders aren't listed. So a vault in one, such as an agent's worktree in `.claude/worktrees/`, isn't in the
tree. Going into it moves the view to it.

You can open any folder you may read, in your home folder or not:

- A file you may not write opens read-only, and slipbox says why:
  `/etc/nginx/nginx.conf is read-only: you may not write it (no permission)`.
- A folder you may not read says why when you open it, unfold it or zoom into it:
  `can't read ~/private: you may not read it (no permission)`.

[Files](../manual/files.md#the-view) has every key of the explorer.

### A row's marks

A row can end with marks, each in a column of its own, so they line up down the tree:

```text
◈ kestrel                    main    ●
  docs                            •  ●
  node_modules                       ⊘
  private                            ⚿
  README.md                       M
◈ kestrel-agent-sync-retry   ⎇ agent/sync-retry
```

- **The last column** says what slipbox's index holds of the row: `●` indexed (dimmed), `◐` being indexed, `⊘` not
  indexed, `⚿` you may not read it, `⚠` a problem, such as a symlink whose target isn't there.
- **The column before it** is git's: `M`, `+`, `R` or `!` for a changed file, and `•` for a folder with a change in
  it.
- **Before the marks, dimmed,** is what describes the row: a vault's branch, a worktree's after `⎇`, or where a
  symlink leads.

With the cursor on a `⊘` row, the status line says why it isn't indexed, until the cursor moves off:
`⊘ not indexed: generated (node_modules)` for a folder tools fill with no note at its top, `git-ignored`, both when
both hold, `walk.exclude`, `on another disk`, `a link not followed`. The Info view says it too, of the file on screen.

[A row's marks](../manual/files.md#a-rows-marks) has their ASCII and Nerd Font forms, and every reason.

### Busy folders: listed, not indexed

Every vault's index leaves out the folders tools fill, wherever they are: `node_modules`, `.venv`, `venv`,
`__pycache__`, `target`, `build`, `dist`, `.next`, `vendor`, `Pods`, `DerivedData`, `.gradle`, `.tox`, and caches. It
leaves one out when it looks made by a tool: its `.gitignore` leaves it out, or no note is directly in it (the folders
in it don't count). It leaves out what `.gitignore` and `walk.exclude` leave out too, and home's skip list.

The explorer still lists them, marked `⊘`. You can unfold them and open their files, to read a build's output, say.
Nothing in them is indexed, though:

- Search doesn't find them, and their links aren't backlinks.
- A wikilink's name doesn't reach them.
- They can't be renamed, moved or deleted from the explorer.

A folder of your notes called `build` or `vendor`, with notes at its top and not ignored, is a folder like any: indexed,
searched, written. Nothing new goes where it would never be indexed: a new note, a move or a copy into an ignored busy
folder, or deeper in one with no note at its top, is refused, from the explorer, a typed path or the command line. A
note already there can still be changed.

## Links into other vaults: the peek

Following a link never moves you into another vault. A note there opens in a peek: a large floating window over the
one you are in, the note drawn as its own vault draws it. Your tabs, your vault and your place stay as they were.

Say `~/notes/index.md` links into kestrel twice, once by a path and once by a pointer:

```markdown
- The architecture overview: [architecture](../work/kestrel/docs/architecture.md).
- The same file, by pointer: [kestrel architecture](slipbox://kestrel/docs/architecture.md).
```

`enter` on either opens a peek titled `kestrel › docs/architecture.md`. The status line still names the vault you
are in, `notes`, and the peek's bottom border lists its keys:

![A peek over notes' index: kestrel's docs/architecture.md drawn in a large floating window titled kestrel ›
docs/architecture.md, its bottom border reading o go there · t keep as a tab · z fill · esc closes, the status line
still in notes](../images/vaults-peek.png)

| Press | To |
| --- | --- |
| `o` | go there: into kestrel, with its own tabs, at the place you were reading. `ctrl+o` comes back |
| `t` | keep it as a tab here, read-only, the tab marked with its vault's name: `kestrel: architecture.md` |
| `z` | fill the screen, or make it most of the screen again |
| `esc` | close it. You're where you were |

`/` finds in it, and you can select and copy from it. You can't edit it, and typing says why:
`a peek is read-only — o goes there, to edit it`. A note is edited in its own vault.

Links inside a peek are read in the note's own vault:

- A link to another of its notes moves the peek there. `ctrl+o` goes back inside the peek, and `space h n` forward.
- A link to a note of the vault you are in closes the peek, and opens the note in your tabs.
- A link to a third vault, or to Elsewhere, moves the peek there.

Under a note, the peek lists its backlinks, `Linked from (3):`, each a link to the line that links here. That needs its
vault's index on disk, which the background index makes for most vaults. A vault without one yet says so, and `o` goes
there, and finds them.

The same peek opens for:

- a backlink from another vault, in `space l b`
- another vault's hit, in a search widened with `ctrl+a`
- a note of home's, from another vault: `~ › todo.md`
- a file of Elsewhere's that a link reaches: `Elsewhere › /etc/hosts`, which says it has no backlinks, and why

With the mouse, a click on a link out of the vault peeks, and `ctrl+click` goes there at once.

## Symlinks: followed once you say so

A symlink can lead anywhere: to another drive, to `~/.ssh`, to a folder a `git pull` just pointed somewhere new.
slipbox doesn't read through one that leads out of where it is until you say so:

- **A symlink out of its vault, or out of home,** asks the first time you open it.
- **A symlink within its vault, or within home,** is a second name for what's already there, like the links `stow`
  makes (`~/.zshrc → ~/dotfiles/zsh/.zshrc`). slipbox never asks about it, and indexes what it leads to once.
- **In Elsewhere,** there's no vault to stay inside, so every symlink asks.

```text
~/notes/                          the vault notes
├── projects/
│   ├── kestrel-v2-3.md
│   └── kestrel-current.md        → kestrel-v2-3.md: within notes, never asks
└── research/
    ├── outside.md                → /etc/hosts: out of notes, asks
    └── archive/                  → /mnt/disk/archive: out of notes, asks
```

In the explorer, a symlink says where it leads, dimmed, and whether it's followed. One not followed is marked `⊘`, as
not indexed:

```text
  outside.md       → /etc/hosts  not followed  ⊘
```

Here the view is zoomed in on `notes/research`. `loop` leads back to `~/notes`, within the vault, so it never asks.
`outside.md` leads to `/etc/hosts`, and isn't followed. `route-engine-spike`, a repository inside notes, is a vault of
its own, marked `◈`:

![The explorer zoomed in on ~/notes/research: loop → ~/notes; route-engine-spike marked ◈ as a vault, with its name and
branch; gps-traces.md marked ⊘, too big to index; outside.md → /etc/hosts, not followed, marked
⊘](../images/vaults-links.png)

Opening it asks, titled `~/notes/research/outside.md → /etc/hosts leads out of notes: follow it?` (in Elsewhere,
`… is a link: follow it?`). Under the answers, the one selected says what it allows here:

![The question over a note: ~/notes/research/outside.md → /etc/hosts leads out of notes: follow it? A line says
/etc/hosts is outside your home folder and agents see what's followed; then Follow it, Just look and No; under them,
Follow it: read and indexed as notes's, never written to: it's outside the vault, kept for this link and where it
leads](../images/vaults-link-question.png)

Press `f`, `l` or `n`, or move to an answer and press `enter`:

| Answer | What it does |
| --- | --- |
| Follow it (`f`) | reads it as part of where you are: indexed, searched, its links counted. Kept |
| Just look (`l`) | opens it read-only, this once. Nothing of it is indexed. A folder is listed a level at a time |
| No (`n`) | leaves it unfollowed. Opening it again asks again |

What following allows depends on where you are, and the answer's own line says it:

- **In home,** slipbox reads, indexes and writes through it.
- **In a vault,** it reads and indexes through it, but never writes to a file it leads to outside the vault. Otherwise
  a symlink that a pull changes could lead a save to `~/.bashrc`.
- **In Elsewhere,** it reads and writes as the file system allows.

What's followed, agents see too: it's in search, in the context bundle and in the command line's answers. So when the
symlink leads to a hidden folder (`~/.ssh`, `~/.aws`) or outside your home folder, a line over the answers says so:
`/etc/hosts is outside your home folder: agents see what's followed`.

The answer is kept by symlink and target:

- **In slipbox's state folder**, in `links.json`, never in the vault. So a repository you clone can't bring its
  symlinks already followed.
- **For where it leads now.** If the symlink later leads somewhere else, by a pull or by hand, slipbox asks again.
- **Just look is for this once.** It isn't kept, and it ends when you go into another vault.
- **Until you forget it.** `space v l` lists the symlinks you've answered, with where each leads and what you said.
  `enter` forgets one, and opening it asks again. One you followed is followed no more, at once: its notes leave the
  index and search, and a tab open through it turns read-only. `slipbox symlinks` and `slipbox symlinks forget <link>`
  do the same from the command line.

A followed symlink on a slow disk, a network share or a drive unplugged, is asked whether it answers before anything
reads through it. If it doesn't answer within three seconds, slipbox gives up on it for now, and says so:
`… didn't answer in 3 s: not followed for now`. The explorer says `not answering`, and slipbox asks it again a minute
later.

The command line never asks, and never follows a symlink on its own. A path through one you haven't followed is
refused, with exit 5:

```text
research/outside.md is reached through a link that isn't followed (…): open it in slipbox to choose
```

So an agent can't follow one for you.

## The git panel follows the vault

`space g` opens the git panel. It shows the vault you are in:

- **In a repository,** the panel is that repository's. Under it, folded, **Other repositories** lists the others in
  the explorer's view.
- **In a vault that isn't a repository,** such as home, an Obsidian vault without git, or Elsewhere, those
  repositories are the panel: `~/work holds 3 repositories`, the one that needs you most first.

`enter` opens a repository up in place, with its worktrees and its uncommitted files. `o` goes into it.
[The repositories around you](../manual/git.md#the-repositories-around-you) has the rest.

## Worked examples

### A folder of repositories

```text
~/work/                   home's: no marker
├── infra/                the vault infra: .git
├── kestrel/              the vault kestrel: .git
└── product/              the vault product: .git
```

`~/work` holds no marker, so it's a folder of home, and each repository in it is a vault. Open one:

```bash
slipbox ~/work/kestrel
```

You're in kestrel. The status line says `kestrel · main`, and the breadcrumb `~ › work › ◈ kestrel ›`. Press `-`, and
the view zooms out to `~/work`. kestrel is highlighted, its tree under it, and the two others are beside it, each with
its branch dimmed at its end:

```text
◈ infra                      main
◈ kestrel                    main
  ▸ docs
  ▸ src
◈ product                    feature/okrs
```

- `l` on `product` unfolds it in place, to look in.
- `enter` on it goes into product, with its own tabs. The status line says `product · feature/okrs`, and the view
  stays at `~/work`.
- `ctrl+o` comes back into kestrel, its tabs as you left them.
- The git panel (`space g`) in kestrel is kestrel's, the other two folded under it, in Other repositories.

Started on the folder itself, `slipbox ~/work`, you're in home, with the view at `~/work`. The rows are the same, once
home's walk has found the repositories ([Home](#home)). The git panel there says `~/work holds 3 repositories`, the one
that needs you most first.

The three stay three vaults. A link in kestrel's docs to `../product/prd/route-sharing.md` opens a peek,
`product › prd/route-sharing.md`. Search in kestrel searches kestrel, and `ctrl+a` widens it to the folders it links
with, then to every vault.

Even a `.slipbox/` in `~/work` wouldn't merge them. `~/work` would become a vault, and each repository in it would stay
a vault of its own.

### An agent's worktree kept elsewhere

An agent works on a branch of its own, in a git worktree. You keep the worktrees together, away from your checkouts,
with this in your config:

```toml
[git]
worktrees = "~/worktrees/{repo}/{branch}"
```

```text
~/
├── Projects/
│   └── kestrel/                    the vault kestrel: the main checkout, on main
└── worktrees/
    └── kestrel/
        └── agent-sync-retry/       the vault kestrel@agent/sync-retry: a worktree
```

A worktree is a vault of its own, with its own tabs, scratch and history, since it's usually a task apart. The status
line names it by its repository and its branch: `kestrel@agent/sync-retry`.

To review the agent's work from your checkout:

1. In kestrel, `space g` opens the git panel. Under Branches, `agent/sync-retry` is marked `⎇`, with its folder.
2. `enter` opens it up in place: its files changed against its base, each with its diff a click away.
3. `[Open]` goes into the worktree, at the note you were on if the branch has it. Or `:worktrees` lists the checkouts,
   and `enter` goes into one.

Going in, the explorer's view zooms out to `~`, the folder holding both checkouts. Only the paths to the two are
unfolded, and the breadcrumb leads on to where you went:

```text
~ › worktrees › kestrel › ◈ agent-sync-retry
```

The worktree's row ends with `⎇ agent/sync-retry`, and the main checkout's with `main`. `ctrl+o` takes you back into
kestrel, where you were.

What a worktree's links mean:

- A relative path out of the repository is read from the main checkout. So `../shared/plan.md` names
  `~/Projects/shared/plan.md`, wherever the worktree is kept.
- Its notes are copies of the main checkout's. So their links aren't backlinks, and search leaves a worktree out.

In home, the git panel lists the worktree under kestrel, as one repository. `◆` marks a worktree with uncommitted
files: work for you to review.

When an agent keeps its worktree inside the repository, in `.claude/worktrees/`, it's a vault inside kestrel. The
explorer doesn't list hidden folders, so going into it moves the view to the worktree itself.

### A notes vault inside a repository

Kestrel's team keeps its notes beside its code, and you want them to work as notes: their own tabs, a wikilink's names
reaching only them, and an explorer listing notes rather than every text file.

```text
~/Projects/kestrel/              the vault kestrel: .git
├── docs/
│   └── architecture.md
├── notes/                       the vault kestrel-notes: .slipbox/
│   ├── .slipbox/
│   ├── decisions.md
│   └── inbox.md
└── src/
```

Give `notes/` a `.slipbox/` of its own, named:

```bash
cd ~/Projects/kestrel
slipbox init notes --name kestrel-notes --dry-run   # what it would change
slipbox init notes --name kestrel-notes
```

In the TUI, `v` on the folder in the explorer does the same. Links that would stop reaching across the new edge, a
`/…` path or a wikilink by name, are rewritten after a preview. Commit `.slipbox/` and everyone who clones the
repository gets the notes vault too. `--private` keeps it on this machine, out of git.

From kestrel, now:

- The explorer marks `notes` `◈`, as a vault. `enter` on it goes into it.
- kestrel's search doesn't find the notes, and `ctrl+a` widens it to them.
- A link from `docs/architecture.md` to `../notes/decisions.md` opens a peek, `kestrel-notes › decisions.md`.

In `notes`:

- `/` at a path's start, and a wikilink's name, reach the notes' own.
- The explorer lists its notes and data files, as `files.show` does in a folder with `.slipbox/`. `a` shows the rest.
- The status line says `kestrel-notes · main`: its git is the repository's, and you commit from the git panel as in
  kestrel.

`shift+v` on the folder in kestrel's explorer, or `slipbox deinit notes`, makes it part of kestrel again.

### A file in `/etc`

```text
/etc/nginx/                                   Elsewhere
├── nginx.conf
├── sites-available/
│   └── default
└── sites-enabled/
    └── default        → ../sites-available/default
```

`/etc` is outside your home folder, and no vault holds it. Open a file there:

```bash
slipbox /etc/nginx/nginx.conf
```

You're in Elsewhere. The status line says `Elsewhere ‹ /etc/nginx/nginx.conf ›`.

- **You may not write it**, so it opens read-only, and slipbox says why:
  `/etc/nginx/nginx.conf is read-only: you may not write it (no permission)`. slipbox never asks for more rights.
- **The explorer** shows `/etc/nginx`, a level at a time. The breadcrumb says `/ › etc › nginx ›`, and `-` zooms out
  to `/etc`.
- **The symlink** in `sites-enabled` says where it leads, `→ /etc/nginx/sites-available/default  not followed`.
  Opening it asks first, as every symlink in Elsewhere does, with a line saying the target is outside your home folder.
  `l` just looks, read-only.
- **No index:** `space f s` and `space l b` say Elsewhere has none.

From a vault, a file in `/etc` is a choice away:

- A link to it, such as `[hosts](/etc/hosts)` in a note, opens a peek, `Elsewhere › /etc/hosts`, read where you are.
  `o` goes into Elsewhere.
- `:e /etc/hosts` goes into Elsewhere at once.

Either way, `ctrl+o` brings back your vault, its tabs as you left them. Elsewhere keeps its own tabs for the next time:
open `/mnt/backup` next week, and `nginx.conf`'s tab is there.

## Where next

- [Links and vaults](../manual/links-and-vaults.md): every link form, vaults, home, Elsewhere, names and pointers.
- [Files](../manual/files.md): the explorer, its view and its marks, and making, moving and deleting files.
- [Git](../manual/git.md): the git panel, branches, worktrees and the repositories around you.
- [Code and git](code-and-git.md): reviewing an agent's branch before you merge it.
