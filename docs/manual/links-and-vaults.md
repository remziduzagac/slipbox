# Links and backlinks

slipbox reads the links your notes already have, written the way GitHub, Obsidian or zk write them. It follows them
from one folder into another.

This chapter covers:

- following a link
- every form a link can take, and where each one lands
- writing links
- backlinks
- how slipbox keeps links working when notes move

## Links that work as they are

Open a folder of notes, and its links work as they are:

- In a repository, `[Coffee](ideas/coffee.md)` opens `ideas/coffee.md`, as it does on GitHub.
- In an Obsidian vault, `[[coffee]]` finds `coffee.md` wherever it is in the vault, as Obsidian does.
- In a zk notebook, `[Coffee](ideas/coffee)` finds the note without its `.md`.

Nothing has to be converted or set up first. Opening a folder writes nothing into it.

A link to a note in another folder works too:

- A relative path, `[the site's plan](../code/website/docs/plan.md)`, works while the two folders sit side by side.
- A pointer, `[the site's plan](slipbox://website/docs/plan.md)`, names the other folder instead of saying where it is.
  So it keeps working when that folder moves, or sits somewhere else on another machine.

Two ideas sit behind this:

- A **vault** is the folder a note belongs to. It decides what a link like `/plan.md` or `[[plan]]` means.
- A **name** is what a pointer calls a folder by.

[Vaults, home and Elsewhere](vaults.md) explains vault boundaries and names. This chapter explains how links resolve
within and across them.

## Following a link

Put the cursor on a link and press `enter`. `g f`, `g x`, `space l f` and a click on the link do the same. If the cursor
isn't on a link, `enter` follows the first link on its row.

| Key | Does |
| --- | --- |
| `ctrl+enter` (`space l t`) | Follows the link into a new tab, as a browser's ctrl+click does |
| `ctrl+w f` (`space l s`) | Follows it into the other window of a split, splitting first |
| `tab`, `shift+tab` (also `] l` and `[ l`, `space l n` and `space l p`) | Moves to the next or previous link |
| `ctrl+o` | Goes back to where you were ([History](finding.md#history)) |
| `space h n` | Goes forward again |
| `y l` (`space l y`) | Copies the link's target: the full path of the file it reaches, or the link as written |

In source mode and in the lens, you see the Markdown itself. There, `enter` reads the link around the cursor from the
text.

A link inside an embedded note is followed from that note, as if you had opened it.

What happens depends on what the link reaches:

| The link reaches | Following it |
| --- | --- |
| a note | opens it, at the heading or block the link names |
| a heading in this note | moves the cursor to it |
| a folder | shows the folder in the explorer, unfolded and selected |
| a note not written yet | asks for the new note's name, typed already. `enter` makes it |
| a data, text or code file | opens it in slipbox. A line fragment (`#L42`) opens it at that line |
| a picture or another binary file | copies its path |
| a web address | copies the address. slipbox opens no browser, which over SSH would open on the wrong machine |
| a picture on the web | fetches it to draw it, after asking by default (`render.images_remote`) |
| a footnote reference | moves to the footnote's definition |
| a tag | lists the notes that carry it |
| a note in another vault, or a file of Elsewhere's | reads it in a peek, at the place the link names (below) |
| one of several notes | lists them, to pick the one you meant |

[Reading](reading.md) describes how pictures, embedded notes and pictures on the web are drawn.
[Configuration](configuration.md) has the setting.

### A peek at another vault

Following a link never moves you to another vault. A note there opens in a peek: a large floating window over the one
you are in, the note drawn as it would be there. Your tabs, your vault and your place stay as they were.

A peek is for reading. `/` finds in it, and you can select and copy, but you can't edit it.

| Key | Does |
| --- | --- |
| `o` | goes there: into the note's vault, with its own tabs, as [switching vaults](vaults.md#switching-vaults) does |
| `t` | keeps it as a tab in this vault, read-only, the tab marked with its vault's name (`kestrel: sync.md`) |
| `z` | fills the screen, or makes it most of the screen again |
| `esc` | closes it. You are where you were |

The links in a peek are read in the note's own vault:

- A link to another note of that vault moves the peek there. `ctrl+o` goes back, inside the peek.
- A link to a note of the vault you are in closes the peek and opens the note in your tabs, as usual.
- A link to a third vault moves the peek there.

Under the note, the peek lists its backlinks, when its vault has an index. Most do, once the background index has
been through (see [Backlinks](#backlinks)). A vault without one yet says so: `o` goes there, and finds them.

The same peek opens for a backlink from another vault, for another vault's hit in a search widened with `ctrl+a`, and
for a file of [Elsewhere's](vaults.md#elsewhere) that a link reaches. With the mouse, a click on such a link peeks, and
`ctrl+click`
goes there at once. `ctrl+enter` still follows a link of this vault into a new tab.

## The forms a link takes

Whatever form a link is written in, slipbox reads it as a file and, optionally, a place in it. The screen shows the link
as the note writes it. slipbox never rewrites a link for display.

### Paths

A Markdown link's destination is a path. These are the forms slipbox reads, written from a note in `~/notes`:

| Written as | Reaches |
| --- | --- |
| `[t](ideas/coffee.md)` | the file relative to the note: the form slipbox writes unless the folder says otherwise |
| `[t](/ideas/coffee.md)` | the file from the vault's top, else the filesystem's `/ideas/coffee.md` |
| `[t](ideas/coffee)` | without an extension: the file as written, else `ideas/coffee.md`, else the folder |
| `[t](ideas/)` | a folder |
| `[t](~/notes/ideas/coffee.md)` | the file from your home folder |
| `[t](/home/you/notes/ideas/coffee.md)` | the absolute path, when nothing in the vault is at `/home/…` |
| `[t](file:///home/you/notes/ideas/coffee.md)` | a file URL |
| `[t](<cold brew.md>)`, `[t](cold%20brew.md)` | a name with spaces, in angle brackets or percent-encoded |

A few things hold for every path:

- A note is found by its name whatever the case, on every filesystem. `[t](Inbox.md)` reaches `inbox.md`.
- A path may leave the vault (`../website/docs/plan.md`, `~/…`, an absolute path). It reaches the file in whichever
  vault holds it, and following it reads the file there in a peek ([A peek at another vault](#a-peek-at-another-vault)).
  Such links work while the folders are laid out the same way. [Names and pointers](vaults.md#names-and-pointers) has
  the form
  that doesn't depend on it.
- Nothing inside code is a link, neither in a code span nor in a fenced block.
- A link in an HTML comment isn't one, nor is a link whose bracket is escaped (`\[t](x.md)`).
- A destination with a bare space in it (`[t](my plan.md)`) isn't a link, as CommonMark says.
- Reference links (`[t][ref]` with `[ref]: ideas/coffee.md` elsewhere) are links like any other.

### Wikilinks

A wikilink is Obsidian's form: double brackets around a note's name.

| Written as | Reaches |
| --- | --- |
| `[[coffee]]` | the note whose file name, without its extension, is `coffee`, anywhere in the vault |
| `[[ideas/coffee]]` | the note at that path from the vault's top, or the one whose path ends so |
| `[[coffee.md]]` | the same note. An extension is allowed |
| `[[coffee\|how I brew]]` | the note, shown as "how I brew" |
| `[[coffee#Brewing]]` | the note, at its heading "Brewing" |
| `[[coffee#^ratio]]` | the note, at the block marked `^ratio` |
| `[[#Brewing]]` | a heading of this note |
| `[[./coffee]]`, `[[../coffee]]` | a path from this note, never a name |
| `![[coffee]]`, `![[beans.png]]` | embedded: the note, or a picture, drawn in place |

Names are compared without regard to case, so `[[Coffee]]` reaches `coffee.md`. A note also answers to the names its
front matter gives under `aliases:` (or `alias:`), after every file name.

A picture or other file (`![[beans.png]]`) is looked for in this order, as Obsidian finds one:

1. beside the note
2. from the vault's top
3. by its name anywhere in the vault

A Markdown export's copies are left out. They're in a folder ending `.export.assets`, or beside the export they belong
to (`book.assets/` beside `book.md`).

In a table cell, write the `|` before the shown text as `\|`.

When two notes share a name, slipbox takes the first of these:

1. the one whose name has the same case as the link
2. the one in the linking note's own folder
3. the one in the deepest folder the two share
4. the one with the shortest path

That is how Obsidian's default setting writes links, so an Obsidian vault opens unchanged. If two candidates are still
equal, slipbox doesn't guess. Following the link lists them to pick from.

A wikilink is read within its vault. A vault nested inside this one ends its names, so a link into it needs a path
(`[[nested/coffee]]`).

A file that belongs to no vault has no names to look in, so its wikilinks reach nothing. When you follow one, slipbox
says so, and says what would make the folder a vault.

### Headings, blocks and lines

The part after `#` is a place in the file:

- **A heading,** by GitHub's form of it (`#cold-brew`), or by its text (`#Cold%20brew`, `<#Cold brew>`). A repeated
  heading is numbered as GitHub numbers it: `#cold-brew-1`. A wikilink names a heading by its text
  (`[[coffee#Cold brew]]`), and can go down a path of them (`[[coffee#Methods#Cold brew]]`). An explicit id comes
  first: `## Cold brew {#cold}`, or an HTML `<a id="cold">`.
- **A block,** `#^ratio`: the paragraph or list item that ends with `^ratio`, or has it alone on the line after it.
- **Lines,** as GitHub writes them: `#L42`, `#L42-L50`, `#L42C5-L45C10`.

If two headings have the same text, the first one is used, and slipbox says so.

A link to a heading or block that isn't there opens the note at its top. slipbox says which heading or block it didn't
find.

### Links in front matter

A wikilink in a note's front matter is a link, as Obsidian's properties hold them. It can be one wikilink,
`related: "[[coffee]]"`, or a list of them. Such a link is:

- followed
- counted as a backlink
- rewritten when its note is renamed
- drawn as a link where the properties are shown

A Markdown link, a bare path or a web address in front matter is a value, not a link.

### Links to the repository's own hosting

In a git repository, a link to one of the repository's own files on GitHub, GitLab or Bitbucket opens the file in your
copy. An example is `https://github.com/you/website/blob/main/docs/plan.md`. This works as long as the address names one
of the repository's remotes, or a named folder's (below).

- A link to the repository's own page opens its README.
- If the address names another branch than the one checked out, the link is still followed. slipbox says which branch
  it names, since the file may differ there.
- Such links count as backlinks.
- A rename rewrites the path in the address, leaving the rest as it was.

### Links in code and data files

Code and data files have links of their own: a path in a code comment, a reference in a JSON schema. They're followed
and counted as backlinks, as a note's are. [Code](code.md) and [Reading](reading.md) describe them.

## Where a link lands

While the cursor is on a link in a rendered note, the status line names it and says whether it resolves. It says
`→ ideas/coffee.md (resolved)`, or `(unresolved)`, `(ambiguous)` or `(external)`.

Sometimes a tie between two notes of one name decided where the link went. Then the status line says that too:
`→ [[coffee]] (resolved, the shortest path of 2 named so)`.

`shift+k` on a link opens a small window with what the link lands on: the heading's section, the block, or the top of
the note. The window is titled with the note's path.

For a heading or block that isn't there, the window says so. It also says that the link opens the note at its top, and
shows that top.

`g d` follows the link, as `enter` does.

Links are drawn in the theme's link colour. A link that reaches nothing has a colour of its own, red in most themes. So
does a link that several notes answer to.

### Fragile links

A link won by where it is written is **fragile**. It won either as the note in the deepest shared folder, or as the one
with the shortest path. A note of the same name written nearer would take it, without a word.

- A fragile link is among the note's problems, as information, with the path that names the note for sure.
- `space c a` on the link writes that path.
- `slipbox problems` lists every fragile link in the vault.

A note you make or remove may send an existing link by name somewhere else. slipbox then says so in a message, even
though no link broke.

### From the command line

- `slipbox resolve <link> --from <note>` follows a link as the TUI does.
- `slipbox links <note>` lists a note's links, each with how it landed and how sure that is.

Both are in [The command line](cli.md).

<a id="links-and-vaults"></a>
<a id="home"></a>
<a id="elsewhere"></a>
<a id="links-that-lead-out"></a>
<a id="giving-a-folder-slipbox"></a>
<a id="switching-vaults"></a>
<a id="worktrees"></a>
<a id="a-folders-name"></a>
<a id="pointers"></a>
<a id="copies-of-a-folder"></a>
<a id="a-named-folder-moved"></a>

## Vaults

Vault detection, home, Elsewhere, switching vaults, worktrees and symlink consent are explained in [Vaults, home and
Elsewhere](vaults.md). The [across-folders guide](../guides/vaults.md) demonstrates a workflow.

## Names and pointers

A vault can have a name used by `slipbox://` pointers. See [Names and pointers](vaults.md#names-and-pointers) for
naming, copies and moved folders.

## How a folder writes links

Each vault has one **convention**: how the links slipbox makes there are written. It has three parts:

| Part | Is |
| --- | --- |
| style | a Markdown link, `[Coffee](ideas/coffee.md)`, or a wikilink, `[[coffee]]` |
| path | relative to the note, from the vault's top (`/ideas/coffee.md`), or by name (a wikilink's only) |
| extension | `.md` kept or dropped |

Each part comes from the first of these that says:

1. your setting, `[links]`, in the vault's `.slipbox/config.toml` or else your own config
   ([The links' convention](configuration.md#the-links-convention) has its values)
2. the settings of the app that owns the folder: Obsidian's `.obsidian/app.json`, or zk's `.zk/config.toml` (below)
3. the folder's notes, when one form has two-thirds or more of their links to the vault's own notes
4. else slipbox's own: a Markdown link, relative, `.md` kept

The style is found first. Then the path and extension are found for that style. For an app, that's as it writes that
style. For the folder's notes, they're counted among the notes' links of that style.

In Obsidian's `.obsidian/app.json`, `useMarkdownLinks` gives wikilinks unless it is `true`. `newLinkFormat` gives the
path:

| `newLinkFormat` | Means |
| --- | --- |
| `shortest` (the default) | by the note's name |
| `relative` | from the note |
| `absolute` | from the vault's top |

Obsidian's Markdown links keep `.md`, and its wikilinks drop it. A Markdown link is always a path, so `shortest` says
nothing about one.

In zk's `.zk/config.toml`, `link-format` says how links are written:

| `link-format` | Means |
| --- | --- |
| `markdown` (the default) | a path from the note |
| `wiki` | a path from the notebook's top |
| a template of your own | says nothing |

`link-drop-extension` drops the extension unless it is `false`.

So the conventions come out like this:

- An Obsidian vault gets wikilinks by name.
- A zk notebook gets Markdown links without `.md`.
- A repository gets whatever its notes already use.
- A folder mixing forms, with none at two-thirds, gets slipbox's own unless you set one.

A Markdown link is never by name. slipbox reads its destination as a path.

Elsewhere has no vault to read names or `/` from. There, your setting applies where it can, else slipbox's own:

- `style = "wiki"` writes a Markdown link.
- `path = "root"` or `"name"` writes a relative one. A wikilink you type stays one, its path relative.
- `extension` is as you set it.

`slipbox info` says each part and where it came from. For example:

- In an Obsidian vault, it says "wikilinks, by name, without .md", from Obsidian's `.obsidian/app.json`.
- In a repository, it says which share of its notes' links decided each part.

The Info view (`space n i`) shows the same in its Links section. `y` there copies it.

The convention decides only the links slipbox makes. The scratch's `path:line` references aren't links. A rename keeps
each existing link in the form it was written in.

## Writing links

There are three ways to have slipbox write a link for you, all in the vault's convention.

- **The link picker:** `space l i` (`:link`) lists the vault's notes and files. Pick one, and the link goes in at the
  cursor while you type. While you read, it goes after the word under the cursor, and the note is saved.
- **Completion:** typing `](` or `[[` in a note opens a list of the files a link could reach, narrowed as you type.
  `tab` or `enter` puts the chosen one in. After `](` the list includes other vaults' notes, as of their last indexing.
  While nothing in the list matches what you typed, it hides, and it comes back when you delete back to a match.
  [Editing](editing.md) has completion's keys.
- **The command line:** `slipbox link <note> --from <note>` prints the link slipbox would write, for an agent to use.

A Markdown link's text is the note's title. A wikilink has none. A wikilink is written:

- by name, where that name reaches the note from where you are
- otherwise by its path from the vault's top, or a relative path (`[[../coffee]]`)

It is never written by a name that would land on another note.

A link to a file in another folder is written by how the two folders travel:

1. in the folder's own convention, when one copy of a folder carries both files. That's the same repository, a
   repository and a submodule it records, or (outside git) one folder inside the other.
2. as a pointer, when the file is in a named folder
3. otherwise as a relative path, which works while the folders are laid out alike

If the pointer's name belongs to more than one folder here, slipbox asks before writing it. You can:

- rename one of the folders first
- write the full name (a repository's)
- write the short one as it is

`esc` writes nothing.

A private name is written, and slipbox says that pointer works on this machine only.

## Backlinks

`space l b` (or `g r`) lists the notes that link to the one you are reading, each with its line and the link's text.
`enter` opens one at the link. One from another vault is read in a peek there
([A peek at another vault](#a-peek-at-another-vault)).

`space l l` lists this note's own links, each with whether it resolves. `enter` follows one.

The Info view (`space n i`) counts both. From the command line, use `slipbox backlinks <note>` and
`slipbox links <note>`.

Backlinks are worked out from slipbox's index, never stored in your files. They include:

- links from notes, embeds and pictures
- links in front matter
- data files' references and code comments' paths
- links from other vaults into this one: by path (relative, `~/`, absolute, a file URL), by pointer, or by this
  repository's own hosting address

A link from another vault is shown by its path, `~/code/website/README.md`.

A note's links to itself don't count. Neither do a worktree's, since its notes are copies.

In the TUI, a note's unsaved text counts as you type. The command line reads the files as saved.

Another vault's links count as of its last indexing. They count only for vaults this machine knows, while those
vaults are there. A vault on a drive that is unplugged drops out until the drive is back.

A vault nested in this one, or holding it, is indexed as soon as a link or a backlink needs it.

**The background index** finds the rest. It runs while the TUI is open and nobody is working. Nobody is working when
there's no key, no click, and no command from an agent for `index.idle_seconds`, 30 by default.

Then slipbox walks your home folder a little at a time. It indexes home's own notes first (see
[Home](vaults.md#home)), then
each vault it found there. So backlinks from folders you never opened here appear by themselves, and from the notes in
your home folder that no other vault holds.

The background index:

- skips what home's index leaves out: hidden folders, `Downloads`, `node_modules` and the like
- picks up where it stopped
- once it has been through, waits a day before the next pass

`index.background = false` turns it off ([Configuration](configuration.md)). `slipbox index --home` runs it now.

Folders outside your home folder, such as other drives, are indexed when you open them or follow a link into them.

## Links kept through renames and moves

Renaming or moving a note in slipbox rewrites every link to it, wherever slipbox reaches one: in this vault, in other
vaults, in data files and code comments. A moved note's own relative links are rewritten too, so they still reach what
they did.

Each link keeps the form it was written in:

- A wikilink stays a wikilink, and a path a path, with or without its extension as written.
- A `/…` path stays from the vault's top, a `~/` path from the home folder, an absolute path absolute, and a file URL
  a URL.
- A pointer stays a pointer, while the note stays in that folder.
- A hosting address keeps its form, with only its path changed.
- A wikilink by name stays a name, unless another note has the new name or the note leaves the vault.

| To rename or move | Keys | Command |
| --- | --- | --- |
| a note, by its path | `space n m` (`:rename`, `:mv`), or `r` and `m` in the explorer | `slipbox mv` |
| a heading | `space n h` for the heading the cursor is under, or `r` in the outline | `slipbox rename-heading` |

You always see a preview first, with every line that will change, in every vault. `enter` does it, and `esc` leaves
everything as it was. [Files](files.md) describes renaming, moving and the preview in full.

Renaming a heading rewrites the links to it the same way.

`space v shift+u` (`slipbox undo`) takes back the last rename, move, naming or relink.

## Repairs

### A note moved outside slipbox

A note moved by another program breaks the path links to it, as it should. That program may be an editor, a file
manager, an agent or git. slipbox never quietly sends a broken link somewhere else.

But slipbox notices the move, in one of two ways:

- by the note's text leaving one place and arriving at another within a minute
- by git's renames after a pull or a merge

A broken link to a note that moved says where it went. slipbox offers the fix once for each batch of moves. The fix is
the relink, previewed, with nothing written until you say.

`space l r` (`:relink`) relinks the note you are reading. `slipbox relink` relinks every note.

The relink rewrites these, each in its own form:

- links broken by a move slipbox saw, to where the file is now
- pointers by a name their folder had, to its name now
- relative paths into a named folder that doesn't travel with this one, to pointers

Before a merge, slipbox can show the links the merge would break ([Git](git.md)).

### Links that name a folder the old way

`[[notes:coffee]]` and `[t](notes:coffee.md)` are an older way of naming a folder, and aren't links.

Where a folder this machine knows has that name, slipbox flags them and offers the pointer that is one. `space c a`
writes it: a Markdown link, with its heading or block kept.

### Links that reach nothing

A link that reaches nothing is drawn in the broken-link colour. While the cursor is on it, the status line says
`(unresolved)`.

It is one of the note's problems:

| The link reaches | The problem is |
| --- | --- |
| a missing file | a warning |
| a note not written yet | information, shown when you set `diagnostics.severity` to `info` |

[Configuration](configuration.md) has that setting.

- `space n q` lists this note's problems.
- `space v p` lists the whole vault's, broken links among them. [Code](code.md) describes the Problems panel.
- `slipbox problems` lists the vault's broken, ambiguous and fragile links, and the notes nothing links to.

A link into a drive that isn't plugged in is broken until the drive is back, and slipbox says why.

## Converting a folder's links

If you would rather a folder's links were plain relative paths, as GitHub and most tools read them, slipbox can convert
them. Nothing asks you to. It's there if you want it.

In the TUI, `:convert-links` converts every note's links, and `:convert-links <note>` one note's. From the command line,
run `slipbox convert-links [note]`.

- Each wikilink becomes a relative Markdown link, and an embed an image link, with its shown text kept.
  `[[coffee#Brewing|how I brew]]` becomes `[how I brew](ideas/coffee.md#brewing)`.
- Without shown text, the text is the link as it was drawn.
- Each link written from the vault's top (`/ideas/coffee.md`) becomes relative.
- Headings and blocks are checked to exist. A link that reaches nothing is left as it is, and listed.
- A link several notes answer to is a row of its own at the top of the preview. `enter` lists the notes, to pick one.
- Wikilinks in code and in front matter stay as they are.

The preview shows every line first. `space v shift+u` (`slipbox undo`) takes it back.

In an Obsidian vault, set `links.style = "markdown"` in the folder's `.slipbox/config.toml` afterwards. If you don't,
new links will still be written as wikilinks, as Obsidian's own setting says.

## Tags

A note's tags are:

- its front matter's `tags:` (or `tag:`), a list or a string split at commas and spaces
- the `#tags` in its text

A tag in the text is letters, digits, `_`, `-` and `/`. It's written after a space or at the start of a line, and it
isn't digits alone.

These aren't tags:

- anything in code
- `#` inside a word or an address (`page#part`)
- a heading's `#`

A colour such as `#0a84ff` written in the text is a tag too. Put it in a code span to keep it out.

`/` nests tags. `#coffee/brewing` is under `#coffee`, and listing `#coffee` includes it.

`#Coffee` and `#coffee` are one tag, shown as it was first written.

Following a tag lists the notes that carry it. [Finding things](finding.md#tags) covers listing every tag, and
searching by one.
