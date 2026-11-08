# Notes

## How it came up

On 2026-11-08 the user asked what LazyVim and Helix have that slipbox doesn't. The comparison
([research](../../research/lazyvim-helix.md)) ranked a top ten and listed the rest by area. The user then went
through it one item at a time: the top ten first, then the rest, the low-ranked ones as two groups to pick from. Each
question offered a recommendation and the alternatives; decisions.md records both.

## What was clarified on the way

- **Reflow and `ui.wrap`:** `ui.wrap` wraps on screen; reflow puts line breaks in the file, for a linter's line
  length, readable diffs and other tools. The user asked for the reverse too, and unwrapping joined EG-D12.
- **`ctrl+space`:** kept free, the user's own (EG-D7).
- **`space g`:** the user asked how the git panel works today: `space g` goes straight into it, single keys act on the
  selected row there, and its footer says them; from the note there's only `] c` / `[ c` and the gutter's click. The
  user proposed `space g` as a which-key group with `space g g` the panel (EG-D15). Every panel key mirrored under
  `space g` from the note was proposed on top of it, and dropped once its costs were laid out: one key saved, a commit
  made without seeing what's staged, the branch acted on from a note, a popup twice as long.
- **Several selections:** the recommendation was to leave them out, for their cost; the user chose Helix's whole
  model (EG-D14), its keys to be settled in its task.

## The decisions it reopens

Raised with the user after the items were settled, each with the reasons recorded:

- **D155, marks:** "vim's marks, macros, named registers and block selection" weren't wanted, the editor to be a good
  one, not all of vim. Marks are kept (EG-D20); the rest stays out.
- **D155, closing pairs:** opt-in (`25.3`), with no reason of their own recorded. On by default now (EG-D22).
- **D141, one split:** the least that reads one note beside another. A tab splits freely now (EG-D21), with or after
  the roadmap's Later item on windows and tabs.
- **GIT-D12, `space g`:** the panel alone, the old `space g` keys retired because most of their work was the panel's.
  A group again, for the note's own change and file, the panel on `space g g` (EG-D15).

The design also changes one line no decision stands behind: the status line said how many problems a file has, never
what one says (EG-D5).

## Points the decisions settle in the design

- The link to a line opens with the platform's opener and never over SSH, where it's copied, as a problem report's
  address is (RPT-D3).
- History is a side pane, not a list, so it has no preview; search, a list of places EG-D2 didn't name, has one.
- Indent guides are for nested list items: quotes draw a bar for each level already.
- The new `ctrl` chords in lists have a click as their other route (D99).
- The toggles: `space u shift+r` for the uses of a name, `space u i` for indent guides.
- `space g u` unstages the note's file: the gutter's changes are against what's staged, so the cursor's line holds
  none staged.
