# Getting started

A first session with slipbox in a folder of your own: open it, move around, open notes, follow a link and come back,
search, change a line and save it, tick a task, and quit. It takes about ten minutes. You need slipbox installed
([Installing slipbox](install.md)) and a terminal at least 90 columns wide, so the explorer has room beside the note.

## A folder to start in

Any folder of Markdown notes will do; this guide calls it `~/notes`. To follow the steps exactly, make two small notes
in it, `inbox.md` and `ideas/coffee.md`:

```bash
mkdir -p ~/notes && cd ~/notes
slipbox write inbox.md --create --stdin <<'EOF'
# Inbox

Things to sort out this week.

- [ ] Buy filter papers
- [ ] Try the new grinder setting

Ideas so far: [coffee](ideas/coffee.md).
EOF
slipbox write ideas/coffee.md --create --stdin <<'EOF'
# Coffee

## Brewing

A ratio of 1 to 16 suits a pour-over.

## Beans

Washed beans taste cleaner than natural ones.
EOF
```

Each prints `created` and the note's name. `slipbox write` is how scripts and agents write a note; `--create` makes it
refuse to write over a note that is already there, so this never touches notes of yours.

## Open the folder

```bash
slipbox ~/notes
```

slipbox fills the terminal. It opens the folder's `index.md` or `README.md` if it has one, and otherwise its first
note by path: here `ideas/coffee.md`. If you have used slipbox in other folders, a list of them may open first,
"Folders", offering to go into one: `esc` closes it.

## The screen

On the left, the explorer lists the folder's notes. On the right is the note, rendered, with its line numbers, and
above it a tab, `1 coffee.md`. Along the bottom, the status line shows the mode (`READ`), the note's path, its word
count and the cursor's place (`L1:1`).

Two keys help while you learn the rest. Press `space`: a popup lists the keys that can follow it, grouped (`f` for
find, `n` for note…); `esc` closes it. Press `?`: every key, with a filter to type into; `esc` closes it too. The mouse
works as well: click a note, a link, a tab. [The screen](../manual/screen.md) describes each part.

## Move

A cursor sits on the text, at the top of the note. `j` and `k`, or the arrow keys, move it down and up a row; `ctrl+d`
and `ctrl+u` half a page; `g g` and `shift+g` to the top and the bottom; `] ]` and `[ [` to the next and previous
heading. The mouse wheel scrolls.

## Open a note

The switcher finds a note by name. Press `ctrl+p`: a list opens, "Open note (2)". Type `inbox`, and the list narrows
to `inbox.md`. Press `enter`: inbox.md opens in place of coffee.md.

The explorer is for browsing. Press `space e`: the explorer takes the keys (the status line says `FILES`), with
`inbox.md` selected. Press `k` to move up to `coffee.md`, then `enter`: coffee.md opens in a second tab,
`2 coffee.md`, and the keys go back to the note. Press `q` to close that tab, and you're back in inbox.md.

If your terminal or multiplexer takes a `ctrl` key for itself (zellij takes `ctrl+p` and `ctrl+o`), each has another
way in under `space`: here, `space f f` for the switcher. The [keys chapter](../manual/keys.md) lists them all.

## Follow a link and come back

In inbox.md, press `tab`: the cursor jumps to the link, `coffee`, and the right of the status line shows where it
goes, `→ ideas/coffee.md (resolved)`. Press `enter`: coffee.md opens. Press `ctrl+o`: you're back in inbox.md, where
you were. A click on a link follows it too, and `space h p` goes back like `ctrl+o`.

## Search

To find something in this note, press `/` and type `grinder`. The cursor moves to the match as you type, and a find
row above the note counts the matches, `1/1`. `enter` keeps the search, and `n` and `shift+n` then go to the next and
previous match. `esc` closes the row.

To search every note, press `space f s` and type `beans`. The list shows each place it's found, the note and the line
first: `ideas/coffee.md:7`. Press `enter` to open coffee.md there, and `ctrl+o` to come back. The first time you open
a folder, slipbox builds its search index in the background; in a large folder, the list says how far it has got.

## Change a line and save

Put the cursor on "Try the new grinder setting" (after the search, it's there already) and press `o`. The note now
shows its Markdown as written, a message says `source — editing the markdown`, and a new task, `- [ ]`, is started on
the line below; the status line says `INSERT`. Type `Order more beans`.

Press `esc` to stop typing: the status line says `SOURCE`, and a dot (`•`) by the tab's name says the note has
unsaved changes. Press `ctrl+s` to save: the message is `saved inbox.md`, and the dot goes. Press `ctrl+k` to see the
note rendered again.

`i` and `a` start typing before and after the cursor, and in source mode the vim keys you may know work (`dd`, `cw`,
`u` to undo, `.`); `ctrl+k` switches a note to source mode and back. If you forget `ctrl+s`, slipbox saves a changed
note by itself after half a minute without a key. The [editing chapter](../manual/editing.md) has the rest, the lens
among it: Markdown shown only around the cursor, the rest of the note left rendered (`space n l`).

## Tick a task

With the note rendered, put the cursor on "Buy filter papers" and press `ctrl+l`. Its box is ticked, a message says
`done ✓`, and the note is saved at once: the line is now `- [x] Buy filter papers`. `ctrl+l` again unticks it.
`space n t` does the same, and so does a click on the box.

## Quit

Press `ctrl+q` to quit (`space q q` and `:qa` do too). If a note has unsaved changes, slipbox stays and names it,
`unsaved changes in inbox.md`: `ctrl+s` (or `:w`) saves it, or `:q!` quits without saving. Plain `q` closes a tab or
a split, but never quits.

Next time you run `slipbox ~/notes`, your tabs come back, each note where you left it.

## Where to go next

- [Making it yours](making-it-yours.md): a theme, your own keys, your editor, settings for a folder.
- [Working with agents](agents.md): slipbox beside a coding agent, both on the same files.
- [Coming from Obsidian or zk](from-obsidian-or-zk.md): opening a vault or a notebook as it is.
- [Finding things](../manual/finding.md), [Links and roots](../manual/links-and-roots.md) and
  [Editing](../manual/editing.md): the chapters behind this session's steps.
- [Keys](../manual/keys.md): every key, as `?` lists them.
