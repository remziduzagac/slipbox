# Notes

## How it came up

While the git panel was drawn (GIT, `workstreams/git-review/`), the user started slipbox in a folder of repositories
and switched into a worktree kept elsewhere. The explorer then showed the worktree, with the folder started in as
another root under it by its full path, cut short; started in a folder holding the worktree, that folder wasn't listed
at all; and opening a folder inside a root shows the root. The user found it confusing and asked to settle the
concepts first.

## Today

- **A root**: the nearest folder above a file holding `.git`, `.slipbox/`, `.obsidian/` or `.zk/`. slipbox is in one
  at a time: its index, settings, session (tabs) and git. Opening `x/y` where `x` is a root shows `x`.
- **A plain folder**: a folder outside every root, opened directly, standing in for one (its own index and session).
  **A loose file**: a file outside every root, opened beside the current root's notes.
- **Other roots in the explorer**, in three places, each acting differently: `..` lists the folders above, a level at
  a time, and a file there switches; a root inside this one (`◈`) is a row whose `enter` switches; under the tree, the
  root started in, the roots pinned (`:pin-root`) and a loose file's folder, which `enter` unfolds (or, for a plain
  folder, switches into). Roots that contain one another are never listed apart.
- **A switch swaps the tabs**: the TUI becomes the other root's, as if started there; `ctrl+o` goes back.
- **Started in a plain folder**, a list of the machine's named folders opens.

## Settled so far

1. **Vault** is the word, for any folder holding `.slipbox/`, `.obsidian/`, `.zk/` or `.git`: any git repository is a
   vault. A vault has its own tabs, index (links, backlinks, search), settings and git. "Root", "plain folder" and
   "loose file" leave what users read (the code already says vault). This reverses D79's choice of "root".
2. **Home is a vault**, without a marker: `~`, less the vaults inside it. Its tabs are its own; its index covers its
   own notes with a skip list: only notes and text files, as the explorer lists them; no hidden folders (`.cache`,
   `.config`, `.local`…), no system folders (`Library`, `AppData`), nothing a vault's walk skips (`node_modules`…);
   large files listed, not read; built in slices while idle. Its settings are yours; git only if `~` is a repository.
3. **No-vault**: everything outside home that isn't in a vault (`/etc`, another disk, a share). Its own tabs, one set
   for the machine; no index and none of the features a vault's index brings; your settings; no git.
4. **Every file belongs to exactly one vault**: the vault it's in, else home, else no-vault. A vault inside a vault is
   its own (a worktree in `.claude/worktrees/` inside a repository among them).
5. **Choosing a file or folder of another vault goes into it**, and the tabs change to its own, as switching does
   today.
6. **The explorer is one tree, the whole file system; the view shows part of it.** It starts at the folder opened (so
   `x/y` shows `y`, in vault `x`). A breadcrumb shows what's hidden above it: `~ › projects ›` inside home, `/ › etc ›`
   outside. Going somewhere else zooms the view out to the common parent of the two places, with only their two paths
   unfolded; it zooms in only when asked (a key, a click on the breadcrumb).
7. **Vaults are marked** in the tree with one icon; the current vault is highlighted; a worktree also shows its branch
   (`⎇ agent/sync-retry`).
8. **Any folder can be opened**, inside home or not, wherever the user may read: no wall at home. A file that can't be
   written opens read-only, saying so; a folder that can't be read shows a lock and says why when opened; slipbox never
   asks to run as root or administrator.
9. **On Windows**, above everything are the drives and shares; home is `C:\Users\<you>`, shown as `~`.

Examples, as drawn:

```text
 ~ › projects ›                       ← the view, zoomed in; what's above is hidden
 ≡  projects
    ▾ ◈ kestrel                main   ← the current vault, highlighted
       ▸ docs/  ▸ src/
    ▸ ◈ product                main
```

A worktree kept elsewhere chosen: the view zooms out to the common parent, `~`, the two paths unfolded:

```text
 ~ ›
 ≡  ~
    ▾ projects/
       ▸ ◈ kestrel             main
       ▸ ◈ product             main
    ▾ worktree/kestrel/
       ▾ ◈ sync-retry          ⎇ agent/sync-retry   ← now the current vault
          ▸ docs/  ▸ src/
```

## Symlinks (settled 2026-10-14)

A link is followed only when the user says so; once followed, it still can't be used to write out of a vault, to show
an agent what wasn't allowed, or to lead somewhere other than what was allowed.

- **Not followed by default.** A symlinked folder (or file) leading out of its vault, or out of home, is shown as a
  link and not opened: `▸ data/   → /mnt/disk/data   not followed`.
- **Asked the first time it's opened:** follow it (part of the vault or home: read, indexed, searchable), just look
  (read-only, this once, nothing indexed), or no. The answer is kept for that link and that target: if the link later
  points elsewhere (a pull changed it, a disk is mounted elsewhere), it's asked again.
- **Trust is kept in slipbox's state, never in the vault**: a cloned repository can't bring its links trusted.
- **What a yes allows:** in home, reading, the index and writing through it; in a vault, reading and the index, never a
  write to a target outside the vault, trusted or not (a link a pull can change could lead a save to `~/.bashrc`).
- **Agents:** what's followed is in search, the context bundle and the CLI's answers. The prompt says so when the
  target is hidden (`~/.ssh`, `~/.aws`) or outside home; the CLI refuses any link not trusted.
- **Slow or big targets** (a network share, an archive): a followed link is read in the background, a disk that
  doesn't answer is given up on and said so; the watcher checks such a target less often.
- **Unchanged:** a vault is known by its real path, so one reached through two links is one vault, one index, one set
  of tabs; a file reached by two names is one tab, indexed once; loops, broken links, devices and pipes are skipped;
  the watcher decides as the walk does.
- **Shown where reached:** the view, the breadcrumb and the zoom's common parent use the path as reached
  (`~/projects/kestrel`), with the target dimmed beside a link (`→ /mnt/disk/kestrel`); belonging and identity use the
  real path.

Two refinements of the assistant's, for the user to confirm:

- **Only links leading out ask.** A link to elsewhere in the same vault, or within home (the links `stow` makes,
  `~/.zshrc → ~/dotfiles/zsh/.zshrc`), is a second name for what's there: shown once, no question, never indexed twice.
- **No-vault doesn't ask.** With no index and nothing exposed, browsing `/etc` follows its links for reading.

Today's rules, as they change: a symlinked folder is never followed → not until allowed; a symlinked file is kept
only inside the root → inside kept, out asked; writes through a link only inside the root (D220) → the same for
vaults, home may write through links it trusted; the CLI refuses reads through a link out of the root → refuses any
link not trusted.

## The peek, and the rest settled 2026-10-14

- **Looking never moves you; only choosing to go does.** Following a link that leads out of the current vault opens a
  peek: a large floating window (as an old version from a file's history shows), the note rendered, read-only; `/`
  finds in it, copying works. `esc` closes it, where you were; `o` goes there (into its vault, the tabs changing); `t`
  keeps it as a tab here, read-only, marked with its vault's name. Most of the screen by default, `z` all of it.
- **Links inside a peek:** one to the peeked note's vault moves the peek (`ctrl+o` back, inside it); one to the current
  vault closes the peek and opens it in the tabs, as usual; one to a third vault moves the peek there.
- **The same peek everywhere** a file of another vault is looked at: a backlink from another vault, another vault's
  search result, a worktree's file from the git panel, a file in no-vault. It shows the note's backlinks when its vault
  has an index (the background index has most), else says to open it to see them.
- **Mouse:** a click on a link to another vault peeks; `ctrl+click` goes there at once.
- **Read-only:** editing another vault's file needs its index and watcher, which is going there (`o`); a peek that edits
  would be a half-switch.
- **No-vault is shown as "Elsewhere":** the status line `Elsewhere  ‹ /etc/nginx/nginx.conf ›`, the explorer's mark,
  the messages. "no-vault" stays the design's word.
- **`Downloads` is in home's skip list.**

This changes D50: a link into another vault peeks instead of switching.

## Busy folders, and the tree's marks (2026-10-14)

- **Busy folders are in the tree, not in the index.** By default: `node_modules`, `.venv` and `venv`, `__pycache__`,
  `target`, `build`, `dist`, `.next`, `vendor`, `Pods`, `DerivedData`, `.gradle`, `.tox`, caches; in a vault, what its
  `.gitignore` leaves out, as today; in home, its skip list. They're listed, opened and browsed like any folder; nothing
  in them is indexed, searched or linked to by name. Today the walk leaves them out of the explorer too.
- **A row can carry several marks**, one per thing it tells, so a folder's state reads at a glance. No emoji: each mark
  is one column wide in every terminal, in the nerd, unicode and ascii glyphs as every mark is.
- **The index's state**, a family (the user's: indexed has its own mark too):

| State | nerd / unicode / ascii | Says |
| --- | --- | --- |
| indexed | `●` / `●` / `*` | read into its vault's index; drawn dimmed, since most folders are |
| indexing | `◐` / `◐` / `~` | being read now |
| not indexed | `⊘` / `⊘` / `-` | skipped: a busy folder, the skip list, `.gitignore`, a link not followed |
| can't read | a lock / `⚿` / `#` | no permission; `⚿` (U+26BF, a squared key) isn't an emoji |
| a problem | `⚠` / `⚠` / `!` | a broken link, a disk that doesn't answer (`⚠` is slipbox's warning already) |

- **Marks are aligned at the right** (the user's), in columns: the index's state last, always in the same place; git's
  mark before it (`M`, `+`, `R`, `•` for a folder with a change in it), as the row's end has it today; between the name
  and those, dimmed, what describes the row: a vault's branch, where a link points.

```text
 ≡  ◈ kestrel                   main      ●
    ▸ docs/                          •    ●
    ▸ src/                                ●
    ▸ node_modules/                       ⊘
    ▸ shared/      → /srv/team/shared     ⊘
    ▸ private/                            ⚿
    ▸ archive/                            ◐
      README.md                      M
```

## Goes away

The plain folder and the loose file; the three places other roots appear (`..` above, rows inside, the list under the
tree); the named folders' list opening when started in a plain folder; `:pin-root`, if the view's zoom replaces it.

## Open

- How the git panel (GIT) shows a vault holding other vaults, such as home, once this is settled.
