# Coming from Obsidian or zk

slipbox opens an Obsidian vault or a zk notebook as it is: no import, no conversion, nothing written into it. It reads
their links the way they do and writes new links the way they would, so you can keep using either app on the same
files.

This guide opens your vault or notebook, shows what slipbox makes of it, and what it leaves to the app, then two things
you may want later: a name other folders can link to it by, and links as plain paths.

## Open it

```bash
slipbox ~/notes
```

A folder holding `.obsidian/` or `.zk/` is a root to slipbox: one collection of notes, opened from its top whichever
note or subfolder you name. The explorer (`space e`) lists its notes and folders; hidden ones, such as `.obsidian/`
itself and Obsidian's `.trash/`, aren't listed. Open a note that links to others, press `tab` to put the cursor on its
first link and `enter` to follow it, wikilink or not; `ctrl+o` comes back.

To see how slipbox reads it, run `slipbox info` there. The `links` line says how it will write links, and what told it:

```text
links     wikilinks, by name, without .md — Obsidian's .obsidian/app.json
```

In a zk notebook: `markdown links, relative, without .md — zk's .zk/config.toml`.

## What slipbox reads

- **Wikilinks**: `[[name]]`, `[[folder/name]]`, `[[name#Heading]]`, `[[name#^block]]`, `[[name|text]]`. A name is
  found as Obsidian finds it: a note of that name anywhere in the vault, case aside, `.md` optional, or one whose front
  matter gives it as an alias. Of two notes with one name, the nearer to the linking note wins; a real tie shows as
  ambiguous, and following it asks which.
- **Embeds**: `![[note]]`, `![[note#Heading]]` and `![[note#^block]]`, alone in a paragraph, are drawn in place behind
  a bar. `![[photo.png|300]]` is a picture, found by its name anywhere in the vault and drawn that wide where your
  terminal draws pictures.
- **Tags**: `#tag` and `#nested/tag` in the text, and `tags:` in the front matter. `space f t` lists them, then a
  tag's notes.
- **Front matter**, Obsidian's properties, is a table at the top of the note. `aliases:` gives a note more names, and
  a wikilink in it (`related: "[[coffee]]"`) is a link like any other.
- **Callouts**: `> [!tip] Title`, Obsidian's kinds and GitHub's, each with its icon and colour.
- **Block ids**: `^id` at the end of a paragraph or list item, where `[[note#^id]]` lands.
- **zk's links**: `[text](ideas/202410021000-coffee)`, a path without `.md`, from the note's folder; one starting with
  `/` is from the notebook's top.

The rest is Markdown: tables, code, maths, diagrams. [Reading](../manual/reading.md) shows how each is drawn, and
[Links and roots](../manual/links-and-roots.md) every link form.

## Links written their way

The links slipbox writes for you (completing after `[[` or `](`, the link picker `space l i`, an agent's
`slipbox link`) come out the way the folder writes them:

- In an Obsidian vault, as Obsidian's settings say (its Files and links page: wikilinks or Markdown links, and the new
  link format). By default, a wikilink by name: `[[coffee]]`.
- In a zk notebook, as `link-format` and `link-drop-extension` in `.zk/config.toml` say. By default, a Markdown link
  from the note, without `.md`.

Renaming or moving a note in slipbox (`space n m`, or `r` and `m` in the explorer) fixes every link to it, each in the
form it was written: a wikilink stays a wikilink, a name stays a name.

## What it doesn't do

- **Plugins.** Nothing a plugin adds runs: a Dataview query is a code block, a Canvas file (`.canvas`) is its text,
  a Templater tag is text.
- **The apps' own settings**, but for the link settings above: Obsidian's themes, hotkeys, templates, daily notes and
  attachment folder; zk's templates and its note ids. Make a note with `zk new` in zk.
- **Obsidian-only marks.** `==highlight==` and `%%comment%%` show as typed, and a folded callout (`> [!note]-`) is
  drawn open.
- **Writing into the folder** of its own accord. slipbox keeps its own state (where you were, the scratch, its trash)
  in its own folders: a note deleted in slipbox goes to slipbox's trash (`space v t`), not Obsidian's `.trash/`.

## Name it, if other folders link to it

A note in another folder links into your vault by a relative path, `../notes/inbox.md`, which breaks if either folder
moves. A name works wherever the vault is, on every machine:

```bash
cd ~/notes
slipbox init --name notes
```

It adds a `.slipbox/` folder holding the name and this folder's own settings; Obsidian and zk leave it alone.
`--private` keeps it out of git. A link from another folder can then be `slipbox://notes/inbox.md`, and slipbox writes
that form when you link into the vault from elsewhere. Obsidian and zk don't read these links: use them between folders
you read in slipbox. In the TUI, `:name` does the same.

## Make the links plain paths, if you want

Wikilinks need an app that looks names up. If you'd rather your notes read anywhere (on GitHub, in any editor), slipbox
rewrites them once as plain relative links:

```bash
cd ~/notes
slipbox convert-links --dry-run     # every line it would change, before and after
slipbox convert-links               # then write it
```

In `inbox.md`, `[[coffee]]` becomes `[coffee](ideas/coffee.md)`, `[[coffee#Brewing|how I brew]]` becomes
`[how I brew](ideas/coffee.md#brewing)`, and `![[photo.png|300]]` becomes `![photo.png|300](attachments/photo.png)`. A
link that reaches nothing, or that several notes answer to, is left as written and named in the warnings: write its
path by hand.

In the TUI, type `:convert-links` and press `enter`: the same preview opens, titled `links → plain paths: …`, with a row
for each link several notes answer to, where `enter` lets you pick its note. `enter` on a change writes it all; `esc`
cancels. `slipbox undo` takes the whole conversion back.

Then have new links written as paths too, or the vault's settings bring wikilinks back: turn wikilinks off in
Obsidian's settings, or put this in the folder's `.slipbox/config.toml` (`slipbox init` makes one):

```toml
[links]
style = "markdown"
```

`links.style`, `links.path` and `links.extension` are in [Configuration](../manual/configuration.md).

## Where next

- [Getting started](getting-started.md): a first session, if you haven't had one.
- [Links and roots](../manual/links-and-roots.md): every link form, roots, named folders and backlinks.
- [Making it yours](making-it-yours.md): a theme, your keys and settings.
