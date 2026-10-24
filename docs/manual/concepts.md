# Glossary

<a id="concepts"></a>

Short definitions for terms used in the guides and topic pages. You can read the tutorials without studying this page
first.

## Notes are your files

A note is a Markdown file read and written in its existing location. Indexes are caches, not a separate collection of
notes.

[Details](how-it-works.md)

## Vault

A folder that provides a file's link and search context and its settings, shared with whoever has the folder. A
repository, Obsidian vault or zk notebook is recognized by its marker. Whether you trust a vault is always your own
answer, never its settings'.

[Details](vaults.md#vaults)

## Workspace

Your tabs and windows in a place: the splits, and each window's note, cursor and history. slipbox keeps one for each
branch of a repository, and one for each folder of home you open by name, in its own state on your machine, never in
the vault. Unlike VS Code's workspace, it isn't a set of folders (that's a vault here); unlike Obsidian's, you don't
save or pick it: slipbox keeps it for you.

[Details](vaults.md#vaults-and-workspaces)

## Where you are

The vault, its branch, and your workspace when it isn't the vault's own, shown in the middle of the top bar
(`◈ kestrel · main`, `◈ ~ › notes`). Click the vault to go into another, or the branch for the branches.

[Details](screen.md#the-top-bar)

## Elsewhere

Files outside home and any recognized vault share Elsewhere. It has no index, so indexed search and backlinks are
unavailable.

[Details](vaults.md#elsewhere)

<a id="the-explorers-view"></a>

## The explorer's zoom

The part of the filesystem currently shown in the explorer. Zooming that view does not combine the vaults it displays.

[Details](files.md#the-zoom)

## The index

A cache of names, links and searchable words. It can be rebuilt; the files remain the source of truth.

[Details](finding.md#the-index)

## Modes

Status labels such as READ, LENS, SOURCE and INSERT show what presentation or interaction is active. INSERT means keys
type text; other panels have their own labels.

[Details](screen.md#the-status-line)

## The lens

A source region inside a rendered document. Open it to inspect or edit a part while the surrounding document remains
rendered.

[Details](editing.md#the-lens)

## The leader key

The first key of a command sequence: space by default. Its popup shows the keys that can follow.

[Details](keys.md)

## Links and backlinks

A link points to another place; backlinks list the notes linking to the current note.

[Details](links-and-vaults.md)

## The peek

A read-only floating view of a file in another vault, shown without leaving your current place.

[Details](links-and-vaults.md#a-peek-at-another-vault)

## Pointers

A slipbox:// link uses a vault's recorded name instead of its current filesystem location.

[Details](vaults.md#pointers)

## The command line

Commands print results and exit, reading saved files. They do not read text held unsaved in the TUI.

[Details](command-line.md)

## The scratch

Editable Markdown collecting selected references and excerpts, scoped to a vault or Elsewhere.

[Details](scratch-and-context.md#the-scratch)

## The context bundle

A Markdown document combining a note with linked and linking material, within configured limits. Review it before
sharing.

[Details](scratch-and-context.md#the-context-bundle)

## Trust

Permission for a vault's own code or tools to run through supported integrations. Following a symlink is a separate
consent decision.

[Details](privacy.md#trust)

## Settings

Your own configuration can set programs and network choices. A vault's settings have narrower authority.

[Details](customization.md)
