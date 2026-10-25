# Working across folders and vaults

<a id="vaults-home-and-elsewhere"></a>
<a id="if-you-know-obsidian-or-vs-code"></a>
<a id="the-places-on-one-machine"></a>
<a id="what-a-vault-is"></a>
<a id="every-file-in-exactly-one-vault"></a>
<a id="making-a-folder-a-vault-or-not"></a>
<a id="home"></a>
<a id="elsewhere"></a>
<a id="going-into-a-vault"></a>
<a id="the-explorer-one-tree-and-the-view"></a>
<a id="a-rows-marks"></a>
<a id="busy-folders-listed-not-indexed"></a>
<a id="links-into-other-vaults-the-peek"></a>
<a id="symlinks-followed-once-you-say-so"></a>
<a id="the-git-panel-follows-the-vault"></a>
<a id="where-next"></a>

Read a note in one place, inspect a linked note elsewhere, and come back without losing your tabs. This guide uses
examples of existing folders; substitute your own paths. Opening them does not require reorganizing or importing files.

You should be comfortable opening a note and using the explorer. If not, begin with
[Working with slipbox](getting-started.md). The [vault model](../manual/vaults.md) explains the rules in full.

## Start in one place

Open a note inside a repository or notes vault, for example:

```bash
slipbox ~/work/kestrel/docs/sync.md
```

Check the vault's name or path in the middle of the top bar. Your tabs there, your workspace, and its scratch belong
to that vault. In the explorer,
`esc` returns to the document; `space e` opens or focuses the explorer again.

<a id="look-outside-the-current-view"></a>

## Look outside the current zoom

Focus the explorer. `-` zooms out one folder; `z` zooms into a selected folder. The breadcrumb tells you
which part of the filesystem you are viewing. Seeing a sibling repository does not add its notes to the current vault.

1. Zoom out until two repositories or notes folders are visible.
2. Expand a sibling to look at its files, or press `enter` on its vault row to go there.
3. Check that the top bar changed to the new vault.
4. Press `ctrl+o` to return. Your earlier vault's tabs are restored.

![The explorer zoomed out to ~/work, its breadcrumb reading ~ › work › ◈ kestrel. Two repositories, infra and kestrel,
are marked ◈ with their branch, main. kestrel, the vault open, is unfolded: its folders marked ● as indexed, build,
node_modules, tmp and vendor marked ⊘ as not indexed, and docs and src marked • for their
changes](../images/vaults-explorer.png)

## Read a linked note in a peek

Follow a link that crosses into another vault. It opens a read-only peek, leaving your current place behind it.
Try `esc` to close it, then follow it again and use `o` to go into that vault. `ctrl+o` comes back.

![A peek over notes' index: kestrel's docs/architecture.md drawn in a large floating window titled kestrel ›
docs/architecture.md, its bottom border reading o go there · t keep as a tab · z fill · esc closes, the top bar still
in notes](../images/vaults-peek.png)

Some links lead through symlinks or outside known places. Read the question before allowing one: consent changes
which files slipbox can follow. The [symlink rules](../manual/vaults.md#links-that-lead-out) explain the scope.

![The question over a note: ~/notes/research/outside.md → /etc/hosts leads out of notes: follow it? A line says
/etc/hosts is outside your home folder and agents see what's followed; then Follow it, Just look and No; under them,
Follow it: read and indexed as notes's, never written to: it's outside the vault, kept for this link and where it
leads](../images/vaults-link-question.png)

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

You're in kestrel. The top bar says `◈ kestrel │ ⎇ main`, and the breadcrumb `~ › work › ◈ kestrel ›`. Press `-`, and
the zoom moves out to `~/work`. kestrel is highlighted, its tree under it, and the two others are beside it, each with
its branch dimmed at its end:

```text
◈ infra                      main
◈ kestrel                    main
  ▸ docs
  ▸ src
◈ product                    feature/okrs
```

- `l` on `product` unfolds it in place, to look in.
- `enter` on it goes into product, with your workspace there. The top bar says `◈ product │ ⎇ feature/okrs`, and the
  zoom stays at `~/work`.
- `ctrl+o` comes back into kestrel, its tabs as you left them.
- The git panel (`space g`) in kestrel is kestrel's, the other two folded under it, in Other repositories.

Started on the folder itself, `slipbox ~/work`, you're in home, with the explorer zoomed to `~/work`. The rows are the
same, once
home's walk has found the repositories ([Home](../manual/vaults.md#home)). The git panel there says `~/work holds 3
repositories`, the one
that needs you most first.

The three stay three vaults. A link in kestrel's docs to `../../product/prd/route-sharing.md` opens a peek,
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

Going in, the explorer's zoom zooms out to `~`, the folder holding both checkouts. Only the paths to the two are
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

When an agent keeps its worktree inside the repository, in `.claude/worktrees/`, it's a vault inside kestrel. `.claude`
is a hidden folder, so going into the worktree moves the explorer's zoom to the worktree itself.

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
- The top bar says `◈ kestrel-notes │ ⎇ main`: its git is the repository's, and you commit from the git panel as in
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

You're in Elsewhere. The top bar says `Elsewhere`, and the status line `‹ /etc/nginx/nginx.conf ›`.

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


## Check your context

Before searching, renaming a file or collecting references, glance at the vault shown on the top bar. A change
of explorer zoom alone is not a change of vault. `slipbox info` can report the current folder's context from the CLI.

![kestrel's docs/architecture.md in a tab of its own, gone into from a link in notes: the top bar reads ◈ kestrel │
⎇ main, the status line the back arrow before the file's path](../images/vaults-links.png)

**Next:** [Coming from Obsidian or zk](from-obsidian-or-zk.md), if that is where your notes already live. Otherwise
continue with [Reviewing changes with Git](code-and-git.md).
