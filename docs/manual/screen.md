# The screen

This chapter is a tour of slipbox's screen: what each part is for, what it tells you, and how to show, hide, move and
resize it. How a note itself is drawn is in [Reading](reading.md), and every key is listed in [Keys](keys.md).

## A map of the screen

Here is slipbox with a folder `~/notes` open, two notes in tabs, the explorer on the left and the outline on the right:

```text
 slipbox
─────────────────────────────────┬──────────────┬───────────────┬───────────────────────────────────────────────────
 ≡  Explorer              +  +▸  │ 1 inbox.md × │ 2 coffee.md × │
 ◷                               ├──────────────┴───────────────┴───────────────┬───────────────────────────────────
 ±  ▸ ..                         │ § Coffee › Brewing › Grind                   │ Outline                         ℹ
    ▾ ideas                      ├──────────────────────────────────────────────┤                                 ▤
    └─  coffee.md                │ 12  A pour-over takes about three minutes.  ▐│ ▾ Coffee                        ¹
    ▸ journal                    │     Start with 15 g of coffee to 250 g of   ▐│ ├─▾ Brewing
      inbox.md                   │     water, then adjust one thing at a time. ▐│ │ └─  Grind
      reading.md                 │                                             ▐│ └─  Beans
                                 │ 15  ▎ ✦ Water first                         ▐│
                                 │     ▎ Heat the water to just off the boil,  ▐│
                                 │     ▎ about 94 °C.                          ▐│
                                 │                                             ▐│
                                 │ 18  ▌ Grind                                 ▐│
                                 │                                             ▐│
                                 │ 20  Medium-fine, like table salt. Too fine  ▐│
                                 │     and the water stalls; too coarse and    ▐│
─────────────────────────────────┴──────────────────────────────────────────────┴───────────────────────────────────
 READ  ~/notes  ‹ ideas/coffee.md ›  ⚠ 0  ● watching                                    97 words  tab 2/2  L18:1 57%
```

From the top:

- **The top bar**: the `slipbox` chip, which opens the command palette, and, at the right end, the folder's state while
  slipbox indexes it (`indexing 3…`).
- **The tab strip**: a tab for each note you have open.
- **The explorer**, on the left: the folder's notes and files as a tree. The column of buttons at the left edge is the
  **left rail**.
- **The window**, in the middle: the note, with its **breadcrumb** above it (the headings the cursor is under). The
  numbers down its left side are the note's line numbers, and its last column is its scrollbar.
- **The outline**, on the right: the note's headings. The buttons at the right edge are the **right rail**.
- **The status line**, at the bottom: the mode, the file, and where you are in it.

Which part has the keys shows as brightness, never as a coloured border: the focused pane's title is bright and the
others dimmer, and the active tab is bright while the note has the keys. The lines between the parts are light by
default; `ui.lines = "heavy"` draws them heavy (`━ ┃`). Tables in a note are always drawn light. The terminal's title
names slipbox and the file on screen.

The drawings of the screen in this chapter use the Unicode glyph set. With Nerd Font icons, or plain ASCII, the
buttons and marks look different: see [Glyphs](reading.md#glyphs).

## The top bar

The top bar holds the `slipbox` chip, which opens the [command palette](#the-command-palette) when clicked, and, while
the folder is being indexed, how far that has got. Without the left rail, the explorer's `≡` button sits on it too.

`space u b` hides it and shows it again, and `ui.top_bar = false` hides it from the start: the note gains its row, and
`:` still opens the palette. See [Configuration](configuration.md) for every `ui` setting.

## Tabs

A tab holds one note, or two in a [split](#windows-and-splits). The strip shows each tab as its number, the file's
name with its extension, and a `×` that closes it. A note that was just reloaded from disk shows `↻` for a few seconds.
When the tabs don't all fit, the strip shows a run of them that includes the active one, and a `+N` button at the right
counts the rest: click it for the list of tabs.

| To | Press |
| --- | --- |
| open this note in a new tab | `ctrl+t c`, `space t c`, or `:tabnew` |
| follow the link under the cursor into a new tab | `ctrl+enter`, `space l t` |
| go to the next or previous tab | `g t` / `g shift+t`, `ctrl+tab` / `ctrl+shift+tab`, `space t n` / `space t p` |
| go to tab 1 to 9 | `alt+1` … `alt+9`, `space t 1` … `space t 9` |
| pick a tab from a list | `ctrl+t t`, `space t t` |
| move the tab left or right | `space t shift+h` / `space t shift+l`, `ctrl+shift+pageup` / `ctrl+shift+pagedown` |
| close the tab | `ctrl+t q`, `space t q` |
| close the other tabs, or all of them | `space t o`, `space t shift+q` |
| pin the tab, or unpin it | `ctrl+t m`, `space t m`, `:tabpin` |

Every `space t` key also works after `ctrl+t`. With the mouse, click a tab to switch to it, drag it to move it, and
middle-click it (or click its `×`) to close it; the wheel over the strip goes to the previous or next tab.

**Pinned tabs** keep their note. A pinned tab has `⚑` before its name and stays at the left of the strip with the
other pinned tabs, in the order you pinned them. Anything that would open over it (a link, the switcher, `:e`, the
explorer) opens in a new tab instead, and closing the other tabs or all of them leaves the pinned ones. `ctrl+t q`
still closes a pinned tab.

## Windows and splits

A tab can be split in two, side by side or one above the other. Each window has its own cursor, its own find and its
own history of where it has been, so the two can show different notes, or two places in the same one.

| To | Press |
| --- | --- |
| split side by side | `ctrl+w v`, `space w v`, `ctrl+\`, or `:vs` |
| split one above the other | `ctrl+w s`, `space w s`, or `:sp` |
| go to the other window | `ctrl+w w`, `space w w` |
| go to the window, or pane, to the left, below, above or right | `ctrl+w h` / `j` / `k` / `l`, or the arrows |
| move this window to the left, bottom, top or right | `ctrl+w shift+h` / `j` / `k` / `l` |
| swap the two windows | `ctrl+w x` |
| close this window | `q`, `ctrl+w q` |
| keep only this window | `ctrl+w o` |
| move this window out into a tab of its own | `ctrl+t c` |
| follow the link under the cursor into the other window | `ctrl+w f`, `space l s` |

Every `ctrl+w` key also works as `space w`. Going left from the leftmost window focuses the explorer, and going right
from the rightmost the outline. Moving a window also sets the split's direction: moving it right makes a side-by-side
split with this window on the right.

When the windows would have fewer than 80 columns between them, a side-by-side split is drawn one above the other, and
a stacked split too short for two windows shows only the active one. In a split, each window names its file at the
start of its breadcrumb row, bright in the active window.

`q` closes the window. On a tab's last window it closes the tab, and on the very last tab it does nothing but remind
you that `ctrl+q` quits. To quit, press `ctrl+q`, `space q q` or type `:qa`; `:q` closes the window and quits on the
very last one, as in vim.

### Resizing

Drag the border between two windows, or between a pane and the note, to resize them. From the keyboard, use resize
mode:

1. Press `space w r`, or resize one step at once with `ctrl+w >`, `ctrl+w <`, `ctrl+w +` or `ctrl+w -`. The status
   line reads `RESIZE` and a popup lists the keys.
2. Press `h` or `l` (or `<` and `>`, or the arrows) to make it narrower or wider, and `k` or `j` (or `-` and `+`) to
   make it shorter or taller. The keys repeat without a prefix: `ctrl+w > > >` widens three steps.
3. Press `=` for equal sizes.
4. Press `esc`, `enter` or `q` to leave. Any other key leaves resize mode and then does its usual job.

What resizes follows focus: the explorer's or the outline's width when it has the keys, the Problems panel's height
when it does, and otherwise this window's share of the split. Side panes stay between 12 columns and half the screen,
always leaving the note 24; a split stays between 15% and 85%. `=` evens the split and puts the panes back to
`ui.sidebar_width` and `ui.outline_width`, and the Problems panel back to a third of the screen. Sizes are kept in the
session. `ui.split_ratio` is the first window's share of a new split, half by default. Resize mode's keys can be
changed under `[keys.resize]` in [Configuration](configuration.md).

## The side panes

Each side of the screen has a panel that shows one view at a time, and a rail of buttons, one for each view:

| Side | View | Button | Key | Covered in |
| --- | --- | --- | --- | --- |
| left | the explorer: the folder's notes and files | `≡` | `space e` | [Files](files.md) |
| left | the history: where this window has been | `◷` | `space h h` | [Finding things](finding.md) |
| left | source control: the files changed in git | `±` | `space g s` | [Git](git.md) |
| right | Info: what the file on screen is | `ℹ` | `space n i` | [below](#the-info-view) |
| right | the outline: the note's headings | `▤` | `space o` | [Finding things](finding.md) |
| right | the footnotes: the note's footnotes | `¹` | `space n f` | [Finding things](finding.md) |

A view's button is bright while it shows. Clicking it shows the panel on that view and gives it the keys; clicking it
again hides the panel. A view's key opens it and gives it the keys; pressed while the view is open but the note has
the keys, it gives them back to the view; pressed while the view has them, it closes it. `space shift+e` selects the
current note in the explorer.

Inside every pane, `j` and `k` move, `enter` opens what is selected or jumps to it, `h` and `l` fold and unfold, `g g`
and `shift+g` go to the top and bottom, and `/` filters: type to narrow the rows, `esc` to clear. `q` closes the pane
and `esc` gives the keys back to the note, leaving the pane open. A view keeps its place, its selection and its filter
while another one shows, and has them back when it returns. The wheel scrolls a pane without moving its selection. A
pane whose rows are wider than it scrolls sideways, with a scrollbar along its bottom row. Each pane's keys are listed
in [Keys](keys.md), and can be changed under `[keys.explorer]`, `[keys.outline]`, `[keys.footnotes]` and
`[keys.info]`.

These settings set up the panes:

- `ui.sidebar`: whether the explorer is open beside the note when slipbox starts (on by default).
- `ui.outline`: the same for the outline (off by default).
- `ui.sidebar_width` and `ui.outline_width`: their widths, 30 and 32 columns.
- `ui.left_rail` and `ui.right_rail`: the rails (both on). Without the left rail, the explorer's `≡` sits on the top
  bar and the history and source control open with their keys. Without the right rail, the outline's `▤` sits at the
  right end of the breadcrumb, and Info and the footnotes open with their keys.

### Narrow terminals

On a screen narrower than `ui.narrow_width` (90 columns by default), and in zen mode, the side panes don't sit beside
the note: each opens over it when you ask for it, and closes again once you've picked something. Whether you like them
open on a wide screen is kept apart, so widening the terminal brings them back.

### The Info view

The Info view tells you what the file on screen is, and follows you to the next one. It has four sections, each folded
and unfolded with `h` and `l`:

- **File**: its path, the root it belongs to, what kind of file it is, its size, when it was changed, its words and
  reading time, its lines, its encoding and line endings, how it indents, and whether it's saved.
- **Properties**: the note's front matter, keys and values, nested ones indented under their key.
- **Tags**: its tags, from the front matter and from the text.
- **Links**: how many links it has and how many reach nothing, its backlinks, headings, footnotes and tasks done, and
  how links are written in this folder.

`enter` on a row opens what it names: a property's line in the front matter, a tag's notes, the list of links or
backlinks, the outline or the footnotes. On any other row, `enter` copies its value, as `y` does on every row. `e` opens
the properties editor, a floating window with the note's front matter to edit as text: see [Editing](editing.md).
`slipbox stat <note>` gives the same information on the command line ([The command line](cli.md)).

The folder's own information (its name, its notes, its index and the watcher) isn't a file's, so it has a window of
its own: `space v i`.

## The Problems panel

The Problems panel runs across the bottom of the screen, under the windows and the side panes, and takes a third of
the rows. It has two tabs:

- **This file** lists every problem of the file on screen, each with its line. `space n q` opens it, as does a click
  on the problem count in the status line. Moving through the list takes the note to each problem and marks it.
- **All** lists what's wrong across the folder, under a heading for each kind: broken, ambiguous and fragile links,
  notes breaking their document type's rules, findings from a linter, files left in a merge conflict, and notes
  nothing links to. `space v p` or `:problems`
  opens it, as does the status line's `⚠ 0` when the file has no problems of its own.

`tab` and `shift+tab` switch between the tabs, `j` and `k` move, `enter` goes to the problem, `/` filters, `q` closes
the panel and `esc` gives the keys back to the note. Pressing the panel's key again while it has the keys closes it. To
make it taller or shorter, drag its top rule, or give it the keys and use resize mode's `j` and `k`.

What the problems are and where they come from is in [Code](code.md); broken links, and how to repair them, are in
[Links and roots](links-and-roots.md).

## The breadcrumb

Each window has a breadcrumb row above the note: `§`, then the headings the cursor is under, from the outermost in,
such as `§ Coffee › Brewing › Grind`. When they don't all fit, the middle ones fold into `…`.

- Click a heading to scroll the window to it.
- Click `§` to find a heading in the note by typing part of it (`space f o` does the same).
- Click `…`, or press `space f b`, to see the whole path as a list: type to filter it, `enter` to jump.

In a data file the breadcrumb shows its sections and keys, and in a code file its definitions. A window shorter than
8 rows has no breadcrumb, nor does zen mode. To hide it everywhere, turn off **Breadcrumb** in `space u u`, or set
`ui.breadcrumb = false`.

## The status line

The status line describes the file in the focused window. From the left:

- **The mode**, in a coloured chip:

  | Chip | What has the keys |
  | --- | --- |
  | `READ` | the note, drawn as a page |
  | `SOURCE` | the note's Markdown, in source mode |
  | `LENS` | the note, with the lens open on the block being edited |
  | `INSERT` | typing |
  | `VISUAL`, `V-LINE` | a selection, by character or by whole rows |
  | `FILES` | the left panel: the explorer, the history or source control |
  | `OUTLINE`, `FOOTNOTES`, `INFO` | the right panel's view |
  | `PROBLEMS` | the Problems panel |
  | `RESIZE` | resize mode |

  While you're in the middle of a key sequence, the chip shows what you've pressed so far instead: `␣ l` after
  `space l`, `C-w` after `ctrl+w`, `2d` after `2 d`.
- **The folder**, dimmed: its name if it has one, else its path (`~/notes`), and in a git repository the branch
  checked out (`~/notes · main`). [Links and roots](links-and-roots.md) explains names.
- **The file's path**, between `‹` and `›`. These two go back and forward in the window's history, as a browser's
  arrows do: each is bright when there's somewhere to go, and hovering over one says where. Clicking the path lists
  the window's history above it, with **Copy path** first.
- **A marker**, when there's something to say: `• unsaved`, `• unsaved ⚠ differs from disk`, `↻ reloaded` after the
  file changed on disk, or `✖ deleted on disk`. On a narrow screen it shrinks to its symbols. See
  [Editing](editing.md) for saving, and for files that change while you edit them.
- **The file's problems**, counted by severity, such as `✖ 1  ⚠ 3`; with none, a dim `⚠ 0`. Click either to open the
  [Problems panel](#the-problems-panel).
- **Whether slipbox sees changes on disk**: `● watching`; `⚠ not watching` when watching failed; `○ not watching` when
  it's turned off (`watch.enabled = false`).

At the right end:

- **The link under the cursor**, in a note drawn as a page, and whether it reaches anything, such as
  `→ ideas/coffee.md (resolved)`.
- **The note's words**, or, while you select, the selection's (`12 words selected`). Front matter isn't counted, and
  each Chinese or Japanese character counts as a word.
- **`tab 2/3`**, when there's more than one tab.
- **Where the cursor is**: `L18:1` is the source line and column of the text under the cursor, and the percentage is
  how far down the window is (`all` when the whole note fits).

When the line is short, the word count goes first, then the link, then the tab count; the position always stays.

## Messages and questions

Messages float at the top right of the window, framed and marked by level: `✗` an error, `!` a warning, `·`
information. Up to four stack up, the newest on top; each stays four seconds, an error eight. They never push the note
down. Click one to see every message; `space m` or `:messages` lists everything slipbox has said, newest first, and
`enter` copies one. On a screen under 30 columns wide, a message takes over the status line while it shows.

Questions, such as a name for a new note or "delete it?", float in a window near the top of the content. Type the
answer after `›` and press `enter`, or `esc` to cancel; the `OK` and `Cancel` buttons click. A yes-or-no question
takes `y` or `n`, and `esc` means no; `enter` is not an answer, so a stray one never deletes anything. A click outside
the window cancels.

## Lists

Every list in slipbox works the same way: the switcher, the pickers, the tab list, the palette and help.

- Type to narrow it: each word you type must match, in any order, and a capital letter makes the match
  case-sensitive.
- Move with the arrows, `tab` and `shift+tab`, or `ctrl+n` and `ctrl+p`; the selection wraps around the ends.
- Press `enter` to pick, or `esc` (or `ctrl+c`) to cancel.
- The wheel scrolls, a click picks, and a click outside the list closes it.

The bottom border counts the entries (`3/40`). Lists of commands have a footer under them: the selected command's
name, what it does, and its other keys. Every key that works in a list is in [Keys](keys.md).

### The command palette

`:` opens the command palette, and so do `ctrl+shift+p`, `space f p` and the `slipbox` chip. Empty, it lists the last
five commands you ran from it or from help, then every command in groups. Type part of a command's name and press
`enter` to run it. Each command shows its first key and its alias, so the palette is also where you learn them.

The palette is a command line too. An alias typed exactly wins over the matches: `:q`, `:vs`, `:theme nord`. Typing an
alias that takes an argument, then a space, lists what it can take: notes, themes or glyph sets. `:42` goes to line 42.
The aliases are listed in [Keys](keys.md), and you can add your own under `[aliases]` in
[Configuration](configuration.md).

### Help

`?` opens help (so do `space ?` and `:help`): every command with all its keys, in groups, then the keys inside each
pane, in resize mode and with the mouse. Type to filter it; the groups stay. `enter` on a command runs it. Opened while
a pane has the keys, or during a selection, help starts at that part.

## The which-key popup

After `space`, a popup lists every key you can press next, each with a name and a short explanation. Groups read
`+name`: `+links`, `+tabs`. After any other key that starts a sequence (`g`, `z`, `y`, `[`, `]`, `ctrl+w`, `ctrl+t`)
it appears if you pause for half a second, so a sequence you know never flashes it. `backspace` goes up a level, `esc`
cancels, and clicking an entry presses its key.

`input.which_key = false` turns the popup off (resize mode still shows its own), and `input.which_key_delay_ms` sets
the pause. The groups' names come from `[groups]`: see [Configuration](configuration.md). The same pause is how long a
key that is both a command and the start of a longer one waits before it runs ([Keys](keys.md#the-which-key-popup)).

## Floating windows

Some things show in a floating window over the note, framed, near the top of the content:

- what's under the cursor (`shift+k`): a link's destination in a note, or a language server's description in code;
- who last changed the cursor's line (`space g b`), and a change shown as a diff (`space g p`);
- a file as it was in an older commit (`space g h`), or as it is on another branch when a link leads there;
- the properties editor (`space n shift+p`) and a commit's message, which you type into.

There is one at a time. In one you only read, you can move, select and copy as in a note; `esc` or `q` closes it, as
does a click outside it.

## The mouse

Everything that looks clickable is: the rail buttons, tabs and their `×`, the breadcrumb's headings, the arrows and
path in the status line, a task's checkbox, the entries of the which-key popup, a message. Under the pointer, small
targets light up.

In a note, a click moves the cursor, and on a link follows it. Drag to select; the selection is copied when you let
go. A double-click selects and copies a word, a triple-click the row. The wheel scrolls the note, a pane or a list.
Drag a border to resize what's beside it, and a scrollbar's thumb to scroll.

`space u m` turns the mouse off, which hands it back to the terminal, so you can select text the terminal's own way;
`ui.mouse = false` starts that way. The whole list of what the mouse does is in [Keys](keys.md).

## UI settings

`space u` holds the settings you change while reading. `space u u` lists them all with their values: pick one to
change it.

| Setting | Key | What it does |
| --- | --- | --- |
| Theme | `space u t` | picks the colours, previewed as you move; `esc` puts the old ones back |
| Glyphs | `space u g` | picks the icon set: Nerd Font icons, Unicode, ASCII, or chosen for you |
| Readable width | `space u shift+w` | caps the text at `ui.readable_max` columns (100), centred |
| Zen mode | `space u z` | hides everything but the note |
| Cursor-row highlight | `space u l` | a band across the cursor's row |
| Line numbers | `space u n` | the note's line numbers down its left side |
| Wrap long lines | `space u w`, `alt+z` | off, a note keeps its own width and scrolls sideways |
| Show link URLs | `space u r` | prints a web link's address after its text |
| Mouse | `space u m` | off, the terminal has the mouse |
| Breadcrumb | (only in the list) | the heading path at the top of each window |
| Top bar | `space u b` | the bar at the top |
| Problems bar | `space u d` | a column beside the text with each line's problems |
| Spelling | `space u s` | misspelt words marked |
| Problems marked in the text | `space u shift+d` | none, errors, warnings and up, or all |
| Code cells | `space u c` | the code view's cells in boxes, or on tinted bands |

How the theme, glyphs, wrapping and URLs change a note is in [Reading](reading.md); spelling is in
[Editing](editing.md); problems and code cells are in [Code](code.md).

**Zen mode** takes away the top bar, the tabs, the rails, the breadcrumb, the status line and the lines between them,
and turns readable width on. The side panes still open on demand, over the note. Press `space u z` again, or type
`:zen`, to come back.

**What a change keeps.** A change applies at once and is remembered in the folder's session, so it's still there the
next time you open the folder. Each change is remembered with the setting it replaced: if you later edit that setting
in your config file, the file wins again. slipbox never writes your config. Each setting's default is in
[Configuration](configuration.md).

## Where you were

slipbox remembers where you were, so you can stop and come back.

**Each note's reading position.** Every note you read keeps its place: the top of the window and the cursor. Open it
again, from the explorer, the switcher or the command line, and it opens there; a link to one of its headings opens at
that heading instead. The place is kept by the heading it's under, so text added above it, by you or by an agent,
doesn't move you.

**The session.** Started on a folder rather than a note (`slipbox`, or `slipbox ~/notes`), slipbox reopens your tabs
as you left them: their splits and sizes, each window's cursor and its history (the last 50 places back and forward),
and whether the explorer and the outline were open, and how wide. `ui.restore_session = false` turns this off.
Started with a note, slipbox opens that note instead. With no session to restore, it opens `index.md`, `README.md` or
`home.md`, whichever the folder has, else its first note. The palette's recent commands and your
[UI settings](#ui-settings) come back on every start.

**Each branch's tabs.** In a git repository, slipbox keeps the tabs each branch had when you left it, for the 30
branches left most recently. Starting on a branch opens its tabs, and switching branches while slipbox runs, in
slipbox or in another terminal, brings back the new branch's tabs. A note with unsaved changes keeps everything as it
is, and slipbox says so. This needs `ui.restore_session` on.

The session is the folder's own; another folder has its own. Where slipbox keeps it on your machine is in
[Where slipbox keeps things](configuration.md#where-slipbox-keeps-things).
