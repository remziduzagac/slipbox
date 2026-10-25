# Design changes

Each change names the root's design section it lands in at consolidation; the root's files change only when HDR is
consolidated. The decisions cited are in [decisions.md](decisions.md), agreed on 2026-10-24.

## MODIFIED design/tui.md § Screen layout

Four paragraphs replace "**The breadcrumb** tops each window, …", "The breadcrumb row has its own background, …" and
"Rules run above and below it. …". The diagram's fourth row becomes:

```text
    ▾ notes    ┃ § Heading › Sub  Read Lens Source┃ Outline            ▤   ← window header (tinted) ┃ outline · rail
```

The new text:

**The window header** tops each window, between two rules: in a split the window's file name, then the breadcrumb,
then at its right the mode's buttons, and at the far right of the window at the top right, without the right rail,
the outline's `▤` (HDR-D1). In a split the name is `strong` in the active window and `dim` in the other, cut to half
the row. `ui.window_header = false` removes it, as do "Window header" in the UI settings list and the palette; zen
mode, the floating window and windows under 8 rows have none (HDR-D3). Without a header there are no header rules,
the outline starts at the top of the content, and a split window gets a plain title row (`tab` / `tab_active`). It is
drawn by `drawWindowHeader` (`src/tui/draw-header.ts`), which `drawPane` calls.

**The mode's buttons**, `Read`, `Lens` and `Source`, are the window's three modes, the rendered view, the lens and
source mode, as a radio group (HDR-D2). Exactly one is selected: the window's mode (`view.source`: Source,
`view.live`: Lens, else Read), drawn `topbar_button_on`; the others are `topbar_button`, and `hover` under the mouse.
They are drawn from the window's own flags each frame, after its layout is asked for, since laying a window out can
change its mode without `setViewMode` (a data file that stopped parsing goes to source mode once typing ends,
`views.ts`; a window given another file, `Lens.fitMode`): nothing about them is kept between frames. Two windows on one
file each have their own. Typing isn't a mode: while typing, the button of the mode it's in stays selected, as the chip
says `INSERT`. A mode the window can't switch to (`Lens.refusal(view, mode)`, the one place `setViewMode`'s refusals
are decided, returning the message and its level and saying nothing itself) is disabled: drawn
`topbar_button_disabled`, never `hover` (`button()`'s `hovers`). The header asks every frame, so it asks
`Lens.canSwitch`, which never parses: a data file whose text changed since its last parse (`NoteBuffer.parseCurrent`)
is taken to parse, its Read and Lens lit, until a parse says otherwise — a click's, which asks of the text as it is,
or a switch's. So no keystroke or edit parses a data file in source mode, whatever its size or however many windows show
it, and data is never judged mid-typing (an open quote is normal there). The selected one
is never disabled: it's the mode the window is in, even where the window couldn't switch to it now (typing in the
lens on data that stopped parsing: Lens selected, until typing ends and the window goes to source mode, said). A file
with no rendered view (a text file; code not in a
language the view maps, or `[render] code = "source"`; data that doesn't parse) has only Source; a drawn buffer (a
diff, a review, the merge screen) can switch to nothing, but it shows only in the floating window, which has no
header. A read-only file, a peek kept as a tab, a file Elsewhere and the scratch in the window on the right have all
three, as their modes do today. The labels are the same for every file: for code, Read is the code as a document and
Lens a cell's source; Source is always the file as written.

**A click** on a button, like every click, first ends typing (`mouse.ts`: its undo step closes, the unsaved changes
kept in the buffer), then focuses the button's window and its content region, as a heading's click does, so the
status chip, which describes the focused window, agrees. Then, on another enabled button, it runs that mode's named
command, `view.mode_read`, `view.mode_lens` or `view.mode_source`, which switches straight there through
`Lens.setViewMode` (Lens from Source never passes through Read) and says what the window shows now, in the toggles'
words. On the selected button it changes nothing more: a radio group never deselects. On a disabled one it says why,
in `setViewMode`'s words; the command says it, as it does any refusal. One click never says a thing twice: where ending
typing in this file, in this window or another on it, said why already (data that stopped parsing goes to source mode),
the click adds nothing: while a click is handled, each message it says is said once (`App.sayingOnce`), its words
`unparsedText`'s wherever they're said; a second click is its own, and says them again. A click focuses its window as
a heading's does (`Mouse.focusWindow`). The hit areas are
`mode:<window>:<read|lens|source>`, the window's index checked as a heading's is; the selected and the disabled keep
theirs, without `hover`. The which-key popup over the header hides them as it hides the headings'
(`draw-overlays.ts`), and so does the floating window, whose margins can lie over the header's row: what lies under it
can't be clicked through it, its own hit areas aside (`drawApp`), and completion's popup, which can hang over a
stacked split's lower header. The modes' table, `MODES`, with `ViewMode` and `viewMode`, is `modes.ts`'s, a module
that imports nothing at load (the lens and the header import each other through the app), for the header, the
mouse, the lens and the status chip (its chip the selected button's label) alike; the header asks `Lens.canSwitch`,
`refusal` without its words. The lens's message names what it shows: a note's
markdown, code, a data file's own format (`the YAML`; `lensWhat`).

**Room** (HDR-D4). The header's row, from the right: `▤` where it is, then the buttons, then the breadcrumb between
the name and them. The buttons are three labels side by side, each with a space either side: ` Read ` ` Lens `
` Source `, 20 columns; shortened, ` R ` ` L ` ` S `, 9; at the least, the selected one's letter alone, 3. The
breadcrumb is drawn in the columns between the name and the buttons less one at each end, as now, and folds into them
as before. The buttons take the widest form that leaves the breadcrumb its least room: its narrowest form but `…`
alone — the icon and its space, `… ›`, and 8 columns of a heading, 14 columns — while the breadcrumb shows, whatever
headings the cursor is under and whatever the mode (a window's headings depend on it), so a window's form changes
only with its width (HDR-D7, HDR-D8); nothing when the breadcrumb is hidden. Past that, the breadcrumb folds further, as
`crumbLayout` does, until only `…` or nothing is left; the selected letter goes only where it doesn't fit beside the
name and `▤` (a split's window squeezed to its narrowest, about 12 columns). `modeButtons` (`draw-header.ts`) picks
the form, from the breadcrumb's least room, `crumbLeast`, beside `crumbLayout`. The name keeps its place (cut to half
the row, as now), and `▤` its.

**The breadcrumb**, on the header after the name, starts with an icon (`§`, ascii `#`) that opens the heading finder
when clicked, then the chain of headings that window's cursor is under, each cut to 40 columns. When they don't all
fit, the middle collapses into `…`: the first heading, `…`, and as many of the innermost as fit; then only the first
and the last, cut (down to 8 columns each); then `…` and the last; then `…` alone. Clicking `…` (or `space f b`) opens
the whole path as a dropdown hanging under the header, centred across the screen, at least half its width (60 to 100
columns) and room for 8 entries between blank rows, framed like the other popups: one heading per row, each hanging
off the one above with `└─`, the current one marked `here` and selected. Typing filters it, as in every list (the
filter's row sits under the title); the arrows and `ctrl+n` / `ctrl+p` move, `enter` or a click jumps there as a
breadcrumb click does, `esc` or a click outside closes it. Clicking a heading focuses that window, puts its cursor on
the heading, and scrolls the heading to the window's first row (as far as the note's end allows). The header stays
above the first heading, so the text doesn't jump. `ui.breadcrumb = false` hides the breadcrumb alone: the header
keeps its name, its buttons and `▤` (HDR-D3). Without the right rail (below), the `▤` button sits at the header's
right end; when no window shows a header, it moves to the right end of the top bar (with neither, in zen or with
`ui.top_bar = false`, the outline opens with `space o`).

The header has its own background, `breadcrumb_band` (`surface` blended into the page at 35%; the role keeps its
name, HDR-D1). The breadcrumb's icon is `breadcrumb_icon` (blue), outer headings `breadcrumb` (dim), separators
`breadcrumb_sep` (faint), and the heading the cursor is in `breadcrumb_current` (bold). A disabled button is
`topbar_button_disabled`: in italics in every theme, its colour halfway from an enabled one's to `surface2` (in the
terminal's palette colour 8, dim; without colour, dim; HDR-D5, HDR-D6).

Rules run above and below the header. The rule above is the frame's rule under the tab strip; the lower window of a
stacked split draws its own.

Previously:

> **The breadcrumb** tops each window, between two rules. It starts with an icon (`§`, ascii `#`) that opens the
> heading finder when clicked, then the chain of headings that window's cursor is under, each cut to 40 columns. When
> they don't all fit, the middle collapses into `…`: the first heading, `…`, and as many of the innermost as fit; then
> only the first and the last, cut (down to 8 columns each); then `…` and the last; then `…` alone. Clicking `…` (or
> `space f b`) opens the whole path as a dropdown hanging under the breadcrumb, centred across the screen, at least
> half its width (60 to 100 columns) and room for 8 entries between blank rows, framed like the other popups: one
> heading per row, each hanging off the one above with `└─`, the current one marked `here` and selected. Typing
> filters it, as in every list (the filter's row sits under the title); the arrows and `ctrl+n` / `ctrl+p` move,
> `enter` or a click jumps there as a breadcrumb click does, `esc` or a click outside closes it. In a split it shares
> the window's title row, after the file name. Clicking a heading focuses that window, puts its cursor on the heading,
> and scrolls the heading to the window's first row (as far as the note's end allows). The row stays reserved above
> the first heading, so the text doesn't jump. `ui.breadcrumb = false` removes it; zen mode and windows under 8 rows
> drop it. Without the right rail (below), the `▤` button sits at the breadcrumb's right end; when no window shows a
> breadcrumb either, it moves to the right end of the top bar (with neither, in zen or with `ui.top_bar = false`, the
> outline opens with `space o`). Without a breadcrumb there are no header rules, the outline starts at the top of the
> content, and a split window gets a plain title row (`tab` / `tab_active`).
>
> The breadcrumb row has its own background, `breadcrumb_band` (`surface` blended into the page at 35%). The icon is
> `breadcrumb_icon` (blue), outer headings `breadcrumb` (dim), separators `breadcrumb_sep` (faint), and the heading the
> cursor is in `breadcrumb_current` (bold). In a split, the file name comes first on the same row: `strong` in the
> active window, `dim` in the other.
>
> Rules run above and below it. The rule above is the frame's rule under the tab strip; the lower window of a stacked
> split draws its own.

The diagram's row was `▾ notes ┃ § Heading › Sub ┃ Outline ▤ ← breadcrumb (tinted) ┃ outline · right rail`.

In the same section, "**Find** … a row of its own under the breadcrumb (or at the window's top when there's none)"
becomes "under the window header (or at the window's top when there's none)"; "the rule under the chrome at the top of
the window under them (its breadcrumb, find and replace rows, …)" becomes "(its header, find and replace rows, …)";
and **Hover** begins "Buttons (the header's mode buttons but the selected and the disabled), tabs and their `×`, `+N`,
breadcrumb headings and icon, …".

Previously: "under the breadcrumb (or at the window's top when there's none)"; "(its breadcrumb, find and replace
rows, which stay in sight)"; "**Hover.** Buttons, tabs and their `×`, `+N`, breadcrumb headings and icon, …".

## MODIFIED design/tui.md § Buffers, views, tabs, windows

"With a split, each window names its note on its header, bright in the active window (on a row of its own when the
header is off)."

Previously: "With a split, each window names its note on its breadcrumb row, bright in the active window."

## MODIFIED design/tui.md § Side panes: explorer (plan `3.7`), history, the git panel, Info, outline and footnotes

"… beside the note's windows: their headers and rules stop at its border (which meets the header's rule in `┫`), and
its title sits level with the header." and, in **The right rail**, "its first button level with the window header"
and "Without it, `▤` sits at the window header's right end, …".

Previously: "their breadcrumbs and rules stop at its border (which meets the breadcrumb's rule in `┫`), and its title
sits level with the breadcrumb"; "its first button level with the breadcrumb"; "Without it, `▤` sits at the
breadcrumb's right end".

## MODIFIED design/tui.md § UI settings

The list's breadcrumb line becomes two: "the window header (no key of its own: the `space u u` list, or the palette;
HDR-D3)" and "the breadcrumb on it (likewise)"; the gutter's line says "halfway from the page to the window header's
shade".

Previously: "the breadcrumb (no key of its own: the `space u u` list, or the palette)"; "halfway from the page to the
breadcrumb row's shade".

## MODIFIED design/tui.md § Source mode (plan `4.13`)

The first sentence: "`space n v` and `ctrl+k` (`:source`) switch a window's note between its raw markdown and the
rendered view, and the header's Source button (`view.mode_source`) sets it (HDR-D2); the status chip reads `SOURCE`."

Previously: "`space n v` (`:source`) shows a window's note as its raw markdown, and again rendered; the status chip
reads `SOURCE`."

## MODIFIED design/tui.md § The lens: live preview (plan `4.14`)

In **The session**: "`space n l` (`:live`) opens it too, and the header's Lens button (`view.mode_lens`) from any mode,
source mode included (HDR-D2)."; "`esc` in normal mode closes it: everything renders again", as before, and so does
the header's Read button (`view.mode_read`).

Previously: "`space n l` (`:live`) opens it too."

## MODIFIED design/tui.md § Files beyond notes (plan `16.x`)

In **Text files open in source mode**: "They have no rendered view: `space n v` and the lens say so and stay in source
mode, and the header's Read and Lens buttons are disabled, a click saying so (HDR-D2)." The same for a data file
that doesn't parse, and for code `[render] code = "source"`.

Previously: "They have no rendered view: `space n v` and the lens say so and stay in source mode."

## ADDED design/terms.md § (the list)

- **Mode** (a window's): how it shows its file: Read (the rendered view), Lens (rendered, the blocks around the
  cursor as their source) or Source (source mode); one at a time, switched by the header's buttons, `ctrl+k` and
  `space n l` (HDR-D2). Not vim's modes (normal, insert, visual). [tui.md](../../../design/tui.md) § Screen layout.
- **Window header**: the row atop each window: in a split its file's name, the breadcrumb, the mode's buttons, and
  `▤` without the right rail (HDR-D1). [tui.md](../../../design/tui.md) § Screen layout.
