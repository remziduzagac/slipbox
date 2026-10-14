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

## Proposed, not yet agreed

- **Looking never switches.** Following a link to a file of another vault, or of no-vault, opens a peek (a floating
  window, as a file's history shows an old version), `o` there going into it. The same rule as the git panel's: a
  worktree reviewed without switching. It changes how links into other vaults are followed today (D50: a switch).
- **No-vault shown as "Elsewhere"** on screen: the status line `Elsewhere  ‹ /etc/nginx/nginx.conf ›`.
- **`Downloads`** in home's skip list?

## Goes away

The plain folder and the loose file; the three places other roots appear (`..` above, rows inside, the list under the
tree); the named folders' list opening when started in a plain folder; `:pin-root`, if the view's zoom replaces it.

## Open

- **Symlinks**, next: what a vault, home, no-vault and the view do with a symlinked file or folder, a link leading to
  another disk among them. Today's rules: a symlinked folder is never walked; a symlinked file is in a vault's index
  only when its real path is inside the vault and isn't already walked; a write goes through to its target only when
  the target is inside the vault (D220); a vault is known by its real path, so one reached through a symlink is the
  same vault, with the same state.
- How the git panel (GIT) shows a vault holding other vaults, such as home, once this is settled.
