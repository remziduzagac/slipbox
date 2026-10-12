# Roots

Which folder a file belongs to, what that folder answers, how it is walked, indexed and named, and where its state
is kept. "Root" is the design's word: the user meets folders, and a pointer's word for a root it can name is "named
folder" (D79). Nothing is ever written into a folder by opening it (D58). Links, which a root scopes, are
[links.md](links.md); switching roots in the TUI is [tui.md](tui.md) § Switching roots; where each file of state and
cache lives is [how-it-works.md](how-it-works.md) § Storage; the commands are
[docs/manual/cli.md](../../docs/manual/cli.md).

## Roots and markers

A file's root is the nearest folder above it holding a root marker: `.git` (a repository's top, a worktree's or a
submodule's), `.slipbox/`, `.obsidian/` (an Obsidian vault) or `.zk/` (a zk notebook) (D69; `core/vault.ts`,
`findVaultRoot`). The list is `walk.root_markers`, read from the user's own config only: a folder's config that sets
it is ignored with a warning, since it decides where roots are. Several markers in one folder make one root, its
settings and name from `.slipbox/` (D58). `$HOME` and `/` are never a root, whatever they hold (D42, D69). A marker
inside another root starts a root of its own, its files its own: the outer root's walk stops there (§ The walk).

One file has one root, however it is opened (D80). `--root` says where to start and where a note's name is looked
for; it must be a root itself, and a root nested in it stays one, in the CLI as in the TUI. Opening a file in a
repository opens the repository, from its top: nothing is asked, and nothing is written into it (D58).

A root is never managed, and none is needed: a folder without one works (§ Plain folders and loose files). Where one
exists, it answers (D69):

- what is indexed and searched first: opening any file or folder inside a root indexes the whole root, not only the
  subfolder opened (§ The index, § Search scope);
- what a leading `/` is measured from, and which notes a wikilink's name can match ([links.md](links.md) § Paths,
  § Wikilinks);
- whose link convention a file follows ([links.md](links.md) § Conventions);
- whether two files travel together, and what a named folder is (§ Named folders; [links.md](links.md) § Between
  folders);
- its settings, when it holds a `.slipbox/config.toml` (§ Settings);
- which session and state are the file's (§ State by root).

The TUI is always in one root; opening a file of another switches to it, and back returns (D50; [tui.md](tui.md)
§ Switching roots).

## Plain folders and loose files

A file under no root is loose. The folder opened then stands in for a root: a plain folder, known by its path,
walked and indexed as a root is, its session and state its own (D58, D76; `folderAt` in `core/vault.ts`). It has no
config of its own, only the user's (§ Settings). There `/` is the filesystem's path, a wikilink has no names to match
(it resolves to nothing, with a hint saying what makes a root), and the links slipbox writes follow the user's
setting where a folder can, else ours ([links.md](links.md) § Paths, § Wikilinks, § Conventions). Nothing of
slipbox's is put into one: the scratch stays in the state folder there whatever `capture.location` says.

`~` and `/` opened are plain folders listed a level at a time, with the walk's filter and size cap, never walked
below: walking them is the background index's work (`isListed`; § The index). A loose file a link leads to opens
beside the current root's notes: it has no root to switch into ([tui.md](tui.md) § Switching roots). A plain folder
gone a month is forgotten (§ State by root).

## `.slipbox/`

`.slipbox/` is optional (D74, D79). It holds a folder's settings (`config.toml`), its format's version (`version`;
bumped only with a migration), and, optionally, its identity: the `[vault]` table's `name` and `id`, with `aliases`
and `previous_names`, read on its own and never merged into the settings (`readIdentity` in `core/registry.ts`;
[docs/manual/configuration.md](../../docs/manual/configuration.md)). A name is letters, digits, `.`, `_` and `-`: no
spaces, `/` or `:`. The id is random, written with the name and never changed; it tells a copy of the folder from a
different folder of the same name (§ Named folders).

- **Written only when the user asks** (D74): the name and id by `slipbox init --name` and `slipbox name`, which the
  user runs; `slipbox init` without `--name` gives settings only. Nothing is written on its own into a `.slipbox/`
  made by hand, and nothing by opening a folder (D58). The identity is added to the config as text, its comments and
  layout kept; a `[vault]` table the edit can't follow is refused, to be edited by hand (`addIdentity`). Identity is
  never written from a worktree (§ Worktrees).
- **Private:** `slipbox init --private` lists `.slipbox/` in the repository's `.git/info/exclude`, kept out of git on
  this machine; any `.slipbox/` git's exclude file keeps out is private, and its name holds on this machine only
  (§ Named folders).
- **Committed,** a `.slipbox/` is merged with its branch. There is little in it (the identity, written once, and
  settings) and nothing slipbox writes while it is used: state and caches are outside the folder, per checkout (D54).
- **Made and taken away:** `slipbox init <folder>` on a folder inside a root makes it a root of its own, and `slipbox
  deinit` takes a nested root's `.slipbox/` away, to the parent's trash, its folder a plain folder of the root holding
  it again; a folder that is a root by another marker (a git checkout) is refused, since it stays one. Either way the
  links that would stop reaching what they did (a `/…` path, a wikilink across the new boundary) are rewritten after a
  preview; relative links reach what they did, so taking `.slipbox/` away changes roots, never what links reach (D79,
  D149; [tui.md](tui.md) § Files in the explorer; [docs/manual/cli.md](../../docs/manual/cli.md) § Moving, copying and
  deleting). The name goes with its `.slipbox/`, so the pointers by it, from the files this machine reaches, are
  rewritten in the same plan, as paths or the parent's pointer (D74, D75; [links.md](links.md) § Pointers).

## Settings

Settings apply deeper over broader: the built-in defaults, the user's config (`--config`, else `$SLIPBOX_CONFIG`,
else `config.toml` in the config folder), then the `.slipbox/config.toml` of each root enclosing this one, broadest
first, then the root's own (D62; `configFilesFor` in `core/vault.ts`, `core/config.ts`). A root without `.slipbox/`
(a repository, an Obsidian vault) has no file of its own; a plain folder takes the user's alone. `slipbox info` lists
the files that applied, and a change to any of them reloads the TUI's settings.

What a folder's config can't set, because whatever is cloned brings it: a key that names a program to run (an
editor, a linter, a language server's command), `walk.root_markers`, and `[trust]` come from the user's own config
only; cloning a repository never chooses what runs, nor where roots are (D62, D166, D177). The layers, the keys and
what only the user can set: [docs/manual/configuration.md](../../docs/manual/configuration.md).

## The walk

One predicate, `WalkFilter` in `core/walk.ts`, decides which files a root holds, for the walk and the watcher alike:
what the walk leaves out, the watcher doesn't subscribe to (D40).

- **Extensions:** `.md` and `.markdown`, case-insensitive (`walk.extensions`), are notes. Other files the walk passes
  are listed as the root's files (pictures, data, code), among which a wikilink finds an attachment by its name.
- **Always skipped:** `.git`, `.slipbox`, `node_modules`, and every entry whose name starts with a dot.
- **`.gitignore` is honoured**, nested ones included, with git's own semantics: every `.gitignore` from the root down
  applies, and the deepest one with an opinion wins, so `!keep.md` re-includes; a folder excluded is never descended
  into. Case follows git's default `core.ignorecase`: insensitive on macOS, sensitive on Linux. What git ignores
  (`target/`, `dist/`, vendored trees) is what must not resolve `[[README]]`. `walk.exclude` adds gitignore-syntax
  patterns.
- **Reached, then indexed:** a git-ignored file, or one under a hidden folder, isn't walked, but is indexed when it is
  reached (a note's link points at it, and then its own links reach further; it is opened in the TUI or named to the
  CLI) and stays indexed after, the list kept with the index (D61). `.git`, `.slipbox`, `node_modules`,
  `walk.exclude` and a root of its own are never reached: named, such a file is read and nothing more. A loose folder
  is listed, not indexed, and reaches nothing. Reached files aren't watched: they are read again when the index is
  next built.
- **Nested roots are boundaries:** a subfolder holding a root marker is a different root, and is not walked (D69,
  D40). A fixture vault inside a repository doesn't leak into it, and a repository's notes, or an Obsidian vault's,
  stay its own.
- **Symlinks:** a symlinked file is included when its real path is inside the root, unless that target is already
  walked, since the same note twice would double every backlink. A symlinked folder is never followed: no cycles, no
  escaping the root. Anything pointing outside the root is skipped and reported (`7.5`), and so is one pointing at
  something that isn't a file (a FIFO or a device, which a read would hang on).
- **Files a root controls are read with care:** a cloned or unpacked folder can hold a FIFO or a symlink to
  `/dev/zero` where a note, `.gitignore`, `.slipbox/config.toml` or `.slipbox/version` should be. Each such read opens
  without blocking and refuses anything but a regular file, and the small files are capped at 1 MB (`readRegular` in
  `core/fsutil.ts`): a hostile folder gets a warning, never a hang.
- **Size cap:** files over `walk.max_file_size` (default 4 MiB) are listed as skipped, not parsed.
- **Errors never abort:** unreadable folders and files are collected and reported as warnings.
- **Encoding:** UTF-8; invalid sequences decode to U+FFFD and the file is flagged; a BOM is noted and stripped for
  parsing only.

## The index

The index is a cache: it makes slipbox fast and gives backlinks, never decides where a link points, and can be
deleted (D61). Each root's is in its cache folder (the link index, the search index); the parse cache is shared
(below; [how-it-works.md](how-it-works.md) § Storage).

- **On demand carries the load:** the folder opened, indexed recursively and first; folders a followed link leads
  into; paths an agent's CLI command names. Once indexed, a folder is remembered and refreshed when touched again.
  Files beyond the walk are indexed when reached (§ The walk). A root nested in this one, or holding it, is indexed
  when a link or a backlink needs it, without having been opened on this machine.
- **In the background** (`core/autoindex.ts`): while the TUI is open and nobody is working (no key or click, and no
  CLI command from an agent, for `index.idle_seconds`; this root's own index done), the home folder is walked a slice
  at a time for roots, and each is indexed with its own config, so backlinks from roots never opened appear by
  themselves. It doesn't walk into a root it found: the roots nested in one are taken from that root's walk. Its
  place is kept (`autoindex.json`; each CLI command marks `activity`): it resumes where it stopped, and a pass done,
  the next is a day later. `[index] background = false` turns it off; `slipbox index --home` runs it now. It skips
  hidden folders (`.git`, `.venv` among them), `node_modules`, `venv`, `__pycache__`, and `~/Library` on macOS.
  Places outside the home folder (drives, `/tmp`) are indexed when opened or linked to. The TUI's side:
  [tui.md](tui.md) § Switching roots.
- **Freshness is checked, not assumed:** a build lists the folders again and keeps a file's entry only while its size
  and modification time match, since a folder's own time doesn't change when a file in it is edited; a file gone is
  dropped, or paired as a move ([links.md](links.md) § Repairs). Folders open are watched. What is covered and how
  fresh it is shows in `slipbox info` and the TUI, and the CLI refreshes a path on demand.
- **A drive unplugged** is unavailable, not deleted: a root or a named folder's copy on one (a path under `/Volumes`,
  `/media`, `/run/media` or `/mnt` that isn't there) stays listed, and links into it are broken, said so, until it
  is back; its links into other roots drop out of their backlinks meanwhile (`unavailable` in `core/registry.ts`).
- **Shared by content** (`core/parsecache.ts`): what a note says once parsed (links as written, headings, anchors,
  tags, aliases, previous names, a title of its own) is kept in one SQLite file, `parsed.db`, by its text's hash (its
  BOM aside), its format and the parser's version (`INDEX_VERSION`, bumped whenever what is extracted changes), for
  every copy on this machine: a worktree, a branch switched to, a clone parses only what no copy has (D61). No
  setting goes into the key, since parsing reads none. A title from the file's name, the file's BOM and line endings
  are the file's own, never cached. Where a link points depends on where the file is, so links are resolved, and
  backlinks derived, per root (D76; [links.md](links.md) § Backlinks). `SLIPBOX_PARSE_CACHE=off` goes without it.

## Named folders

A named folder is a root a pointer can name (D74; `core/folders.ts`). Its name travels with it, since the file
holding a pointer goes to other machines:

- the name in its `.slipbox/` config, given by `slipbox init --name` or `slipbox name`;
- else, for a repository, its remote's last part (`research`: `origin`'s, else the first remote's), qualified
  (`github.com/me/research`) when a different repository this machine knows shares the short one
  (`core/remotes.ts`);
- never its folder's own name, nor a copy's path: neither travels. A root with neither (`.obsidian/` or `.zk/` alone,
  a repository with no remote) is unnamed: shown by its path, and linked by relative path.

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
  one ([tui.md](tui.md) § Switching roots has the TUI's). A copy is a folder by its real path: one reached through a
  symlink is the same copy. A repository's worktrees are its branches, not copies: a worktree's copy is its main
  checkout.
- **A copy gone** (moved, unplugged) stays listed, unavailable, and is no choice; lookups take another copy
  meanwhile, said so (`via: "another-copy"`).
- **A clone with a `.slipbox/` name of its own,** given to tell it from the repository it was cloned from, is still a
  copy of that repository: the lookup takes a repository's copies, one remote, as one folder, whatever their
  `.slipbox/` call them (`byRepository` in `core/folders.ts`). By the remote, a qualified pointer and a hosting URL open
  the repository's default copy: the one called by the remote's name (its last part, as its `.slipbox/` name, an alias
  or the remote's own), else the first found; that one not here, another copy of the repository, said so. The clone's
  own name opens the clone, and a pointer written to a copy of the same repository is no clash. Being a copy, it may be
  made the repository's default copy: `folders default` (and the TUI's `:folders-default`) takes any copy of the
  repository, under whatever name (`repositoryCopies` in `core/folders.ts`), and the repository's name, its full name
  and its hosting then open the clone; `slipbox folders` lists it under the repository too, `*`, with its own name. A
  default that is no copy of the repository any more (its remote changed) is passed over for the repository's first
  copy. And it may be named as its repository is (`init --name`, `name`): a copy of the same repository is no
  different folder (`folderNamed`) (DF-D30). Named alike, its copies are called by the remote's name alike, and the
  first found opens until `folders default` picks one.
- **A name for one copy only** is a private `.slipbox/` (`slipbox init --private --name research-review`): its
  pointers work on this machine only; `slipbox info` and `slipbox folders` say it is private.
- **Different folders of one name:** `slipbox init` refuses a name a different folder has here (its name, an alias or a
  name it had; a copy of the same repository is none, DF-D30), suggesting one: the folder's name, prefixed with the
  enclosing root's (`x-plan` inside `x`), `-2`, `-3` after it while that is taken; `slipbox name` refuses it too. A
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

## How a root is named and shown

A root is told by the name pointers use (its `.slipbox/` name, else its remote's), else by its path (`~/…`), as a
plain folder is; a worktree of a named repository as `name@branch`, a detached head by its short commit
(D77; `rootLabel` in `core/names.ts`). Never by its folder's own name, and never in a file. The status line, the
explorer's roots, the named folders list, `slipbox info` and the CLI's `root` and `name` show it so ([tui.md](tui.md)
§ Screen layout, § Side panes, § Switching roots; [docs/manual/cli.md](../../docs/manual/cli.md) § `resolve`). Files in
lists (backlinks, search results, pickers, hovers) are shown by path, from the root ([rendering.md](rendering.md) §
Blocks and inlines).

The CLI says root where the code says vault, in its messages and its JSON, whose `schema` stays 1 (DF-D9): `info`'s
`mode` is `root` or `folder`; a change's `kind` is `root` for a root's naming, `make-root` for `init` of a folder
inside a root, `unmake-root` for `deinit`; a root nested in another is skipped by the walk as a `nested root`; and
nothing to undo is "in this root". The renames log and the saved plans keep the code's words, `vault`, `make-vault`
and `unmake-vault`, and the CLI says them as root when it prints them (`kindWord` in `cli/cli.ts`). A theme slipbox
ships is `built-in`, as a document type is ([docs/manual/cli.md](../../docs/manual/cli.md) § `info`, § Moving,
copying and deleting, § `themes`).

## Search scope

Search ranks this root (else the folder opened) first, then, under a divider, the roots linked to or from it; widened
to every root this machine knows, those join the linked ones, ranked together by score (D64, D79; `core/scope.ts`).
Linked means this root's notes link into it by path, or its notes link here, as of its index; every root leaves out
worktrees, whose notes are their main checkout's, even one a note links into (by `@branch`, or by path). Each root is
searched with its own index, caught up first (a scan where it has none), and a hit of another root carries its name and
its path. `~` or `/` opened searches only itself. The CLI takes `--scope here|linked|all`, `here` by default, so an
agent's results are predictable; in the TUI, `ctrl+a` in search widens it a step at a time ([tui.md](tui.md) §
Overlays).

## Worktrees

A linked worktree (`git worktree add`) is a root of its own: its own state and cache, its own session, scratch,
positions and indexes, since worktrees are an agent's task, each its own context (D54). Which checkout a folder is
comes from the files under `.git` (`core/git.ts`): a worktree's `.git` is a file naming `.git/worktrees/<name>`, whose
`commondir` is the repository's; a submodule's has no `commondir`, and is a repository of its own. Never a git
process, and never where the folder is: `project/worktrees/x/feat` is a worktree of `project/x` as surely as
`x/.worktrees/feat` would be.

- **State by path:** each checkout's state is its path's, the main checkout's and every worktree's apart (D76). A
  worktree moved by `git worktree move` is found by git's name for it, and its state carried to the new path, only
  when its admin folder (`.git/worktrees/<name>`) is the one recorded: its `commondir`'s inode and time, which `git
  worktree add` writes and a move leaves (`worktreeFingerprint`). A worktree removed and another added under its name
  (git reuses it) is a new one, its state its own.
- **Identity is never written from a worktree:** each would write its own, and merging the branches would conflict
  over it. A worktree whose config has none takes the main checkout's; with none there either, it has none until the
  main checkout has one, committed (`identityAt` in `core/folders.ts`).
- **A pointer's name means the main checkout** (`slipbox://x/note.md`), the stable one; a worktree's branch is named as
  one: `slipbox://x@feat/note.md` (D75; [links.md](links.md) § Pointers).
- **Backlinks don't count a worktree's links:** its notes are copies of the main checkout's ([links.md](links.md)
  § Backlinks).
- **A relative path out of the repository is taken from the main checkout:** `../y/plan.md` names the sibling
  repository beside the main one, wherever the worktree is kept ([links.md](links.md) § Paths).
- **A worktree that is gone** (merged, removed) has its cache removed at once; its state, an agent's scratch, a month
  after it was last seen (`pruneWorktrees` in `core/registry.ts`).
- The status line and the explorer show a worktree's branch (`research@refactor`, `⎇ feat`). A branch switch inside
  one checkout is one event (D153; [tui.md](tui.md) § External changes).

## State by root

Personal state is kept in the state folder, never in the folder it is about (D39, D76; where each file lives:
[how-it-works.md](how-it-works.md) § Storage):

- **By root:** the session, scratch, trash, undo log, staleness, moves seen, branch heads seen and pinned roots are
  kept under the root's key, else the plain folder opened's (§ Storage keys). Opening `project/` or `project/docs/`
  brings back the same session, since both have the root `project/`; a worktree, another path, has its own.
- **Reading positions are by file:** one `positions.json` for the machine, each note by its absolute path and the root
  it was read from, so a note opened from another root, or from a folder inside its root, is where it was left. A
  root's history lists its own files and those read from it. The newest 5,000 are kept.
- **The machine's roots** (`roots.json`, `core/registry.ts`): each root and plain folder seen, by path, with when it
  was seen and indexed, a worktree's name and fingerprint, and its moves. A root is recorded before its graph opens,
  so a named folder moved here by hand has its cache adopted first.
- **A named folder moved by hand takes its state along** when it is sure: its `.slipbox/` id or remote at a new path,
  nothing left at the old one, and exactly one such copy gone, also when the background index found it at the new
  path first (`movedFrom` in `core/folders.ts`, `recordLocation` in `core/vault.ts`). Its cache, session, scratch,
  trash, undo log and positions move to the new key; the move is kept with its entry in `roots.json`, for the relink,
  which is offered at once ([links.md](links.md) § Repairs). That isn't a guess, so nothing is asked. A worktree
  moved by `git worktree move` is found as § Worktrees says. Any other move (an unnamed root, two copies gone) starts
  fresh; naming the root (`slipbox name`) lets it be found again.
- **A plain folder's state is its own,** by its path: moved, it starts afresh. A plain folder gone a month is
  forgotten: its entry in `roots.json`, its cache and its state removed, as a worktree's are.
- **State does not travel between machines;** reading position is machine-local anyway.
- **Older state is moved once:** the instances' list (`vaults.json`, D59) is read into `roots.json` the first time
  slipbox runs, each instance's state and cache moved from its key to its path's, and the old list removed; a root's
  own `positions.json` is merged into the machine's the first time it is opened. The home vault's
  `$XDG_DATA_HOME/slipbox/home/config.toml` is no longer read (D58).

## Storage keys

A root's cache and state folders are named by its key, `<basename>-<hash>`: the hash the first 12 hex characters of
SHA-256 over the root's real path, else the plain folder opened's; the basename, its characters outside
`A-Za-z0-9._-` made `_`, is only there so a person can find the folder (D39, D76; `vaultKey` in `core/paths.ts`).
Where each file lives: [how-it-works.md](how-it-works.md) § Storage.
