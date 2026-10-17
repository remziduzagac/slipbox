# Requirements

## Goals

- One word for the folders slipbox works in, vault, and every file in exactly one: a vault, home, or no-vault
  (VV-D1–VV-D4).
- An explorer with one picture: the file system as one tree, the view a part of it, a breadcrumb saying where; what was
  opened shown, not the vault around it (VV-D5).
- Nothing outside a vault or home read, indexed, written or shown to an agent through a link without the user's yes
  (VV-D6).
- Looking never moves you: another vault's file read in a peek, going there a choice (VV-D7).
- What's in the tree says what's indexed, what's a vault, what's a link and what can't be read, at a glance (VV-D8,
  VV-D9); the git panel follows the vault, its repositories' work in view (VV-D10).

## Non-goals

- Several trees at once, or a workspace of several vaults open together (talked through and dropped).
- Indexing all of home: its skip list stays, and so does each vault's own index.
- Native Windows: its drives and shares are designed for (VV-D5), built with `14.14`–`14.17`.
- Trusting a vault's links on the vault's word: trust is the user's alone, kept in slipbox's state (VV-D6).

## Builds on

- The roots and their markers, the walk, the background index and the registry of roots (design/roots.md; `20.9`).
- Switching roots and the explorer's `..` above the root (design/tui.md § Switching roots, § Side panes; `17.10`,
  `17.13`, `17.14`).
- The trust prompt for a vault's own tools (D172, D175) and writes kept inside the root (D142, D220).
- The floating window (an old version from a file's history, a hover) for the peek.

## Acceptance criteria

- **Words** (VV-T1): the docs, the help, the messages and the status line say vault, home and Elsewhere; "root",
  "plain folder" and "loose file" are gone from them; `tests/docs.test.ts` holds it.
- **Home** (VV-T2): started in `~`, home is the current vault; its notes outside other vaults have backlinks; nothing in
  its skip list is read; its index is built in slices while idle.
- **Elsewhere** (VV-T3): `slipbox /etc` opens in no-vault, "Elsewhere" on the status line, its tabs kept apart; a
  note there has no backlinks and says why.
- **The view** (VV-T4): opening `x/y` shows `y` with `x` named; the breadcrumb says what's above; choosing a worktree
  kept elsewhere zooms the view out to the common parent with both paths unfolded; `z` zooms in; the roots beside the
  tree, the named folders' list at the start and `:pin-root` are gone. A terminal check covers each.
- **Marks** (VV-T5): a vault, the current vault, a worktree's branch, a link and its target, and the index's five
  states each drawn in the right column in all three glyph sets.
- **Symlinks** (VV-T6): a link out of home asked about the first time; followed, indexed; just looked at, nothing
  indexed; the answer kept, asked again when the target changes; a write through a link out of a vault refused even
  trusted; the CLI refusing an untrusted link. A regression test for each rule.
- **The peek** (VV-T7): a link into another vault peeks; `o`, `t`, `esc`, `z`; links inside it as VV-D7 says; a
  backlink from another vault and a no-vault file peek the same way.
- **Busy folders** (VV-T5): `node_modules` and the rest listed, browsed, `⊘`, nothing in them indexed.
- **The git panel** (VV-T8): in home with the view at a folder of repositories, those repositories listed, ordered by
  what needs attention, one opened up in place, `o` going into it.
- `bun run check` passes; the docs say it without the blueprint's IDs; the screenshots retaken.

## Changes

### MODIFIED requirements.md § Roots and links

Renamed "Vaults and links". The first bullet becomes: a file's vault is its nearest folder holding `.git`, `.slipbox/`,
`.obsidian/` or `.zk/`, however it is opened; else home (`~`), a vault without a marker, its index with a skip list;
else no-vault, shown as Elsewhere, which has no index (VV-D1–VV-D3). Adds: a link leading out of a vault or home is
followed only when the user says so, and never to write out of a vault (VV-D6). Previously: "`$HOME` and `/` are never
a root".

### MODIFIED requirements.md § Navigating and search

The explorer bullet becomes: the explorer shows the file system as one tree, the view starting at what's opened, a
breadcrumb saying what's above, zoomed out when going elsewhere and in when asked; vaults, links, the index's state
and git marked on each row (VV-D5, VV-D8, VV-D9). Adds: another vault's file is read in a peek, going there a choice
(VV-D7). "Root" becomes "vault" in the search bullet. Previously: "the root of what's opened, and a folder a link was
followed into beside it".

### MODIFIED requirements.md § Git

Adds: the git panel shows the current vault's repository, and the repositories in the view (VV-D10).

### MODIFIED design/terms.md

Adds vault, home, no-vault (Elsewhere), the view, the peek; moves root, plain folder and loose file to Retired.
