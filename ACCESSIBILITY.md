# Accessibility

slipbox is a terminal app: a full-screen TUI for reading and writing notes, and a command line beside it. This page says
what the TUI does for people who use it in different ways, where it falls short, and how to report a barrier. The
settings it names are in [Configuration](docs/manual/configuration.md), and the keys in [Keys](docs/manual/keys.md).

## The keyboard

- **Everything from the keyboard.** Every action in the TUI is a named command. The command palette (`:`) runs any of
  them by its name, and help (`?`) lists them all with their keys.
- **Nothing to memorise.** `space` opens a popup listing the keys that can follow it, and so does a pause on any key
  that starts a sequence; `?` lists every key.
- **Every key can be changed:** each binding, the leader (`input.leader`), and the `:` aliases.
- **Chords have another way.** Every `ctrl` chord has one, usually a sequence under `space`, for a terminal that keeps
  the chord for itself or a hand that finds chords hard. Moving the cursor has plain keys: the arrows, the page keys,
  `home` and `end`.
- **Timing you can set.** A key that is a binding of its own and also starts a sequence waits half a second for the next
  key before it runs; `input.which_key_delay_ms` sets the wait, up to ten seconds.
- **Stray keys do little harm.** Plain `q` and `ctrl+c` never quit. A yes-or-no question takes `y` or `n`, never
  `enter`. Deleting moves to slipbox's trash, and `u` in the explorer puts it back.

## The mouse

The mouse is optional: everything it does can be done from the keyboard. Where it helps, everything that looks clickable
is, and the wheel scrolls. `space u m` turns it off, or `ui.mouse = false` from the start, which hands the mouse back to
the terminal and its own selection.

## Seeing the screen

- **Your terminal's font and size.** slipbox draws in the terminal's character cells, so the terminal's font, its size
  and its zoom are yours to set.
- **Themes, light and dark.** slipbox has dark and light themes built in. `terminal` takes the terminal's own sixteen
  colours, so a high-contrast palette you set there shows through. Your own base16 or base24 scheme works as a theme,
  and `[colors]` changes the colour of any single part of the screen.
- **No colour at all.** The `mono` theme, which `NO_COLOR` turns on, uses only bold, dim, italics and underlines. Links
  are underlined, the cursor is shown in reverse video, the focused pane's title and the active tab are underlined, and
  the columns of buttons at the sides get a border where a theme would tint them.
- **Plain characters.** Icons, bullets and lines come from a glyph set: `nerd`, `unicode`, or `ascii`, which uses only
  the characters every font has. `space u g` picks one; by default, where the locale isn't UTF-8, slipbox picks `ascii`
  itself.
- **Less on screen.** Zen mode (`space u z`) shows only the note; a readable width (`space u shift+w`) caps the text
  column, centred; the band on the cursor's row (`space u l`), line numbers (`space u n`) and heavy frame lines
  (`ui.lines = "heavy"`) can each be switched.
- **Pictures have text.** A picture shows where the terminal can draw it, and as its caption where it can't. Mermaid
  diagrams are drawn in characters, and maths as Unicode text.

## Motion and time

- **Nothing moves on its own.** There's no animation, and slipbox's cursor doesn't blink. The screen changes when you
  act, when a file changes on disk (the note reloads, and the status line says so), and while a folder is indexed (a
  count in the top bar).
- **Messages can be read again.** A message stays four seconds, an error eight; `space m` lists everything slipbox has
  said, newest first.
- **No answer is timed.** Questions wait for your answer. Autosave saves after 30 seconds without a key;
  `editor.autosave_ms` changes that, and `0` turns it off.

## Screen readers

slipbox hasn't been tried with a screen reader, and a full-screen terminal app is hard for one to follow. The TUI
redraws the screen in place, in columns of cells, and draws its own cursor as a colour rather than with the terminal's
cursor. A screen reader that follows the terminal's cursor, or reads new output line by line, will lose track of where
you are.

The command line is the way around this. It prints plain text, a line at a time, and reaches every change the TUI makes
but git's:

- `slipbox render <note> --plain` prints a note as the TUI draws it, with no colour or other escape codes, and
  `--glyphs ascii` in plain characters; `slipbox read` prints its text exactly.
- `slipbox outline`, `find`, `search`, `links` and `backlinks` list a note's headings, matches and links.
- `slipbox write`, `task`, `mv` and the rest change notes, and `--json` gives every answer as one object for a tool of
  your own.

[The command line](docs/manual/cli.md) has every command. The notes themselves are plain Markdown files, so your own
editor reads and writes them too; `space n e` hands the note you're reading to it.

## Reporting a barrier

If something in slipbox stops you, or makes it harder than it should be, open an issue:
<https://github.com/remziduzagac/slipbox/issues>. Say what you were doing, what got in the way, and what you use: the
terminal, a screen reader or magnifier, the theme and glyph set. A barrier is a bug, and is treated as one.
