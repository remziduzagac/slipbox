# Decisions: the window header

Agreed by the user on 2026-10-24 ("design is ok"), the design and its recommended answers to the seven open questions
as notes.md has them.

## HDR-D1: The row is the window header; the breadcrumb is the trail on it (2026-10-24)

**Decision:** The row atop each window is the window header: in a split the window's file name, the breadcrumb, the
mode's buttons, and `▤` without the right rail. "Breadcrumb" names only the headings the cursor is under. The docs,
the design and the code say so (`drawWindowHeader`, `src/tui/draw-header.ts`); `docs/manual/screen.md` § The window
header holds § The breadcrumb, so `#the-breadcrumb` still lands. The colour role keeps its name, `breadcrumb_band`.

**Why:** The row holds more than the breadcrumb, and the code already called it the header. The role also fills the
code view's cells drawn as bands (`src/core/layout/code.ts`), which `window_header` would misname, and one name needs
no alias.

**Not chosen:** a `window_header` role with `breadcrumb_band` read as it (`OLD_ROLES`, DF-D22).

## HDR-D2: Read, Lens and Source, a radio group on the header (2026-10-24)

> **Amended by HDR-D5 (2026-10-24):** without colour a disabled button is dim and italic, no longer the same as an
> enabled one.

**Decision:** Each window's header shows `Read`, `Lens` and `Source`, exactly one selected: the window's mode, drawn
from its flags each frame after its layout. A click, which like every click ends typing first, focuses the window and,
on another enabled button, runs that mode's command, which switches straight there through `Lens.setViewMode` and says
what the toggles say; on the selected one it changes nothing more; on a disabled one it says why, in `setViewMode`'s
words (`Lens.refusal`, their one home). The selected one is never disabled. The commands are `view.mode_read`,
`view.mode_lens` and `view.mode_source` ("Read mode", "Lens mode", "Source mode"), `cli: null`, with no default keys;
`view.source` and `view.live` stay toggles. Selected is `topbar_button_on`, the others `topbar_button`, a disabled one
a new role, `topbar_button_disabled` (`surface2`; dim without colour), never drawn in `hover`.

**Why:** The issue's: a mode is shown and switched where the window is, and a radio group never deselects. Every
click already ends typing (`src/tui/mouse.ts`), so the selected button follows the rule rather than make one for
itself. No keys: the toggles keep `ctrl+k`, `space n v` and `space n l`, and the letters free under `space n` say
nothing of the modes.

**Cost:** Without colour an enabled button is dim already, so a disabled one looks the same and only its click tells;
the selected one is bold.

**Not chosen:** `view.read`, `view.lens`, `view.whole_source`; one `view.mode <read|lens|source>`, which the palette
lists once; three roles of the header's own (notes.md, questions 1, 5, 7).

## HDR-D3: The breadcrumb and the header hide apart (2026-10-24)

**Decision:** `ui.breadcrumb = false` (and Breadcrumb in `space u u`) hides only the breadcrumb: the header stays, with
the name, the buttons and `▤`. `ui.window_header = false` (Window header in `space u u` and the palette,
`ui.window_header`, no key) removes the row as `ui.breadcrumb = false` did. Zen mode, the floating window and windows
under 8 rows have no header, as before.

**Why:** The issue's: hiding the breadcrumb shouldn't take the buttons with it, and someone who wants the row back for
text still can. The key keeps its name and intent; its narrower effect is a CHANGELOG line under Changed.

## HDR-D4: The buttons give way before the breadcrumb's innermost heading does (2026-10-24)

**Decision:** In a narrow header the breadcrumb folds first, down to its innermost heading cut to 8 columns (with `§`,
and `… ›` before it when there are two or more); then the buttons shorten to `R` `L` `S`, then to the selected one's
letter; then the breadcrumb folds on to `…` or nothing. The selected letter goes only where it doesn't fit beside the
name and `▤`.

**Why:** A narrow split still shows the heading the cursor is in, which the status chip doesn't, while the mode it does
(`READ`, `LENS`, `SOURCE`).

**Not chosen:** the buttons shortening only once the breadcrumb is down to `§ …` (the issue's order, read strictly;
notes.md, question 4).

## HDR-D5: Without colour, a disabled button is dim and italic (2026-10-24)

> Taken as recommended while the maintainer was away (2026-10-24); theirs to confirm or change.

**Decision:** In the `mono` theme (`NO_COLOR`), `topbar_button_disabled` is dim and italic, so a mode the file can't be
shown in reads differently from one a click switches to (dim) and from the selected one (bold). Amends HDR-D2's Cost.

**Why:** Without it, a disabled button and an enabled one looked the same without colour, and only the click told;
the review before the pull request found it, and ACCESSIBILITY.md has the `mono` theme show state by bold, dim, italics
and underlines. A terminal that draws no italics shows it dim, as before.

**Not chosen:** keeping the two alike (HDR-D2's Cost as first agreed).
