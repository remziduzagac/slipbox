# Concepts

The words slipbox uses, each in a few lines. Each section links the chapter that says more.

## Notes are your files

A note is a Markdown file in a folder. slipbox has no database and no format of its own. It reads your files where they
are and writes them back there. Close slipbox, and any other editor, git or sync tool sees the same files.

[How slipbox works](how-it-works.md)

## Vault

A vault is a folder whose notes belong together. slipbox finds it for you: it's the nearest folder above a note that
holds `.git`, `.slipbox/`, `.obsidian/` or `.zk/`. So a git repository is a vault, and so are an Obsidian vault and a
zk notebook.

Your home folder is a vault too, without a marker: home. Its notes are those in your home folder that no other vault
holds. Its index leaves out hidden folders, `Downloads` and other folders that aren't your notes.

The vault decides how links resolve, what is searched together, and which settings apply. Opening any file in a vault
opens the whole vault. The status line shows which vault you're in.

[Links and vaults](links-and-vaults.md#vaults)

## The index

slipbox keeps an index of each vault: the notes' names, their links and their words. It makes search, backlinks and
link checks fast. The index is a copy kept in slipbox's own cache folder. Deleting it is always safe; slipbox builds it
again.

[Finding things](finding.md#the-index)

## Modes

The chip at the left of the status line says what your keys act on.

| Mode | What you see |
| --- | --- |
| `READ` | the note rendered, as a page |
| `LENS` | the note rendered, with the part around the cursor shown as Markdown, to edit |
| `INSERT` | you're typing |
| `SOURCE` | the whole note as Markdown |
| `FILES` | the explorer on the left has the keys |
| `GIT` | the git panel on the left has the keys |

[The screen](screen.md#the-status-line)

## The lens

The lens edits a note in place. The blocks around the cursor show their Markdown between two rules. The rest of the
note stays rendered. `i` opens the lens, and `i` again starts typing. `esc` steps back out, one level at a time.

Source mode is the other way to edit: `ctrl+k` shows the whole note as Markdown.

[Editing](editing.md#source-mode-and-the-lens)

## The leader key

`space` is the leader. It starts most commands: `space f s` searches, `space n` acts on the note, `space g` on git. After
`space`, a popup lists the keys that can follow, so you don't have to remember them.

[Keys](keys.md)

## Links and backlinks

slipbox reads the links you already write: Markdown links, wikilinks, links to headings. `enter` follows one, and
`ctrl+o` comes back. A link into another vault opens a peek: the note read in a floating window, you staying where you
are, until `o` goes there. A note's backlinks are the notes that link to it. Renaming or moving a note fixes the links
to it.

[Links and vaults](links-and-vaults.md)

## Pointers

A pointer is a link that reaches a note in another vault, by that vault's name: `slipbox://notes/ideas/coffee.md`. It
keeps working when the folder moves.

[Links and vaults](links-and-vaults.md#pointers)

## The command line

The same `slipbox` program has commands for agents and scripts: `slipbox search`, `slipbox backlinks`,
`slipbox write`, and many more. They read and write the same files as the screen, so both always agree. Most commands
print JSON with `--json`.

[The command line](cli.md)

## The scratch

The scratch is a Markdown file where you collect places to hand to an agent. `space s a` adds the line at the cursor,
or the selected lines. `space s s` opens the scratch, and `space s y` copies it, ready to paste into a prompt. Agents
add to it with `slipbox capture`.

[Editing](editing.md#the-scratch) and [Working with agents](../guides/agents.md)

## The context bundle

`space s c` copies a note's context for an agent: the note, the notes it links to, and the notes that link to it, as
one Markdown document.

[Working with agents](../guides/agents.md)

## Trust

A folder can bring code with it: tools, build scripts, git hooks. slipbox runs none of it until you trust that vault.
It asks the first time it matters. `:trust` and `:untrust` change your answer.

[Code](code.md#trust)

## Settings

Your settings are in `~/.config/slipbox/config.toml`. A vault can have its own, in `.slipbox/config.toml`. A vault's
settings never run programs or reach the network; only yours can.

[Configuration](configuration.md)
